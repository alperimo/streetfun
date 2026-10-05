use crate::cp_amm;
use crate::errors::StreetfunError;
use crate::state::{
    DbcLaunchAccount, GlobalConfig, SettlementPolicy, DBC_LAUNCH_SEED, GLOBAL_CONFIG_SEED,
    SETTLEMENT_POLICY_SEED,
};
use anchor_lang::prelude::*;
use anchor_lang::solana_program::{
    instruction::{AccountMeta, Instruction},
    program::invoke_signed,
};
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{Token, TokenAccount},
    token_interface::{Mint, TokenAccount as InterfaceTokenAccount, TokenInterface},
};

const DBC_PROGRAM_ID: Pubkey = pubkey!("dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN");
const DBC_POOL_AUTHORITY: Pubkey = pubkey!("FhVo3mqL8PW5pH5U2CN4XE33DokiyZnUwuGpH2hmHLuM");
const DBC_POOL_SEED: &[u8] = b"pool";
const DAMM_V2_POOL_SEED: &[u8] = b"pool";
const DBC_EVENT_AUTHORITY_SEED: &[u8] = b"__event_authority";
const VIRTUAL_POOL_DISCRIMINATOR: [u8; 8] = [213, 224, 5, 209, 98, 69, 119, 92];
const DBC_CONFIG_DISCRIMINATOR: [u8; 8] = [26, 108, 14, 123, 116, 230, 129, 43];
const DAMM_V2_POOL_DISCRIMINATOR: [u8; 8] = [241, 154, 109, 4, 17, 177, 109, 188];
const DBC_CONFIG_QUOTE_MINT_OFFSET: usize = 8;
const DBC_CONFIG_FEE_CLAIMER_OFFSET: usize = 40;
const DBC_CONFIG_LEFTOVER_RECEIVER_OFFSET: usize = 72;
const DBC_CONFIG_MIGRATION_OPTION_OFFSET: usize = 233;
const DBC_CONFIG_TOKEN_DECIMAL_OFFSET: usize = 235;
const DBC_CONFIG_TOKEN_TYPE_OFFSET: usize = 237;
const DBC_CONFIG_PARTNER_LOCKED_LIQUIDITY_OFFSET: usize = 239;
const DBC_CONFIG_PARTNER_LIQUIDITY_OFFSET: usize = 240;
const DBC_CONFIG_CREATOR_LOCKED_LIQUIDITY_OFFSET: usize = 241;
const DBC_CONFIG_CREATOR_LIQUIDITY_OFFSET: usize = 242;
const DBC_CONFIG_MIGRATION_FEE_OPTION_OFFSET: usize = 243;
const DBC_CONFIG_FIXED_SUPPLY_OFFSET: usize = 244;
const DBC_CONFIG_MIGRATION_FEE_PERCENTAGE_OFFSET: usize = 247;
const DBC_CONFIG_CREATOR_MIGRATION_FEE_PERCENTAGE_OFFSET: usize = 248;
const DBC_CONFIG_MIGRATION_QUOTE_THRESHOLD_OFFSET: usize = 264;
const DBC_CONFIG_PRE_MIGRATION_SUPPLY_OFFSET: usize = 344;
const DBC_CONFIG_POST_MIGRATION_SUPPLY_OFFSET: usize = 352;
const DBC_POOL_CONFIG_OFFSET: usize = 72;
const DBC_POOL_CREATOR_OFFSET: usize = 104;
const DBC_POOL_BASE_MINT_OFFSET: usize = 136;
const DBC_POOL_QUOTE_VAULT_OFFSET: usize = 200;
const DBC_POOL_IS_MIGRATED_OFFSET: usize = 305;
// From Meteora's published Dynamic Bonding Curve PoolState layout.
const DBC_POOL_FINISH_CURVE_TIMESTAMP_OFFSET: usize = 344;
const DAMM_V2_POOL_TOKEN_A_MINT_OFFSET: usize = 168;
const DAMM_V2_POOL_TOKEN_B_MINT_OFFSET: usize = 200;
const DAMM_V2_POOL_TOKEN_A_VAULT_OFFSET: usize = 232;
const DAMM_V2_POOL_TOKEN_B_VAULT_OFFSET: usize = 264;
// From Meteora's published DAMM v2 Pool layout.
const DAMM_V2_POOL_SQRT_PRICE_OFFSET: usize = 456;
const DBC_MIGRATION_FEE_PERCENTAGE: u8 = 50;
const DBC_MIGRATION_OPTION_MET_DAMM_V2: u8 = 1;
const DBC_MIGRATION_FEE_OPTION_CUSTOMIZABLE: u8 = 6;
const DBC_TOTAL_SUPPLY: u64 = 1_000_000_000_000_000;
const WITHDRAW_MIGRATION_FEE_DISCRIMINATOR: [u8; 8] = [237, 142, 45, 23, 129, 6, 222, 162];
const DBC_SETTLEMENT_FALLBACK_DELAY_SECONDS: i64 = 24 * 60 * 60;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct SettleDbcGraduationParams {
    /// Minimum spendable equity tokens the DAMM v2 swap must deliver.
    pub min_equity_tokens_expected: u64,
}

#[derive(Accounts)]
pub struct RegisterDbcLaunch<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(seeds = [GLOBAL_CONFIG_SEED], bump = global_config.bump)]
    pub global_config: Account<'info, GlobalConfig>,

    /// DBC creates and fixes the SPL mint before this instruction runs.
    pub meme_mint: InterfaceAccount<'info, Mint>,
    pub target_equity_mint: InterfaceAccount<'info, Mint>,
    pub quote_mint: Account<'info, anchor_spl::token::Mint>,

    /// CHECK: The DBC owner, canonical pool PDA, config and pool state are verified below.
    #[account(owner = DBC_PROGRAM_ID)]
    pub dbc_config: UncheckedAccount<'info>,
    /// CHECK: The DBC owner, canonical pool PDA, creator, mint and quote vault are verified below.
    #[account(mut, owner = DBC_PROGRAM_ID)]
    pub dbc_pool: UncheckedAccount<'info>,
    /// CHECK: DBC's canonical quote vault is checked against the pool state and token owner below.
    #[account(mut)]
    pub dbc_quote_vault: InterfaceAccount<'info, InterfaceTokenAccount>,

    /// The live USDC/collateral DAMM v2 pool selected during launch preparation.
    /// CHECK: Program ownership, pair and price state are validated below.
    pub equity_damm_v2_pool: UncheckedAccount<'info>,

    #[account(
        init,
        payer = creator,
        space = 8 + DbcLaunchAccount::INIT_SPACE,
        seeds = [DBC_LAUNCH_SEED, meme_mint.key().as_ref()],
        bump,
    )]
    pub dbc_launch: Account<'info, DbcLaunchAccount>,

    #[account(
        init,
        payer = creator,
        associated_token::mint = target_equity_mint,
        associated_token::authority = dbc_launch,
        associated_token::token_program = equity_token_program,
    )]
    pub treasury_vault: InterfaceAccount<'info, InterfaceTokenAccount>,

    /// Partner migration fees are claimed to this protocol PDA ATA by the
    /// creator-authorized settlement instruction; it is not a user wallet.
    #[account(
        init_if_needed,
        payer = creator,
        associated_token::mint = quote_mint,
        associated_token::authority = global_config,
    )]
    pub partner_quote_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub equity_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn handle_register_dbc_launch(ctx: Context<RegisterDbcLaunch>) -> Result<()> {
    require_keys_eq!(
        *ctx.accounts.meme_mint.to_account_info().owner,
        Token::id(),
        StreetfunError::InvalidTokenProgram
    );
    require!(
        ctx.accounts.quote_mint.decimals == 6,
        StreetfunError::CalculationError
    );
    require!(
        ctx.accounts.meme_mint.decimals == 6 && ctx.accounts.meme_mint.supply == DBC_TOTAL_SUPPLY,
        StreetfunError::SettlementAmountsMismatch
    );
    require!(
        ctx.accounts.meme_mint.key() != ctx.accounts.target_equity_mint.key()
            && ctx.accounts.quote_mint.key() != ctx.accounts.target_equity_mint.key(),
        StreetfunError::InvalidEquityMint
    );
    require_keys_eq!(
        *ctx.accounts.target_equity_mint.to_account_info().owner,
        ctx.accounts.equity_token_program.key(),
        StreetfunError::InvalidTokenProgram
    );

    validate_dbc_pool(
        &ctx.accounts.dbc_pool.to_account_info(),
        ctx.accounts.dbc_config.key(),
        ctx.accounts.creator.key(),
        ctx.accounts.meme_mint.key(),
        ctx.accounts.quote_mint.key(),
        ctx.accounts.dbc_quote_vault.key(),
        false,
    )?;
    validate_dbc_config(
        &ctx.accounts.dbc_config.to_account_info(),
        ctx.accounts.global_config.key(),
        ctx.accounts.quote_mint.key(),
        ctx.accounts.global_config.key(),
    )?;
    require_keys_eq!(
        ctx.accounts.dbc_quote_vault.mint,
        ctx.accounts.quote_mint.key(),
        StreetfunError::InvalidDammV2Pool
    );
    require_keys_eq!(
        ctx.accounts.dbc_quote_vault.owner,
        DBC_POOL_AUTHORITY,
        StreetfunError::InvalidDammV2Pool
    );
    require_keys_eq!(
        *ctx.accounts.equity_damm_v2_pool.to_account_info().owner,
        cp_amm::ID,
        StreetfunError::InvalidDammV2Pool
    );
    let market_a = read_dbc_pool_pubkey(
        &ctx.accounts.equity_damm_v2_pool.to_account_info(),
        DAMM_V2_POOL_TOKEN_A_MINT_OFFSET,
    )?;
    let market_b = read_dbc_pool_pubkey(
        &ctx.accounts.equity_damm_v2_pool.to_account_info(),
        DAMM_V2_POOL_TOKEN_B_MINT_OFFSET,
    )?;
    validate_market_pair(
        market_a,
        market_b,
        ctx.accounts.quote_mint.key(),
        ctx.accounts.target_equity_mint.key(),
        market_a,
        market_b,
    )?;
    read_damm_v2_sqrt_price(&ctx.accounts.equity_damm_v2_pool.to_account_info())?;

    let launch = &mut ctx.accounts.dbc_launch;
    launch.creator = ctx.accounts.creator.key();
    launch.meme_mint = ctx.accounts.meme_mint.key();
    launch.target_equity_mint = ctx.accounts.target_equity_mint.key();
    launch.quote_mint = ctx.accounts.quote_mint.key();
    launch.dbc_config = ctx.accounts.dbc_config.key();
    launch.dbc_pool = ctx.accounts.dbc_pool.key();
    // Before graduation this field pins the fallback collateral market. After
    // settlement it records the migrated DBC meme/quote pool instead.
    launch.meteora_damm_v2_pool = ctx.accounts.equity_damm_v2_pool.key();
    launch.initial_meme_supply = ctx.accounts.meme_mint.supply;
    launch.settlement_quote_amount = 0;
    launch.total_equity_locked = 0;
    launch.graduated_at = 0;
    launch.is_graduated = false;
    launch.bump = ctx.bumps.dbc_launch;

    emit!(crate::DbcLaunchRegisteredEvent {
        creator: launch.creator,
        meme_mint: launch.meme_mint,
        target_equity_mint: launch.target_equity_mint,
        quote_mint: launch.quote_mint,
        dbc_config: launch.dbc_config,
        dbc_pool: launch.dbc_pool,
    });
    Ok(())
}

#[derive(Accounts)]
pub struct SettleDbcGraduation<'info> {
    /// The creator may settle immediately; after the fallback delay settlement is permissionless.
    #[account(mut)]
    pub caller: Signer<'info>,

    #[account(mut, seeds = [GLOBAL_CONFIG_SEED], bump = global_config.bump)]
    pub global_config: Box<Account<'info, GlobalConfig>>,

    pub meme_mint: Box<InterfaceAccount<'info, Mint>>,
    pub quote_mint: Box<Account<'info, anchor_spl::token::Mint>>,
    pub target_equity_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        mut,
        seeds = [DBC_LAUNCH_SEED, meme_mint.key().as_ref()],
        bump = dbc_launch.bump,
        constraint = dbc_launch.meme_mint == meme_mint.key() @ StreetfunError::InvalidDammV2Pool,
        constraint = dbc_launch.quote_mint == quote_mint.key() @ StreetfunError::InvalidDammV2Pool,
        constraint = dbc_launch.target_equity_mint == target_equity_mint.key() @ StreetfunError::InvalidEquityMint,
        constraint = !dbc_launch.is_graduated @ StreetfunError::CurveAlreadyGraduated,
    )]
    pub dbc_launch: Box<Account<'info, DbcLaunchAccount>>,

    /// CHECK: Bound to the launch registry and decoded/verified as a migrated DBC pool.
    #[account(mut, owner = DBC_PROGRAM_ID)]
    pub dbc_pool: UncheckedAccount<'info>,
    /// CHECK: The registered DBC config is decoded and constrained below.
    #[account(address = dbc_launch.dbc_config, owner = DBC_PROGRAM_ID)]
    pub dbc_config: UncheckedAccount<'info>,
    /// CHECK: Bound to the pool state's quote vault, mint, and Meteora authority below.
    #[account(mut)]
    pub dbc_quote_vault: Box<InterfaceAccount<'info, InterfaceTokenAccount>>,
    /// CHECK: DBC's canonical authority.
    #[account(address = DBC_POOL_AUTHORITY)]
    pub dbc_pool_authority: UncheckedAccount<'info>,
    /// CHECK: Canonical DBC event authority PDA.
    pub dbc_event_authority: UncheckedAccount<'info>,
    /// CHECK: Address constrained to Meteora's published DBC program.
    #[account(address = DBC_PROGRAM_ID)]
    pub dbc_program: UncheckedAccount<'info>,

    /// The canonical DAMM v2 pool created by DBC migration for this launch.
    /// CHECK: Program ownership, canonical PDA, token pair, and vaults are validated below.
    pub migrated_dbc_damm_pool: UncheckedAccount<'info>,
    /// The DAMM v2 config used by DBC's manual or keeper migration.
    /// CHECK: Program ownership and canonical pool derivation are validated below.
    pub migrated_dbc_damm_config: UncheckedAccount<'info>,
    /// Both live vaults must be the vault addresses recorded in the migrated pool.
    #[account(mut)]
    pub migrated_dbc_damm_token_a_vault: Box<InterfaceAccount<'info, InterfaceTokenAccount>>,
    #[account(mut)]
    pub migrated_dbc_damm_token_b_vault: Box<InterfaceAccount<'info, InterfaceTokenAccount>>,

    #[account(
        mut,
        associated_token::mint = quote_mint,
        associated_token::authority = global_config,
    )]
    pub partner_quote_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = target_equity_mint,
        associated_token::authority = dbc_launch,
        associated_token::token_program = equity_token_program,
    )]
    pub treasury_vault: Box<InterfaceAccount<'info, InterfaceTokenAccount>>,

    /// The live USDC/selected collateral DAMM v2 market used for the equity leg.
    /// CHECK: Owner, pair, vault mints, and pool authority are validated below and by DAMM v2 CPI.
    #[account(mut)]
    pub equity_damm_v2_pool: UncheckedAccount<'info>,
    #[account(mut)]
    pub equity_reserve_a: Box<InterfaceAccount<'info, InterfaceTokenAccount>>,
    #[account(mut)]
    pub equity_reserve_b: Box<InterfaceAccount<'info, InterfaceTokenAccount>>,
    pub equity_token_a_mint: Box<InterfaceAccount<'info, Mint>>,
    pub equity_token_b_mint: Box<InterfaceAccount<'info, Mint>>,
    pub equity_token_a_program: Interface<'info, TokenInterface>,
    pub equity_token_b_program: Interface<'info, TokenInterface>,
    /// CHECK: Canonical DAMM v2 pool authority.
    pub damm_v2_pool_authority: UncheckedAccount<'info>,
    /// CHECK: Canonical DAMM v2 event authority PDA.
    pub damm_v2_event_authority: UncheckedAccount<'info>,
    pub damm_v2_program: Program<'info, cp_amm::program::CpAmm>,

    pub token_program: Program<'info, Token>,
    pub equity_token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    #[account(seeds = [SETTLEMENT_POLICY_SEED, quote_mint.key().as_ref(), target_equity_mint.key().as_ref()], bump = settlement_policy.bump)]
    pub settlement_policy: Account<'info, SettlementPolicy>,
}

pub fn handle_settle_dbc_graduation(
    ctx: Context<SettleDbcGraduation>,
    params: SettleDbcGraduationParams,
) -> Result<()> {
    require!(
        params.min_equity_tokens_expected > 0,
        StreetfunError::ZeroAmount
    );
    require!(
        ctx.accounts.dbc_launch.initial_meme_supply == DBC_TOTAL_SUPPLY
            && ctx.accounts.meme_mint.supply <= ctx.accounts.dbc_launch.initial_meme_supply,
        StreetfunError::SettlementAmountsMismatch
    );
    require_keys_eq!(
        ctx.accounts.dbc_launch.dbc_pool,
        ctx.accounts.dbc_pool.key(),
        StreetfunError::InvalidDammV2Pool
    );
    require_keys_eq!(
        ctx.accounts.dbc_launch.dbc_config,
        read_dbc_pool_pubkey(&ctx.accounts.dbc_pool, DBC_POOL_CONFIG_OFFSET)?,
        StreetfunError::InvalidDammV2Pool
    );
    validate_dbc_config(
        &ctx.accounts.dbc_config.to_account_info(),
        ctx.accounts.global_config.key(),
        ctx.accounts.quote_mint.key(),
        ctx.accounts.global_config.key(),
    )?;
    validate_dbc_pool(
        &ctx.accounts.dbc_pool.to_account_info(),
        ctx.accounts.dbc_launch.dbc_config,
        ctx.accounts.dbc_launch.creator,
        ctx.accounts.meme_mint.key(),
        ctx.accounts.quote_mint.key(),
        ctx.accounts.dbc_quote_vault.key(),
        true,
    )?;
    validate_settlement_caller(
        ctx.accounts.caller.key(),
        ctx.accounts.dbc_launch.creator,
        read_dbc_pool_finish_curve_timestamp(&ctx.accounts.dbc_pool.to_account_info())?,
        Clock::get()?.unix_timestamp,
    )?;
    require_keys_eq!(
        ctx.accounts.dbc_quote_vault.mint,
        ctx.accounts.quote_mint.key(),
        StreetfunError::InvalidDammV2Pool
    );
    require_keys_eq!(
        ctx.accounts.dbc_quote_vault.owner,
        DBC_POOL_AUTHORITY,
        StreetfunError::InvalidDammV2Pool
    );
    require_keys_eq!(
        ctx.accounts.dbc_pool_authority.key(),
        DBC_POOL_AUTHORITY,
        StreetfunError::InvalidDammV2Pool
    );
    let expected_dbc_event_authority =
        Pubkey::find_program_address(&[DBC_EVENT_AUTHORITY_SEED], &DBC_PROGRAM_ID).0;
    require_keys_eq!(
        ctx.accounts.dbc_event_authority.key(),
        expected_dbc_event_authority,
        StreetfunError::InvalidDammV2Pool
    );
    require_keys_eq!(
        *ctx.accounts.target_equity_mint.to_account_info().owner,
        ctx.accounts.equity_token_program.key(),
        StreetfunError::InvalidTokenProgram
    );
    validate_market_pair(
        ctx.accounts.equity_token_a_mint.key(),
        ctx.accounts.equity_token_b_mint.key(),
        ctx.accounts.quote_mint.key(),
        ctx.accounts.target_equity_mint.key(),
        ctx.accounts.equity_reserve_a.mint,
        ctx.accounts.equity_reserve_b.mint,
    )?;
    require_keys_eq!(
        *ctx.accounts.equity_token_a_mint.to_account_info().owner,
        ctx.accounts.equity_token_a_program.key(),
        StreetfunError::InvalidTokenProgram
    );
    require_keys_eq!(
        *ctx.accounts.equity_token_b_mint.to_account_info().owner,
        ctx.accounts.equity_token_b_program.key(),
        StreetfunError::InvalidTokenProgram
    );
    require_keys_eq!(
        ctx.accounts.damm_v2_program.key(),
        cp_amm::ID,
        StreetfunError::InvalidDammV2Pool
    );
    require_keys_eq!(
        *ctx.accounts.equity_damm_v2_pool.to_account_info().owner,
        cp_amm::ID,
        StreetfunError::InvalidDammV2Pool
    );

    // DBC flips is_migrated only after migration. Validate the actual DBC
    // migration pool separately from the USDC/equity market used for backing.
    validate_migrated_dbc_damm_pool(
        &ctx.accounts.migrated_dbc_damm_pool.to_account_info(),
        ctx.accounts.migrated_dbc_damm_config.key(),
        &ctx.accounts.migrated_dbc_damm_config.to_account_info(),
        ctx.accounts.meme_mint.key(),
        ctx.accounts.quote_mint.key(),
        &ctx.accounts.migrated_dbc_damm_token_a_vault,
        &ctx.accounts.migrated_dbc_damm_token_b_vault,
    )?;

    // The protocol ATA is shared by every launch. Only spend the amount newly
    // withdrawn from this DBC pool; older migration fees must remain untouched.
    ctx.accounts.partner_quote_account.reload()?;
    let quote_before_claim = ctx.accounts.partner_quote_account.amount;
    withdraw_dbc_partner_migration_fee(&ctx.accounts)?;
    ctx.accounts.partner_quote_account.reload()?;
    let quote_after_claim = ctx.accounts.partner_quote_account.amount;
    let quote_for_equity = quote_after_claim
        .checked_sub(quote_before_claim)
        .ok_or(StreetfunError::SettlementAmountsMismatch)?;
    require!(
        quote_for_equity > 0,
        StreetfunError::InsufficientQuoteReserves
    );
    crate::instructions::settlement_policy::validate_settlement_policy(
        &ctx.accounts.settlement_policy,
        ctx.accounts.equity_damm_v2_pool.key(),
        ctx.accounts.quote_mint.key(),
        ctx.accounts.target_equity_mint.key(),
        quote_for_equity,
        params.min_equity_tokens_expected,
        Clock::get()?.unix_timestamp,
    )?;

    let equity_before = ctx.accounts.treasury_vault.amount;
    let config_bump = [ctx.accounts.global_config.bump];
    let config_seeds: &[&[u8]] = &[GLOBAL_CONFIG_SEED, &config_bump];
    cp_amm::cpi::swap2(
        CpiContext::new_with_signer(
            ctx.accounts.damm_v2_program.to_account_info(),
            cp_amm::cpi::accounts::Swap2 {
                pool_authority: ctx.accounts.damm_v2_pool_authority.to_account_info(),
                pool: ctx.accounts.equity_damm_v2_pool.to_account_info(),
                input_token_account: ctx.accounts.partner_quote_account.to_account_info(),
                output_token_account: ctx.accounts.treasury_vault.to_account_info(),
                token_a_vault: ctx.accounts.equity_reserve_a.to_account_info(),
                token_b_vault: ctx.accounts.equity_reserve_b.to_account_info(),
                token_a_mint: ctx.accounts.equity_token_a_mint.to_account_info(),
                token_b_mint: ctx.accounts.equity_token_b_mint.to_account_info(),
                payer: ctx.accounts.global_config.to_account_info(),
                token_a_program: ctx.accounts.equity_token_a_program.to_account_info(),
                token_b_program: ctx.accounts.equity_token_b_program.to_account_info(),
                referral_token_account: None,
                event_authority: ctx.accounts.damm_v2_event_authority.to_account_info(),
                program: ctx.accounts.damm_v2_program.to_account_info(),
            },
            &[config_seeds],
        ),
        cp_amm::types::SwapParameters2 {
            amount_0: quote_for_equity,
            amount_1: params.min_equity_tokens_expected,
            swap_mode: 0,
        },
    )?;

    ctx.accounts.partner_quote_account.reload()?;
    ctx.accounts.treasury_vault.reload()?;
    require!(
        ctx.accounts.partner_quote_account.amount == quote_before_claim,
        StreetfunError::SettlementAmountsMismatch
    );
    let equity_acquired = ctx
        .accounts
        .treasury_vault
        .amount
        .checked_sub(equity_before)
        .ok_or(StreetfunError::SettlementAmountsMismatch)?;
    require!(
        equity_acquired >= params.min_equity_tokens_expected,
        StreetfunError::SlippageExceeded
    );

    let now = Clock::get()?.unix_timestamp;
    let launch = &mut ctx.accounts.dbc_launch;
    launch.settlement_quote_amount = quote_for_equity;
    launch.total_equity_locked = equity_acquired;
    launch.meteora_damm_v2_pool = ctx.accounts.migrated_dbc_damm_pool.key();
    launch.graduated_at = now;
    launch.is_graduated = true;
    ctx.accounts.global_config.total_equity_purchased = ctx
        .accounts
        .global_config
        .total_equity_purchased
        .checked_add(equity_acquired)
        .ok_or(StreetfunError::MathOverflow)?;

    emit!(crate::DbcGraduatedEvent {
        meme_mint: launch.meme_mint,
        target_equity_mint: launch.target_equity_mint,
        quote_spent_for_equity: quote_for_equity,
        equity_locked: equity_acquired,
        meteora_damm_v2_pool: launch.meteora_damm_v2_pool,
        timestamp: now,
    });
    Ok(())
}

fn withdraw_dbc_partner_migration_fee(accounts: &SettleDbcGraduation) -> Result<()> {
    let mut data = Vec::with_capacity(9);
    data.extend_from_slice(&WITHDRAW_MIGRATION_FEE_DISCRIMINATOR);
    data.push(0); // DBC's role flag 0 is the partner fee claimer.
    let event_authority = accounts.dbc_event_authority.key();
    let instruction = Instruction {
        program_id: DBC_PROGRAM_ID,
        accounts: vec![
            AccountMeta::new_readonly(DBC_POOL_AUTHORITY, false),
            AccountMeta::new_readonly(accounts.dbc_launch.dbc_config, false),
            AccountMeta::new(accounts.dbc_pool.key(), false),
            AccountMeta::new(accounts.partner_quote_account.key(), false),
            AccountMeta::new(accounts.dbc_quote_vault.key(), false),
            AccountMeta::new_readonly(accounts.quote_mint.key(), false),
            AccountMeta::new_readonly(accounts.global_config.key(), true),
            AccountMeta::new_readonly(Token::id(), false),
            AccountMeta::new_readonly(event_authority, false),
            AccountMeta::new_readonly(DBC_PROGRAM_ID, false),
        ],
        data,
    };
    let bump = [accounts.global_config.bump];
    let signer_seeds: &[&[&[u8]]] = &[&[GLOBAL_CONFIG_SEED, &bump]];
    invoke_signed(
        &instruction,
        &[
            accounts.dbc_pool_authority.to_account_info(),
            accounts.dbc_config.to_account_info(),
            accounts.dbc_pool.to_account_info(),
            accounts.partner_quote_account.to_account_info(),
            accounts.dbc_quote_vault.to_account_info(),
            accounts.quote_mint.to_account_info(),
            accounts.global_config.to_account_info(),
            accounts.token_program.to_account_info(),
            accounts.dbc_event_authority.to_account_info(),
            accounts.dbc_program.to_account_info(),
        ],
        signer_seeds,
    )?;
    Ok(())
}

/// A creator can settle as soon as the DBC curve is complete. If the creator
/// is unavailable, any signer can settle one day after Meteora records that
/// the curve finished. The pool timestamp is owned by Meteora and cannot be
/// reset by a settlement caller.
fn validate_settlement_caller(
    caller: Pubkey,
    creator: Pubkey,
    finish_curve_timestamp: i64,
    now: i64,
) -> Result<bool> {
    if caller == creator {
        return Ok(false);
    }
    require!(
        finish_curve_timestamp > 0,
        StreetfunError::SettlementFallbackNotReady
    );
    let fallback_at = finish_curve_timestamp
        .checked_add(DBC_SETTLEMENT_FALLBACK_DELAY_SECONDS)
        .ok_or(StreetfunError::MathOverflow)?;
    require!(
        now >= fallback_at,
        StreetfunError::SettlementFallbackNotReady
    );
    Ok(true)
}

fn read_dbc_pool_finish_curve_timestamp(pool: &AccountInfo) -> Result<i64> {
    let data = pool.try_borrow_data()?;
    let end = DBC_POOL_FINISH_CURVE_TIMESTAMP_OFFSET + 8;
    require!(data.len() >= end, StreetfunError::InvalidDammV2Pool);
    let timestamp = u64::from_le_bytes(
        data[DBC_POOL_FINISH_CURVE_TIMESTAMP_OFFSET..end]
            .try_into()
            .map_err(|_| StreetfunError::InvalidDammV2Pool)?,
    );
    i64::try_from(timestamp).map_err(|_| StreetfunError::MathOverflow.into())
}

fn read_damm_v2_sqrt_price(pool: &AccountInfo) -> Result<u128> {
    let data = pool.try_borrow_data()?;
    let end = DAMM_V2_POOL_SQRT_PRICE_OFFSET + 16;
    require!(
        data.len() >= end && data[..8] == DAMM_V2_POOL_DISCRIMINATOR,
        StreetfunError::InvalidDammV2Pool
    );
    let sqrt_price = u128::from_le_bytes(
        data[DAMM_V2_POOL_SQRT_PRICE_OFFSET..end]
            .try_into()
            .map_err(|_| StreetfunError::InvalidDammV2Pool)?,
    );
    require!(sqrt_price > 0, StreetfunError::InvalidDammV2Pool);
    Ok(sqrt_price)
}

fn validate_dbc_config(
    config: &AccountInfo,
    fee_claimer: Pubkey,
    quote_mint: Pubkey,
    leftover_receiver: Pubkey,
) -> Result<()> {
    require_keys_eq!(
        *config.owner,
        DBC_PROGRAM_ID,
        StreetfunError::InvalidDammV2Pool
    );
    let data = config.try_borrow_data()?;
    require!(
        data.len() >= DBC_CONFIG_POST_MIGRATION_SUPPLY_OFFSET + 8
            && data[..8] == DBC_CONFIG_DISCRIMINATOR,
        StreetfunError::InvalidDammV2Pool
    );
    require_keys_eq!(
        read_dbc_pool_pubkey_data(&data, DBC_CONFIG_QUOTE_MINT_OFFSET)?,
        quote_mint,
        StreetfunError::InvalidDammV2Pool
    );
    require_keys_eq!(
        read_dbc_pool_pubkey_data(&data, DBC_CONFIG_FEE_CLAIMER_OFFSET)?,
        fee_claimer,
        StreetfunError::InvalidDammV2Pool
    );
    require_keys_eq!(
        read_dbc_pool_pubkey_data(&data, DBC_CONFIG_LEFTOVER_RECEIVER_OFFSET)?,
        leftover_receiver,
        StreetfunError::InvalidDammV2Pool
    );
    require!(
        data[DBC_CONFIG_MIGRATION_OPTION_OFFSET] == DBC_MIGRATION_OPTION_MET_DAMM_V2
            && data[DBC_CONFIG_TOKEN_DECIMAL_OFFSET] == 6
            && data[DBC_CONFIG_TOKEN_TYPE_OFFSET] == 0
            && data[DBC_CONFIG_PARTNER_LOCKED_LIQUIDITY_OFFSET] == 100
            && data[DBC_CONFIG_PARTNER_LIQUIDITY_OFFSET] == 0
            && data[DBC_CONFIG_CREATOR_LOCKED_LIQUIDITY_OFFSET] == 0
            && data[DBC_CONFIG_CREATOR_LIQUIDITY_OFFSET] == 0
            && data[DBC_CONFIG_MIGRATION_FEE_OPTION_OFFSET]
                == DBC_MIGRATION_FEE_OPTION_CUSTOMIZABLE
            && data[DBC_CONFIG_FIXED_SUPPLY_OFFSET] == 1
            && data[DBC_CONFIG_MIGRATION_FEE_PERCENTAGE_OFFSET] == DBC_MIGRATION_FEE_PERCENTAGE
            && data[DBC_CONFIG_CREATOR_MIGRATION_FEE_PERCENTAGE_OFFSET] == 0,
        StreetfunError::InvalidDammV2Pool
    );
    let pre_migration_supply = u64::from_le_bytes(
        data[DBC_CONFIG_PRE_MIGRATION_SUPPLY_OFFSET..DBC_CONFIG_PRE_MIGRATION_SUPPLY_OFFSET + 8]
            .try_into()
            .map_err(|_| StreetfunError::InvalidDammV2Pool)?,
    );
    let post_migration_supply = u64::from_le_bytes(
        data[DBC_CONFIG_POST_MIGRATION_SUPPLY_OFFSET..DBC_CONFIG_POST_MIGRATION_SUPPLY_OFFSET + 8]
            .try_into()
            .map_err(|_| StreetfunError::InvalidDammV2Pool)?,
    );
    require!(
        pre_migration_supply == DBC_TOTAL_SUPPLY && post_migration_supply == DBC_TOTAL_SUPPLY,
        StreetfunError::InvalidDammV2Pool
    );
    let threshold = u64::from_le_bytes(
        data[DBC_CONFIG_MIGRATION_QUOTE_THRESHOLD_OFFSET
            ..DBC_CONFIG_MIGRATION_QUOTE_THRESHOLD_OFFSET + 8]
            .try_into()
            .map_err(|_| StreetfunError::InvalidDammV2Pool)?,
    );
    require!(threshold > 0, StreetfunError::InvalidDammV2Pool);
    Ok(())
}

fn validate_migrated_dbc_damm_pool(
    pool: &AccountInfo,
    damm_config: Pubkey,
    damm_config_info: &AccountInfo,
    base_mint: Pubkey,
    quote_mint: Pubkey,
    token_a_vault: &InterfaceAccount<InterfaceTokenAccount>,
    token_b_vault: &InterfaceAccount<InterfaceTokenAccount>,
) -> Result<()> {
    require_keys_eq!(*pool.owner, cp_amm::ID, StreetfunError::InvalidDammV2Pool);
    require_keys_eq!(
        *damm_config_info.owner,
        cp_amm::ID,
        StreetfunError::InvalidDammV2Pool
    );
    let (first_mint, second_mint) = ordered_mints(base_mint, quote_mint);
    let expected_pool = Pubkey::find_program_address(
        &[
            DAMM_V2_POOL_SEED,
            damm_config.as_ref(),
            first_mint.as_ref(),
            second_mint.as_ref(),
        ],
        &cp_amm::ID,
    )
    .0;
    require_keys_eq!(pool.key(), expected_pool, StreetfunError::InvalidDammV2Pool);
    let data = pool.try_borrow_data()?;
    require!(
        data.len() >= DAMM_V2_POOL_TOKEN_B_MINT_OFFSET + 32,
        StreetfunError::InvalidDammV2Pool
    );
    let token_a = read_dbc_pool_pubkey_data(&data, DAMM_V2_POOL_TOKEN_A_MINT_OFFSET)?;
    let token_b = read_dbc_pool_pubkey_data(&data, DAMM_V2_POOL_TOKEN_B_MINT_OFFSET)?;
    require!(
        (token_a == base_mint && token_b == quote_mint)
            || (token_a == quote_mint && token_b == base_mint),
        StreetfunError::InvalidDammV2Pool
    );
    let expected_token_a_vault =
        read_dbc_pool_pubkey_data(&data, DAMM_V2_POOL_TOKEN_A_VAULT_OFFSET)?;
    let expected_token_b_vault =
        read_dbc_pool_pubkey_data(&data, DAMM_V2_POOL_TOKEN_B_VAULT_OFFSET)?;
    require_keys_eq!(
        token_a_vault.key(),
        expected_token_a_vault,
        StreetfunError::InvalidDammV2Pool
    );
    require_keys_eq!(
        token_b_vault.key(),
        expected_token_b_vault,
        StreetfunError::InvalidDammV2Pool
    );
    let (expected_authority, _) = Pubkey::find_program_address(&[b"pool_authority"], &cp_amm::ID);
    require_keys_eq!(
        token_a_vault.owner,
        expected_authority,
        StreetfunError::InvalidDammV2Pool
    );
    require_keys_eq!(
        token_b_vault.owner,
        expected_authority,
        StreetfunError::InvalidDammV2Pool
    );
    require_keys_eq!(
        token_a_vault.mint,
        token_a,
        StreetfunError::InvalidDammV2Pool
    );
    require_keys_eq!(
        token_b_vault.mint,
        token_b,
        StreetfunError::InvalidDammV2Pool
    );
    require!(
        token_a_vault.amount > 0 && token_b_vault.amount > 0,
        StreetfunError::InsufficientQuoteReserves
    );
    Ok(())
}

fn ordered_mints(a: Pubkey, b: Pubkey) -> (Pubkey, Pubkey) {
    if a.to_bytes() > b.to_bytes() {
        (a, b)
    } else {
        (b, a)
    }
}

fn validate_market_pair(
    token_a: Pubkey,
    token_b: Pubkey,
    quote_mint: Pubkey,
    other_mint: Pubkey,
    reserve_a_mint: Pubkey,
    reserve_b_mint: Pubkey,
) -> Result<()> {
    require!(
        (token_a == quote_mint && token_b == other_mint)
            || (token_a == other_mint && token_b == quote_mint),
        StreetfunError::InvalidDammV2Pool
    );
    require!(
        reserve_a_mint == token_a && reserve_b_mint == token_b,
        StreetfunError::InvalidDammV2Pool
    );
    Ok(())
}

fn validate_dbc_pool(
    pool: &AccountInfo,
    config: Pubkey,
    creator: Pubkey,
    base_mint: Pubkey,
    quote_mint: Pubkey,
    quote_vault: Pubkey,
    should_be_migrated: bool,
) -> Result<()> {
    require_keys_eq!(
        *pool.owner,
        DBC_PROGRAM_ID,
        StreetfunError::InvalidDammV2Pool
    );
    let (max_mint, min_mint) = if quote_mint.to_bytes() > base_mint.to_bytes() {
        (quote_mint, base_mint)
    } else {
        (base_mint, quote_mint)
    };
    let expected_pool = Pubkey::find_program_address(
        &[
            DBC_POOL_SEED,
            config.as_ref(),
            max_mint.as_ref(),
            min_mint.as_ref(),
        ],
        &DBC_PROGRAM_ID,
    )
    .0;
    require_keys_eq!(pool.key(), expected_pool, StreetfunError::InvalidDammV2Pool);

    let data = pool.try_borrow_data()?;
    require!(
        data.len() > DBC_POOL_IS_MIGRATED_OFFSET && data[..8] == VIRTUAL_POOL_DISCRIMINATOR,
        StreetfunError::InvalidDammV2Pool
    );
    require_keys_eq!(
        read_dbc_pool_pubkey_data(&data, DBC_POOL_CONFIG_OFFSET)?,
        config,
        StreetfunError::InvalidDammV2Pool
    );
    require_keys_eq!(
        read_dbc_pool_pubkey_data(&data, DBC_POOL_CREATOR_OFFSET)?,
        creator,
        StreetfunError::InvalidDammV2Pool
    );
    require_keys_eq!(
        read_dbc_pool_pubkey_data(&data, DBC_POOL_BASE_MINT_OFFSET)?,
        base_mint,
        StreetfunError::InvalidDammV2Pool
    );
    require_keys_eq!(
        read_dbc_pool_pubkey_data(&data, DBC_POOL_QUOTE_VAULT_OFFSET)?,
        quote_vault,
        StreetfunError::InvalidDammV2Pool
    );
    require!(
        (data[DBC_POOL_IS_MIGRATED_OFFSET] == 1) == should_be_migrated,
        StreetfunError::InvalidDammV2Pool
    );
    Ok(())
}

fn read_dbc_pool_pubkey(pool: &AccountInfo, offset: usize) -> Result<Pubkey> {
    let data = pool.try_borrow_data()?;
    read_dbc_pool_pubkey_data(&data, offset)
}

fn read_dbc_pool_pubkey_data(data: &[u8], offset: usize) -> Result<Pubkey> {
    let bytes: [u8; 32] = data
        .get(offset..offset + 32)
        .ok_or(StreetfunError::InvalidDammV2Pool)?
        .try_into()
        .map_err(|_| StreetfunError::InvalidDammV2Pool)?;
    Ok(Pubkey::new_from_array(bytes))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn creator_can_settle_immediately_but_other_wallets_wait_one_day() {
        let creator = Pubkey::new_unique();
        let keeper = Pubkey::new_unique();
        let finished_at = 1_000;

        assert_eq!(
            validate_settlement_caller(creator, creator, 0, 0).unwrap(),
            false
        );
        assert!(
            validate_settlement_caller(keeper, creator, finished_at, finished_at + 86_399).is_err()
        );
        assert_eq!(
            validate_settlement_caller(keeper, creator, finished_at, finished_at + 86_400).unwrap(),
            true
        );
        assert!(validate_settlement_caller(keeper, creator, 0, i64::MAX).is_err());
    }
}

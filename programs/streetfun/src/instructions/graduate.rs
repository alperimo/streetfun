use crate::cp_amm;
use crate::errors::StreetfunError;
use crate::instructions::launch::{SALE_SUPPLY, TOTAL_MEME_SUPPLY};
use crate::state::{
    CurveAccount, GlobalConfig, SettlementPolicy, CURVE_SEED, GLOBAL_CONFIG_SEED, QUOTE_VAULT_SEED,
    SETTLEMENT_POLICY_SEED, TOKEN_VAULT_SEED, TREASURY_VAULT_SEED,
};
use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token::{self, Mint, Token, TokenAccount, TransferChecked},
    token_2022::Token2022,
    token_interface::{
        Mint as InterfaceMint, TokenAccount as InterfaceTokenAccount, TokenInterface,
    },
};

const CP_AMM_POOL_AUTHORITY: Pubkey = pubkey!("HLnpSz9h2S4hiLQ43rnSD9XkcUThA7B8hQMKmDaiTLcC");
const CP_AMM_EVENT_AUTHORITY_SEED: &[u8] = b"__event_authority";
const DAMM_V2_CUSTOM_POOL_SEED: &[u8] = b"cpool";
const DAMM_V2_POSITION_SEED: &[u8] = b"position";
const DAMM_V2_POSITION_NFT_ACCOUNT_SEED: &[u8] = b"position_nft_account";
const DAMM_V2_TOKEN_VAULT_SEED: &[u8] = b"token_vault";
const DAMM_V2_DEAD_LIQUIDITY: u128 = 100_u128 << 64;
const DAMM_V2_MIN_SQRT_PRICE: u128 = 4_295_048_016;
const DAMM_V2_MAX_SQRT_PRICE: u128 = 79_226_673_521_066_979_257_578_248_091;

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct GraduateParams {
    /// Minimum net target-equity units the DAMM v2 swap must deliver.
    pub min_equity_tokens_expected: u64,
    /// DAMM v2 BothToken pool inputs; all other pool settings are fixed below.
    pub pool_liquidity: u128,
    pub pool_sqrt_price: u128,
}

#[derive(Accounts)]
pub struct GraduateAndExecuteStock<'info> {
    /// Permissionless finalizer. This wallet pays pool and position rent.
    #[account(mut)]
    pub caller: Signer<'info>,

    #[account(
        mut,
        seeds = [GLOBAL_CONFIG_SEED],
        bump = global_config.bump,
    )]
    pub global_config: Box<Account<'info, GlobalConfig>>,

    pub meme_mint: Box<Account<'info, Mint>>,
    pub quote_mint: Box<Account<'info, Mint>>,

    /// Tessera T-Token on mainnet, or an explicitly-labelled test collateral mint on Devnet.
    pub target_equity_mint: Box<InterfaceAccount<'info, InterfaceMint>>,

    #[account(
        mut,
        seeds = [CURVE_SEED, meme_mint.key().as_ref()],
        bump = curve.curve_bump,
        constraint = curve.target_equity_mint == target_equity_mint.key() @ StreetfunError::InvalidEquityMint,
        constraint = curve.meme_mint != target_equity_mint.key() @ StreetfunError::InvalidEquityMint,
    )]
    pub curve: Box<Account<'info, CurveAccount>>,

    #[account(
        mut,
        seeds = [TOKEN_VAULT_SEED, curve.key().as_ref()],
        bump = curve.token_vault_bump,
        token::mint = meme_mint,
        token::authority = curve,
    )]
    pub token_vault: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [QUOTE_VAULT_SEED, curve.key().as_ref()],
        bump = curve.quote_vault_bump,
        token::mint = quote_mint,
        token::authority = curve,
    )]
    pub quote_vault: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [TREASURY_VAULT_SEED, curve.key().as_ref()],
        bump = curve.treasury_vault_bump,
        token::mint = target_equity_mint,
        token::authority = curve,
        token::token_program = equity_token_program,
    )]
    pub treasury_vault: Box<InterfaceAccount<'info, InterfaceTokenAccount>>,

    /// Existing DAMM v2 quote/target-equity pair. The program verifies its token pair and reserves.
    /// CHECK: DAMM v2 ownership is checked here; the DAMM v2 CPI validates pool state and vault links.
    #[account(mut, owner = cp_amm::ID)]
    pub equity_damm_v2_pool: UncheckedAccount<'info>,
    #[account(mut)]
    pub equity_reserve_a: Box<InterfaceAccount<'info, InterfaceTokenAccount>>,
    #[account(mut)]
    pub equity_reserve_b: Box<InterfaceAccount<'info, InterfaceTokenAccount>>,
    pub equity_token_a_mint: Box<InterfaceAccount<'info, InterfaceMint>>,
    pub equity_token_b_mint: Box<InterfaceAccount<'info, InterfaceMint>>,
    pub equity_token_a_program: Interface<'info, TokenInterface>,
    pub equity_token_b_program: Interface<'info, TokenInterface>,

    /// Temporary ATAs receive the pool's assets before DAMM v2 initializes its first position.
    /// CHECK: Associated-token constraints bind both token accounts to the caller and the supplied mints.
    #[account(
        mut,
        associated_token::mint = quote_mint,
        associated_token::authority = caller,
    )]
    pub caller_quote_account: Box<Account<'info, TokenAccount>>,
    /// CHECK: Associated-token constraints bind both token accounts to the caller and the supplied mints.
    #[account(
        mut,
        associated_token::mint = meme_mint,
        associated_token::authority = caller,
    )]
    pub caller_meme_account: Box<Account<'info, TokenAccount>>,

    /// The DAMM v2 customizable-pool PDA and its first LP position are created in this instruction.
    /// CHECK: The canonical PDA is checked against the published DAMM v2 seed scheme.
    #[account(mut)]
    pub damm_v2_pool: UncheckedAccount<'info>,
    /// A fresh keypair signer, minted as the first DAMM v2 position NFT for the curve PDA.
    #[account(mut)]
    pub position_nft_mint: Signer<'info>,
    /// CHECK: The canonical position NFT token account PDA is checked and created by DAMM v2.
    #[account(mut)]
    pub position_nft_account: UncheckedAccount<'info>,
    /// CHECK: The canonical position PDA is checked and created by DAMM v2.
    #[account(mut)]
    pub damm_v2_position: UncheckedAccount<'info>,
    /// CHECK: The canonical token-vault PDAs are checked and created by DAMM v2.
    #[account(mut)]
    pub damm_v2_quote_vault: UncheckedAccount<'info>,
    /// CHECK: The canonical token-vault PDAs are checked and created by DAMM v2.
    #[account(mut)]
    pub damm_v2_meme_vault: UncheckedAccount<'info>,

    /// CHECK: Canonical DAMM v2 pool-authority address.
    pub damm_v2_pool_authority: UncheckedAccount<'info>,
    /// CHECK: Canonical DAMM v2 event-authority PDA.
    pub damm_v2_event_authority: UncheckedAccount<'info>,
    pub damm_v2_program: Program<'info, cp_amm::program::CpAmm>,
    pub token_program: Program<'info, Token>,
    pub equity_token_program: Interface<'info, TokenInterface>,
    pub token_2022_program: Program<'info, Token2022>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,

    #[account(seeds = [SETTLEMENT_POLICY_SEED, quote_mint.key().as_ref(), target_equity_mint.key().as_ref()], bump = settlement_policy.bump)]
    pub settlement_policy: Account<'info, SettlementPolicy>,
}

#[inline(never)]
pub fn handle_graduate_and_execute_stock<'a, 'b, 'c, 'info>(
    mut ctx: Context<'a, 'b, 'c, 'info, GraduateAndExecuteStock<'info>>,
    params: GraduateParams,
) -> Result<()> {
    validate_pre_settlement(&ctx.accounts, &params)?;

    let quote_total = ctx.accounts.curve.real_quote_reserves;
    let quote_surplus = ctx.accounts.quote_vault.amount - quote_total;
    let equity_before = ctx.accounts.treasury_vault.amount;
    let (quote_for_equity, quote_for_liquidity) = split_settlement_quote(quote_total)?;
    let expected_pool_tokens = ctx
        .accounts
        .curve
        .real_token_reserves
        .checked_add(TOTAL_MEME_SUPPLY - SALE_SUPPLY)
        .ok_or(StreetfunError::MathOverflow)?;
    require!(
        expected_pool_tokens > 0,
        StreetfunError::InsufficientLiquidity
    );

    let token_surplus = ctx.accounts.token_vault.amount - expected_pool_tokens;
    crate::instructions::settlement_policy::validate_settlement_policy(
        &ctx.accounts.settlement_policy,
        ctx.accounts.equity_damm_v2_pool.key(),
        ctx.accounts.quote_mint.key(),
        ctx.accounts.target_equity_mint.key(),
        quote_for_equity,
        params.min_equity_tokens_expected,
        Clock::get()?.unix_timestamp,
    )?;
    let equity_acquired = perform_equity_swap(&mut ctx.accounts, quote_for_equity, &params)?;
    create_damm_v2_pool(
        &mut ctx.accounts,
        &params,
        quote_for_liquidity,
        expected_pool_tokens,
    )?;

    // Re-read the mint after both CPIs; graduation must never rely on a stale supply snapshot.
    ctx.accounts.meme_mint.reload()?;
    validate_meme_supply(
        ctx.accounts.curve.total_meme_supply,
        ctx.accounts.meme_mint.supply,
    )?;
    require!(
        ctx.accounts.quote_vault.amount == quote_surplus
            && ctx.accounts.token_vault.amount == token_surplus,
        StreetfunError::SettlementAmountsMismatch
    );
    require!(
        ctx.accounts
            .treasury_vault
            .amount
            .checked_sub(equity_before)
            == Some(equity_acquired),
        StreetfunError::SettlementAmountsMismatch
    );

    let now = Clock::get()?.unix_timestamp;
    let curve = &mut ctx.accounts.curve;
    curve.total_equity_locked = equity_acquired;
    curve.total_meme_supply = ctx.accounts.meme_mint.supply;
    curve.real_quote_reserves = 0;
    curve.real_token_reserves = 0;
    curve.meteora_damm_v2_pool = ctx.accounts.damm_v2_pool.key();
    curve.is_graduated = true;
    curve.graduated_at = now;

    let config = &mut ctx.accounts.global_config;
    config.total_equity_purchased = config
        .total_equity_purchased
        .checked_add(equity_acquired)
        .ok_or(StreetfunError::MathOverflow)?;
    config.total_graduated_tokens = config
        .total_graduated_tokens
        .checked_add(expected_pool_tokens)
        .ok_or(StreetfunError::MathOverflow)?;

    emit!(crate::GraduatedEvent {
        meme_mint: ctx.accounts.meme_mint.key(),
        target_equity_mint: ctx.accounts.target_equity_mint.key(),
        quote_for_equity,
        equity_locked: equity_acquired,
        quote_for_liquidity,
        meme_tokens_deposited: expected_pool_tokens,
        meteora_damm_v2_pool: ctx.accounts.damm_v2_pool.key(),
        timestamp: now,
    });
    msg!(
        "Graduation settled atomically: quote->equity={}, equity received={}, quote->DAMM v2={}, meme->DAMM v2={}, pool={}",
        quote_for_equity,
        equity_acquired,
        quote_for_liquidity,
        expected_pool_tokens,
        ctx.accounts.damm_v2_pool.key(),
    );
    Ok(())
}

#[inline(never)]
fn validate_pre_settlement(
    accounts: &GraduateAndExecuteStock,
    params: &GraduateParams,
) -> Result<()> {
    require!(
        !accounts.curve.is_graduated,
        StreetfunError::CurveAlreadyGraduated
    );
    require!(
        accounts.curve.real_quote_reserves >= accounts.global_config.graduation_threshold,
        StreetfunError::GraduationThresholdNotReached
    );
    require!(
        accounts.quote_vault.amount >= accounts.curve.real_quote_reserves,
        StreetfunError::SettlementAmountsMismatch
    );
    require!(
        accounts.curve.total_equity_locked == 0,
        StreetfunError::SettlementAmountsMismatch
    );
    require!(
        accounts.quote_mint.decimals == 6,
        StreetfunError::InvalidDammV2Pool
    );
    require!(
        accounts.meme_mint.decimals == 6,
        StreetfunError::SupplyInvariantViolation
    );
    validate_meme_supply(accounts.curve.total_meme_supply, accounts.meme_mint.supply)?;

    let expected_pool_tokens = accounts
        .curve
        .real_token_reserves
        .checked_add(TOTAL_MEME_SUPPLY - SALE_SUPPLY)
        .ok_or(StreetfunError::MathOverflow)?;
    require!(
        accounts.token_vault.amount >= expected_pool_tokens,
        StreetfunError::SupplyInvariantViolation
    );
    require!(
        params.min_equity_tokens_expected > 0,
        StreetfunError::ZeroAmount
    );
    require!(
        params.pool_liquidity > DAMM_V2_DEAD_LIQUIDITY
            && params.pool_sqrt_price >= DAMM_V2_MIN_SQRT_PRICE
            && params.pool_sqrt_price <= DAMM_V2_MAX_SQRT_PRICE,
        StreetfunError::InvalidDammV2Pool
    );
    require!(
        accounts.global_config.graduation_fee_bps > 0
            && accounts.global_config.graduation_fee_bps <= crate::state::MAX_FEE_BPS,
        StreetfunError::InvalidDammV2Pool
    );

    validate_market_pair(
        accounts.equity_token_a_mint.key(),
        accounts.equity_token_b_mint.key(),
        accounts.quote_mint.key(),
        accounts.target_equity_mint.key(),
        accounts.equity_reserve_a.mint,
        accounts.equity_reserve_b.mint,
    )?;
    require_keys_eq!(
        *accounts.equity_token_a_mint.to_account_info().owner,
        accounts.equity_token_a_program.key(),
        StreetfunError::InvalidTokenProgram
    );
    require_keys_eq!(
        *accounts.equity_token_b_mint.to_account_info().owner,
        accounts.equity_token_b_program.key(),
        StreetfunError::InvalidTokenProgram
    );
    validate_damm_v2_creation_accounts(accounts)?;
    Ok(())
}

#[inline(never)]
fn perform_equity_swap<'info>(
    accounts: &mut GraduateAndExecuteStock<'info>,
    quote_for_equity: u64,
    params: &GraduateParams,
) -> Result<u64> {
    let quote_before = accounts.quote_vault.amount;
    let equity_before = accounts.treasury_vault.amount;
    let meme_mint = accounts.meme_mint.key();
    let bump = [accounts.curve.curve_bump];
    let curve_seeds: &[&[u8]] = &[CURVE_SEED, meme_mint.as_ref(), &bump];

    cp_amm::cpi::swap2(
        CpiContext::new_with_signer(
            accounts.damm_v2_program.to_account_info(),
            cp_amm::cpi::accounts::Swap2 {
                pool_authority: accounts.damm_v2_pool_authority.to_account_info(),
                pool: accounts.equity_damm_v2_pool.to_account_info(),
                input_token_account: accounts.quote_vault.to_account_info(),
                output_token_account: accounts.treasury_vault.to_account_info(),
                token_a_vault: accounts.equity_reserve_a.to_account_info(),
                token_b_vault: accounts.equity_reserve_b.to_account_info(),
                token_a_mint: accounts.equity_token_a_mint.to_account_info(),
                token_b_mint: accounts.equity_token_b_mint.to_account_info(),
                payer: accounts.curve.to_account_info(),
                token_a_program: accounts.equity_token_a_program.to_account_info(),
                token_b_program: accounts.equity_token_b_program.to_account_info(),
                referral_token_account: None,
                event_authority: accounts.damm_v2_event_authority.to_account_info(),
                program: accounts.damm_v2_program.to_account_info(),
            },
            &[curve_seeds],
        ),
        cp_amm::types::SwapParameters2 {
            amount_0: quote_for_equity,
            amount_1: params.min_equity_tokens_expected,
            swap_mode: 0,
        },
    )?;

    accounts.quote_vault.reload()?;
    accounts.treasury_vault.reload()?;
    require!(
        quote_before.checked_sub(accounts.quote_vault.amount) == Some(quote_for_equity),
        StreetfunError::SettlementAmountsMismatch
    );
    let equity_acquired = accounts
        .treasury_vault
        .amount
        .checked_sub(equity_before)
        .ok_or(StreetfunError::SettlementAmountsMismatch)?;
    require!(
        equity_acquired >= params.min_equity_tokens_expected,
        StreetfunError::SlippageExceeded
    );
    Ok(equity_acquired)
}

#[inline(never)]
fn create_damm_v2_pool<'info>(
    accounts: &mut GraduateAndExecuteStock<'info>,
    params: &GraduateParams,
    quote_for_liquidity: u64,
    meme_tokens: u64,
) -> Result<()> {
    let curve_key = accounts.curve.key();
    let meme_mint = accounts.meme_mint.key();
    let caller_quote_before = accounts.caller_quote_account.amount;
    let caller_meme_before = accounts.caller_meme_account.amount;
    let bump = [accounts.curve.curve_bump];
    let curve_seeds: &[&[u8]] = &[CURVE_SEED, meme_mint.as_ref(), &bump];

    transfer_curve_tokens_to_payer(accounts, quote_for_liquidity, meme_tokens, &[curve_seeds])?;

    let pool_fees = damm_v2_pool_fees(accounts.global_config.graduation_fee_bps)?;
    let pool_params = cp_amm::types::InitializeCustomizablePoolParameters {
        pool_fees,
        sqrt_min_price: DAMM_V2_MIN_SQRT_PRICE,
        sqrt_max_price: DAMM_V2_MAX_SQRT_PRICE,
        has_alpha_vault: false,
        liquidity: params.pool_liquidity,
        sqrt_price: params.pool_sqrt_price,
        activation_type: 0,
        // BothToken mode deposits both sides as supplied. Compounding mode
        // rounds the meme-side liquidity down and leaves dust outside the pool.
        collect_fee_mode: 0,
        activation_point: None,
    };

    cp_amm::cpi::initialize_customizable_pool(
        CpiContext::new(
            accounts.damm_v2_program.to_account_info(),
            cp_amm::cpi::accounts::InitializeCustomizablePool {
                creator: accounts.curve.to_account_info(),
                position_nft_mint: accounts.position_nft_mint.to_account_info(),
                position_nft_account: accounts.position_nft_account.to_account_info(),
                payer: accounts.caller.to_account_info(),
                pool_authority: accounts.damm_v2_pool_authority.to_account_info(),
                pool: accounts.damm_v2_pool.to_account_info(),
                position: accounts.damm_v2_position.to_account_info(),
                token_a_mint: accounts.quote_mint.to_account_info(),
                token_b_mint: accounts.meme_mint.to_account_info(),
                token_a_vault: accounts.damm_v2_quote_vault.to_account_info(),
                token_b_vault: accounts.damm_v2_meme_vault.to_account_info(),
                payer_token_a: accounts.caller_quote_account.to_account_info(),
                payer_token_b: accounts.caller_meme_account.to_account_info(),
                token_a_program: accounts.token_program.to_account_info(),
                token_b_program: accounts.token_program.to_account_info(),
                token_2022_program: accounts.token_2022_program.to_account_info(),
                system_program: accounts.system_program.to_account_info(),
                event_authority: accounts.damm_v2_event_authority.to_account_info(),
                program: accounts.damm_v2_program.to_account_info(),
            },
        ),
        pool_params,
    )?;

    accounts.caller_quote_account.reload()?;
    accounts.caller_meme_account.reload()?;
    require!(
        accounts.caller_quote_account.amount == caller_quote_before
            && accounts.caller_meme_account.amount == caller_meme_before,
        StreetfunError::SettlementAmountsMismatch
    );

    let quote_vault = read_token_account(&accounts.damm_v2_quote_vault.to_account_info())?;
    let meme_vault = read_token_account(&accounts.damm_v2_meme_vault.to_account_info())?;
    require_keys_eq!(
        quote_vault.mint,
        accounts.quote_mint.key(),
        StreetfunError::InvalidDammV2Pool
    );
    require_keys_eq!(
        meme_vault.mint,
        accounts.meme_mint.key(),
        StreetfunError::InvalidDammV2Pool
    );
    require_keys_eq!(
        quote_vault.owner,
        CP_AMM_POOL_AUTHORITY,
        StreetfunError::InvalidDammV2Pool
    );
    require_keys_eq!(
        meme_vault.owner,
        CP_AMM_POOL_AUTHORITY,
        StreetfunError::InvalidDammV2Pool
    );
    require!(
        quote_vault.amount == quote_for_liquidity && meme_vault.amount == meme_tokens,
        StreetfunError::SettlementAmountsMismatch
    );

    // The DAMM v2 position NFT and its one-token account belong to the curve PDA;
    // the caller can pay rent but cannot take control of the graduated liquidity.
    let position_nft =
        read_interface_token_account(&accounts.position_nft_account.to_account_info())?;
    require_keys_eq!(
        position_nft.mint,
        accounts.position_nft_mint.key(),
        StreetfunError::InvalidDammV2Pool
    );
    require_keys_eq!(
        position_nft.owner,
        curve_key,
        StreetfunError::InvalidDammV2Pool
    );
    require!(position_nft.amount == 1, StreetfunError::InvalidDammV2Pool);
    Ok(())
}

#[inline(never)]
fn transfer_curve_tokens_to_payer<'info>(
    accounts: &mut GraduateAndExecuteStock<'info>,
    quote_amount: u64,
    meme_amount: u64,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    token::transfer_checked(
        CpiContext::new_with_signer(
            accounts.token_program.to_account_info(),
            TransferChecked {
                from: accounts.quote_vault.to_account_info(),
                mint: accounts.quote_mint.to_account_info(),
                to: accounts.caller_quote_account.to_account_info(),
                authority: accounts.curve.to_account_info(),
            },
            signer_seeds,
        ),
        quote_amount,
        accounts.quote_mint.decimals,
    )?;
    token::transfer_checked(
        CpiContext::new_with_signer(
            accounts.token_program.to_account_info(),
            TransferChecked {
                from: accounts.token_vault.to_account_info(),
                mint: accounts.meme_mint.to_account_info(),
                to: accounts.caller_meme_account.to_account_info(),
                authority: accounts.curve.to_account_info(),
            },
            signer_seeds,
        ),
        meme_amount,
        accounts.meme_mint.decimals,
    )?;
    accounts.quote_vault.reload()?;
    accounts.token_vault.reload()?;
    Ok(())
}

#[inline(never)]
fn validate_damm_v2_creation_accounts(accounts: &GraduateAndExecuteStock) -> Result<()> {
    let quote = accounts.quote_mint.key();
    let meme = accounts.meme_mint.key();
    let (max_mint, min_mint) = if quote.to_bytes() > meme.to_bytes() {
        (quote, meme)
    } else {
        (meme, quote)
    };
    let expected_pool = Pubkey::find_program_address(
        &[
            DAMM_V2_CUSTOM_POOL_SEED,
            max_mint.as_ref(),
            min_mint.as_ref(),
        ],
        &cp_amm::ID,
    )
    .0;
    let expected_position = Pubkey::find_program_address(
        &[
            DAMM_V2_POSITION_SEED,
            accounts.position_nft_mint.key().as_ref(),
        ],
        &cp_amm::ID,
    )
    .0;
    let expected_position_nft_account = Pubkey::find_program_address(
        &[
            DAMM_V2_POSITION_NFT_ACCOUNT_SEED,
            accounts.position_nft_mint.key().as_ref(),
        ],
        &cp_amm::ID,
    )
    .0;
    let expected_quote_vault = Pubkey::find_program_address(
        &[
            DAMM_V2_TOKEN_VAULT_SEED,
            quote.as_ref(),
            expected_pool.as_ref(),
        ],
        &cp_amm::ID,
    )
    .0;
    let expected_meme_vault = Pubkey::find_program_address(
        &[
            DAMM_V2_TOKEN_VAULT_SEED,
            meme.as_ref(),
            expected_pool.as_ref(),
        ],
        &cp_amm::ID,
    )
    .0;
    let event_authority =
        Pubkey::find_program_address(&[CP_AMM_EVENT_AUTHORITY_SEED], &cp_amm::ID).0;

    require_keys_eq!(
        accounts.damm_v2_pool.key(),
        expected_pool,
        StreetfunError::InvalidDammV2Pool
    );
    require_keys_eq!(
        accounts.damm_v2_position.key(),
        expected_position,
        StreetfunError::InvalidDammV2Pool
    );
    require_keys_eq!(
        accounts.position_nft_account.key(),
        expected_position_nft_account,
        StreetfunError::InvalidDammV2Pool
    );
    require_keys_eq!(
        accounts.damm_v2_quote_vault.key(),
        expected_quote_vault,
        StreetfunError::InvalidDammV2Pool
    );
    require_keys_eq!(
        accounts.damm_v2_meme_vault.key(),
        expected_meme_vault,
        StreetfunError::InvalidDammV2Pool
    );
    require_keys_eq!(
        accounts.damm_v2_pool_authority.key(),
        CP_AMM_POOL_AUTHORITY,
        StreetfunError::InvalidDammV2Pool
    );
    require_keys_eq!(
        accounts.damm_v2_event_authority.key(),
        event_authority,
        StreetfunError::InvalidDammV2Pool
    );
    require_keys_eq!(
        accounts.damm_v2_program.key(),
        cp_amm::ID,
        StreetfunError::InvalidDammV2Pool
    );

    // A customizable pool is unique to a mint pair and can only be created once.
    require_keys_eq!(
        *accounts.damm_v2_pool.owner,
        System::id(),
        StreetfunError::InvalidDammV2Pool
    );
    require_keys_eq!(
        *accounts.damm_v2_position.owner,
        System::id(),
        StreetfunError::InvalidDammV2Pool
    );
    require_keys_eq!(
        *accounts.position_nft_account.owner,
        System::id(),
        StreetfunError::InvalidDammV2Pool
    );
    require_keys_eq!(
        *accounts.damm_v2_quote_vault.owner,
        System::id(),
        StreetfunError::InvalidDammV2Pool
    );
    require_keys_eq!(
        *accounts.damm_v2_meme_vault.owner,
        System::id(),
        StreetfunError::InvalidDammV2Pool
    );
    Ok(())
}

fn read_token_account(account: &AccountInfo) -> Result<TokenAccount> {
    require_keys_eq!(
        *account.owner,
        Token::id(),
        StreetfunError::InvalidDammV2Pool
    );
    let data = account.try_borrow_data()?;
    TokenAccount::try_deserialize(&mut &data[..]).map_err(Into::into)
}

fn read_interface_token_account(account: &AccountInfo) -> Result<InterfaceTokenAccount> {
    let data = account.try_borrow_data()?;
    InterfaceTokenAccount::try_deserialize(&mut &data[..]).map_err(Into::into)
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

fn damm_v2_pool_fees(graduation_fee_bps: u16) -> Result<cp_amm::types::PoolFeeParameters> {
    require!(
        graduation_fee_bps > 0 && graduation_fee_bps <= crate::state::MAX_FEE_BPS,
        StreetfunError::InvalidDammV2Pool
    );
    // DAMM v2 Borsh BaseFeeParameters is 27 bytes:
    // cliff_fee_numerator:u64, number_of_period:u16, period_frequency:u64,
    // reduction_factor:u64, base_fee_mode:u8. Zero schedule values make the
    // configured graduation fee static. The config is admin-controlled on-chain.
    let numerator = u64::from(graduation_fee_bps)
        .checked_mul(100_000)
        .ok_or(StreetfunError::MathOverflow)?;
    let mut base_fee_data = [0_u8; 27];
    base_fee_data[..8].copy_from_slice(&numerator.to_le_bytes());
    base_fee_data[26] = 0; // FeeTimeSchedulerLinear, static when all schedule fields are zero.
    Ok(cp_amm::types::PoolFeeParameters {
        base_fee: cp_amm::types::BaseFeeParameters {
            data: base_fee_data,
        },
        // BothToken mode collects fees on both assets; compounding fees are not used.
        compounding_fee_bps: 0,
        padding: 0,
        dynamic_fee: None,
    })
}

fn split_settlement_quote(total: u64) -> Result<(u64, u64)> {
    let quote_for_equity = total / 2;
    let quote_for_liquidity = total
        .checked_sub(quote_for_equity)
        .ok_or(StreetfunError::MathOverflow)?;
    require!(
        quote_for_equity > 0 && quote_for_liquidity > 0,
        StreetfunError::InsufficientQuoteReserves
    );
    Ok((quote_for_equity, quote_for_liquidity))
}

fn validate_meme_supply(recorded_supply: u64, live_mint_supply: u64) -> Result<()> {
    require!(
        recorded_supply == TOTAL_MEME_SUPPLY
            && live_mint_supply > 0
            && live_mint_supply <= recorded_supply,
        StreetfunError::SupplyInvariantViolation
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_matching_recorded_and_live_mint_supply() {
        assert!(validate_meme_supply(TOTAL_MEME_SUPPLY, TOTAL_MEME_SUPPLY).is_ok());
    }

    #[test]
    fn accepts_external_burns_but_rejects_supply_inflation() {
        assert!(validate_meme_supply(TOTAL_MEME_SUPPLY, TOTAL_MEME_SUPPLY - 1).is_ok());
        assert!(validate_meme_supply(TOTAL_MEME_SUPPLY, TOTAL_MEME_SUPPLY + 1).is_err());
    }

    #[test]
    fn rejects_noncanonical_recorded_supply_even_when_mint_matches() {
        assert!(validate_meme_supply(TOTAL_MEME_SUPPLY - 1, TOTAL_MEME_SUPPLY - 1).is_err());
    }

    #[test]
    fn validates_only_quote_target_or_quote_meme_damm_v2_pairs() {
        let quote = Pubkey::new_unique();
        let target = Pubkey::new_unique();
        let x = Pubkey::new_unique();
        let y = Pubkey::new_unique();
        assert!(validate_market_pair(quote, target, quote, target, quote, target).is_ok());
        assert!(validate_market_pair(target, quote, quote, target, target, quote).is_ok());
        assert!(validate_market_pair(quote, x, quote, target, quote, x).is_err());
        assert!(validate_market_pair(quote, target, quote, target, quote, y).is_err());
    }

    #[test]
    fn both_token_graduation_pool_does_not_configure_compounding_fees() {
        let fees = damm_v2_pool_fees(150).unwrap();
        assert_eq!(fees.compounding_fee_bps, 0);
        assert!(damm_v2_pool_fees(0).is_err());
        assert!(damm_v2_pool_fees(crate::state::MAX_FEE_BPS + 1).is_err());
    }

    #[test]
    fn splits_quote_budget_evenly_and_assigns_odd_atom_deterministically() {
        assert_eq!(split_settlement_quote(100).unwrap(), (50, 50));
        assert_eq!(split_settlement_quote(101).unwrap(), (50, 51));
        assert!(split_settlement_quote(1).is_err());
    }
}

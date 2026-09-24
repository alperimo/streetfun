use crate::state::{
    CurveAccount, GlobalConfig, CURVE_SEED, GLOBAL_CONFIG_SEED, QUOTE_VAULT_SEED,
    TOKEN_VAULT_SEED, TREASURY_VAULT_SEED,
};
use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::spl_token::instruction::AuthorityType;
use anchor_spl::token::{self, Mint, MintTo, SetAuthority, Token, TokenAccount};

pub const TOTAL_MEME_SUPPLY: u64 = 1_000_000_000_000_000; // 1 Billion tokens with 6 decimals
pub const SALE_SUPPLY: u64 = 800_000_000_000_000; // 800M for bonding curve, 200M reserved for Meteora DLMM liquidity

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct LaunchStonkParams {
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub meteora_dbc_pool: Option<Pubkey>,
}

#[derive(Accounts)]
pub struct LaunchStonk<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        seeds = [GLOBAL_CONFIG_SEED],
        bump = global_config.bump,
    )]
    pub global_config: Account<'info, GlobalConfig>,

    #[account(
        init,
        payer = creator,
        mint::decimals = 6,
        mint::authority = curve,
        mint::freeze_authority = curve,
    )]
    pub meme_mint: Account<'info, Mint>,

    /// SPL Token or Token-2022 mint of the target equity (e.g. OpenAI, SpaceX, Kalshi)
    pub target_equity_mint: InterfaceAccount<'info, anchor_spl::token_interface::Mint>,

    #[account(
        init,
        payer = creator,
        space = 8 + CurveAccount::INIT_SPACE,
        seeds = [CURVE_SEED, meme_mint.key().as_ref()],
        bump
    )]
    pub curve: Account<'info, CurveAccount>,

    #[account(
        init,
        payer = creator,
        seeds = [TOKEN_VAULT_SEED, curve.key().as_ref()],
        bump,
        token::mint = meme_mint,
        token::authority = curve,
    )]
    pub token_vault: Account<'info, TokenAccount>,

    /// Quote token mint (e.g. USDC)
    pub quote_mint: Account<'info, Mint>,

    #[account(
        init,
        payer = creator,
        seeds = [QUOTE_VAULT_SEED, curve.key().as_ref()],
        bump,
        token::mint = quote_mint,
        token::authority = curve,
    )]
    pub quote_vault: Account<'info, TokenAccount>,

    #[account(
        init,
        payer = creator,
        seeds = [TREASURY_VAULT_SEED, curve.key().as_ref()],
        bump,
        token::mint = target_equity_mint,
        token::authority = curve,
        token::token_program = token_program,
    )]
    pub treasury_vault: InterfaceAccount<'info, anchor_spl::token_interface::TokenAccount>,

    pub token_program: Interface<'info, anchor_spl::token_interface::TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handle_launch_stonk(
    ctx: Context<LaunchStonk>,
    params: LaunchStonkParams,
) -> Result<()> {
    require!(ctx.accounts.quote_mint.decimals == 6, crate::errors::StreetfunError::CalculationError);
    require!(params.name.len() <= 64 && params.symbol.len() <= 16 && params.uri.len() <= 256, crate::errors::StreetfunError::CalculationError);
    require!(params.meteora_dbc_pool.is_none(), crate::errors::StreetfunError::SettlementUnavailable);
    let curve_key = ctx.accounts.curve.key();
    let meme_mint_key = ctx.accounts.meme_mint.key();
    let curve_seeds: &[&[u8]] = &[
        CURVE_SEED,
        meme_mint_key.as_ref(),
        &[ctx.bumps.curve],
    ];
    let signer_seeds = &[curve_seeds];

    // Mint the fixed 1 Billion supply directly to the token vault
    token::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            MintTo {
                mint: ctx.accounts.meme_mint.to_account_info(),
                to: ctx.accounts.token_vault.to_account_info(),
                authority: ctx.accounts.curve.to_account_info(),
            },
            signer_seeds,
        ),
        TOTAL_MEME_SUPPLY,
    )?;

    // Revoke mint authority to guarantee fixed supply
    token::set_authority(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            SetAuthority {
                current_authority: ctx.accounts.curve.to_account_info(),
                account_or_mint: ctx.accounts.meme_mint.to_account_info(),
            },
            signer_seeds,
        ),
        AuthorityType::MintTokens,
        None,
    )?;

    let curve = &mut ctx.accounts.curve;
    curve.creator = ctx.accounts.creator.key();
    curve.meme_mint = ctx.accounts.meme_mint.key();
    curve.target_equity_mint = ctx.accounts.target_equity_mint.key();
    curve.meteora_dbc_pool = params.meteora_dbc_pool.unwrap_or(Pubkey::default());
    curve.virtual_quote_reserves = ctx.accounts.global_config.initial_virtual_quote_reserves;
    curve.virtual_token_reserves = ctx.accounts.global_config.initial_virtual_token_reserves;
    curve.real_quote_reserves = 0;
    curve.real_token_reserves = SALE_SUPPLY;
    curve.total_meme_supply = TOTAL_MEME_SUPPLY;
    curve.total_equity_locked = 0;
    curve.is_graduated = false;
    curve.graduated_at = 0;
    curve.curve_bump = ctx.bumps.curve;
    curve.token_vault_bump = ctx.bumps.token_vault;
    curve.quote_vault_bump = ctx.bumps.quote_vault;
    curve.treasury_vault_bump = ctx.bumps.treasury_vault;

    msg!(
        "Stonk launched. Curve: {}, Meme Mint: {}, Target Equity: {}",
        curve_key,
        curve.meme_mint,
        curve.target_equity_mint
    );

    Ok(())
}

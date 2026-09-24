use crate::errors::StreetfunError;
use crate::state::{
    CurveAccount, GlobalConfig, CURVE_SEED, GLOBAL_CONFIG_SEED, QUOTE_VAULT_SEED,
    TOKEN_VAULT_SEED, TREASURY_VAULT_SEED,
};
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct GraduateParams {
    pub min_equity_tokens_expected: u64,
}

#[derive(Accounts)]
pub struct GraduateAndExecuteStock<'info> {
    #[account(mut)]
    pub caller: Signer<'info>,

    #[account(
        mut,
        seeds = [GLOBAL_CONFIG_SEED],
        bump = global_config.bump,
    )]
    pub global_config: Box<Account<'info, GlobalConfig>>,

    pub meme_mint: Account<'info, Mint>,

    /// SPL Token mint of the target equity (e.g., $SPCX, $NVDA)
    pub target_equity_mint: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [CURVE_SEED, meme_mint.key().as_ref()],
        bump = curve.curve_bump,
        constraint = curve.target_equity_mint == target_equity_mint.key() @ StreetfunError::InvalidEquityMint,
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
        token::authority = curve,
    )]
    pub quote_vault: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        seeds = [TREASURY_VAULT_SEED, curve.key().as_ref()],
        bump = curve.treasury_vault_bump,
        token::mint = target_equity_mint,
        token::authority = curve,
    )]
    pub treasury_vault: Box<Account<'info, TokenAccount>>,

    /// Destination account receiving the 50% USDC equity purchase budget (e.g., Jupiter swap / broker vault)
    #[account(
        mut,
        token::mint = quote_vault.mint,
        constraint = equity_purchase_account.key() != quote_vault.key() @ StreetfunError::CurveVaultMismatch,
    )]
    pub equity_purchase_account: Box<Account<'info, TokenAccount>>,

    /// Source account providing the tokenized equity shares into the treasury vault
    #[account(
        mut,
        token::mint = target_equity_mint,
    )]
    pub equity_source_account: Box<Account<'info, TokenAccount>>,

    /// CHECK: Authority for equity_source_account (caller or swap program authority)
    pub equity_source_authority: Signer<'info>,

    /// Destination account receiving the 50% USDC AMM liquidity budget
    #[account(
        mut,
        token::mint = quote_vault.mint,
        constraint = amm_quote_destination.key() != quote_vault.key() @ StreetfunError::CurveVaultMismatch,
    )]
    pub amm_quote_destination: Box<Account<'info, TokenAccount>>,

    /// Destination account receiving remaining meme tokens for AMM pool creation
    #[account(
        mut,
        token::mint = meme_mint,
        constraint = amm_token_destination.key() != token_vault.key() @ StreetfunError::CurveVaultMismatch,
    )]
    pub amm_token_destination: Box<Account<'info, TokenAccount>>,

    pub token_program: Program<'info, Token>,
}

pub fn handle_graduate_and_execute_stock(
    _ctx: Context<GraduateAndExecuteStock>,
    _params: GraduateParams,
) -> Result<()> {
    // The previous implementation transferred reserves to caller-provided accounts
    // without executing a purchase or creating a pool. No settlement is valid
    // until those operations and destination/LP ownership checks are atomic CPIs.
    err!(StreetfunError::SettlementUnavailable)
}

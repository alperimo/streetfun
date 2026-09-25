use crate::errors::StreetfunError;
use crate::instructions::launch::TOTAL_MEME_SUPPLY;
use crate::state::{
    CurveAccount, GlobalConfig, CURVE_SEED, GLOBAL_CONFIG_SEED, QUOTE_VAULT_SEED, TOKEN_VAULT_SEED,
    TREASURY_VAULT_SEED,
};
use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct GraduateParams {
    pub min_equity_tokens_expected: u64,
}

#[derive(Accounts)]
pub struct GraduateAndExecuteStock<'info> {
    /// Permissionless finalizer. This signer grants no authority.
    #[account(mut)]
    pub caller: Signer<'info>,

    #[account(
        mut,
        seeds = [GLOBAL_CONFIG_SEED],
        bump = global_config.bump,
    )]
    pub global_config: Box<Account<'info, GlobalConfig>>,

    pub meme_mint: Account<'info, Mint>,

    /// SPL or Token-2022 mint of the target equity (e.g., $SPCX, $NVDA, OpenAI)
    pub target_equity_mint: InterfaceAccount<'info, anchor_spl::token_interface::Mint>,

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
        token::token_program = equity_token_program,
    )]
    pub treasury_vault: Box<InterfaceAccount<'info, anchor_spl::token_interface::TokenAccount>>,

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
        token::token_program = equity_token_program,
    )]
    pub equity_source_account:
        Box<InterfaceAccount<'info, anchor_spl::token_interface::TokenAccount>>,

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
    pub equity_token_program: Interface<'info, anchor_spl::token_interface::TokenInterface>,
}

/// The old settlement only sent quote and meme tokens to arbitrary destinations.
/// It did not execute a Tessera acquisition or create/verify Meteora liquidity.
/// Keep the on-chain instruction closed until both legs are atomic and verifiable.
pub fn handle_graduate_and_execute_stock<'a, 'b, 'c, 'info>(
    ctx: Context<'a, 'b, 'c, 'info, GraduateAndExecuteStock<'info>>,
    _params: GraduateParams,
) -> Result<()> {
    let curve = &ctx.accounts.curve;

    require!(!curve.is_graduated, StreetfunError::CurveAlreadyGraduated);
    require!(
        curve.real_quote_reserves >= ctx.accounts.global_config.graduation_threshold,
        StreetfunError::GraduationThresholdNotReached
    );
    validate_meme_supply(curve.total_meme_supply, ctx.accounts.meme_mint.supply)?;

    // Keep finalization closed until the instruction can verify the Tessera
    // acquisition and actual Meteora DLMM pool atomically. The checks above
    // are still enforced so callers cannot bypass the graduation invariants.
    Err(StreetfunError::SettlementUnavailable.into())
}

fn validate_meme_supply(recorded_supply: u64, live_mint_supply: u64) -> Result<()> {
    require!(
        recorded_supply == TOTAL_MEME_SUPPLY && live_mint_supply == recorded_supply,
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
    fn rejects_live_mint_supply_mismatch() {
        assert!(validate_meme_supply(TOTAL_MEME_SUPPLY, TOTAL_MEME_SUPPLY - 1).is_err());
    }

    #[test]
    fn rejects_noncanonical_recorded_supply_even_when_mint_matches() {
        assert!(validate_meme_supply(TOTAL_MEME_SUPPLY - 1, TOTAL_MEME_SUPPLY - 1).is_err());
    }
}

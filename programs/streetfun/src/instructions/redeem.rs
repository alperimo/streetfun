use crate::errors::StreetfunError;
use crate::math::calculate_pro_rata_equity;
use crate::state::{CurveAccount, CURVE_SEED, TREASURY_VAULT_SEED};
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Burn, Mint, Token, TokenAccount, Transfer};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct BurnAndRedeemParams {
    pub meme_tokens_to_burn: u64,
    pub min_equity_tokens_out: u64,
}

#[derive(Accounts)]
pub struct BurnAndRedeem<'info> {
    #[account(mut)]
    pub redeemer: Signer<'info>,

    #[account(mut)]
    pub meme_mint: Account<'info, Mint>,

    /// SPL Token mint of the target equity (e.g. $SPCX)
    pub target_equity_mint: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [CURVE_SEED, meme_mint.key().as_ref()],
        bump = curve.curve_bump,
        constraint = curve.is_graduated @ StreetfunError::CurveNotGraduated,
        constraint = curve.target_equity_mint == target_equity_mint.key() @ StreetfunError::InvalidEquityMint,
    )]
    pub curve: Account<'info, CurveAccount>,

    #[account(
        mut,
        seeds = [TREASURY_VAULT_SEED, curve.key().as_ref()],
        bump = curve.treasury_vault_bump,
        token::mint = target_equity_mint,
        token::authority = curve,
    )]
    pub treasury_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = meme_mint,
        token::authority = redeemer,
    )]
    pub redeemer_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = target_equity_mint,
        token::authority = redeemer,
    )]
    pub redeemer_equity_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handle_burn_and_redeem(
    ctx: Context<BurnAndRedeem>,
    params: BurnAndRedeemParams,
) -> Result<()> {
    if params.meme_tokens_to_burn == 0 {
        return Err(StreetfunError::ZeroAmount.into());
    }

    let curve = &mut ctx.accounts.curve;

    let entitled_shares = calculate_pro_rata_equity(
        params.meme_tokens_to_burn,
        curve.total_meme_supply,
        curve.total_equity_locked,
    )?;

    if entitled_shares == 0 {
        return Err(StreetfunError::InsufficientLiquidity.into());
    }

    if entitled_shares < params.min_equity_tokens_out {
        return Err(StreetfunError::SlippageExceeded.into());
    }

    // 1. Burn user's meme tokens permanently
    token::burn(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Burn {
                mint: ctx.accounts.meme_mint.to_account_info(),
                from: ctx.accounts.redeemer_token_account.to_account_info(),
                authority: ctx.accounts.redeemer.to_account_info(),
            },
        ),
        params.meme_tokens_to_burn,
    )?;

    // 2. Transfer pro-rata tokenized equity from Treasury Vault to redeemer
    let meme_mint_key = ctx.accounts.meme_mint.key();
    let curve_seeds: &[&[u8]] = &[
        CURVE_SEED,
        meme_mint_key.as_ref(),
        &[curve.curve_bump],
    ];
    let signer_seeds = &[curve_seeds];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.treasury_vault.to_account_info(),
                to: ctx.accounts.redeemer_equity_account.to_account_info(),
                authority: curve.to_account_info(),
            },
            signer_seeds,
        ),
        entitled_shares,
    )?;

    // 3. Update curve supply and remaining locked equity
    curve.total_meme_supply = curve
        .total_meme_supply
        .checked_sub(params.meme_tokens_to_burn)
        .ok_or(StreetfunError::MathOverflow)?;
    curve.total_equity_locked = curve
        .total_equity_locked
        .checked_sub(entitled_shares)
        .ok_or(StreetfunError::MathOverflow)?;

    msg!(
        "Burn and redeem completed. Burned: {}, Redeemed Shares: {}, Remaining Locked: {}",
        params.meme_tokens_to_burn,
        entitled_shares,
        curve.total_equity_locked
    );

    Ok(())
}

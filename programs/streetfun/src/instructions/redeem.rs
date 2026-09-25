use crate::errors::StreetfunError;
use crate::math::calculate_pro_rata_equity;
use crate::state::{CurveAccount, CURVE_SEED, TREASURY_VAULT_SEED};
use anchor_lang::prelude::*;
use anchor_spl::token::{Burn, Mint, Token, TokenAccount};
use anchor_spl::token_interface::{
    self, Mint as InterfaceMint, TokenAccount as InterfaceTokenAccount, TokenInterface,
    TransferChecked,
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct BurnAndRedeemParams {
    pub meme_tokens_to_burn: u64,
    /// Minimum spendable equity tokens the redeemer must receive after any Token-2022 fee.
    pub min_equity_tokens_out: u64,
}

#[derive(Accounts)]
pub struct BurnAndRedeem<'info> {
    #[account(mut)]
    pub redeemer: Signer<'info>,

    #[account(mut)]
    pub meme_mint: Account<'info, Mint>,

    /// SPL or Token-2022 mint of the target equity (e.g. OpenAI, SpaceX, Kalshi)
    pub target_equity_mint: InterfaceAccount<'info, InterfaceMint>,

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
        token::token_program = equity_token_program,
    )]
    pub treasury_vault: InterfaceAccount<'info, InterfaceTokenAccount>,

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
        token::token_program = equity_token_program,
    )]
    pub redeemer_equity_account: InterfaceAccount<'info, InterfaceTokenAccount>,

    pub token_program: Program<'info, Token>,
    pub equity_token_program: Interface<'info, TokenInterface>,
}

pub fn handle_burn_and_redeem<'a, 'b, 'c, 'info>(
    ctx: Context<'a, 'b, 'c, 'info, BurnAndRedeem<'info>>,
    params: BurnAndRedeemParams,
) -> Result<()> {
    if params.meme_tokens_to_burn == 0 {
        return Err(StreetfunError::ZeroAmount.into());
    }

    let curve = &mut ctx.accounts.curve;

    let entitled_shares = calculate_pro_rata_equity(
        params.meme_tokens_to_burn,
        ctx.accounts.meme_mint.supply,
        curve.total_equity_locked,
    )?;

    if entitled_shares == 0 {
        return Err(StreetfunError::InsufficientLiquidity.into());
    }

    require!(
        entitled_shares <= ctx.accounts.treasury_vault.amount,
        StreetfunError::InsufficientLiquidity
    );
    let redeemer_equity_before = ctx.accounts.redeemer_equity_account.amount;

    // 1. Burn user's meme tokens permanently
    anchor_spl::token::burn(
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
    let curve_seeds: &[&[u8]] = &[CURVE_SEED, meme_mint_key.as_ref(), &[curve.curve_bump]];
    let signer_seeds = &[curve_seeds];

    token_interface::transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.equity_token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.treasury_vault.to_account_info(),
                mint: ctx.accounts.target_equity_mint.to_account_info(),
                to: ctx.accounts.redeemer_equity_account.to_account_info(),
                authority: curve.to_account_info(),
            },
            signer_seeds,
        ),
        entitled_shares,
        ctx.accounts.target_equity_mint.decimals,
    )?;
    ctx.accounts.redeemer_equity_account.reload()?;
    let equity_received = ctx
        .accounts
        .redeemer_equity_account
        .amount
        .checked_sub(redeemer_equity_before)
        .ok_or(StreetfunError::SettlementAmountsMismatch)?;
    require!(
        equity_received >= params.min_equity_tokens_out,
        StreetfunError::SlippageExceeded
    );

    // 3. Update curve supply and remaining locked equity
    curve.total_meme_supply = ctx
        .accounts
        .meme_mint
        .supply
        .checked_sub(params.meme_tokens_to_burn)
        .ok_or(StreetfunError::MathOverflow)?;
    curve.total_equity_locked = curve
        .total_equity_locked
        .checked_sub(entitled_shares)
        .ok_or(StreetfunError::MathOverflow)?;

    msg!(
        "Burn and redeem completed. Burned: {}, Redeemed Shares: {}, Remaining Locked: {}",
        params.meme_tokens_to_burn,
        equity_received,
        curve.total_equity_locked
    );

    Ok(())
}

use crate::errors::StreetfunError;
use crate::math::calculate_pro_rata_equity;
use crate::state::{
    CurveAccount, DbcLaunchAccount, CURVE_SEED, DBC_LAUNCH_SEED, TREASURY_VAULT_SEED,
};
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

#[derive(Accounts)]
pub struct BurnAndRedeemDbc<'info> {
    #[account(mut)]
    pub redeemer: Signer<'info>,

    #[account(mut)]
    pub meme_mint: Account<'info, Mint>,

    pub target_equity_mint: InterfaceAccount<'info, InterfaceMint>,

    #[account(
        mut,
        seeds = [DBC_LAUNCH_SEED, meme_mint.key().as_ref()],
        bump = dbc_launch.bump,
        constraint = dbc_launch.is_graduated @ StreetfunError::CurveNotGraduated,
        constraint = dbc_launch.meme_mint == meme_mint.key() @ StreetfunError::InvalidDammV2Pool,
        constraint = dbc_launch.target_equity_mint == target_equity_mint.key() @ StreetfunError::InvalidEquityMint,
    )]
    pub dbc_launch: Account<'info, DbcLaunchAccount>,

    #[account(
        mut,
        associated_token::mint = target_equity_mint,
        associated_token::authority = dbc_launch,
        associated_token::token_program = equity_token_program,
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

pub fn handle_burn_and_redeem_dbc(
    ctx: Context<BurnAndRedeemDbc>,
    params: BurnAndRedeemParams,
) -> Result<()> {
    require!(params.meme_tokens_to_burn > 0, StreetfunError::ZeroAmount);
    require!(
        ctx.accounts.meme_mint.supply > 0,
        StreetfunError::InsufficientLiquidity
    );

    let launch = &mut ctx.accounts.dbc_launch;
    let entitled_shares = calculate_pro_rata_equity(
        params.meme_tokens_to_burn,
        ctx.accounts.meme_mint.supply,
        launch.total_equity_locked,
    )?;
    require!(entitled_shares > 0, StreetfunError::InsufficientLiquidity);
    require!(
        entitled_shares <= ctx.accounts.treasury_vault.amount,
        StreetfunError::InsufficientLiquidity
    );

    let equity_before = ctx.accounts.redeemer_equity_account.amount;
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

    let meme_mint_key = ctx.accounts.meme_mint.key();
    let bump = [launch.bump];
    let signer_seeds: &[&[&[u8]]] = &[&[DBC_LAUNCH_SEED, meme_mint_key.as_ref(), &bump]];
    token_interface::transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.equity_token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.treasury_vault.to_account_info(),
                mint: ctx.accounts.target_equity_mint.to_account_info(),
                to: ctx.accounts.redeemer_equity_account.to_account_info(),
                authority: launch.to_account_info(),
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
        .checked_sub(equity_before)
        .ok_or(StreetfunError::SettlementAmountsMismatch)?;
    require!(
        equity_received >= params.min_equity_tokens_out,
        StreetfunError::SlippageExceeded
    );
    launch.total_equity_locked = launch
        .total_equity_locked
        .checked_sub(entitled_shares)
        .ok_or(StreetfunError::MathOverflow)?;

    emit!(crate::RedeemedEvent {
        redeemer: ctx.accounts.redeemer.key(),
        meme_mint: meme_mint_key,
        target_equity_mint: ctx.accounts.target_equity_mint.key(),
        meme_burned: params.meme_tokens_to_burn,
        equity_redeemed: equity_received,
        remaining_equity: launch.total_equity_locked,
        timestamp: Clock::get()?.unix_timestamp,
    });
    Ok(())
}

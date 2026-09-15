use crate::errors::StreetfunError;
use crate::state::{
    CurveAccount, GlobalConfig, CURVE_SEED, GLOBAL_CONFIG_SEED, QUOTE_VAULT_SEED,
    TOKEN_VAULT_SEED, TREASURY_VAULT_SEED,
};
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

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
    pub global_config: Account<'info, GlobalConfig>,

    pub meme_mint: Account<'info, Mint>,

    /// SPL Token mint of the target equity (e.g., $SPCX, $NVDA)
    pub target_equity_mint: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [CURVE_SEED, meme_mint.key().as_ref()],
        bump = curve.curve_bump,
        constraint = curve.target_equity_mint == target_equity_mint.key() @ StreetfunError::InvalidEquityMint,
    )]
    pub curve: Account<'info, CurveAccount>,

    #[account(
        mut,
        seeds = [TOKEN_VAULT_SEED, curve.key().as_ref()],
        bump = curve.token_vault_bump,
        token::mint = meme_mint,
        token::authority = curve,
    )]
    pub token_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [QUOTE_VAULT_SEED, curve.key().as_ref()],
        bump = curve.quote_vault_bump,
        token::authority = curve,
    )]
    pub quote_vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [TREASURY_VAULT_SEED, curve.key().as_ref()],
        bump = curve.treasury_vault_bump,
        token::mint = target_equity_mint,
        token::authority = curve,
    )]
    pub treasury_vault: Account<'info, TokenAccount>,

    /// Destination account receiving the 50% USDC equity purchase budget (e.g., Jupiter swap / broker vault)
    #[account(
        mut,
        token::mint = quote_vault.mint,
    )]
    pub equity_purchase_account: Account<'info, TokenAccount>,

    /// Source account providing the tokenized equity shares into the treasury vault
    #[account(
        mut,
        token::mint = target_equity_mint,
    )]
    pub equity_source_account: Account<'info, TokenAccount>,

    /// CHECK: Authority for equity_source_account (caller or swap program authority)
    pub equity_source_authority: Signer<'info>,

    /// Destination account receiving the 50% USDC AMM liquidity budget
    #[account(
        mut,
        token::mint = quote_vault.mint,
    )]
    pub amm_quote_destination: Account<'info, TokenAccount>,

    /// Destination account receiving remaining meme tokens for AMM pool creation
    #[account(
        mut,
        token::mint = meme_mint,
    )]
    pub amm_token_destination: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handle_graduate_and_execute_stock(
    ctx: Context<GraduateAndExecuteStock>,
    params: GraduateParams,
) -> Result<()> {
    let curve = &mut ctx.accounts.curve;

    if curve.is_graduated {
        return Err(StreetfunError::CurveAlreadyGraduated.into());
    }

    if curve.real_quote_reserves < ctx.accounts.global_config.graduation_threshold {
        return Err(StreetfunError::GraduationThresholdNotReached.into());
    }

    let total_reserves = curve.real_quote_reserves;
    let quote_for_equity = total_reserves
        .checked_div(2)
        .ok_or(StreetfunError::MathOverflow)?;
    let quote_for_liquidity = total_reserves
        .checked_sub(quote_for_equity)
        .ok_or(StreetfunError::MathOverflow)?;

    let meme_mint_key = ctx.accounts.meme_mint.key();
    let curve_seeds: &[&[u8]] = &[
        CURVE_SEED,
        meme_mint_key.as_ref(),
        &[curve.curve_bump],
    ];
    let signer_seeds = &[curve_seeds];

    // 1. Transfer 50% USDC for equity purchase
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.quote_vault.to_account_info(),
                to: ctx.accounts.equity_purchase_account.to_account_info(),
                authority: curve.to_account_info(),
            },
            signer_seeds,
        ),
        quote_for_equity,
    )?;

    // 2. Transfer tokenized equity into the immutable Treasury Vault
    let treasury_balance_before = ctx.accounts.treasury_vault.amount;
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.equity_source_account.to_account_info(),
                to: ctx.accounts.treasury_vault.to_account_info(),
                authority: ctx.accounts.equity_source_authority.to_account_info(),
            },
        ),
        params.min_equity_tokens_expected,
    )?;

    ctx.accounts.treasury_vault.reload()?;
    let treasury_balance_after = ctx.accounts.treasury_vault.amount;
    let equity_deposited = treasury_balance_after
        .checked_sub(treasury_balance_before)
        .ok_or(StreetfunError::MathOverflow)?;

    if equity_deposited < params.min_equity_tokens_expected {
        return Err(StreetfunError::SlippageExceeded.into());
    }

    // 3. Transfer remaining 50% USDC for AMM pool creation
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.quote_vault.to_account_info(),
                to: ctx.accounts.amm_quote_destination.to_account_info(),
                authority: curve.to_account_info(),
            },
            signer_seeds,
        ),
        quote_for_liquidity,
    )?;

    // 4. Transfer remaining meme tokens in vault for AMM pool liquidity
    let remaining_tokens = ctx.accounts.token_vault.amount;
    if remaining_tokens > 0 {
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.token_vault.to_account_info(),
                    to: ctx.accounts.amm_token_destination.to_account_info(),
                    authority: curve.to_account_info(),
                },
                signer_seeds,
            ),
            remaining_tokens,
        )?;
    }

    // 5. Update curve state and global statistics
    curve.is_graduated = true;
    curve.total_equity_locked = equity_deposited;
    curve.real_quote_reserves = 0;
    curve.real_token_reserves = 0;
    curve.graduated_at = Clock::get()?.unix_timestamp;

    let config = &mut ctx.accounts.global_config;
    config.total_graduated_tokens = config
        .total_graduated_tokens
        .checked_add(1)
        .ok_or(StreetfunError::MathOverflow)?;
    config.total_equity_purchased = config
        .total_equity_purchased
        .checked_add(equity_deposited)
        .ok_or(StreetfunError::MathOverflow)?;

    msg!(
        "Curve graduated successfully! Equity locked: {}, USDC deployed to AMM: {}",
        equity_deposited,
        quote_for_liquidity
    );

    Ok(())
}

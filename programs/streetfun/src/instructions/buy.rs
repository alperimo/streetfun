use crate::errors::StreetfunError;
use crate::math::calculate_buy_tokens_out;
use crate::state::{
    CurveAccount, GlobalConfig, CURVE_SEED, GLOBAL_CONFIG_SEED, QUOTE_VAULT_SEED, TOKEN_VAULT_SEED,
};
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct BuyCurveParams {
    pub quote_amount_in: u64,
    pub min_tokens_out: u64,
}

#[derive(Accounts)]
pub struct BuyCurve<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    #[account(
        seeds = [GLOBAL_CONFIG_SEED],
        bump = global_config.bump,
    )]
    pub global_config: Account<'info, GlobalConfig>,

    pub meme_mint: Account<'info, Mint>,

    #[account(
        mut,
        seeds = [CURVE_SEED, meme_mint.key().as_ref()],
        bump = curve.curve_bump,
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
        token::mint = quote_vault.mint,
        token::authority = buyer,
    )]
    pub buyer_quote_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = meme_mint,
        token::authority = buyer,
    )]
    pub buyer_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = protocol_fee_account.owner == global_config.protocol_fee_recipient,
        constraint = protocol_fee_account.mint == quote_vault.mint,
    )]
    pub protocol_fee_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handle_buy_curve(ctx: Context<BuyCurve>, params: BuyCurveParams) -> Result<()> {
    let curve = &mut ctx.accounts.curve;

    if curve.is_graduated {
        return Err(StreetfunError::CurveAlreadyGraduated.into());
    }

    require!(
        curve.real_quote_reserves < ctx.accounts.global_config.graduation_threshold,
        StreetfunError::GraduationThresholdReached
    );

    let result = calculate_buy_tokens_out(
        params.quote_amount_in,
        curve.virtual_quote_reserves,
        curve.virtual_token_reserves,
        curve.real_token_reserves,
        ctx.accounts.global_config.protocol_fee_bps,
    )?;

    if result.tokens_out < params.min_tokens_out {
        return Err(StreetfunError::SlippageExceeded.into());
    }

    // 1. Transfer net quote from buyer to quote vault
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.buyer_quote_account.to_account_info(),
                to: ctx.accounts.quote_vault.to_account_info(),
                authority: ctx.accounts.buyer.to_account_info(),
            },
        ),
        result.net_quote,
    )?;

    // 2. Transfer protocol fee from buyer to protocol fee account
    if result.fee_quote > 0 {
        token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.buyer_quote_account.to_account_info(),
                    to: ctx.accounts.protocol_fee_account.to_account_info(),
                    authority: ctx.accounts.buyer.to_account_info(),
                },
            ),
            result.fee_quote,
        )?;
    }

    // 3. Transfer meme tokens from token vault to buyer
    let meme_mint_key = ctx.accounts.meme_mint.key();
    let curve_seeds: &[&[u8]] = &[CURVE_SEED, meme_mint_key.as_ref(), &[curve.curve_bump]];
    let signer_seeds = &[curve_seeds];

    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.token_vault.to_account_info(),
                to: ctx.accounts.buyer_token_account.to_account_info(),
                authority: curve.to_account_info(),
            },
            signer_seeds,
        ),
        result.tokens_out,
    )?;

    // 4. Update curve state
    curve.real_quote_reserves = curve
        .real_quote_reserves
        .checked_add(result.net_quote)
        .ok_or(StreetfunError::MathOverflow)?;
    curve.real_token_reserves = result.new_real_tokens;
    curve.virtual_quote_reserves = result.new_virtual_quote;
    curve.virtual_token_reserves = result.new_virtual_tokens;

    msg!(
        "Buy executed. Spent: {}, Received: {}, New Real Quote: {}",
        params.quote_amount_in,
        result.tokens_out,
        curve.real_quote_reserves
    );

    Ok(())
}

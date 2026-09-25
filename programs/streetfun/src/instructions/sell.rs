use crate::errors::StreetfunError;
use crate::math::calculate_sell_quote_out;
use crate::state::{
    CurveAccount, GlobalConfig, CURVE_SEED, GLOBAL_CONFIG_SEED, QUOTE_VAULT_SEED, TOKEN_VAULT_SEED,
};
use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct SellCurveParams {
    pub tokens_amount_in: u64,
    pub min_quote_out: u64,
}

#[derive(Accounts)]
pub struct SellCurve<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,

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
        token::mint = meme_mint,
        token::authority = seller,
    )]
    pub seller_token_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = quote_vault.mint,
        token::authority = seller,
    )]
    pub seller_quote_account: Account<'info, TokenAccount>,

    #[account(
        mut,
        constraint = protocol_fee_account.owner == global_config.protocol_fee_recipient,
        constraint = protocol_fee_account.mint == quote_vault.mint,
    )]
    pub protocol_fee_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handle_sell_curve(ctx: Context<SellCurve>, params: SellCurveParams) -> Result<()> {
    let curve = &mut ctx.accounts.curve;

    if curve.is_graduated {
        return Err(StreetfunError::CurveAlreadyGraduated.into());
    }

    let result = calculate_sell_quote_out(
        params.tokens_amount_in,
        curve.virtual_quote_reserves,
        curve.virtual_token_reserves,
        curve.real_quote_reserves,
        ctx.accounts.global_config.protocol_fee_bps,
    )?;

    if result.net_quote_out < params.min_quote_out {
        return Err(StreetfunError::SlippageExceeded.into());
    }

    // 1. Transfer meme tokens from seller to token vault
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.seller_token_account.to_account_info(),
                to: ctx.accounts.token_vault.to_account_info(),
                authority: ctx.accounts.seller.to_account_info(),
            },
        ),
        params.tokens_amount_in,
    )?;

    let meme_mint_key = ctx.accounts.meme_mint.key();
    let curve_seeds: &[&[u8]] = &[CURVE_SEED, meme_mint_key.as_ref(), &[curve.curve_bump]];
    let signer_seeds = &[curve_seeds];

    // 2. Transfer net quote from quote vault to seller
    token::transfer(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.quote_vault.to_account_info(),
                to: ctx.accounts.seller_quote_account.to_account_info(),
                authority: curve.to_account_info(),
            },
            signer_seeds,
        ),
        result.net_quote_out,
    )?;

    // 3. Transfer protocol fee from quote vault to fee account
    if result.fee_quote > 0 {
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.quote_vault.to_account_info(),
                    to: ctx.accounts.protocol_fee_account.to_account_info(),
                    authority: curve.to_account_info(),
                },
                signer_seeds,
            ),
            result.fee_quote,
        )?;
    }

    // 4. Update curve state
    curve.real_quote_reserves = result.new_real_quote;
    curve.real_token_reserves = curve
        .real_token_reserves
        .checked_add(params.tokens_amount_in)
        .ok_or(StreetfunError::MathOverflow)?;
    curve.virtual_quote_reserves = result.new_virtual_quote;
    curve.virtual_token_reserves = result.new_virtual_tokens;

    msg!(
        "Sell executed. Sold: {}, Received Quote: {}, New Real Quote: {}",
        params.tokens_amount_in,
        result.net_quote_out,
        curve.real_quote_reserves
    );

    Ok(())
}

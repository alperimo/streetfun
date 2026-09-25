use crate::errors::StreetfunError;
use crate::state::{GlobalConfig, GLOBAL_CONFIG_SEED, MAX_FEE_BPS};
use anchor_lang::prelude::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct InitializeConfigParams {
    pub protocol_fee_bps: u16,
    pub graduation_fee_bps: u16,
    pub graduation_threshold: u64,
    pub initial_virtual_quote_reserves: u64,
    pub initial_virtual_token_reserves: u64,
}

#[derive(Accounts)]
pub struct InitializeGlobalConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    /// CHECK: Protocol fee recipient wallet
    pub protocol_fee_recipient: AccountInfo<'info>,

    #[account(
        init,
        payer = admin,
        space = 8 + GlobalConfig::INIT_SPACE,
        seeds = [GLOBAL_CONFIG_SEED],
        bump
    )]
    pub global_config: Account<'info, GlobalConfig>,

    pub system_program: Program<'info, System>,
}

pub fn handle_initialize_global_config(
    ctx: Context<InitializeGlobalConfig>,
    params: InitializeConfigParams,
) -> Result<()> {
    if params.protocol_fee_bps > MAX_FEE_BPS || params.graduation_fee_bps > MAX_FEE_BPS {
        return Err(StreetfunError::InvalidFeeBps.into());
    }

    require!(
        params.graduation_threshold > 0
            && params.initial_virtual_quote_reserves > 0
            && params.initial_virtual_token_reserves > crate::instructions::launch::SALE_SUPPLY,
        StreetfunError::CalculationError
    );

    let config = &mut ctx.accounts.global_config;
    config.admin = ctx.accounts.admin.key();
    config.protocol_fee_recipient = ctx.accounts.protocol_fee_recipient.key();
    config.protocol_fee_bps = params.protocol_fee_bps;
    config.graduation_fee_bps = params.graduation_fee_bps;
    config.graduation_threshold = params.graduation_threshold;
    config.initial_virtual_quote_reserves = params.initial_virtual_quote_reserves;
    config.initial_virtual_token_reserves = params.initial_virtual_token_reserves;
    config.total_graduated_tokens = 0;
    config.total_equity_purchased = 0;
    config.bump = ctx.bumps.global_config;

    msg!("Global config initialized. Admin: {}", config.admin);
    Ok(())
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct UpdateConfigParams {
    pub protocol_fee_bps: Option<u16>,
    pub graduation_fee_bps: Option<u16>,
    pub graduation_threshold: Option<u64>,
    pub initial_virtual_quote_reserves: Option<u64>,
    pub initial_virtual_token_reserves: Option<u64>,
    pub protocol_fee_recipient: Option<Pubkey>,
}

#[derive(Accounts)]
pub struct UpdateGlobalConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        mut,
        seeds = [GLOBAL_CONFIG_SEED],
        bump = global_config.bump,
        has_one = admin @ StreetfunError::Unauthorized,
    )]
    pub global_config: Account<'info, GlobalConfig>,
}

pub fn handle_update_global_config(
    ctx: Context<UpdateGlobalConfig>,
    params: UpdateConfigParams,
) -> Result<()> {
    let config = &mut ctx.accounts.global_config;

    if let Some(bps) = params.protocol_fee_bps {
        require!(bps <= MAX_FEE_BPS, StreetfunError::InvalidFeeBps);
        config.protocol_fee_bps = bps;
    }
    if let Some(bps) = params.graduation_fee_bps {
        require!(bps <= MAX_FEE_BPS, StreetfunError::InvalidFeeBps);
        config.graduation_fee_bps = bps;
    }
    if let Some(threshold) = params.graduation_threshold {
        require!(threshold > 0, StreetfunError::CalculationError);
        config.graduation_threshold = threshold;
    }
    if let Some(reserves) = params.initial_virtual_quote_reserves {
        require!(reserves > 0, StreetfunError::CalculationError);
        config.initial_virtual_quote_reserves = reserves;
    }
    if let Some(tokens) = params.initial_virtual_token_reserves {
        require!(
            tokens > crate::instructions::launch::SALE_SUPPLY,
            StreetfunError::CalculationError
        );
        config.initial_virtual_token_reserves = tokens;
    }
    if let Some(recipient) = params.protocol_fee_recipient {
        config.protocol_fee_recipient = recipient;
    }

    msg!(
        "Global config updated. Graduation threshold: {}",
        config.graduation_threshold
    );
    Ok(())
}

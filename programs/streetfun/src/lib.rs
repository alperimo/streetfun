use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod math;
pub mod state;

use instructions::*;

declare_id!("6ZiovCkRxRJgUaCS9uftFk3eVnGDsbnDXgUV1XHybH52");

// Generated CPI client from Meteora's published DAMM v2 IDL in
// programs/streetfun/idls/cp_amm.json.
declare_program!(cp_amm);

#[program]
pub mod streetfun {
    use super::*;

    pub fn initialize_global_config(
        ctx: Context<InitializeGlobalConfig>,
        params: InitializeConfigParams,
    ) -> Result<()> {
        instructions::initialize::handle_initialize_global_config(ctx, params)
    }

    pub fn update_global_config(
        ctx: Context<UpdateGlobalConfig>,
        params: UpdateConfigParams,
    ) -> Result<()> {
        instructions::initialize::handle_update_global_config(ctx, params)
    }

    pub fn launch_stonk(ctx: Context<LaunchStonk>, params: LaunchStonkParams) -> Result<()> {
        instructions::launch::handle_launch_stonk(ctx, params)
    }

    pub fn buy_curve(ctx: Context<BuyCurve>, params: BuyCurveParams) -> Result<()> {
        instructions::buy::handle_buy_curve(ctx, params)
    }

    pub fn sell_curve(ctx: Context<SellCurve>, params: SellCurveParams) -> Result<()> {
        instructions::sell::handle_sell_curve(ctx, params)
    }

    pub fn graduate_and_execute_stock<'a, 'b, 'c, 'info>(
        ctx: Context<'a, 'b, 'c, 'info, GraduateAndExecuteStock<'info>>,
        params: GraduateParams,
    ) -> Result<()> {
        instructions::graduate::handle_graduate_and_execute_stock(ctx, params)
    }

    pub fn burn_and_redeem<'a, 'b, 'c, 'info>(
        ctx: Context<'a, 'b, 'c, 'info, BurnAndRedeem<'info>>,
        params: BurnAndRedeemParams,
    ) -> Result<()> {
        instructions::redeem::handle_burn_and_redeem(ctx, params)
    }
}

#[event]
pub struct StonkLaunchedEvent {
    pub creator: Pubkey,
    pub meme_mint: Pubkey,
    pub target_equity_mint: Pubkey,
    pub name: String,
    pub symbol: String,
    pub timestamp: i64,
}

#[event]
pub struct TradeEvent {
    pub user: Pubkey,
    pub meme_mint: Pubkey,
    pub is_buy: bool,
    pub quote_amount: u64,
    pub token_amount: u64,
    pub fee_amount: u64,
    pub new_real_quote: u64,
    pub timestamp: i64,
}

#[event]
pub struct GraduatedEvent {
    pub meme_mint: Pubkey,
    pub target_equity_mint: Pubkey,
    pub quote_for_equity: u64,
    pub equity_locked: u64,
    pub quote_for_liquidity: u64,
    pub meme_tokens_deposited: u64,
    pub meteora_damm_v2_pool: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct RedeemedEvent {
    pub redeemer: Pubkey,
    pub meme_mint: Pubkey,
    pub target_equity_mint: Pubkey,
    pub meme_burned: u64,
    pub equity_redeemed: u64,
    pub remaining_equity: u64,
    pub timestamp: i64,
}

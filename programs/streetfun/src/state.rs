use anchor_lang::prelude::*;

pub const GLOBAL_CONFIG_SEED: &[u8] = b"global-config";
pub const CURVE_SEED: &[u8] = b"curve";
pub const TOKEN_VAULT_SEED: &[u8] = b"token-vault";
pub const QUOTE_VAULT_SEED: &[u8] = b"quote-vault";
pub const TREASURY_VAULT_SEED: &[u8] = b"treasury-vault";
pub const DBC_LAUNCH_SEED: &[u8] = b"dbc-launch";

pub const MAX_FEE_BPS: u16 = 1_000; // Max 10%
pub const BPS_DENOMINATOR: u64 = 10_000;

#[account]
#[derive(InitSpace)]
pub struct GlobalConfig {
    pub admin: Pubkey,
    pub protocol_fee_recipient: Pubkey,
    pub protocol_fee_bps: u16,
    pub graduation_fee_bps: u16,
    pub graduation_threshold: u64,
    pub initial_virtual_quote_reserves: u64,
    pub initial_virtual_token_reserves: u64,
    pub total_graduated_tokens: u64,
    pub total_equity_purchased: u64,
    pub bump: u8,
}

#[account]
#[derive(InitSpace)]
pub struct CurveAccount {
    pub creator: Pubkey,
    pub meme_mint: Pubkey,
    pub target_equity_mint: Pubkey,
    pub meteora_damm_v2_pool: Pubkey,
    pub virtual_quote_reserves: u64,
    pub virtual_token_reserves: u64,
    pub real_quote_reserves: u64,
    pub real_token_reserves: u64,
    pub total_meme_supply: u64,
    pub total_equity_locked: u64,
    pub is_graduated: bool,
    pub graduated_at: i64,
    pub curve_bump: u8,
    pub token_vault_bump: u8,
    pub quote_vault_bump: u8,
    pub treasury_vault_bump: u8,
}

/// StreetFun's collateral and settlement registry for a Meteora DBC launch.
/// DBC owns the curve and token vaults; StreetFun stores only the backing asset
/// and the settlement proof required before collateral redemption is enabled.
#[account]
#[derive(InitSpace)]
pub struct DbcLaunchAccount {
    pub creator: Pubkey,
    pub meme_mint: Pubkey,
    pub target_equity_mint: Pubkey,
    pub quote_mint: Pubkey,
    pub dbc_config: Pubkey,
    pub dbc_pool: Pubkey,
    /// Selected collateral market before graduation; migrated DBC pool afterward.
    pub meteora_damm_v2_pool: Pubkey,
    pub initial_meme_supply: u64,
    pub settlement_quote_amount: u64,
    pub total_equity_locked: u64,
    pub graduated_at: i64,
    pub is_graduated: bool,
    pub bump: u8,
}

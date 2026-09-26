use crate::{
    cp_amm,
    errors::StreetfunError,
    state::{GlobalConfig, SettlementPolicy, GLOBAL_CONFIG_SEED, SETTLEMENT_POLICY_SEED},
};
use anchor_lang::prelude::*;

pub const MAX_POLICY_LIFETIME_SECONDS: i64 = 300;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy)]
pub struct UpdateSettlementPolicyParams {
    /// Minimum spendable equity atoms / input quote atoms, after all fees.
    pub minimum_output_numerator: u64,
    pub minimum_output_denominator: u64,
    pub valid_until: i64,
}

#[derive(Accounts)]
pub struct UpdateSettlementPolicy<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(seeds = [GLOBAL_CONFIG_SEED], bump = global_config.bump, has_one = admin @ StreetfunError::Unauthorized)]
    pub global_config: Account<'info, GlobalConfig>,
    pub quote_mint: Account<'info, anchor_spl::token::Mint>,
    pub equity_mint: InterfaceAccount<'info, anchor_spl::token_interface::Mint>,
    /// CHECK: Program owner and market pair are validated before approval.
    #[account(owner = cp_amm::ID)]
    pub market: UncheckedAccount<'info>,
    #[account(init_if_needed, payer = admin, space = 8 + SettlementPolicy::INIT_SPACE,
        seeds = [SETTLEMENT_POLICY_SEED, quote_mint.key().as_ref(), equity_mint.key().as_ref()], bump)]
    pub settlement_policy: Account<'info, SettlementPolicy>,
    pub system_program: Program<'info, System>,
}

pub fn handle_update_settlement_policy(
    ctx: Context<UpdateSettlementPolicy>,
    params: UpdateSettlementPolicyParams,
) -> Result<()> {
    let now = Clock::get()?.unix_timestamp;
    require!(
        params.minimum_output_numerator > 0 && params.minimum_output_denominator > 0,
        StreetfunError::ZeroAmount
    );
    require!(
        params.valid_until > now
            && params.valid_until
                <= now
                    .checked_add(MAX_POLICY_LIFETIME_SECONDS)
                    .ok_or(StreetfunError::MathOverflow)?,
        StreetfunError::SettlementUnavailable
    );
    let data = ctx.accounts.market.try_borrow_data()?;
    require!(
        data.len() >= 232 && data[..8] == [241, 154, 109, 4, 17, 177, 109, 188],
        StreetfunError::InvalidDammV2Pool
    );
    let token_a = Pubkey::new_from_array(
        data[168..200]
            .try_into()
            .map_err(|_| StreetfunError::InvalidDammV2Pool)?,
    );
    let token_b = Pubkey::new_from_array(
        data[200..232]
            .try_into()
            .map_err(|_| StreetfunError::InvalidDammV2Pool)?,
    );
    let quote = ctx.accounts.quote_mint.key();
    let equity = ctx.accounts.equity_mint.key();
    require!(
        quote != equity
            && ((token_a == quote && token_b == equity) || (token_b == quote && token_a == equity)),
        StreetfunError::InvalidDammV2Pool
    );
    ctx.accounts.settlement_policy.set_inner(SettlementPolicy {
        quote_mint: quote,
        equity_mint: equity,
        market: ctx.accounts.market.key(),
        minimum_output_numerator: params.minimum_output_numerator,
        minimum_output_denominator: params.minimum_output_denominator,
        updated_at: now,
        valid_until: params.valid_until,
        bump: ctx.bumps.settlement_policy,
    });
    Ok(())
}

pub fn validate_settlement_policy(
    policy: &SettlementPolicy,
    market: Pubkey,
    quote: Pubkey,
    equity: Pubkey,
    amount: u64,
    minimum: u64,
    now: i64,
) -> Result<()> {
    require!(
        policy.market == market && policy.quote_mint == quote && policy.equity_mint == equity,
        StreetfunError::InvalidDammV2Pool
    );
    require!(
        policy.updated_at <= now
            && now < policy.valid_until
            && policy.valid_until.saturating_sub(policy.updated_at) <= MAX_POLICY_LIFETIME_SECONDS,
        StreetfunError::SettlementUnavailable
    );
    require!(
        amount > 0 && policy.minimum_output_numerator > 0 && policy.minimum_output_denominator > 0,
        StreetfunError::ZeroAmount
    );
    let product = u128::from(amount) * u128::from(policy.minimum_output_numerator);
    let denominator = u128::from(policy.minimum_output_denominator);
    let floor = product / denominator + u128::from(product % denominator != 0);
    require!(
        u128::from(minimum) >= floor,
        StreetfunError::SlippageExceeded
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_substituted_markets_dust_outputs_and_stale_rates() {
        let policy = SettlementPolicy {
            quote_mint: Pubkey::new_unique(),
            equity_mint: Pubkey::new_unique(),
            market: Pubkey::new_unique(),
            minimum_output_numerator: 3,
            minimum_output_denominator: 2,
            updated_at: 100,
            valid_until: 200,
            bump: 1,
        };
        let check = |market, min, now| {
            validate_settlement_policy(
                &policy,
                market,
                policy.quote_mint,
                policy.equity_mint,
                3,
                min,
                now,
            )
        };
        assert!(check(policy.market, 5, 100).is_ok());
        assert!(check(policy.market, 4, 100).is_err());
        assert!(check(Pubkey::new_unique(), 5, 100).is_err());
        assert!(check(policy.market, 5, 99).is_err());
        assert!(check(policy.market, 5, 200).is_err());
    }
}

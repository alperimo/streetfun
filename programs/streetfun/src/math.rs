use crate::errors::StreetfunError;
use crate::state::BPS_DENOMINATOR;
use anchor_lang::prelude::*;

pub struct BuyResult {
    pub tokens_out: u64,
    pub fee_quote: u64,
    pub net_quote: u64,
    pub new_real_quote: u64,
    pub new_real_tokens: u64,
    pub new_virtual_quote: u64,
    pub new_virtual_tokens: u64,
}

pub struct SellResult {
    pub net_quote_out: u64,
    pub fee_quote: u64,
    pub gross_quote_out: u64,
    pub new_real_quote: u64,
    pub new_real_tokens: u64,
    pub new_virtual_quote: u64,
    pub new_virtual_tokens: u64,
}

pub fn calculate_fee(amount: u64, fee_bps: u16) -> Result<u64> {
    if fee_bps == 0 {
        return Ok(0);
    }
    let fee = (amount as u128)
        .checked_mul(fee_bps as u128)
        .ok_or(StreetfunError::MathOverflow)?
        .checked_div(BPS_DENOMINATOR as u128)
        .ok_or(StreetfunError::MathOverflow)?;
    Ok(fee as u64)
}

pub fn calculate_buy_tokens_out(
    quote_in: u64,
    virtual_quote: u64,
    virtual_tokens: u64,
    real_tokens: u64,
    fee_bps: u16,
) -> Result<BuyResult> {
    if quote_in == 0 {
        return Err(StreetfunError::ZeroAmount.into());
    }

    let fee_quote = calculate_fee(quote_in, fee_bps)?;
    let net_quote = quote_in
        .checked_sub(fee_quote)
        .ok_or(StreetfunError::MathOverflow)?;

    let x = virtual_quote as u128;
    let y = virtual_tokens as u128;
    let dx = net_quote as u128;

    // k = x * y
    let k = x.checked_mul(y).ok_or(StreetfunError::MathOverflow)?;

    // x_new = x + dx
    let x_new = x.checked_add(dx).ok_or(StreetfunError::MathOverflow)?;

    // y_new = ceil(k / x_new)
    // To favor the pool (give fewer tokens to user):
    // y_new = (k + x_new - 1) / x_new
    let y_new = k
        .checked_add(x_new.checked_sub(1).ok_or(StreetfunError::MathOverflow)?)
        .ok_or(StreetfunError::MathOverflow)?
        .checked_div(x_new)
        .ok_or(StreetfunError::MathOverflow)?;

    let dy = y
        .checked_sub(y_new)
        .ok_or(StreetfunError::InsufficientLiquidity)?;

    let tokens_out = dy as u64;

    if tokens_out == 0 {
        return Err(StreetfunError::InsufficientLiquidity.into());
    }

    if tokens_out > real_tokens {
        return Err(StreetfunError::InsufficientLiquidity.into());
    }

    let new_real_tokens = real_tokens
        .checked_sub(tokens_out)
        .ok_or(StreetfunError::MathOverflow)?;

    let new_virtual_quote = (x_new) as u64;
    let new_virtual_tokens = (y_new) as u64;

    Ok(BuyResult {
        tokens_out,
        fee_quote,
        net_quote,
        new_real_quote: net_quote, // caller adds to real quote
        new_real_tokens,
        new_virtual_quote,
        new_virtual_tokens,
    })
}

pub fn calculate_sell_quote_out(
    tokens_in: u64,
    virtual_quote: u64,
    virtual_tokens: u64,
    real_quote: u64,
    fee_bps: u16,
) -> Result<SellResult> {
    if tokens_in == 0 {
        return Err(StreetfunError::ZeroAmount.into());
    }

    let x = virtual_quote as u128;
    let y = virtual_tokens as u128;
    let dy = tokens_in as u128;

    // k = x * y
    let k = x.checked_mul(y).ok_or(StreetfunError::MathOverflow)?;

    // y_new = y + dy
    let y_new = y.checked_add(dy).ok_or(StreetfunError::MathOverflow)?;

    // x_new = ceil(k / y_new)
    // To favor the pool: x_new = (k + y_new - 1) / y_new
    let x_new = k
        .checked_add(y_new.checked_sub(1).ok_or(StreetfunError::MathOverflow)?)
        .ok_or(StreetfunError::MathOverflow)?
        .checked_div(y_new)
        .ok_or(StreetfunError::MathOverflow)?;

    let dx = x
        .checked_sub(x_new)
        .ok_or(StreetfunError::InsufficientQuoteReserves)?;

    let gross_quote_out = dx as u64;

    if gross_quote_out > real_quote {
        return Err(StreetfunError::InsufficientQuoteReserves.into());
    }

    let fee_quote = calculate_fee(gross_quote_out, fee_bps)?;
    let net_quote_out = gross_quote_out
        .checked_sub(fee_quote)
        .ok_or(StreetfunError::MathOverflow)?;

    let new_real_quote = real_quote
        .checked_sub(gross_quote_out)
        .ok_or(StreetfunError::MathOverflow)?;

    let new_virtual_quote = x_new as u64;
    let new_virtual_tokens = y_new as u64;

    Ok(SellResult {
        net_quote_out,
        fee_quote,
        gross_quote_out,
        new_real_quote,
        new_real_tokens: tokens_in, // caller adds to real tokens
        new_virtual_quote,
        new_virtual_tokens,
    })
}

pub fn calculate_pro_rata_equity(
    meme_amount_burned: u64,
    total_meme_supply: u64,
    total_equity_locked: u64,
) -> Result<u64> {
    if meme_amount_burned == 0 || total_equity_locked == 0 {
        return Ok(0);
    }
    if total_meme_supply == 0 {
        return Err(StreetfunError::CalculationError.into());
    }

    let entitled_shares = (meme_amount_burned as u128)
        .checked_mul(total_equity_locked as u128)
        .ok_or(StreetfunError::MathOverflow)?
        .checked_div(total_meme_supply as u128)
        .ok_or(StreetfunError::MathOverflow)?;

    Ok(entitled_shares as u64)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_constant_product_buy() {
        let v_quote = 30_000_000_000u64; // 30,000 USDC (6 decimals)
        let v_tokens = 1_073_000_000_000_000u64; // 1.073 billion tokens (6 decimals)
        let r_tokens = 800_000_000_000_000u64; // 800 million tokens available
        let quote_in = 1_000_000_000u64; // 1,000 USDC
        let fee_bps = 100u16; // 1%

        let res = calculate_buy_tokens_out(quote_in, v_quote, v_tokens, r_tokens, fee_bps).unwrap();
        assert_eq!(res.fee_quote, 10_000_000); // 10 USDC
        assert_eq!(res.net_quote, 990_000_000); // 990 USDC
        assert!(res.tokens_out > 0);
        assert!(res.tokens_out < r_tokens);
    }

    #[test]
    fn test_constant_product_sell() {
        let v_quote = 35_000_000_000u64;
        let v_tokens = 950_000_000_000_000u64;
        let r_quote = 5_000_000_000u64;
        let tokens_in = 10_000_000_000_000u64; // 10M tokens
        let fee_bps = 100u16;

        let res = calculate_sell_quote_out(tokens_in, v_quote, v_tokens, r_quote, fee_bps).unwrap();
        assert!(res.gross_quote_out > 0);
        assert!(res.gross_quote_out <= r_quote);
        assert!(res.net_quote_out < res.gross_quote_out);
    }

    #[test]
    fn test_pro_rata_redemption() {
        let burned = 50_000_000_000_000u64; // 5% of supply
        let total_supply = 1_000_000_000_000_000u64; // 1B tokens
        let total_equity = 100_000_000u64; // 100 shares (6 decimals)

        let shares = calculate_pro_rata_equity(burned, total_supply, total_equity).unwrap();
        assert_eq!(shares, 5_000_000); // 5 shares (6 decimals)
    }
}

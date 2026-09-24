use anchor_lang::prelude::*;

#[error_code]
pub enum StreetfunError {
    #[msg("Amount must be greater than zero.")]
    ZeroAmount,

    #[msg("Bonding curve has already graduated. Bonding curve trades are closed.")]
    CurveAlreadyGraduated,

    #[msg("Bonding curve has not graduated yet. Burn and redeem is not accessible.")]
    CurveNotGraduated,

    #[msg("Graduation threshold reached. Curve must be graduated.")]
    GraduationThresholdReached,

    #[msg("Graduation threshold has not been reached yet.")]
    GraduationThresholdNotReached,

    #[msg("Slippage tolerance exceeded.")]
    SlippageExceeded,

    #[msg("Insufficient token liquidity available in curve vault.")]
    InsufficientLiquidity,

    #[msg("Insufficient quote reserves in curve vault.")]
    InsufficientQuoteReserves,

    #[msg("Target equity mint does not match the curve target equity.")]
    InvalidEquityMint,

    #[msg("Arithmetic overflow or underflow occurred.")]
    MathOverflow,

    #[msg("Calculation error occurred in bonding curve engine.")]
    CalculationError,

    #[msg("Signer is not authorized to execute this instruction.")]
    Unauthorized,

    #[msg("Curve vault account does not match expected PDA.")]
    CurveVaultMismatch,

    #[msg("Treasury vault account does not match expected PDA.")]
    TreasuryVaultMismatch,

    #[msg("Fee basis points exceed maximum allowed limit.")]
    InvalidFeeBps,

    #[msg("Verified asset purchase and liquidity settlement are unavailable.")]
    SettlementUnavailable,

    #[msg("Invalid token program provided for target equity mint.")]
    InvalidTokenProgram,
}

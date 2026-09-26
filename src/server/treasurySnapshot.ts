import type { TokenMetadata } from "@/lib/types";

/** Indexed holdings are discovery hints, never the source of current balances. */
export function liveTreasuryHoldings(tokens: TokenMetadata[]) {
  return tokens.filter(token => token.dataSource === "onchain" && token.bondingCurve.isGraduated &&
    Boolean(token.bondingCurve.meteoraPoolAddress) && Boolean(token.observedSlot) &&
    Boolean(token.lastUpdatedAt) && token.treasury.totalEquityLocked > 0).map(token => ({
      mint: token.mint,
      tokenName: token.name,
      tokenSymbol: token.symbol,
      tokenAvatarUrl: token.avatarUrl || null,
      equityMint: token.targetEquity.mintAddress,
      equitySymbol: token.targetEquity.symbol || "UNVERIFIED",
      equityAmount: String(token.treasury.totalEquityLocked),
      observedSlot: token.observedSlot!,
      updatedAt: token.lastUpdatedAt!,
    }));
}

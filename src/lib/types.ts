export interface TokenMetadata {
  mint: string;
  name: string;
  symbol: string;
  description: string;
  avatarUrl: string;
  creator: string;
  createdAt: string;
  marketCapUsd: number;
  priceUsd: number;
  priceChange24h: number;
  volume24hUsd: number;
  targetEquity: {
    symbol: string;
    name: string;
    mintAddress: string;
    custodian: string;
    legalFramework: string;
    logoUrl: string;
    stockPriceUsd: number;
  };
  bondingCurve: {
    realQuoteReservesUsd: number;
    graduationThresholdUsd: number;
    progressPct: number;
    virtualQuoteReserves: string;
    virtualTokenReserves: string;
    realTokenReserves: string;
    isGraduated: boolean;
    graduatedAt?: string;
  };
  treasury: {
    totalEquityLocked: number; // e.g. 154.5 shares
    totalEquityValueUsd: number;
    vaultPda: string;
  };
}

export interface TreasuryGlobalStats {
  totalEquityValueLockedUsd: number;
  totalGraduatedCurves: number;
  totalRedemptionsUsd: number;
  walletsRedeemed: number;
  assetBreakdown: {
    symbol: string;
    name: string;
    sharesLocked: number;
    valueUsd: number;
    backingPercentage: number;
    mintAddress: string;
  }[];
  recentRedemptions: {
    id: string;
    timestamp: string;
    tokenSymbol: string;
    equitySymbol: string;
    burnedMemeAmount: string;
    sharesRedeemed: number;
    redeemerAddress: string;
    txHash: string;
  }[];
}

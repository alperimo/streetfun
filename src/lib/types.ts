export interface TokenMetadata {
  mint: string;
  name: string;
  symbol: string;
  description: string;
  avatarUrl: string;
  creator: string;
  createdAt: string;
  totalSupply?: number;
  marketCapUsd: number;
  priceUsd: number;
  priceChange24h: number;
  priceChange24hAvailable?: boolean;
  volume24hUsd: number;
  volume24hAvailable?: boolean;
  targetEquity: {
    symbol: string;
    name: string;
    mintAddress: string;
    issuer?: string;
    custodian: string;
    legalFramework: string;
    proofOfReserve?: string;
    meteoraPoolAddress?: string;
    logoUrl: string;
    stockPriceUsd: number;
    decimals?: number;
    verifiedTessera?: boolean;
    verifiedPreStocks?: boolean;
    isTestCollateral?: boolean;
    /** Active Token-2022 transfer fee, if the mint has one; undefined means unknown. */
    transferFee?: { basisPoints: number; maximumFeeRaw: string } | null;
    provider?: string;
    isPreIpo?: boolean;
  };
  bondingCurve: {
    /** New launches use Meteora DBC; old tokens can retain the legacy protocol. */
    protocol?: "meteora-dbc" | "streetfun-legacy";
    dbcPoolAddress?: string;
    /** Unix time after which any wallet may complete DBC settlement. */
    dbcSettlementFallbackAt?: number;
    settlementPending?: boolean;
    realQuoteReservesUsd: number;
    graduationThresholdUsd: number;
    progressPct: number;
    /** Legacy StreetFun reserves; DBC tokens expose these only when applicable. */
    virtualQuoteReserves?: string;
    virtualTokenReserves?: string;
    realTokenReserves?: string;
    /** Live DBC virtual-pool reserves in raw token units. */
    dbcQuoteReserveRaw?: string;
    dbcBaseReserveRaw?: string;
    quoteMint?: string;
    isGraduated: boolean;
    graduatedAt?: string;
    meteoraPoolAddress?: string;
    dynamicFeeBps?: number;
    equityPurchaseBudgetUsd?: number;
    ammLiquidityBudgetUsd?: number;
  };
  treasury: {
    totalEquityLocked: number; // e.g. 139.27 $TSPACEX shares
    totalEquityValueUsd: number;
    vaultPda: string;
    proofOfReserveVerified?: boolean;
    valuationAvailable?: boolean;
    valuationSource?: string;
  };
  dataSource?: "onchain" | "indexed" | "mock";
  lastUpdatedAt?: string;
  observedSlot?: number;
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
    logoUrl?: string;
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
    tokenAvatarUrl?: string;
    estimatedValueUsd?: number;
  }[];
}

export type LifecycleStage = "pre-graduation" | "post-graduation";
export type PantaSide = "yes" | "no";
export type PantaPhase = "primary" | "secondary" | "resolved" | "cancelled";

export interface PantaMarket {
  marketId: string;
  title: string;
  description: string;
  phase: PantaPhase;
  resolved: boolean;
  status: string;
  startTime: number | null;
  resolutionTime: number | null;
  yesPrice: string | null;
  noPrice: string | null;
  volumeUsdc: string | null;
}
export interface LifecycleMarketInfo extends PantaMarket {
  mint: string;
  stage: LifecycleStage;
  marketUrl: string;
  tradingEnabled: boolean;
  programId: string;
  usdcMint: string;
}
export interface PantaOrderQuote {
  quoteId: string;
  marketId: string;
  side: PantaSide;
  amountUsdc: string;
  shares: string;
  avgPrice: string;
  feeUsdc: string;
  expiresAt: string;
  quoteToken: string;
}
export interface PantaInstruction {
  programId: string;
  data: string;
  accounts: { pubkey: string; isSigner: boolean; isWritable: boolean }[];
}
export interface PantaOrderBuildResponse {
  orderId: string;
  quoteId: string;
  wallet: string;
  marketId: string;
  side: PantaSide;
  amountUsdc: string;
  expectedShares: string;
  feeUsdc: string;
  instructions: PantaInstruction[];
  recentBlockhash: string;
  lastValidBlockHeight: number;
  expiresAt: string;
  transaction: string;
  orderToken: string;
}
export interface PantaPosition {
  marketId: string;
  programId: string;
  usdcMint: string;
  side: PantaSide;
  shares: string;
  phase: PantaPhase;
  claimable: boolean;
  claimed: boolean;
  outcome: PantaSide | null;
}

export interface PantaMarket {
  marketId: string;
  category: string;
  title: string;
  description: string;
  images: string[];
  phase: "primary" | "secondary" | "resolved" | "cancelled";
  marketType: "standard" | "breaking";
  startTime: number;
  endTime: number;
  resolutionTime: number;
  region: string;
  resolved: boolean;
  status: string;
  volumeUsdc: string | null;
  volumeUsdcBase?: number | null;
  yesPrice: string | null;
  noPrice: string | null;
  primaryYesPrice?: string | null;
  primaryNoPrice?: string | null;
  secondaryYesPrice?: string | null;
  secondaryNoPrice?: string | null;
  createdByPartner?: boolean;
}

export interface PantaOrderQuote {
  quoteId: string;
  marketId: string;
  wallet: string;
  side: "yes" | "no";
  amountUsdc: string;
  shares: string;
  avgPrice?: string;
  feeUsdc: string;
  expiresAt: string;
  blockhashExpiryHintSec?: number;
}

export interface PantaPosition {
  marketId: string;
  category: string | null;
  side: "yes" | "no";
  shares: string;
  phase: string;
  claimable: boolean;
  claimed: boolean;
  outcome: string | null;
}

export interface PantaOrderBuildResponse {
  orderId: string;
  quoteId: string;
  wallet: string;
  instructions: {
    programId: string;
    data: string;
    accounts: { pubkey: string; isSigner: boolean; isWritable: boolean }[];
  }[];
  recentBlockhash: string;
  lastValidBlockHeight: number;
  expectedShares?: string;
  feeUsdc?: string;
  expiresAt?: string;
}

export interface PantaClaimBuildResponse {
  wallet: string;
  marketId: string;
  outcome: string;
  winningShares: string;
  instructions: {
    programId: string;
    data: string;
    accounts: { pubkey: string; isSigner: boolean; isWritable: boolean }[];
  }[];
  recentBlockhash: string;
  lastValidBlockHeight: number;
  derived?: Record<string, string>;
}

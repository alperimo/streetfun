import { TokenMetadata } from "@/lib/types";
import { PublicKey } from "@solana/web3.js";

export interface TokenLaunchParams {
  name: string;
  symbol: string;
  description: string;
  avatarUrl: string;
  targetEquitySymbol: string;
  initialBuyUsdc?: number;
}

export interface TradeParams {
  token: TokenMetadata;
  tradeMode: "buy" | "sell";
  amount: number; // Quote USDC for buy, Meme Token amount for sell
  slippagePct: number;
}

export interface TradeResult {
  success: boolean;
  txSignature?: string;
  tokensAmount: number;
  quoteAmount: number;
  effectivePrice: number;
  priceImpactPct: number;
  isGraduated: boolean;
  message: string;
  updatedToken: TokenMetadata;
}

export interface RedeemParams {
  token: TokenMetadata;
  memeAmount: number;
  actionType: "stock" | "usdc";
}

export interface RedeemResult {
  success: boolean;
  txSignature?: string;
  entitledShares: number;
  usdcValue: number;
  message: string;
  updatedToken: TokenMetadata;
}

export interface OHLCVBar {
  time: number; // Unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type TimeframeOption = "1m" | "5m" | "15m" | "1h" | "4h" | "1D";

export interface ITokenService {
  getTokens(): Promise<TokenMetadata[]>;
  getToken(mint: string): Promise<TokenMetadata | null>;
  launchToken(params: TokenLaunchParams, walletPublicKey?: PublicKey | null): Promise<TokenMetadata>;
}

export interface ITradeService {
  executeTrade(params: TradeParams, walletPublicKey?: PublicKey | null): Promise<TradeResult>;
}

export interface IRedeemService {
  executeRedeem(params: RedeemParams, walletPublicKey?: PublicKey | null): Promise<RedeemResult>;
}

export interface IChartService {
  getOHLCV(token: TokenMetadata, timeframe: TimeframeOption): Promise<OHLCVBar[]>;
}

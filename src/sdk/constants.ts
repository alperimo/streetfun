import { PublicKey } from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID || "6ZiovCkRxRJgUaCS9uftFk3eVnGDsbnDXgUV1XHybH52"
);

// Meteora Dynamic Bonding Curve (DBC) & DLMM Program IDs
export const METEORA_DBC_PROGRAM_ID = new PublicKey("dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN");
export const USDC_MINT = new PublicKey(
  process.env.NEXT_PUBLIC_USDC_MINT || "DuQ1T5B6tmf5ZfSNpPomVcDntLEzR1mkoB81yHP5rGHG"
);

export const GLOBAL_CONFIG_SEED = Buffer.from("global-config");
export const CURVE_SEED = Buffer.from("curve");
export const TOKEN_VAULT_SEED = Buffer.from("token-vault");
export const QUOTE_VAULT_SEED = Buffer.from("quote-vault");
export const TREASURY_VAULT_SEED = Buffer.from("treasury-vault");

export const TOTAL_MEME_SUPPLY = 1_000_000_000n * 1_000_000n; // 1 Billion tokens (6 decimals)
export const SALE_SUPPLY = 800_000_000n * 1_000_000n; // 800M for Meteora DBC curve
export const EQUITY_SPOT_BUY_RATIO = 0.5; // 50% (30 USDC) to acquire Tessera Pre-IPO token ($TOPAI)
export const AMM_MIGRATION_RATIO = 0.5; // 50% (30 USDC) + leftover meme supply to Meteora DLMM pool

export interface TesseraPreIpoAsset {
  symbol: string;
  ticker: string;
  name: string;
  mintAddress: string;
  issuer: string;
  custodian: string;
  legalFramework: string;
  proofOfReserve: string;
  meteoraPoolAddress: string;
  logoUrl: string;
  currentStockPriceUsd: number;
  isPreIpo: boolean;
}

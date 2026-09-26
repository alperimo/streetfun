import { PublicKey } from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID || "6ZiovCkRxRJgUaCS9uftFk3eVnGDsbnDXgUV1XHybH52"
);

// Meteora Dynamic Bonding Curve and DAMM v2 Program IDs.
export const METEORA_DBC_PROGRAM_ID = new PublicKey("dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN");
// DAMM v2 publishes the same program address for Devnet and mainnet.
export const METEORA_DAMM_V2_PROGRAM_ID = new PublicKey("cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG");
export const USDC_MINT = new PublicKey(
  process.env.NEXT_PUBLIC_USDC_MINT || "DuQ1T5B6tmf5ZfSNpPomVcDntLEzR1mkoB81yHP5rGHG"
);

// Published by Meteora for DBC migrations using MigrationFeeOption.Customizable.
export const METEORA_DAMM_V2_MIGRATION_CONFIG = new PublicKey(
  "A8gMrEPJkacWkcb3DGwtJwTe16HktSEfvwtuDh2MCtck"
);

/** Creator settlement is immediate; public fallback opens one day after DBC completion. */
export const DBC_SETTLEMENT_FALLBACK_DELAY_SECONDS = 24 * 60 * 60;

export const GLOBAL_CONFIG_SEED = Buffer.from("global-config");
export const DBC_LAUNCH_SEED = Buffer.from("dbc-launch");
export const CURVE_SEED = Buffer.from("curve");
export const TOKEN_VAULT_SEED = Buffer.from("token-vault");
export const QUOTE_VAULT_SEED = Buffer.from("quote-vault");
export const TREASURY_VAULT_SEED = Buffer.from("treasury-vault");

export const TOTAL_MEME_SUPPLY = 1_000_000_000n * 1_000_000n; // 1 Billion tokens (6 decimals)
export const SALE_SUPPLY = 800_000_000n * 1_000_000n; // 800M for the StreetFun bonding curve

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

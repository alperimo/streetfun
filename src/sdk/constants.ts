import { PublicKey } from "@solana/web3.js";
import { DYNAMIC_BONDING_CURVE_PROGRAM_ID } from "@meteora-ag/dynamic-bonding-curve-sdk";

export const PROGRAM_ID = new PublicKey(
  "6ZiovCkRxRJgUaCS9uftFk3eVnGDsbnDXgUV1XHybH52"
);

// Meteora Dynamic Bonding Curve (DBC) & DLMM Program IDs
export const METEORA_DBC_PROGRAM_ID = DYNAMIC_BONDING_CURVE_PROGRAM_ID;
export const USDC_MINT = new PublicKey(
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
);

export const GLOBAL_CONFIG_SEED = Buffer.from("global-config");
export const CURVE_SEED = Buffer.from("curve");
export const TOKEN_VAULT_SEED = Buffer.from("token-vault");
export const QUOTE_VAULT_SEED = Buffer.from("quote-vault");
export const TREASURY_VAULT_SEED = Buffer.from("treasury-vault");

export const TOTAL_MEME_SUPPLY = 1_000_000_000n * 1_000_000n; // 1 Billion tokens (6 decimals)
export const SALE_SUPPLY = 800_000_000n * 1_000_000n; // 800M for Meteora DBC curve
export const DEFAULT_GRADUATION_THRESHOLD_USDC = 60_000;
export const EQUITY_SPOT_BUY_RATIO = 0.5; // 50% (30,000 USDC) to acquire Tessera Pre-IPO token ($TSPACEX)
export const AMM_MIGRATION_RATIO = 0.5; // 50% (30,000 USDC) + leftover meme supply to Meteora DLMM pool

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

export const VERIFIED_TESSERA_PRE_IPO_ASSETS: TesseraPreIpoAsset[] = [
  {
    symbol: "$TSPACEX",
    ticker: "TSPACEX",
    name: "SpaceX (Tessera Pre-IPO)",
    mintAddress: "TSPX111111111111111111111111111111111111111",
    issuer: "Tessera Private Equity",
    custodian: "Fireblocks Institutional Custody",
    legalFramework: "Cayman Islands SPC - Loan Participation Right",
    proofOfReserve: "Pyth Network Oracle / On-Chain PoR",
    meteoraPoolAddress: "METspcxPoolAddress1111111111111111111111111",
    logoUrl: "https://images.unsplash.com/photo-1541185933-ef5d8ed016c2?w=128&q=80",
    currentStockPriceUsd: 215.4,
    isPreIpo: true,
  },
  {
    symbol: "$TOPAI",
    ticker: "TOPAI",
    name: "OpenAI (Tessera Pre-IPO)",
    mintAddress: "TOPAI111111111111111111111111111111111111111",
    issuer: "Tessera Private Equity",
    custodian: "Fireblocks Institutional Custody",
    legalFramework: "Cayman Islands SPC - Loan Participation Right",
    proofOfReserve: "Pyth Network Oracle / On-Chain PoR",
    meteoraPoolAddress: "METopeNAIPoolAddress111111111111111111111111",
    logoUrl: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=128&q=80",
    currentStockPriceUsd: 185.0,
    isPreIpo: true,
  },
  {
    symbol: "$TSTRIPE",
    ticker: "TSTRIPE",
    name: "Stripe (Tessera Pre-IPO)",
    mintAddress: "TSTRP111111111111111111111111111111111111111",
    issuer: "Tessera Private Equity",
    custodian: "Fireblocks Institutional Custody",
    legalFramework: "Cayman Islands SPC - Loan Participation Right",
    proofOfReserve: "Pyth Network Oracle / On-Chain PoR",
    meteoraPoolAddress: "METstripePoolAddress111111111111111111111111",
    logoUrl: "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=128&q=80",
    currentStockPriceUsd: 72.5,
    isPreIpo: true,
  },
  {
    symbol: "$NVDA",
    ticker: "NVDA",
    name: "Nvidia Corporation",
    mintAddress: "NVDA111111111111111111111111111111111111111",
    issuer: "Backpack Securities",
    custodian: "Fireblocks Institutional Custody",
    legalFramework: "New York UCC Article 8 Securities Intermediary",
    proofOfReserve: "Pyth Network Oracle / On-Chain PoR",
    meteoraPoolAddress: "METnvdaPoolAddress1111111111111111111111111",
    logoUrl: "https://images.unsplash.com/photo-1591488320449-011701bb6704?w=128&q=80",
    currentStockPriceUsd: 128.5,
    isPreIpo: false,
  },
  {
    symbol: "$TSLA",
    ticker: "TSLA",
    name: "Tesla Inc.",
    mintAddress: "TSLA111111111111111111111111111111111111111",
    issuer: "Backpack Securities",
    custodian: "Fireblocks Institutional Custody",
    legalFramework: "New York UCC Article 8 Securities Intermediary",
    proofOfReserve: "Pyth Network Oracle / On-Chain PoR",
    meteoraPoolAddress: "METtslaPoolAddress1111111111111111111111111",
    logoUrl: "https://images.unsplash.com/photo-1563986768609-322da13575f3?w=128&q=80",
    currentStockPriceUsd: 245.2,
    isPreIpo: false,
  },
];

// Backward-compatible alias for existing UI components
export type TokenizedEquity = TesseraPreIpoAsset;
export const VERIFIED_TOKENIZED_EQUITIES = VERIFIED_TESSERA_PRE_IPO_ASSETS;

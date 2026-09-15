import { PublicKey } from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey(
  "6ZiovCkRxRJgUaCS9uftFk3eVnGDsbnDXgUV1XHybH52"
);

export const GLOBAL_CONFIG_SEED = Buffer.from("global-config");
export const CURVE_SEED = Buffer.from("curve");
export const TOKEN_VAULT_SEED = Buffer.from("token-vault");
export const QUOTE_VAULT_SEED = Buffer.from("quote-vault");
export const TREASURY_VAULT_SEED = Buffer.from("treasury-vault");

export const TOTAL_MEME_SUPPLY = 1_000_000_000n * 1_000_000n; // 1 Billion tokens (6 decimals)
export const SALE_SUPPLY = 800_000_000n * 1_000_000n; // 800M for bonding curve
export const DEFAULT_GRADUATION_THRESHOLD_USDC = 60_000;

export interface TokenizedEquity {
  symbol: string;
  name: string;
  mintAddress: string;
  custodian: string;
  legalFramework: string;
  logoUrl: string;
  currentStockPriceUsd: number;
}

export const VERIFIED_TOKENIZED_EQUITIES: TokenizedEquity[] = [
  {
    symbol: "$SPCX",
    name: "SpaceX",
    mintAddress: "SPCX111111111111111111111111111111111111111",
    custodian: "Backpack Securities",
    legalFramework: "New York UCC Article 8",
    logoUrl: "https://images.unsplash.com/photo-1541185933-ef5d8ed016c2?w=128&q=80",
    currentStockPriceUsd: 215.4,
  },
  {
    symbol: "$NVDA",
    name: "Nvidia Corporation",
    mintAddress: "NVDA111111111111111111111111111111111111111",
    custodian: "Backpack Securities",
    legalFramework: "New York UCC Article 8",
    logoUrl: "https://images.unsplash.com/photo-1591488320449-011701bb6704?w=128&q=80",
    currentStockPriceUsd: 128.5,
  },
  {
    symbol: "$GRND",
    name: "Grindr Inc.",
    mintAddress: "GRND111111111111111111111111111111111111111",
    custodian: "Backpack Securities",
    legalFramework: "New York UCC Article 8",
    logoUrl: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=128&q=80",
    currentStockPriceUsd: 14.8,
  },
  {
    symbol: "$SNDK",
    name: "SanDisk Technologies",
    mintAddress: "SNDK111111111111111111111111111111111111111",
    custodian: "Backpack Securities",
    legalFramework: "New York UCC Article 8",
    logoUrl: "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=128&q=80",
    currentStockPriceUsd: 42.1,
  },
  {
    symbol: "$TSLA",
    name: "Tesla Inc.",
    mintAddress: "TSLA111111111111111111111111111111111111111",
    custodian: "Backpack Securities",
    legalFramework: "New York UCC Article 8",
    logoUrl: "https://images.unsplash.com/photo-1563986768609-322da13575f3?w=128&q=80",
    currentStockPriceUsd: 245.2,
  },
  {
    symbol: "$AAPL",
    name: "Apple Inc.",
    mintAddress: "AAPL111111111111111111111111111111111111111",
    custodian: "Backpack Securities",
    legalFramework: "New York UCC Article 8",
    logoUrl: "https://images.unsplash.com/photo-1611186871348-b1ce696e52c9?w=128&q=80",
    currentStockPriceUsd: 226.7,
  },
];

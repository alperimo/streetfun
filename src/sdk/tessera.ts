import {
  TesseraPreIpoAsset,
  TOTAL_MEME_SUPPLY,
} from "./constants";
import { calculateProRataEquity } from "./math";

export interface TesseraProofOfReserveStatus {
  isVerified: boolean;
  oracleNetwork: string;
  heartbeatTimestamp: string;
  collateralRatio: number; // e.g. 1.00 (100% backed)
  custodian: string;
  legalEntity: string;
}

/**
 * Finds a verified Tessera Pre-IPO asset by symbol, ticker, or mint address
 */
export function getTesseraAsset(identifier: string, assets: TesseraPreIpoAsset[]): TesseraPreIpoAsset {
  const normalized = identifier.trim().toUpperCase().replace("$", "");
  const found = assets.find(
    (a) =>
      a.ticker.toUpperCase() === normalized ||
      a.symbol.toUpperCase().replace("$", "") === normalized ||
      a.mintAddress === identifier
  );

  if (!found) throw new Error("Asset is not in the current Tessera catalog.");
  return found;
}

/**
 * Calculates entitled Tessera Pre-IPO shares when burning meme tokens post-graduation
 * Formula: (burnedMemeAmount / totalMemeSupply) * totalLockedTesseraShares
 */
export function calculateTesseraSharesEntitlement(
  memeAmountBurned: bigint,
  totalEquityLockedShares: bigint,
  totalMemeSupply: bigint = TOTAL_MEME_SUPPLY
): bigint {
  return calculateProRataEquity(
    memeAmountBurned,
    totalMemeSupply,
    totalEquityLockedShares
  );
}

/**
 * Queries Tessera's Pyth Network Proof-of-Reserve / On-Chain oracle status
 * In production, this reads the Pyth Price/Reserve feed on Solana.
 */
export async function getTesseraProofOfReserveStatus(
  asset: TesseraPreIpoAsset
): Promise<TesseraProofOfReserveStatus> {
  throw new Error("A verified Tessera reserve oracle is not integrated. No reserve attestation is available.");
}

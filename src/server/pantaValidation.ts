import { PublicKey } from "@solana/web3.js";
import type { LifecycleStage, PantaMarket, PantaPhase, PantaSide } from "@/lib/pantaTypes";

export class PantaError extends Error {
  constructor(public code: string, public status: number, message: string) { super(message); }
}
export const unavailable = () => new PantaError("PANTA_UNAVAILABLE", 503, "Prediction markets are temporarily unavailable.");
export function invalid(): never { throw new PantaError("INVALID_REQUEST", 400, "Invalid prediction market request."); }
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalid();
  return value as Record<string, unknown>;
}
export function address(value: unknown): string {
  if (typeof value !== "string" || value.length < 32 || value.length > 44) invalid();
  try { if (new PublicKey(value).toBase58() !== value) invalid(); } catch { invalid(); }
  return value;
}
export function side(value: unknown): PantaSide {
  if (value !== "yes" && value !== "no") invalid();
  return value;
}
export function text(value: unknown, max = 4000): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) invalid();
  return value;
}
export function decimal(value: unknown, positive = false): string {
  if (typeof value !== "string" || value.length > 40 || !/^(0|[1-9]\d*)(\.\d{1,9})?$/.test(value)) invalid();
  if (!Number.isFinite(Number(value)) || (positive && Number(value) <= 0)) invalid();
  return value;
}
/** USDC stays in integer micro-units; scientific notation and excess precision fail. */
export function usdcUnits(value: unknown, allowZero = false): bigint {
  if (typeof value !== "string" || value.length > 24 || !/^(0|[1-9]\d*)(\.\d{1,6})?$/.test(value)) invalid();
  const [whole, fraction = ""] = value.split(".");
  const units = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, "0"));
  if ((!allowZero && units === 0n) || units > 1_000_000_000n) invalid(); // maximum 1,000 USDC/order
  return units;
}
export function phase(value: unknown): PantaPhase {
  if (!["primary", "secondary", "resolved", "cancelled"].includes(String(value))) invalid();
  return value as PantaPhase;
}
function price(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const result = decimal(value);
  if (Number(result) > 1) invalid();
  return result;
}
function epoch(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0 || value > 8_640_000_000_000) invalid();
  return value;
}
export function parseMarket(value: unknown, marketId: string): PantaMarket {
  const row = object(value);
  if (row.marketId !== marketId || typeof row.resolved !== "boolean") throw unavailable();
  try {
    return {
      marketId: address(row.marketId), title: text(row.title, 500),
      description: text(row.description, 12000), phase: phase(row.phase),
      resolved: row.resolved, status: text(row.status, 64),
      startTime: epoch(row.startTime), resolutionTime: epoch(row.resolutionTime),
      yesPrice: price(row.yesPrice), noPrice: price(row.noPrice),
      volumeUsdc: row.volumeUsdc == null ? null : decimal(row.volumeUsdc),
    };
  } catch { throw unavailable(); }
}
export interface MarketBinding {
  network: "devnet" | "mainnet-beta";
  mint: string;
  stage: LifecycleStage;
  marketId: string;
  programId: string;
  usdcMint: string;
  expectedTitle: string;
}
/** Reviewed deployment configuration, never supplied by a browser or a default market. */
export function bindings(raw = process.env.PANTA_MARKET_BINDINGS_JSON || "[]"): MarketBinding[] {
  try {
    const rows: unknown = JSON.parse(raw);
    if (!Array.isArray(rows) || rows.length > 100) throw unavailable();
    const seen = new Set<string>();
    return rows.map(value => {
      const row = object(value);
      if (row.network !== "devnet" && row.network !== "mainnet-beta") throw unavailable();
      if (row.stage !== "pre-graduation" && row.stage !== "post-graduation") throw unavailable();
      const binding: MarketBinding = {
        network: row.network, stage: row.stage, mint: address(row.mint), marketId: address(row.marketId),
        programId: address(row.programId), usdcMint: address(row.usdcMint), expectedTitle: text(row.expectedTitle, 500),
      };
      const key = `${binding.network}:${binding.mint}:${binding.stage}`;
      const marketKey = `${binding.network}:${binding.marketId}`;
      if (seen.has(key) || seen.has(marketKey)) throw unavailable();
      seen.add(key); seen.add(marketKey);
      return binding;
    });
  } catch { throw unavailable(); }
}
export function findBinding(mint: string, stage: LifecycleStage): MarketBinding {
  const network = process.env.NEXT_PUBLIC_SOLANA_NETWORK || "devnet";
  const row = bindings().find(b => b.network === network && b.mint === mint && b.stage === stage);
  if (!row) throw new PantaError("MARKET_NOT_CONFIGURED", 404, "A prediction market is not available for this token yet.");
  return row;
}

export function shareUnits(value: unknown): bigint {
  const [whole, fraction = ""] = decimal(value, true).split(".");
  return BigInt(whole) * 1_000_000_000n + BigInt(fraction.padEnd(9, "0"));
}

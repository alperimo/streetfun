import type { LifecycleStage } from "@/lib/pantaTypes";
import { createServerSupabaseClient } from "./supabase";
import { address, type MarketBinding, PantaError, text, unavailable } from "./pantaValidation";

export type LifecycleRow = {
  network: "devnet" | "mainnet-beta"; mint: string; stage: LifecycleStage;
  source_signature: string; source_slot: number; anchor_time: number; deadline: number;
  status: "queued" | "quoted" | "signed" | "registered" | "blocked";
  question: string; title: string; resolution_rule: string; description: string; sources: string[]; target_mint: string;
  create_id: string | null; market_id: string | null; program_id: string | null; usdc_mint: string | null;
  quote: Record<string, unknown> | null; payment_units: string | null; quote_expires_at: string | null;
  signed_transaction: string | null; create_signature: string | null; last_valid_block_height: number | null;
  baseline: PriceEvidence | null; final_snapshot: PriceEvidence | null;
  graduated_signature: string | null; graduated_slot: number | null; graduated_time: number | null;
  failure_code: string | null; attempts: number; lease_id: string | null;
};
export type PriceEvidence = {
  observedAt: string; slot: number; tokenPriceUsd: number; targetPriceUsd: number;
  targetMint: string; targetSource: string; tokenPool: string; testCollateral: boolean;
};
export function lifecycleDb() {
  const db = createServerSupabaseClient();
  if (!db) throw unavailable();
  return db;
}
export function lifecycleNetwork(): LifecycleRow["network"] {
  const network = process.env.NEXT_PUBLIC_SOLANA_NETWORK || "devnet";
  if (network !== "devnet" && network !== "mainnet-beta") throw unavailable();
  return network;
}
export async function lifecycleRows(mint: string): Promise<LifecycleRow[]> {
  const { data, error } = await lifecycleDb().from("panta_lifecycle_markets").select("*").eq("network", lifecycleNetwork()).eq("mint", address(mint));
  if (error || !data) throw unavailable();
  return data as LifecycleRow[];
}
export function rowBinding(row: LifecycleRow): MarketBinding {
  if (row.status !== "registered") throw new PantaError("MARKET_PROVISIONING", 409, "The system prediction market is being prepared. Please check again shortly.");
  return { network: row.network, mint: address(row.mint), stage: row.stage, marketId: address(row.market_id),
    programId: address(row.program_id), usdcMint: address(row.usdc_mint), expectedTitle: text(row.title, 500) };
}
export async function lifecycleBinding(mint: string, stage: LifecycleStage): Promise<MarketBinding> {
  const row = (await lifecycleRows(mint)).find(row => row.stage === stage);
  if (!row) throw new PantaError("MARKET_NOT_CONFIGURED", 404, "A system prediction market is not available for this token yet.");
  return rowBinding(row);
}

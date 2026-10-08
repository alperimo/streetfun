import { NextRequest } from "next/server";
import { lifecycleRows } from "@/server/pantaLifecycleStore";
import { pantaJson, pantaFailure, pantaQuery, pantaLimit } from "@/server/pantaHttp";
import { address, invalid } from "@/server/pantaValidation";
import { evidenceOutcome } from "@/server/pantaResolution";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest, ctx: { params: Promise<{ mint: string }> }) {
  try {
    const mint = address((await ctx.params).mint);
    const params = pantaQuery(req, ["stage", "network"]), stage = params.get("stage"), network = params.get("network");
    if (!["pre-graduation", "post-graduation"].includes(stage || "") || network !== (process.env.NEXT_PUBLIC_SOLANA_NETWORK || "devnet")) invalid();
    await pantaLimit();
    const row = (await lifecycleRows(mint)).find(row => row.stage === stage);
    if (!row) return pantaJson({ error: "Lifecycle evidence not found." }, 404);
    return pantaJson({ version: 1, issuer: "StreetFun", network: row.network, mint: row.mint, stage: row.stage,
      title: row.title, resolutionRule: row.resolution_rule, sourcesOfTruth: row.sources,
      launchOrGraduation: { signature: row.source_signature, slot: row.source_slot, blockTime: row.anchor_time },
      deadline: row.deadline, targetMint: row.target_mint, marketId: row.status === "registered" ? row.market_id : null,
      graduation: row.graduated_signature ? { signature: row.graduated_signature, slot: row.graduated_slot, blockTime: row.graduated_time } : null,
      baseline: row.baseline, finalObservation: row.final_snapshot, outcomeEvidence: evidenceOutcome(row),
      settlementAuthority: "Panta oracle. This evidence does not itself resolve a Panta market." });
  } catch (error) { return pantaFailure(error); }
}

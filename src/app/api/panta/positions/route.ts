import { NextRequest } from "next/server";
import { pantaRequest } from "@/server/pantaService";
import { reviewedBindingsForToken } from "@/server/pantaMarket";
import { address, decimal, object, phase, side, unavailable } from "@/server/pantaValidation";
import { pantaFailure, pantaJson, pantaQuery } from "@/server/pantaHttp";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  try {
    const params = pantaQuery(req, ["wallet", "mint"]);
    const wallet = address(params.get("wallet")), mint = address(params.get("mint"));
    const { reviewed } = await reviewedBindingsForToken(mint);
    const result = object(await pantaRequest(`/positions/?${new URLSearchParams({ wallet })}`));
    if (result.wallet !== wallet || !Array.isArray(result.positions) || result.positions.length > 200) throw unavailable();
    const positions = result.positions.map(value => {
      const row = object(value);
      if (typeof row.claimable !== "boolean" || typeof row.claimed !== "boolean") throw unavailable();
      return { marketId: address(row.marketId), side: side(row.side), shares: decimal(row.shares), phase: phase(row.phase),
        claimable: row.claimable, claimed: row.claimed, outcome: row.outcome == null ? null : side(row.outcome) };
    }).filter(row => reviewed.some(binding => binding.marketId === row.marketId)).map(row => {
      const binding = reviewed.find(binding => binding.marketId === row.marketId)!;
      return { ...row, programId: binding.programId, usdcMint: binding.usdcMint };
    });
    return pantaJson({ wallet, positions });
  } catch (error) { return pantaFailure(error); }
}

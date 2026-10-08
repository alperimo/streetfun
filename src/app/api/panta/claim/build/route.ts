import { NextRequest } from "next/server";
import { pantaRequest } from "@/server/pantaService";
import { reviewedBindingsForToken, checkedMarket } from "@/server/pantaMarket";
import { buildCheckedTransaction } from "@/server/pantaBuild";
import { address, decimal, object, PantaError, unavailable } from "@/server/pantaValidation";
import { pantaBody, pantaFailure, pantaJson } from "@/server/pantaHttp";
export const dynamic = "force-dynamic";
export async function POST(req: NextRequest) {
  try {
    const body = await pantaBody(req, ["wallet", "mint", "marketId"]);
    const wallet = address(body.wallet), mint = address(body.mint);
    const marketId = address(body.marketId);
    const { reviewed } = await reviewedBindingsForToken(mint);
    const binding = reviewed.find(row => row.marketId === marketId);
    if (!binding) throw new PantaError("MARKET_NOT_CONFIGURED", 404, "This claim market is not associated with the token.");
    const market = await checkedMarket(binding);
    if (!market.resolved || market.phase !== "resolved") throw new PantaError("NOT_CLAIMABLE", 409, "This market is not ready for claims.");
    const raw = object(await pantaRequest("/claim/build/", { wallet, marketId: binding.marketId }));
    if (raw.wallet !== wallet || raw.marketId !== binding.marketId || !["YES", "NO", "yes", "no"].includes(String(raw.outcome))) throw unavailable();
    decimal(raw.winningShares, true);
    const transaction = await buildCheckedTransaction(raw, binding, { wallet }, "claim");
    return pantaJson({ ...transaction, winningShares: raw.winningShares, outcome: raw.outcome });
  } catch (error) { return pantaFailure(error); }
}

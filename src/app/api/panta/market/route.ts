import { NextRequest } from "next/server";
import { reviewedBindingsForToken, checkedMarket } from "@/server/pantaMarket";
import { lifecycleRows, rowBinding } from "@/server/pantaLifecycleStore";
import { address } from "@/server/pantaValidation";
import { pantaFailure, pantaJson, pantaQuery } from "@/server/pantaHttp";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  try {
    const mint = address(pantaQuery(req, ["mint"]).get("mint"));
    const { token } = await reviewedBindingsForToken(mint);
    const stage = token.bondingCurve.isGraduated ? "post-graduation" : "pre-graduation";
    const row = (await lifecycleRows(mint)).find(row => row.stage === stage);
    if (!row) return pantaJson({ code: "LIFECYCLE_EVENT_NOT_INDEXED", error: "The verified lifecycle event must be indexed before its system market can open." }, 404);
    if (row.status !== "registered") return pantaJson({ status: "provisioning", stage, title: row.title, description: row.description,
      message: row.failure_code === "PANTA_CONFIGURATION_INCOMPLETE" ? "Panta is completing prediction market setup for this network. Trading will become available after the market is confirmed."
        : row.failure_code === "LIFECYCLE_WINDOW_EXPIRED" ? "This market could not open before its prediction window ended."
        : "StreetFun has queued this system market. Trading will become available after Panta confirms its creation." }, 202);
    return pantaJson(await checkedMarket(rowBinding(row)));
  } catch (error) { return pantaFailure(error); }
}

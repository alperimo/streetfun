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
      availabilityLabel: row.status === "blocked" ? "Market unavailable" : row.status === "signed" ? "Awaiting confirmation"
        : row.failure_code === "PANTA_CONFIGURATION_INCOMPLETE" ? "Awaiting provider setup" : "Creation queued",
      message: row.failure_code === "PANTA_CONFIGURATION_INCOMPLETE" ? "Panta prediction trading is unavailable on this network. The system market will retry after provider setup is available."
        : row.failure_code === "LIFECYCLE_WINDOW_EXPIRED" ? "This market could not open before its prediction window ended."
        : row.failure_code === "LIFECYCLE_ALREADY_GRADUATED" ? "This token graduated before its prediction market could open."
        : row.failure_code === "PRICE_BASELINE_MISSING" ? "This market could not open because verified graduation prices were not available in time."
        : row.failure_code === "CREATE_TRANSACTION_FAILED" ? "The system market creation transaction failed. Prediction trading is unavailable."
        : "StreetFun has queued this system market. Trading will become available after Panta confirms its creation." }, 202);
    return pantaJson(await checkedMarket(rowBinding(row)));
  } catch (error) { return pantaFailure(error); }
}

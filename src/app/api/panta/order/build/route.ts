import { NextRequest } from "next/server";
import { pantaRequest } from "@/server/pantaService";
import { bindingFromSession, bindingForToken, requirePrimaryMarket } from "@/server/pantaMarket";
import { readPantaSession } from "@/server/pantaSession";
import { buildCheckedTransaction } from "@/server/pantaBuild";
import { decimal, object, text, unavailable, usdcUnits, shareUnits } from "@/server/pantaValidation";
import { pantaBody, pantaFailure, pantaJson } from "@/server/pantaHttp";
export const dynamic = "force-dynamic";
export async function POST(req: NextRequest) {
  try {
    const body = await pantaBody(req, ["quoteToken"]);
    const session = readPantaSession(body.quoteToken, "quote");
    const binding = await bindingFromSession(session);
    if ((await bindingForToken(binding.mint)).marketId !== binding.marketId) throw unavailable();
    await requirePrimaryMarket(binding);
    const raw = object(await pantaRequest("/primaryorderbuild/", { quoteId: session.quoteId, wallet: session.wallet, maxSlippageBps: 100 }));
    if (raw.wallet !== session.wallet || raw.marketId !== session.marketId || raw.quoteId !== session.quoteId || raw.side !== session.side ||
        raw.status !== "built" || usdcUnits(raw.amountUsdc) !== usdcUnits(session.amountUsdc) || !/^ord_[A-Za-z0-9_-]+$/.test(text(raw.orderId, 128))) throw unavailable();
    decimal(raw.expectedShares, true); decimal(raw.feeUsdc);
    if (usdcUnits(raw.feeUsdc, true) > usdcUnits(session.feeUsdc, true) + 1n ||
        shareUnits(raw.expectedShares) * 101n < shareUnits(session.shares) * 100n) throw unavailable();
    const transaction = await buildCheckedTransaction(raw, binding, session, "buy");
    return pantaJson({ ...transaction, orderId: raw.orderId, quoteId: raw.quoteId, amountUsdc: raw.amountUsdc, side: raw.side, expectedShares: raw.expectedShares, feeUsdc: raw.feeUsdc });
  } catch (error) { return pantaFailure(error); }
}

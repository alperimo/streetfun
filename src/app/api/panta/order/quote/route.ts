import { NextRequest } from "next/server";
import { pantaRequest } from "@/server/pantaService";
import { bindingForToken, requirePrimaryMarket } from "@/server/pantaMarket";
import { address, decimal, object, side, text, unavailable, usdcUnits } from "@/server/pantaValidation";
import { pantaBody, pantaFailure, pantaJson } from "@/server/pantaHttp";
import { issuePantaSession } from "@/server/pantaSession";
export const dynamic = "force-dynamic";
export async function POST(req: NextRequest) {
  try {
    const body = await pantaBody(req, ["mint", "wallet", "side", "amountUsdc"]);
    const mint = address(body.mint), wallet = address(body.wallet), orderSide = side(body.side);
    const amountUsdc = text(body.amountUsdc, 24); usdcUnits(amountUsdc);
    const binding = await bindingForToken(mint);
    await requirePrimaryMarket(binding);
    const quote = object(await pantaRequest("/primaryorderquote/", { wallet, marketId: binding.marketId, side: orderSide, amountUsdc }));
    const quoteId = text(quote.quoteId, 128), expiresAt = text(quote.expiresAt, 64);
    const expires = Date.parse(expiresAt);
    if (!/^qt_[A-Za-z0-9_-]+$/.test(quoteId) || quote.marketId !== binding.marketId || quote.side !== orderSide ||
        usdcUnits(quote.amountUsdc) !== usdcUnits(amountUsdc) || !Number.isFinite(expires) || expires <= Date.now() || expires > Date.now() + 120_000) throw unavailable();
    const shares = decimal(quote.shares, true), feeUsdc = decimal(quote.feeUsdc), avgPrice = decimal(quote.avgPrice, true);
    if (Number(avgPrice) > 1 || usdcUnits(feeUsdc, true) > usdcUnits(amountUsdc)) throw unavailable();
    const quoteToken = issuePantaSession({ kind: "quote", ...binding, wallet, side: orderSide, amountUsdc, quoteId, shares, feeUsdc, avgPrice, expires });
    return pantaJson({ quoteId, marketId: binding.marketId, side: orderSide, amountUsdc, shares, feeUsdc, avgPrice, expiresAt, quoteToken });
  } catch (error) { return pantaFailure(error); }
}

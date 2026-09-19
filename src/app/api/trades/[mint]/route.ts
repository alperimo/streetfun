import { NextRequest, NextResponse } from "next/server";
import { TradeStoreService } from "@/services/indexer/tradeStore";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ mint: string }> }
) {
  try {
    const { mint } = await params;
    const url = new URL(req.url);
    const limit = Number(url.searchParams.get("limit") ?? "20");

    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
      return NextResponse.json({ error: "Limit must be an integer from 1 to 1000." }, { status: 400 });
    }
    const tradeStore = TradeStoreService.getInstance();
    const trades = await tradeStore.getTrades(mint, limit);

    return NextResponse.json({
      success: true,
      trades,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

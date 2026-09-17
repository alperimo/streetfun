import { NextRequest, NextResponse } from "next/server";
import { TradeStoreService } from "@/services/indexer/tradeStore";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ mint: string }> }
) {
  try {
    const { mint } = await params;
    const url = new URL(req.url);
    const limit = parseInt(url.searchParams.get("limit") || "20", 10);

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

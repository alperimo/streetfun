import { NextRequest, NextResponse } from "next/server";
import { TradeStoreService } from "@/services/indexer/tradeStore";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ mint: string }> }
) {
  try {
    const { mint } = await params;
    const url = new URL(req.url);
    const intervalStr = url.searchParams.get("timeframe") || "15m";
    const currentPrice = parseFloat(url.searchParams.get("price") || "0.00003");

    let intervalMinutes = 15;
    if (intervalStr === "1m") intervalMinutes = 1;
    else if (intervalStr === "5m") intervalMinutes = 5;
    else if (intervalStr === "15m") intervalMinutes = 15;
    else if (intervalStr === "1h") intervalMinutes = 60;
    else if (intervalStr === "4h") intervalMinutes = 240;
    else if (intervalStr === "1D") intervalMinutes = 1440;

    const tradeStore = TradeStoreService.getInstance();
    const bars = await tradeStore.getOHLCV(mint, intervalMinutes, 100, currentPrice);

    return NextResponse.json({
      success: true,
      bars,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

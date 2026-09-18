import { NextRequest, NextResponse } from "next/server";
import { TradeStoreService, TradeRecord, TokenRecord } from "@/services/indexer/tradeStore";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const tradeStore = TradeStoreService.getInstance();

    if (body.token) {
      const token: TokenRecord = body.token;
      await tradeStore.recordToken(token);
    }

    if (body.trade || body.mint) {
      const trade: TradeRecord = body.trade || body;
      await tradeStore.recordTrade(trade);
    }

    return NextResponse.json({
      success: true,
      message: "Trade successfully recorded and indexed",
    });
  } catch (err: any) {
    console.error("[Trades Record API] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

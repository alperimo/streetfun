import { NextResponse } from "next/server";
import { TradeStoreService } from "@/services/indexer/tradeStore";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const tradeStore = TradeStoreService.getInstance();
    const prices = await tradeStore.getLatestPrices();

    return NextResponse.json({
      success: true,
      prices,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { TradeStoreService } from "@/services/indexer/tradeStore";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const tradeStore = TradeStoreService.getInstance();
    const redemptions = await tradeStore.getRedemptions(30);

    return NextResponse.json({
      success: true,
      redemptions,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

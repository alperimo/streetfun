import { NextRequest, NextResponse } from "next/server";
import { TradeStoreService } from "@/services/indexer/tradeStore";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const rawMints = req.nextUrl.searchParams.get("mints") || "";
    const mints = Array.from(
      new Set(
        rawMints
          .split(",")
          .map((mint) => mint.trim())
          .filter(Boolean)
          .slice(0, 200)
      )
    );
    const stats = await TradeStoreService.getInstance().getMarketStats(mints);

    return NextResponse.json(
      { success: true, stats, asOf: new Date().toISOString() },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

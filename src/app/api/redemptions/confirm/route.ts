import { NextResponse } from "next/server";
import { indexConfirmedTransaction } from "@/server/indexTransaction";
import { getServerConnection } from "@/server/rpc";
import { InvalidCurveTradeError } from "@/services/indexer/parseCurveTrade";

export async function POST(request: Request) {
  try {
    const { signature, mint } = await request.json();
    const result = await indexConfirmedTransaction(getServerConnection(), signature);
    const trade = result.trades.find(t => t.trade_type === "REDEEM" && t.mint === mint);
    if (!trade) return NextResponse.json({ error: "No matching redemption." }, { status: 422 });
    return NextResponse.json({ success: true, trade });
  } catch (error) {
    return NextResponse.json({ error: "Redemption receipt unavailable." }, { status: error instanceof InvalidCurveTradeError ? 422 : 503 });
  }
}

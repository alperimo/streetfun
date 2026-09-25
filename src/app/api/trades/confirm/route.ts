import { NextRequest, NextResponse } from "next/server";
import { getServerConnection } from "@/server/rpc";
import { indexConfirmedTransaction } from "@/server/indexTransaction";
import { readConfirmedCurveTrade, InvalidCurveTradeError } from "@/services/indexer/confirmedTrade";

export async function POST(req: NextRequest) {
  try {
    const { signature, mint, protocol, purpose } = await req.json();
    const connection = getServerConnection();
    if (protocol === "meteora-dbc") {
      const result = await indexConfirmedTransaction(connection, signature, undefined, mint);
      if (purpose === "graduation") return NextResponse.json({ success: true, indexed: true });
      const trade = result.trades.find(item => item.mint === mint && item.trade_type !== "REDEEM");
      if (!trade) throw new InvalidCurveTradeError("No matching confirmed Meteora swap was found.");
      return NextResponse.json({ success: true, indexed: true, trade });
    }
    const trade = await readConfirmedCurveTrade(connection, signature, mint);
    try {
      await indexConfirmedTransaction(connection, signature, undefined, mint);
      return NextResponse.json({ success: true, indexed: true, trade });
    } catch (indexError) {
      console.error("[TradeConfirm] Confirmed transaction could not be indexed:", indexError);
      return NextResponse.json({ success: true, indexed: false, trade });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err instanceof InvalidCurveTradeError ? 422 : 503 });
  }
}

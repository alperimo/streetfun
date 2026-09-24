import { NextRequest, NextResponse } from "next/server";
import { getServerConnection } from "@/server/rpc";
import { indexConfirmedTransaction } from "@/server/indexTransaction";
import { readConfirmedCurveTrade, InvalidCurveTradeError } from "@/services/indexer/confirmedTrade";

export async function POST(req: NextRequest) {
  try {
    const { signature, mint } = await req.json();
    const connection = getServerConnection();
    const trade = await readConfirmedCurveTrade(connection, signature, mint);
    try {
      await indexConfirmedTransaction(connection, signature);
      return NextResponse.json({ success: true, indexed: true, trade });
    } catch (indexError) {
      console.error("[TradeConfirm] Confirmed transaction could not be indexed:", indexError);
      return NextResponse.json({ success: true, indexed: false, trade });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: err instanceof InvalidCurveTradeError ? 422 : 503 });
  }
}

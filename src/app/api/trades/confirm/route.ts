import { NextRequest, NextResponse } from "next/server";
import { Connection } from "@solana/web3.js";
import { TradeStoreService } from "@/services/indexer/tradeStore";
import { readConfirmedCurveTrade } from "@/services/indexer/confirmedTrade";

export async function POST(req: NextRequest) {
  try {
    const { signature, mint } = await req.json();
    const connection = new Connection(
      process.env.NEXT_PUBLIC_SOLANA_RPC || "https://api.devnet.solana.com",
      "confirmed"
    );
    const trade = await readConfirmedCurveTrade(connection, signature, mint);
    try {
      await TradeStoreService.getInstance().recordTrade(trade);
      return NextResponse.json({ success: true, indexed: true, trade });
    } catch (indexError) {
      console.error("[TradeConfirm] Confirmed transaction could not be indexed:", indexError);
      return NextResponse.json({ success: true, indexed: false, trade });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 422 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { Connection } from "@solana/web3.js";
import { TradeStoreService } from "@/services/indexer/tradeStore";
import { readConfirmedCurveTrade } from "@/services/indexer/confirmedTrade";

export async function POST(req: NextRequest) {
  const secret = process.env.HELIUS_WEBHOOK_SECRET;
  const authorization = req.headers.get("authorization");
  if (!secret || (authorization !== secret && authorization !== `Bearer ${secret}`)) {
    return NextResponse.json({ error: "Unauthorized webhook caller" }, { status: 401 });
  }

  try {
    const payload = await req.json();
    if (!Array.isArray(payload)) {
      return NextResponse.json({ error: "Expected an array of transactions" }, { status: 400 });
    }

    const connection = new Connection(
      process.env.NEXT_PUBLIC_SOLANA_RPC || "https://api.devnet.solana.com",
      "confirmed"
    );
    const tradeStore = TradeStoreService.getInstance();
    let processedCount = 0;
    let skippedCount = 0;

    for (const event of payload) {
      try {
        const trade = await readConfirmedCurveTrade(connection, event.signature);
        if (event.slot && Number(event.slot) !== trade.slot) {
          throw new Error("Webhook slot does not match the confirmed transaction.");
        }
        await tradeStore.recordTrade(trade);
        processedCount += 1;
      } catch (error) {
        skippedCount += 1;
        console.warn("[Helius Webhook] Ignored unverified transaction:", error);
      }
    }

    return NextResponse.json({ success: true, processedCount, skippedCount });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

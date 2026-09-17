import { NextRequest, NextResponse } from "next/server";
import { TradeStoreService } from "@/services/indexer/tradeStore";
import { PROGRAM_ID } from "@/sdk/constants";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const secret = process.env.HELIUS_WEBHOOK_SECRET;

    // Optional secret verification if configured
    if (secret && authHeader !== secret && authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized webhook caller" }, { status: 401 });
    }

    const payload = await req.json();
    if (!Array.isArray(payload)) {
      return NextResponse.json({ error: "Expected array of transactions" }, { status: 400 });
    }

    const tradeStore = TradeStoreService.getInstance();
    let processedCount = 0;

    for (const tx of payload) {
      const signature = tx.signature;
      const slot = tx.slot;
      const timestamp = tx.timestamp ? new Date(tx.timestamp * 1000).toISOString() : new Date().toISOString();
      const feePayer = tx.feePayer;

      // Scan instructions or account data
      const instructions = tx.instructions || [];
      for (const ix of instructions) {
        if (ix.programId === PROGRAM_ID.toBase58()) {
          // Identify trade / action
          // In real production Anchor, events or instruction logs determine action:
          const logs = tx.meta?.logMessages || tx.events?.nft || [];
          const logString = Array.isArray(logs) ? logs.join(" ") : "";

          let tradeType: "BUY" | "SELL" | "REDEEM" = "BUY";
          if (logString.includes("Instruction: Sell") || logString.includes("Sell")) {
            tradeType = "SELL";
          } else if (logString.includes("Instruction: BurnAndRedeem") || logString.includes("Redeem")) {
            tradeType = "REDEEM";
          }

          // Mint address is typically the meme mint in the account keys
          const mint = ix.accounts?.[2] || ix.accounts?.[1] || "UNKNOWN_MINT";

          await tradeStore.recordTrade({
            tx_signature: signature,
            mint,
            trade_type: tradeType,
            price_usd: 0.00003, // Will be parsed from logs/events
            tokens_amount: 10000,
            quote_amount_usd: 10,
            trader: feePayer,
            slot,
            created_at: timestamp,
          });

          processedCount++;
        }
      }
    }

    return NextResponse.json({
      success: true,
      message: `Processed ${processedCount} StreetFun protocol events`,
    });
  } catch (err: any) {
    console.error("[Helius Webhook] Error processing event:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

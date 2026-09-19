import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { TradeStoreService } from "@/services/indexer/tradeStore";
import { PROGRAM_ID } from "@/sdk/constants";

const SIGNATURE_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{64,88}$/;
const TOKEN_DECIMALS = 1_000_000;

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const secret = process.env.HELIUS_WEBHOOK_SECRET;
    if (!secret || (authHeader !== secret && authHeader !== `Bearer ${secret}`)) {
      return NextResponse.json({ error: "Unauthorized webhook caller" }, { status: 401 });
    }

    const payload = await req.json();
    if (!Array.isArray(payload)) {
      return NextResponse.json({ error: "Expected array of transactions" }, { status: 400 });
    }

    const tradeStore = TradeStoreService.getInstance();
    let processedCount = 0;
    let skippedCount = 0;

    for (const tx of payload) {
      const signature = tx.signature;
      const slot = Number(tx.slot);
      if (!SIGNATURE_PATTERN.test(signature || "") || !Number.isInteger(slot) || slot <= 0) {
        skippedCount += 1;
        continue;
      }

      const instructions = (tx.instructions || []).filter(
        (instruction: any) => instruction.programId === PROGRAM_ID.toBase58()
      );
      const logs = tx.meta?.logMessages || [];
      const logText = Array.isArray(logs) ? logs.join("\n") : "";
      const buy = logText.match(/Buy executed\. Spent: (\d+), Received: (\d+), New Real Quote: (\d+)/);
      const sell = logText.match(/Sell executed\. Sold: (\d+), Received Quote: (\d+), New Real Quote: (\d+)/);
      const redeem = logText.match(
        /Burn and redeem completed\. Burned: (\d+), Redeemed Shares: (\d+), Remaining Locked: (\d+)/
      );

      if (instructions.length === 0 || (!buy && !sell && !redeem)) {
        skippedCount += 1;
        continue;
      }

      const instruction = instructions[0];
      const mintCandidate = redeem ? instruction.accounts?.[1] : instruction.accounts?.[2];
      let mint: string;
      try {
        mint = new PublicKey(mintCandidate).toBase58();
      } catch {
        skippedCount += 1;
        continue;
      }

      const match = buy || sell || redeem!;
      const tradeType: "BUY" | "SELL" | "REDEEM" = buy ? "BUY" : sell ? "SELL" : "REDEEM";
      const tokenRaw = BigInt(match[buy ? 2 : 1]);
      const quoteRaw = buy
        ? BigInt(match[1])
        : sell
          ? BigInt(match[2])
          : 0n;
      const tokensAmount = Number(tokenRaw) / TOKEN_DECIMALS;
      const quoteAmountUsd = Number(quoteRaw) / TOKEN_DECIMALS;
      const priceUsd = quoteAmountUsd > 0 && tokensAmount > 0 ? quoteAmountUsd / tokensAmount : 0;

      await tradeStore.recordTrade({
        tx_signature: signature,
        mint,
        trade_type: tradeType,
        price_usd: priceUsd,
        tokens_amount: tokensAmount,
        quote_amount_usd: quoteAmountUsd,
        trader: tx.feePayer,
        slot,
        created_at: tx.timestamp
          ? new Date(tx.timestamp * 1000).toISOString()
          : new Date().toISOString(),
      });
      processedCount += 1;
    }

    return NextResponse.json({ success: true, processedCount, skippedCount });
  } catch (err: any) {
    console.error("[Helius Webhook] Error processing event:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "@/sdk/constants";
import { TradeStoreService } from "@/services/indexer/tradeStore";

const SIGNATURE_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{64,88}$/;
const TOKEN_DECIMALS = 1_000_000;

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function POST(req: NextRequest) {
  try {
    const { signature, mint } = await req.json();
    if (!SIGNATURE_PATTERN.test(signature || "")) {
      return NextResponse.json({ error: "Invalid Solana signature" }, { status: 400 });
    }

    let mintPublicKey: PublicKey;
    try {
      mintPublicKey = new PublicKey(mint);
    } catch {
      return NextResponse.json({ error: "Invalid mint" }, { status: 400 });
    }

    const connection = new Connection(
      process.env.NEXT_PUBLIC_SOLANA_RPC || "https://api.devnet.solana.com",
      "confirmed"
    );
    let transaction = null;
    for (let attempt = 0; attempt < 4 && !transaction; attempt += 1) {
      transaction = await connection.getParsedTransaction(signature, {
        commitment: "confirmed",
        maxSupportedTransactionVersion: 0,
      });
      if (!transaction && attempt < 3) await wait(250);
    }

    if (!transaction || transaction.meta?.err) {
      return NextResponse.json({ error: "Confirmed transaction not found" }, { status: 404 });
    }

    const accountKeys = transaction.transaction.message.accountKeys;
    const keys = accountKeys.map((entry) => entry.pubkey.toBase58());
    if (!keys.includes(PROGRAM_ID.toBase58()) || !keys.includes(mintPublicKey.toBase58())) {
      return NextResponse.json(
        { error: "Transaction does not belong to this StreetFun curve" },
        { status: 422 }
      );
    }

    const logs = transaction.meta?.logMessages || [];
    const logText = logs.join("\n");
    const buy = logText.match(/Buy executed\. Spent: (\d+), Received: (\d+), New Real Quote: (\d+)/);
    const sell = logText.match(/Sell executed\. Sold: (\d+), Received Quote: (\d+), New Real Quote: (\d+)/);
    if (!buy && !sell) {
      return NextResponse.json({ error: "No StreetFun trade event found" }, { status: 422 });
    }

    const tradeType = buy ? "BUY" : "SELL";
    const tokenRaw = BigInt((buy || sell)![buy ? 2 : 1]);
    const quoteRaw = BigInt((buy || sell)![buy ? 1 : 2]);
    const tokensAmount = Number(tokenRaw) / TOKEN_DECIMALS;
    const quoteAmountUsd = Number(quoteRaw) / TOKEN_DECIMALS;
    if (!(tokensAmount > 0) || !(quoteAmountUsd > 0)) {
      return NextResponse.json({ error: "Trade amounts are invalid" }, { status: 422 });
    }

    const trader =
      accountKeys.find((entry) => entry.signer)?.pubkey.toBase58() || accountKeys[0].pubkey.toBase58();
    await TradeStoreService.getInstance().recordTrade({
      tx_signature: signature,
      mint: mintPublicKey.toBase58(),
      trade_type: tradeType,
      price_usd: quoteAmountUsd / tokensAmount,
      tokens_amount: tokensAmount,
      quote_amount_usd: quoteAmountUsd,
      trader,
      slot: transaction.slot,
      created_at: transaction.blockTime
        ? new Date(transaction.blockTime * 1000).toISOString()
        : new Date().toISOString(),
    });

    return NextResponse.json({ success: true, signature });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

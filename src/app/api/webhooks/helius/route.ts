import { NextRequest, NextResponse } from "next/server";
import { Connection } from "@solana/web3.js";
import { TradeStoreService } from "@/services/indexer/tradeStore";
import { readConfirmedCurveTrade, InvalidCurveTradeError } from "@/services/indexer/confirmedTrade";
import { createServerSupabaseClient } from "@/lib/supabase";
import { solanaTokenService } from "@/services/solana/solanaTokenService";
import { VERIFIED_TESSERA_PRE_IPO_ASSETS } from "@/sdk/constants";

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

    const rpcUrl =
      process.env.NEXT_PUBLIC_SOLANA_RPC ||
      (process.env.HELIUS_API_KEY
        ? `https://devnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
        : "https://api.devnet.solana.com");
    const connection = new Connection(rpcUrl, "confirmed");
    const tradeStore = TradeStoreService.getInstance();
    const supabase = createServerSupabaseClient();
    let processedCount = 0;
    let skippedCount = 0;
    let retryCount = 0;

    for (const event of payload) {
      const signature = event?.signature;
      if (!signature) {
        skippedCount += 1;
        continue;
      }

      try {
        // 1. Check if it's a Buy or Sell curve trade
        try {
          const trade = await readConfirmedCurveTrade(connection, signature);
          await tradeStore.recordTrade(trade);
          processedCount += 1;
          continue;
        } catch (tradeError) {
          if (!(tradeError instanceof InvalidCurveTradeError)) {
            throw tradeError;
          }
        }

        // 2. If not a buy/sell trade, check if it's Launch, Graduation, or Redemption
        const tx = await connection.getParsedTransaction(signature, {
          commitment: "confirmed",
          maxSupportedTransactionVersion: 0,
        });

        if (!tx || !tx.meta) {
          skippedCount += 1;
          continue;
        }

        const logs = tx.meta.logMessages || [];
        const logsText = logs.join(" ");

        // Case A: Launch Stonk
        if (logsText.includes("Instruction: LaunchStonk") || logsText.includes("launch_stonk")) {
          const keys = tx.transaction.message.accountKeys;
          const creator = keys[0]?.pubkey?.toBase58();
          const memeMint = keys[2]?.pubkey?.toBase58();
          const targetEquityMint = keys[3]?.pubkey?.toBase58();

          if (memeMint && supabase) {
            const knownAsset = VERIFIED_TESSERA_PRE_IPO_ASSETS.find(
              (a) => a.mintAddress === targetEquityMint
            );
            await supabase.from("tokens").upsert(
              {
                mint: memeMint,
                name: `StreetFun ${memeMint.slice(0, 4)}`,
                symbol: memeMint.slice(0, 5).toUpperCase(),
                target_equity_symbol: knownAsset?.symbol || "UNKNOWN",
                target_equity_mint: targetEquityMint || "",
                creator: creator || "",
                is_graduated: false,
                created_at: tx.blockTime
                  ? new Date(tx.blockTime * 1000).toISOString()
                  : new Date().toISOString(),
              },
              { onConflict: "mint" }
            );
            processedCount += 1;
            console.log(`[Helius Webhook] Indexed new launch: ${memeMint}`);
            continue;
          }
        }

        // Case B: Graduation & 50/50 Split
        if (
          logsText.includes("Curve graduated successfully!") ||
          logsText.includes("Instruction: GraduateAndExecuteStock")
        ) {
          const keys = tx.transaction.message.accountKeys;
          const memeMint = keys[2]?.pubkey?.toBase58();

          if (memeMint && supabase) {
            await supabase
              .from("tokens")
              .update({
                is_graduated: true,
                updated_at: new Date().toISOString(),
              })
              .eq("mint", memeMint);
            processedCount += 1;
            console.log(`[Helius Webhook] Indexed graduation for ${memeMint}`);
            continue;
          }
        }

        // Case C: Burn & Redeem Stock
        const redeemMatch = logsText.match(/Burn and redeem completed\. Burned: (\d+), Redeemed Shares: (\d+)/);
        if (redeemMatch || logsText.includes("Instruction: BurnAndRedeem")) {
          const keys = tx.transaction.message.accountKeys;
          const redeemer = keys[0]?.pubkey?.toBase58();
          const memeMint = keys[1]?.pubkey?.toBase58();
          const burnedTokens = redeemMatch ? Number(redeemMatch[1]) / 1_000_000 : 0;

          if (memeMint) {
            await tradeStore.recordTrade({
              tx_signature: signature,
              mint: memeMint,
              trade_type: "REDEEM",
              price_usd: 0,
              tokens_amount: burnedTokens,
              quote_amount_usd: 0,
              trader: redeemer || "unknown",
              slot: tx.slot,
              created_at: tx.blockTime
                ? new Date(tx.blockTime * 1000).toISOString()
                : new Date().toISOString(),
            });
            processedCount += 1;
            console.log(`[Helius Webhook] Indexed redemption for ${memeMint}`);
            continue;
          }
        }

        skippedCount += 1;
      } catch (error) {
        retryCount += 1;
        console.warn("[Helius Webhook] Transaction processing note:", error);
      }
    }

    // Invalidate cache so users immediately get updated prices and states
    if (processedCount > 0) {
      solanaTokenService.invalidateCache();
    }

    return NextResponse.json(
      { success: retryCount === 0, processedCount, skippedCount, retryCount },
      { status: retryCount > 0 ? 503 : 200 }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
}

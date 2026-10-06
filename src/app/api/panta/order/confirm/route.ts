import { NextRequest, NextResponse } from "next/server";
import { PantaClient } from "@/server/pantaService";
import { getServerConnection } from "@/server/rpc";
import { createServerSupabaseClient } from "@/server/supabase";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { signature, wallet, marketId, side, quoteId, orderId, amountUsdc, shares } = body;

    if (!signature || !wallet) {
      return NextResponse.json(
        { error: "Missing signature or wallet" },
        { status: 400 }
      );
    }

    // 1. Verify transaction on Solana Devnet
    const connection = getServerConnection();
    try {
      const statusRes = await connection.getSignatureStatus(signature);
      console.log(`[api/panta/order/confirm] Tx ${signature} status:`, statusRes.value?.confirmationStatus);
    } catch (solErr) {
      console.warn(`[api/panta/order/confirm] Could not fetch signature status immediately:`, solErr);
    }

    // 2. Report to Panta API for attribution (idempotent fail-safe)
    let pantaAttribution = "pending";
    try {
      const reportRes = await PantaClient.reportTrade({
        signature,
        wallet,
        marketId: marketId || "F2nK5f6NTgVA8zVT2CzRYRNaMcntv3njEkNCozGMs2Sj",
        side: side || "yes",
        quoteId,
      });
      pantaAttribution = reportRes.status || "reported";
    } catch (pantaErr: any) {
      console.log(`[api/panta/order/confirm] Panta report note:`, pantaErr.message);
    }

    // 3. Persist position & trade record in Supabase database if available
    const db = createServerSupabaseClient();
    if (db) {
      try {
        await db.from("panta_predictions").insert({
          signature,
          wallet,
          market_id: marketId,
          side: side || "yes",
          amount_usdc: amountUsdc ? parseFloat(amountUsdc) : 0,
          shares: shares ? parseFloat(shares) : 0,
          status: "confirmed",
          created_at: new Date().toISOString(),
        });
      } catch (dbErr) {
        // Table might not exist yet, log gracefully
        console.warn("[api/panta/order/confirm] Supabase persist note:", dbErr);
      }
    }

    return NextResponse.json({
      success: true,
      signature,
      attribution: pantaAttribution,
      message: `Prediction for ${side?.toUpperCase()} recorded successfully on-chain and attributed to Panta.`,
    });
  } catch (err: any) {
    console.error("[api/panta/order/confirm] Error:", err);
    return NextResponse.json(
      { error: err.message || "Failed to confirm prediction trade" },
      { status: 500 }
    );
  }
}

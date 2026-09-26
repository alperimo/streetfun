import { NextResponse } from "next/server";
import { isVerifiedChainTrade, TradeRecord } from "@/services/indexer/tradeStore";
import { createServerSupabaseClient } from "@/server/supabase";
import { getLiveTokens } from "@/services/tokens/liveTokens";
import { liveTreasuryHoldings } from "@/server/treasurySnapshot";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const db = createServerSupabaseClient();
  let liveTokens;
  try { liveTokens = await getLiveTokens(); }
  catch { return NextResponse.json({ error: "Current treasury balances could not be verified. Please retry." }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
  const graduatedLiveTokens = liveTokens.filter(
    (t) => t.bondingCurve.isGraduated && Boolean(t.bondingCurve.meteoraPoolAddress)
  );

  let redemptionsRaw: any[] = [];
  let summary: any = null;

  if (db) {
    try {
      const [redemptionsResult, graduatedResult] = await Promise.all([
        Promise.resolve(
          db
            .from("trades")
            .select("id,tx_signature,instruction_index,mint,trade_type,price_usd,tokens_amount,quote_amount_usd,trader,equity_amount,slot,created_at")
            .eq("trade_type", "REDEEM")
            .order("created_at", { ascending: false })
            .limit(100)
        ).catch(() => ({ data: null, error: { message: "trades table unavailable" } })),
        Promise.resolve(
          db.rpc("get_treasury_summary")
        ).catch(() => ({ data: null, error: { message: "rpc unavailable" } })),
      ]);

      if (redemptionsResult && !redemptionsResult.error && redemptionsResult.data) {
        redemptionsRaw = redemptionsResult.data;
      }
      if (graduatedResult && !graduatedResult.error && graduatedResult.data?.[0]) {
        summary = graduatedResult.data[0];
      }
    } catch (err) {
      console.warn("[Treasury API] Direct table query warning, falling back to live tokens:", err);
    }
  }

  const redemptions = (redemptionsRaw as TradeRecord[]).filter(isVerifiedChainTrade);

  const holdings = liveTreasuryHoldings(liveTokens);

  const recentRedemptions = redemptions.map((redemption) => {
    const token = liveTokens.find((t) => t.mint === redemption.mint);
    return {
      id: String(redemption.id || `${redemption.tx_signature}:${redemption.instruction_index || 0}`),
      mint: redemption.mint,
      tokenName: token?.name || `StreetFun ${redemption.mint.slice(0, 4)}`,
      tokenSymbol: token?.symbol || redemption.mint.slice(0, 5),
      tokenAvatarUrl: token?.avatarUrl || null,
      equitySymbol: token?.targetEquity.symbol || "UNVERIFIED",
      burnedAmount: String(redemption.tokens_amount || 0),
      equityAmount: String(redemption.equity_amount || 0),
      redeemer: redemption.trader,
      signature: redemption.tx_signature,
      createdAt: redemption.created_at,
    };
  });

  // The legacy on-chain graduation flag does not prove Meteora settlement.
  const graduatedVaultCount = graduatedLiveTokens.length;

  const redemptionCount =
    summary?.redemption_count != null
      ? Number(summary.redemption_count)
      : redemptions.length;

  const uniqueRedeemerCount =
    summary?.unique_redeemer_count != null
      ? Number(summary.unique_redeemer_count)
      : new Set(redemptions.map((r) => r.trader).filter(Boolean)).size;

  const collateralAssetCount = new Set(holdings.map(h => h.equityMint)).size;

  return NextResponse.json(
    {
      success: true,
      holdings,
      recentRedemptions,
      graduatedVaultCount,
      redemptionCount,
      uniqueRedeemerCount,
      collateralAssetCount,
      asOf: liveTokens.length ? liveTokens.map(t => t.lastUpdatedAt).filter((time): time is string => Boolean(time)).sort()[0] || null : new Date().toISOString(),
      source: "onchain",
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

import { NextResponse } from "next/server";
import { isVerifiedChainTrade, TradeRecord } from "@/services/indexer/tradeStore";
import { createServerSupabaseClient } from "@/server/supabase";
import { getLiveTokens } from "@/services/tokens/liveTokens";
import { persistVaultHoldingAmount } from "@/server/treasury";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

let backfillInFlight: Promise<void> | null = null;
let lastBackfillAttemptAt = 0;

async function backfillGraduatedVaultHoldings(db: any): Promise<void> {
  if (backfillInFlight) return backfillInFlight;
  if (Date.now() - lastBackfillAttemptAt < 60_000) return;
  lastBackfillAttemptAt = Date.now();
  backfillInFlight = (async () => {
    const tokens = await getLiveTokens();
    const graduated = tokens.filter((token) => token.bondingCurve.isGraduated && token.observedSlot);
    for (let offset = 0; offset < graduated.length; offset += 20) {
      await Promise.all(graduated.slice(offset, offset + 20).map((token) =>
        persistVaultHoldingAmount(db, {
          mint: token.mint,
          equityMint: token.targetEquity.mintAddress,
          equitySymbol: token.targetEquity.symbol || "UNVERIFIED",
          equityAmount: String(token.treasury.totalEquityLocked || 0),
          observedSlot: token.observedSlot!,
        })
      ));
    }
  })();
  try {
    await backfillInFlight;
  } finally {
    backfillInFlight = null;
  }
}

export async function GET() {
  const db = createServerSupabaseClient();
  if (!db) {
    return NextResponse.json(
      { error: "Treasury data is not configured." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    let [holdingsResult, redemptionsResult, graduatedResult, snapshotCountResult] = await Promise.all([
      db
        .from("vault_holdings")
        .select("mint,equity_mint,equity_symbol,equity_amount,observed_slot,updated_at")
        .gt("equity_amount", 0)
        .limit(200),
      db
        .from("trades")
        .select("id,tx_signature,instruction_index,mint,trade_type,price_usd,tokens_amount,quote_amount_usd,trader,equity_amount,slot,created_at")
        .eq("trade_type", "REDEEM")
        .order("created_at", { ascending: false })
        .limit(100),
      db.rpc("get_treasury_summary"),
      db.from("vault_holdings").select("mint", { count: "exact", head: true }),
    ]);

    if (holdingsResult.error) throw new Error(`Vault holdings query failed: ${holdingsResult.error.message}`);
    if (redemptionsResult.error) throw new Error(`Redemptions query failed: ${redemptionsResult.error.message}`);
    if (graduatedResult.error) throw new Error(`Treasury summary query failed: ${graduatedResult.error.message}`);
    const summary = graduatedResult.data?.[0];
    if (!summary) throw new Error("Treasury summary is unavailable.");
    if (snapshotCountResult.error) throw new Error(`Vault snapshot query failed: ${snapshotCountResult.error.message}`);

    let treasuryHoldings: any[] = holdingsResult.data || [];
    if (Number(snapshotCountResult.count || 0) < Number(summary.graduated_vault_count || 0)) {
      try {
        await backfillGraduatedVaultHoldings(db);
        const [refreshedHoldings, refreshedSnapshots] = await Promise.all([
          db
            .from("vault_holdings")
            .select("mint,equity_mint,equity_symbol,equity_amount,observed_slot,updated_at")
            .gt("equity_amount", 0)
            .limit(200),
          db.from("vault_holdings").select("mint", { count: "exact", head: true }),
        ]);
        if (refreshedHoldings.error) throw new Error(refreshedHoldings.error.message);
        if (refreshedSnapshots.error) throw new Error(refreshedSnapshots.error.message);
        treasuryHoldings = refreshedHoldings.data || [];
      } catch (error) {
        console.warn("[Treasury API] Initial vault balance reconciliation failed:", error);
      }
    }

    const redemptions = ((redemptionsResult.data || []) as TradeRecord[]).filter(isVerifiedChainTrade);
    const mints = Array.from(new Set([
      ...treasuryHoldings.map((holding: any) => holding.mint),
      ...redemptions.map((redemption) => redemption.mint),
    ]));
    const tokenMetadata = new Map<string, any>();

    if (mints.length) {
      const { data, error } = await db
        .from("tokens")
        .select("mint,name,symbol,avatar_url,target_equity_symbol,target_equity_mint")
        .in("mint", mints);
      if (error) throw new Error(`Treasury token metadata query failed: ${error.message}`);
      for (const token of data || []) tokenMetadata.set(token.mint, token);
    }

    const holdings = treasuryHoldings.map((holding: any) => {
      const token = tokenMetadata.get(holding.mint);
      return {
        mint: holding.mint,
        tokenName: token?.name || `StreetFun ${holding.mint.slice(0, 4)}`,
        tokenSymbol: token?.symbol || holding.mint.slice(0, 5),
        tokenAvatarUrl: token?.avatar_url || null,
        equityMint: holding.equity_mint,
        equitySymbol: holding.equity_symbol || token?.target_equity_symbol || "UNVERIFIED",
        equityAmount: String(holding.equity_amount),
        observedSlot: Number(holding.observed_slot),
        updatedAt: holding.updated_at,
      };
    });

    const recentRedemptions = redemptions.map((redemption) => {
      const token = tokenMetadata.get(redemption.mint);
      return {
        id: String(redemption.id || `${redemption.tx_signature}:${redemption.instruction_index || 0}`),
        mint: redemption.mint,
        tokenName: token?.name || `StreetFun ${redemption.mint.slice(0, 4)}`,
        tokenSymbol: token?.symbol || redemption.mint.slice(0, 5),
        tokenAvatarUrl: token?.avatar_url || null,
        equitySymbol: token?.target_equity_symbol || "UNVERIFIED",
        burnedAmount: String(redemption.tokens_amount || 0),
        equityAmount: String(redemption.equity_amount || 0),
        redeemer: redemption.trader,
        signature: redemption.tx_signature,
        createdAt: redemption.created_at,
      };
    });

    return NextResponse.json(
      {
        success: true,
        holdings,
        recentRedemptions,
        graduatedVaultCount: Number(summary.graduated_vault_count || 0),
        redemptionCount: Number(summary.redemption_count || 0),
        uniqueRedeemerCount: Number(summary.unique_redeemer_count || 0),
        collateralAssetCount: Number(summary.collateral_asset_count || 0),
        asOf: new Date().toISOString(),
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    console.error("[Treasury API] Failed to read Supabase data:", error);
    return NextResponse.json(
      { error: "Treasury data is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}

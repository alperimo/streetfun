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
  const liveTokens = await getLiveTokens().catch(() => []);
  const graduatedLiveTokens = liveTokens.filter(
    (t) => t.bondingCurve.isGraduated && Boolean(t.bondingCurve.meteoraPoolAddress)
  );

  let treasuryHoldings: any[] = [];
  let redemptionsRaw: any[] = [];
  let summary: any = null;

  if (db) {
    try {
      const [holdingsResult, redemptionsResult, graduatedResult] = await Promise.all([
        Promise.resolve(
          db
            .from("vault_holdings")
            .select("mint,equity_mint,equity_symbol,equity_amount,observed_slot,updated_at")
            .gt("equity_amount", 0)
            .limit(200)
        ).catch(() => ({ data: null, error: { message: "vault_holdings table unavailable" } })),
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

      if (holdingsResult && !holdingsResult.error && holdingsResult.data) {
        treasuryHoldings = holdingsResult.data;
      }
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

  // If vault_holdings table is empty or missing, derive holdings from live on-chain tokens
  let holdings: any[] = [];
  if (treasuryHoldings.length > 0) {
    const mints = Array.from(new Set([
      ...treasuryHoldings.map((h: any) => h.mint),
      ...redemptions.map((r) => r.mint),
    ]));
    const tokenMetadata = new Map<string, any>();

    if (db && mints.length > 0) {
      const { data } = await db
        .from("tokens")
        .select("mint,name,symbol,avatar_url,target_equity_symbol,target_equity_mint")
        .in("mint", mints);
      for (const token of data || []) tokenMetadata.set(token.mint, token);
    }

    holdings = treasuryHoldings.map((holding: any) => {
      const token = tokenMetadata.get(holding.mint);
      return {
        mint: holding.mint,
        tokenName: token?.name || `StreetFun ${holding.mint.slice(0, 4)}`,
        tokenSymbol: token?.symbol || holding.mint.slice(0, 5),
        tokenAvatarUrl: token?.avatar_url || null,
        equityMint: holding.equity_mint,
        equitySymbol: holding.equity_symbol || token?.target_equity_symbol || "UNVERIFIED",
        equityAmount: String(holding.equity_amount),
        observedSlot: Number(holding.observed_slot || 0),
        updatedAt: holding.updated_at || new Date().toISOString(),
      };
    });
  } else {
    // Derive from live verified tokens
    holdings = graduatedLiveTokens
      .filter((t) => (t.treasury.totalEquityLocked || 0) > 0)
      .map((t) => ({
        mint: t.mint,
        tokenName: t.name,
        tokenSymbol: t.symbol,
        tokenAvatarUrl: t.avatarUrl || null,
        equityMint: t.targetEquity.mintAddress,
        equitySymbol: t.targetEquity.symbol || "UNVERIFIED",
        equityAmount: String(t.treasury.totalEquityLocked || 0),
        observedSlot: Number(t.observedSlot || 0),
        updatedAt: new Date().toISOString(),
      }));
  }

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

  const graduatedVaultCount =
    summary?.graduated_vault_count != null
      ? Number(summary.graduated_vault_count)
      : graduatedLiveTokens.length;

  const redemptionCount =
    summary?.redemption_count != null
      ? Number(summary.redemption_count)
      : redemptions.length;

  const uniqueRedeemerCount =
    summary?.unique_redeemer_count != null
      ? Number(summary.unique_redeemer_count)
      : new Set(redemptions.map((r) => r.trader).filter(Boolean)).size;

  const collateralAssetCount =
    summary?.collateral_asset_count != null
      ? Number(summary.collateral_asset_count)
      : new Set(holdings.map((h) => h.equitySymbol).filter(Boolean)).size;

  return NextResponse.json(
    {
      success: true,
      holdings,
      recentRedemptions,
      graduatedVaultCount,
      redemptionCount,
      uniqueRedeemerCount,
      collateralAssetCount,
      asOf: new Date().toISOString(),
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

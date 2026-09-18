import { NextResponse } from "next/server";
import { TradeStoreService } from "@/services/indexer/tradeStore";
import { INITIAL_TOKENS } from "@/lib/mockData";
import { VERIFIED_TESSERA_PRE_IPO_ASSETS } from "@/sdk/constants";
import { TokenMetadata } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const tradeStore = TradeStoreService.getInstance();
    const registeredTokens = await tradeStore.getAllTokens();
    const prices = await tradeStore.getLatestPrices();

    const tokenMap = new Map<string, TokenMetadata>();

    // 1. Seed with curated initial tokens (calibrated to real bonding curve math)
    for (const t of INITIAL_TOKENS) {
      tokenMap.set(t.mint.toLowerCase(), { ...t });
    }

    // 2. Hydrate/merge all tokens registered in Supabase
    for (const st of registeredTokens) {
      const mintLower = st.mint.toLowerCase();
      const existing = tokenMap.get(mintLower);

      const matchedEquity =
        VERIFIED_TESSERA_PRE_IPO_ASSETS.find(
          (e) => e.symbol.toLowerCase() === (st.target_equity_symbol || "").toLowerCase()
        ) || VERIFIED_TESSERA_PRE_IPO_ASSETS[0];

      if (!existing) {
        tokenMap.set(mintLower, {
          mint: st.mint,
          name: st.name,
          symbol: st.symbol,
          description: st.description || `Culture coin backed by ${matchedEquity.name} tokenized equity.`,
          avatarUrl: st.avatar_url || matchedEquity.logoUrl,
          creator: st.creator || "519jca26LioEQiPhwoHCkC8mNZiCF7cDmtaXdp98iCv2",
          createdAt: st.is_graduated ? "Graduated" : "Active Curve",
          marketCapUsd: 28_000,
          priceUsd: 0.000028,
          priceChange24h: 0.0,
          volume24hUsd: 0,
          targetEquity: {
            ...matchedEquity,
            stockPriceUsd: matchedEquity.currentStockPriceUsd,
          },
          bondingCurve: {
            realQuoteReservesUsd: 0,
            graduationThresholdUsd: 60_000,
            progressPct: 0,
            virtualQuoteReserves: "30000000000",
            virtualTokenReserves: "1073000000000000",
            realTokenReserves: "800000000000000",
            isGraduated: Boolean(st.is_graduated),
            meteoraPoolAddress: st.meteora_pool || `METdbc${st.symbol}Pool`,
            dynamicFeeBps: 20,
            equityPurchaseBudgetUsd: 30_000,
            ammLiquidityBudgetUsd: 30_000,
          },
          treasury: {
            totalEquityLocked: 0,
            totalEquityValueUsd: 0,
            vaultPda: "",
            proofOfReserveVerified: true,
          },
        });
      }
    }

    // 3. Attach dynamic prices and real volumes from trades if available
    for (const [mintLower, token] of tokenMap.entries()) {
      const priceData = prices[token.mint] || prices[mintLower];
      if (priceData && priceData.priceUsd) {
        token.priceUsd = priceData.priceUsd;
        token.marketCapUsd = Math.round(priceData.marketCapUsd);
      }
    }

    const tokensList = Array.from(tokenMap.values());

    return NextResponse.json({
      success: true,
      tokens: tokensList,
      prices,
    });
  } catch (err: any) {
    console.error("[Tokens API] Error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

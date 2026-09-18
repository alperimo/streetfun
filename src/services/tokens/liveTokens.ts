import { TradeStoreService } from "@/services/indexer/tradeStore";
import { VERIFIED_TESSERA_PRE_IPO_ASSETS } from "@/sdk/constants";
import { TokenMetadata } from "@/lib/types";

function calcBondingCurveMetrics(realReservesUsd: number) {
  const V_QUOTE = 30_000;
  const V_TOKENS = 1_073_000_000;
  const k = V_QUOTE * V_TOKENS;
  const TOTAL_SUPPLY = 1_000_000_000;
  const GRADUATION_THRESHOLD = 60_000;

  const effectiveQuote = V_QUOTE + realReservesUsd;
  const effectiveTokens = k / effectiveQuote;
  const spotPrice = effectiveQuote / effectiveTokens;
  const marketCap = spotPrice * TOTAL_SUPPLY;
  const progressPct = Math.min(100, Math.round((realReservesUsd / GRADUATION_THRESHOLD) * 100));

  return { spotPrice, marketCap, progressPct, realReservesUsd };
}

let memoryCachedTokens: { tokens: TokenMetadata[]; timestamp: number } | null = null;

export async function getLiveTokens(): Promise<TokenMetadata[]> {
  const now = Date.now();
  if (memoryCachedTokens && now - memoryCachedTokens.timestamp < 3000) {
    return memoryCachedTokens.tokens;
  }

  try {
    const tradeStore = TradeStoreService.getInstance();
    const registeredTokens = await tradeStore.getAllTokens();
    const reservesPerMint = await tradeStore.getReservesPerMint();

    const tokensList: TokenMetadata[] = registeredTokens.map((st) => {
      const matchedEquity =
        VERIFIED_TESSERA_PRE_IPO_ASSETS.find(
          (e) => e.symbol.toLowerCase() === (st.target_equity_symbol || "").toLowerCase()
        ) || VERIFIED_TESSERA_PRE_IPO_ASSETS[0];

      const realReserves = reservesPerMint[st.mint] || 0;
      const isGraduated = Boolean(st.is_graduated);
      const curve = isGraduated
        ? calcBondingCurveMetrics(60_000)
        : calcBondingCurveMetrics(realReserves);

      const spotPrice = curve.spotPrice;
      const marketCap = Math.round(curve.marketCap);

      return {
        mint: st.mint,
        name: st.name,
        symbol: st.symbol,
        description: st.description || `Culture coin backed by ${matchedEquity.name} tokenized equity.`,
        avatarUrl: st.avatar_url || matchedEquity.logoUrl,
        creator: st.creator || "",
        createdAt: isGraduated ? "Graduated" : "Active Curve",
        marketCapUsd: marketCap,
        priceUsd: spotPrice,
        priceChange24h: 0.0,
        volume24hUsd: 0,
        targetEquity: {
          ...matchedEquity,
          stockPriceUsd: matchedEquity.currentStockPriceUsd,
        },
        bondingCurve: {
          realQuoteReservesUsd: isGraduated ? 60_000 : realReserves,
          graduationThresholdUsd: 60_000,
          progressPct: isGraduated ? 100 : curve.progressPct,
          virtualQuoteReserves: "30000000000",
          virtualTokenReserves: "1073000000000000",
          realTokenReserves: isGraduated ? "0" : "800000000000000",
          isGraduated,
          meteoraPoolAddress: st.meteora_pool || "",
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
      };
    });

    memoryCachedTokens = { tokens: tokensList, timestamp: now };
    return tokensList;
  } catch (err) {
    console.error("[getLiveTokens] Error querying live tokens:", err);
    if (memoryCachedTokens && memoryCachedTokens.tokens.length > 0) {
      return memoryCachedTokens.tokens;
    }
    return [];
  }
}

export function invalidateLiveTokensCache() {
  memoryCachedTokens = null;
}

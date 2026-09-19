import { createClient } from "@supabase/supabase-js";
import { OHLCVBar } from "../types";

export interface TradeRecord {
  id?: number | string;
  tx_signature: string;
  mint: string;
  trade_type: "BUY" | "SELL" | "REDEEM";
  price_usd: number;
  tokens_amount: number;
  quote_amount_usd: number;
  trader: string;
  slot?: number;
  created_at?: string;
}

export interface TokenRecord {
  mint: string;
  name: string;
  symbol: string;
  target_equity_symbol: string;
  target_equity_mint: string;
  creator: string;
  description?: string;
  avatar_url?: string;
  is_graduated?: boolean;
  meteora_pool?: string;
}

// In-memory fallback for localnet & dev without Supabase keys
const localTradesStore: TradeRecord[] = [];
const localTokensStore: Map<string, TokenRecord> = new Map();

let cachedSupabaseClient: any = null;

const SOLANA_SIGNATURE_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{64,88}$/;

export function isVerifiedChainTrade(trade: Pick<TradeRecord, "tx_signature" | "slot">): boolean {
  return SOLANA_SIGNATURE_PATTERN.test(trade.tx_signature) && Number.isInteger(trade.slot) && Number(trade.slot) > 0;
}

function isMockDataEnabled(): boolean {
  return process.env.NEXT_PUBLIC_USE_MOCK_DATA === "true";
}

function getSupabaseClient() {
  if (cachedSupabaseClient) return cachedSupabaseClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Modern Supabase: SUPABASE_SECRET_KEY (server) & NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (client)
  // Backward compatibility: SUPABASE_SERVICE_ROLE_KEY & NEXT_PUBLIC_SUPABASE_ANON_KEY
  const key =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (url && key) {
    cachedSupabaseClient = createClient(url, key, {
      auth: { persistSession: false },
    });
    return cachedSupabaseClient;
  }
  return null;
}

export class TradeStoreService {
  private static instance: TradeStoreService;
  private cachedTokens: TokenRecord[] | null = null;
  private lastTokensFetch = 0;
  private cachedPrices: Record<string, { priceUsd: number; marketCapUsd: number }> | null = null;
  private lastPricesFetch = 0;
  private cachedReserves: Record<string, number> | null = null;
  private lastReservesFetch = 0;

  public static getInstance(): TradeStoreService {
    if (!TradeStoreService.instance) {
      TradeStoreService.instance = new TradeStoreService();
    }
    return TradeStoreService.instance;
  }

  async recordTrade(trade: TradeRecord): Promise<void> {
    const tradeWithTime: TradeRecord = {
      ...trade,
      created_at: trade.created_at || new Date().toISOString(),
    };

    if (!isMockDataEnabled() && !isVerifiedChainTrade(tradeWithTime)) {
      throw new Error("Live indexing rejected a trade without a confirmed Solana signature and slot.");
    }

    // If executed in browser, delegate persistence to server API route with secret key
    if (typeof window !== "undefined") {
      try {
        fetch("/api/trades/record", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ trade: tradeWithTime }),
        }).catch((e) => console.warn("[TradeStore] Failed to sync trade to server:", e));
      } catch (err) {
        console.warn("[TradeStore] Network error posting trade:", err);
      }
      localTradesStore.unshift(tradeWithTime);
      return;
    }

    const supabase = getSupabaseClient();
    if (!supabase && !isMockDataEnabled()) {
      throw new Error("Live trade index is not configured.");
    }
    if (supabase) {
      try {
        // Ensure token exists in tokens table to avoid foreign key constraint error
        const { data: existingToken } = await supabase
          .from("tokens")
          .select("mint")
          .eq("mint", trade.mint)
          .maybeSingle();

        if (!existingToken) {
          const indexedToken = localTokensStore.get(trade.mint.toLowerCase());

          const { error: tokenError } = await supabase.from("tokens").upsert({
            mint: trade.mint,
            name: indexedToken?.name || "Unindexed StreetFun Token",
            symbol: indexedToken?.symbol || "TOKEN",
            target_equity_symbol: indexedToken?.target_equity_symbol || "UNKNOWN",
            target_equity_mint:
              indexedToken?.target_equity_mint || "11111111111111111111111111111111",
            creator: trade.trader || indexedToken?.creator || "11111111111111111111111111111111",
            avatar_url: indexedToken?.avatar_url,
            is_graduated: indexedToken?.is_graduated || false,
            meteora_pool: indexedToken?.meteora_pool,
          });
          if (tokenError) throw new Error(`Could not index curve metadata: ${tokenError.message}`);
        }

        const { error } = await supabase.from("trades").upsert(tradeWithTime, {
          onConflict: "tx_signature",
        });
        if (error) {
          throw new Error(`Could not persist confirmed trade: ${error.message}`);
        }
      } catch (e) {
        console.error("[TradeStore] Error ensuring token and trade:", e);
        throw e;
      }
    }

    // Always keep in local store for rapid UI response
    localTradesStore.unshift(tradeWithTime);
    this.cachedPrices = null;
    this.cachedReserves = null;
  }

  async recordToken(token: TokenRecord): Promise<void> {
    if (typeof window !== "undefined") {
      try {
        fetch("/api/trades/record", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        }).catch((e) => console.warn("[TradeStore] Failed to sync token to server:", e));
      } catch (err) {
        console.warn("[TradeStore] Network error posting token:", err);
      }
      localTokensStore.set(token.mint.toLowerCase(), token);
      return;
    }

    const supabase = getSupabaseClient();
    if (supabase) {
      const { error } = await supabase.from("tokens").upsert(token);
      if (error) throw new Error(`Could not persist token metadata: ${error.message}`);
    }
    localTokensStore.set(token.mint.toLowerCase(), token);
    this.cachedTokens = null;
  }

  async getAllTokens(): Promise<TokenRecord[]> {
    const now = Date.now();
    if (this.cachedTokens && now - this.lastTokensFetch < 3000) {
      return this.cachedTokens;
    }

    const tokensMap = new Map<string, TokenRecord>();

    // 1. Query Supabase tokens table
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from("tokens")
          .select("*")
          .order("created_at", { ascending: false });

        if (!error && data) {
          for (const item of data) {
            tokensMap.set(item.mint.toLowerCase(), {
              mint: item.mint,
              name: item.name,
              symbol: item.symbol,
              target_equity_symbol: item.target_equity_symbol || "$TSPACEX",
              target_equity_mint: item.target_equity_mint || "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
              creator: item.creator || "",
              description: item.description || "",
              avatar_url: item.avatar_url || "",
              is_graduated: Boolean(item.is_graduated),
              meteora_pool: item.meteora_pool || "",
            });
          }
        }
      } catch (err) {
        console.warn("[TradeStore] Failed to fetch tokens from supabase:", err);
      }
    }

    // 2. Merge local tokens store
    for (const [mintLower, token] of localTokensStore.entries()) {
      if (!tokensMap.has(mintLower)) {
        tokensMap.set(mintLower, token);
      }
    }

    const result = Array.from(tokensMap.values());
    this.cachedTokens = result;
    this.lastTokensFetch = Date.now();
    return result;
  }

  async getLatestPrices(): Promise<Record<string, { priceUsd: number; marketCapUsd: number }>> {
    const now = Date.now();
    if (this.cachedPrices && now - this.lastPricesFetch < 3000) {
      return this.cachedPrices;
    }

    const prices: Record<string, { priceUsd: number; marketCapUsd: number }> = {};
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from("trades")
          .select("mint, price_usd, created_at, tx_signature, slot")
          .order("created_at", { ascending: false })
          .limit(100);

        if (!error && data) {
          for (const trade of data) {
            if (
              !prices[trade.mint] &&
              trade.price_usd &&
              (isMockDataEnabled() || isVerifiedChainTrade(trade as TradeRecord))
            ) {
              const price = Number(trade.price_usd);
              prices[trade.mint] = {
                priceUsd: price,
                marketCapUsd: price * 1_000_000_000,
              };
            }
          }
        }
      } catch (err) {
        console.warn("[TradeStore] Failed to fetch latest prices from supabase:", err);
      }
    }

    // Also check local store
    for (const trade of localTradesStore) {
      if (
        !prices[trade.mint] &&
        trade.price_usd &&
        (isMockDataEnabled() || isVerifiedChainTrade(trade))
      ) {
        const price = Number(trade.price_usd);
        prices[trade.mint] = {
          priceUsd: price,
          marketCapUsd: price * 1_000_000_000,
        };
      }
    }

    this.cachedPrices = prices;
    this.lastPricesFetch = Date.now();
    return prices;
  }

  /**
   * Compute net USDC reserves deposited per token mint from all BUY/SELL trades.
   * BUY adds to reserves, SELL subtracts from reserves.
   */
  async getReservesPerMint(): Promise<Record<string, number>> {
    const now = Date.now();
    if (this.cachedReserves && now - this.lastReservesFetch < 3000) {
      return this.cachedReserves;
    }

    const reserves: Record<string, number> = {};
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from("trades")
          .select("mint, trade_type, quote_amount_usd");

        if (!error && data) {
          for (const trade of data) {
            if (!reserves[trade.mint]) reserves[trade.mint] = 0;
            const amount = Number(trade.quote_amount_usd) || 0;
            if (trade.trade_type === "BUY") {
              reserves[trade.mint] += amount;
            } else if (trade.trade_type === "SELL" || trade.trade_type === "REDEEM") {
              reserves[trade.mint] -= amount;
            }
          }
        }
      } catch (err) {
        console.warn("[TradeStore] Failed to fetch reserves from supabase:", err);
      }
    }

    // Also check local store
    for (const trade of localTradesStore) {
      if (!reserves[trade.mint]) reserves[trade.mint] = 0;
      const amount = Number(trade.quote_amount_usd) || 0;
      if (trade.trade_type === "BUY") {
        reserves[trade.mint] += amount;
      } else if (trade.trade_type === "SELL" || trade.trade_type === "REDEEM") {
        reserves[trade.mint] -= amount;
      }
    }

    // Ensure no negative reserves
    for (const mint of Object.keys(reserves)) {
      if (reserves[mint] < 0) reserves[mint] = 0;
    }

    this.cachedReserves = reserves;
    this.lastReservesFetch = Date.now();
    return reserves;
  }

  async getTrades(mint: string, limit = 20, verifiedOnly = !isMockDataEnabled()): Promise<TradeRecord[]> {
    const supabase = getSupabaseClient();
    if (supabase) {
      const matches: TradeRecord[] = [];
      const pageSize = verifiedOnly ? 1_000 : limit;
      for (let offset = 0; matches.length < limit; offset += pageSize) {
        const { data, error } = await supabase
          .from("trades")
          .select("*")
          .eq("mint", mint)
          .order("created_at", { ascending: false })
          .range(offset, offset + pageSize - 1);
        if (error) {
          if (!isMockDataEnabled()) throw new Error(`Verified trade index unavailable: ${error.message}`);
          break;
        }
        const page = (data || []) as TradeRecord[];
        matches.push(...(verifiedOnly ? page.filter(isVerifiedChainTrade) : page));
        if (page.length < pageSize) break;
      }
      return matches.slice(0, limit);
    }

    if (!isMockDataEnabled()) throw new Error("Verified trade index is not configured.");

    // Fallback to local store
    return localTradesStore
      .filter(
        (t) =>
          t.mint.toLowerCase() === mint.toLowerCase() &&
          (!verifiedOnly || isVerifiedChainTrade(t))
      )
      .slice(0, limit);
  }

  async getRedemptions(limit = 20): Promise<TradeRecord[]> {
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from("trades")
          .select("*")
          .eq("trade_type", "REDEEM")
          .order("created_at", { ascending: false })
          .limit(limit);

        if (!error && data && data.length > 0) {
          const trades = data as TradeRecord[];
          return isMockDataEnabled() ? trades : trades.filter(isVerifiedChainTrade);
        }
      } catch (_e) {}
    }

    return localTradesStore
      .filter(
        (t) =>
          t.trade_type === "REDEEM" &&
          (isMockDataEnabled() || isVerifiedChainTrade(t))
      )
      .slice(0, limit);
  }

  async getMarketStats(mints: string[]): Promise<
    Record<
      string,
      { volume24hUsd: number; referencePriceUsd: number | null; latestTradePriceUsd: number | null }
    >
  > {
    const normalizedMints = new Map(mints.map((mint) => [mint.toLowerCase(), mint]));
    const result: Record<
      string,
      { volume24hUsd: number; referencePriceUsd: number | null; latestTradePriceUsd: number | null }
    > = {};

    for (const mint of mints) {
      result[mint] = { volume24hUsd: 0, referencePriceUsd: null, latestTradePriceUsd: null };
    }

    if (mints.length === 0) return result;

    const cutoffIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    let trades: TradeRecord[] = [];
    const supabase = getSupabaseClient();

    if (!supabase && !isMockDataEnabled()) {
      throw new Error("Verified trade index is not configured.");
    }

    if (supabase) {
      const pageSize = 1_000;
      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await supabase
          .from("trades")
          .select("mint, trade_type, price_usd, quote_amount_usd, tx_signature, slot, created_at")
          .in("mint", mints)
          .gte("created_at", cutoffIso)
          .order("created_at", { ascending: true })
          .range(offset, offset + pageSize - 1);

        if (error) throw new Error(`Verified trade index unavailable: ${error.message}`);
        trades.push(...((data || []) as TradeRecord[]));
        if (!data || data.length < pageSize) break;
      }
    }

    const localTrades = localTradesStore.filter(
      (trade) =>
        normalizedMints.has(trade.mint.toLowerCase()) &&
        new Date(trade.created_at || 0).getTime() >= new Date(cutoffIso).getTime()
    );
    const seen = new Set(trades.map((trade) => trade.tx_signature));
    trades.push(...localTrades.filter((trade) => !seen.has(trade.tx_signature)));

    if (!isMockDataEnabled()) trades = trades.filter(isVerifiedChainTrade);
    trades.sort(
      (a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
    );

    for (const trade of trades) {
      if (trade.trade_type === "REDEEM") continue;
      const canonicalMint = normalizedMints.get(trade.mint.toLowerCase());
      if (!canonicalMint) continue;
      const stat = result[canonicalMint];
      const price = Number(trade.price_usd);
      stat.volume24hUsd += Number(trade.quote_amount_usd) || 0;
      if (stat.referencePriceUsd === null && Number.isFinite(price) && price > 0) {
        stat.referencePriceUsd = price;
      }
      if (Number.isFinite(price) && price > 0) stat.latestTradePriceUsd = price;
    }

    return result;
  }

  async getOHLCV(
    mint: string,
    intervalMinutes = 15,
    limit = 100
  ): Promise<OHLCVBar[]> {
    if (!isMockDataEnabled()) {
      const verifiedTrades = await this.getTrades(mint, 10_000, true);
      return this.aggregateOHLCV(verifiedTrades, intervalMinutes).slice(-limit);
    }
    const supabase = getSupabaseClient();
    if (supabase) {
      const { data, error } = await supabase.rpc("get_ohlcv", {
        p_mint: mint,
        p_interval_minutes: intervalMinutes,
        p_limit: limit,
      });

      if (!error && data && data.length > 0) {
        return data.map((b: any) => ({
          time: Number(b.time),
          open: Number(b.open),
          high: Number(b.high),
          low: Number(b.low),
          close: Number(b.close),
          volume: Number(b.volume),
        }));
      }
    }

    // Local in-memory OHLCV aggregation from real trades
    const trades = localTradesStore.filter(
      (t) =>
        t.mint.toLowerCase() === mint.toLowerCase() &&
        (isMockDataEnabled() || isVerifiedChainTrade(t))
    );

    return this.aggregateOHLCV(trades, intervalMinutes).slice(-limit);
  }

  private aggregateOHLCV(
    trades: TradeRecord[],
    intervalMinutes: number
  ): OHLCVBar[] {
    if (trades.length === 0) return [];

    // Bucket trades by interval
    const buckets = new Map<number, TradeRecord[]>();
    for (const t of trades) {
      const tradeTime = Math.floor(new Date(t.created_at || Date.now()).getTime() / 1000);
      const bucketTime = Math.floor(tradeTime / (intervalMinutes * 60)) * (intervalMinutes * 60);
      const existing = buckets.get(bucketTime) || [];
      existing.push(t);
      buckets.set(bucketTime, existing);
    }

    const sortedBuckets = Array.from(buckets.keys()).sort((a, b) => a - b);
    const bars: OHLCVBar[] = [];
    for (const time of sortedBuckets) {
      const bTrades = buckets.get(time)!;
      // Sort asc for open/close
      bTrades.sort(
        (a, b) =>
          new Date(a.created_at || 0).getTime() -
          new Date(b.created_at || 0).getTime()
      );

      const prices = bTrades.map((t) => Number(t.price_usd));
      const volume = bTrades.reduce((acc, t) => acc + (Number(t.quote_amount_usd) || 0), 0);

      const open = prices[0];
      const close = prices[prices.length - 1];
      const high = Math.max(...prices);
      const low = Math.min(...prices);

      bars.push({
        time,
        open,
        high,
        low,
        close,
        volume,
      });
    }

    return bars;
  }
}

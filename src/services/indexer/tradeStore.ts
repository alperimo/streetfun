import { createClient } from "@supabase/supabase-js";
import { OHLCVBar } from "../types";
import { INITIAL_TOKENS } from "@/lib/mockData";

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

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // Modern Supabase: SUPABASE_SECRET_KEY (server) & NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (client)
  // Backward compatibility: SUPABASE_SERVICE_ROLE_KEY & NEXT_PUBLIC_SUPABASE_ANON_KEY
  const key =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (url && key) {
    return createClient(url, key);
  }
  return null;
}

export class TradeStoreService {
  private static instance: TradeStoreService;

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
    if (supabase) {
      try {
        // Ensure token exists in tokens table to avoid foreign key constraint error
        const { data: existingToken } = await supabase
          .from("tokens")
          .select("mint")
          .eq("mint", trade.mint)
          .maybeSingle();

        if (!existingToken) {
          // Check if it's one of the initial tokens
          const initialToken = INITIAL_TOKENS.find(
            (t) => t.mint.toLowerCase() === trade.mint.toLowerCase()
          );

          await supabase.from("tokens").upsert({
            mint: trade.mint,
            name: initialToken?.name || "StreetFun Protocol Token",
            symbol: initialToken?.symbol || "TOKEN",
            target_equity_symbol: initialToken?.targetEquity?.symbol || "$TSPACEX",
            target_equity_mint:
              initialToken?.targetEquity?.mintAddress ||
              "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
            creator: trade.trader || initialToken?.creator || "11111111111111111111111111111111",
            avatar_url: initialToken?.avatarUrl,
            is_graduated: initialToken?.bondingCurve?.isGraduated || false,
            meteora_pool: initialToken?.bondingCurve?.meteoraPoolAddress,
          });
        }

        const { error } = await supabase.from("trades").upsert(tradeWithTime);
        if (error) {
          console.error("[TradeStore] Supabase insert error:", error);
        }
      } catch (e) {
        console.error("[TradeStore] Error ensuring token and trade:", e);
      }
    }

    // Always keep in local store for rapid UI response
    localTradesStore.unshift(tradeWithTime);
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
      await supabase.from("tokens").upsert(token);
    }
    localTokensStore.set(token.mint.toLowerCase(), token);
  }

  async getLatestPrices(): Promise<Record<string, { priceUsd: number; marketCapUsd: number }>> {
    const prices: Record<string, { priceUsd: number; marketCapUsd: number }> = {};
    const supabase = getSupabaseClient();
    if (supabase) {
      try {
        const { data, error } = await supabase
          .from("trades")
          .select("mint, price_usd, created_at")
          .order("created_at", { ascending: false })
          .limit(100);

        if (!error && data) {
          for (const trade of data) {
            if (!prices[trade.mint] && trade.price_usd) {
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
      if (!prices[trade.mint] && trade.price_usd) {
        const price = Number(trade.price_usd);
        prices[trade.mint] = {
          priceUsd: price,
          marketCapUsd: price * 1_000_000_000,
        };
      }
    }

    return prices;
  }

  async getTrades(mint: string, limit = 20): Promise<TradeRecord[]> {
    const supabase = getSupabaseClient();
    if (supabase) {
      const { data, error } = await supabase
        .from("trades")
        .select("*")
        .eq("mint", mint)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (!error && data && data.length > 0) {
        return data as TradeRecord[];
      }
    }

    // Fallback to local store
    return localTradesStore
      .filter((t) => t.mint.toLowerCase() === mint.toLowerCase())
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
          return data as TradeRecord[];
        }
      } catch (_e) {}
    }

    return localTradesStore
      .filter((t) => t.trade_type === "REDEEM")
      .slice(0, limit);
  }

  async getOHLCV(
    mint: string,
    intervalMinutes = 15,
    limit = 100,
    currentPrice = 0.00003
  ): Promise<OHLCVBar[]> {
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
      (t) => t.mint.toLowerCase() === mint.toLowerCase()
    );

    if (trades.length === 0) {
      // If zero trades yet on a fresh curve, return a single candle at current spot price
      const now = Math.floor(Date.now() / 1000);
      const bucketTime = Math.floor(now / (intervalMinutes * 60)) * (intervalMinutes * 60);
      return [
        {
          time: bucketTime,
          open: currentPrice,
          high: currentPrice,
          low: currentPrice,
          close: currentPrice,
          volume: 0,
        },
      ];
    }

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
    const initialCurvePrice = 30_000 / 1_073_000_000;
    let prevClose = initialCurvePrice;

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

      const open = prevClose;
      const close = prices[prices.length - 1];
      const high = Math.max(...prices, open, close);
      const low = Math.min(...prices, open, close);

      bars.push({
        time,
        open,
        high,
        low,
        close,
        volume: Math.round(volume),
      });

      prevClose = close;
    }

    return bars;
  }
}

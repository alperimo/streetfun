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
    const supabase = getSupabaseClient();
    const tradeWithTime: TradeRecord = {
      ...trade,
      created_at: trade.created_at || new Date().toISOString(),
    };

    if (supabase) {
      const { error } = await supabase.from("trades").upsert(tradeWithTime);
      if (error) {
        console.error("[TradeStore] Supabase insert error:", error);
      }
    }

    // Always keep in local store for rapid UI response
    localTradesStore.unshift(tradeWithTime);
  }

  async recordToken(token: TokenRecord): Promise<void> {
    const supabase = getSupabaseClient();
    if (supabase) {
      await supabase.from("tokens").upsert(token);
    }
    localTokensStore.set(token.mint.toLowerCase(), token);
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

    for (const time of sortedBuckets) {
      const bTrades = buckets.get(time)!;
      // Sort asc for open/close
      bTrades.sort(
        (a, b) =>
          new Date(a.created_at || 0).getTime() -
          new Date(b.created_at || 0).getTime()
      );

      const prices = bTrades.map((t) => t.price_usd);
      const volume = bTrades.reduce((acc, t) => acc + t.quote_amount_usd, 0);

      bars.push({
        time,
        open: prices[0],
        high: Math.max(...prices),
        low: Math.min(...prices),
        close: prices[prices.length - 1],
        volume: Math.round(volume),
      });
    }

    return bars;
  }
}

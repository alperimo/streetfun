-- StreetFun Protocol Supabase Database Schema
-- Optimally designed for Helius Webhook indexing and real-time TradingView OHLCV charts

-- 1. Tokens Table
CREATE TABLE IF NOT EXISTS public.tokens (
    mint TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    symbol TEXT NOT NULL,
    target_equity_symbol TEXT NOT NULL,
    target_equity_mint TEXT NOT NULL,
    creator TEXT NOT NULL,
    description TEXT,
    avatar_url TEXT,
    is_graduated BOOLEAN DEFAULT FALSE,
    meteora_pool TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast token lookups
CREATE INDEX IF NOT EXISTS idx_tokens_symbol ON public.tokens(symbol);
CREATE INDEX IF NOT EXISTS idx_tokens_target_equity ON public.tokens(target_equity_symbol);
CREATE INDEX IF NOT EXISTS idx_tokens_is_graduated ON public.tokens(is_graduated);

-- 2. Trades Table
CREATE TABLE IF NOT EXISTS public.trades (
    id BIGSERIAL PRIMARY KEY,
    tx_signature TEXT UNIQUE NOT NULL,
    mint TEXT NOT NULL REFERENCES public.tokens(mint) ON DELETE CASCADE,
    trade_type TEXT NOT NULL CHECK (trade_type IN ('BUY', 'SELL', 'REDEEM')),
    price_usd NUMERIC(16, 8) NOT NULL,
    tokens_amount NUMERIC(24, 6) NOT NULL,
    quote_amount_usd NUMERIC(16, 4) NOT NULL,
    trader TEXT NOT NULL,
    slot BIGINT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Fast time-series queries
CREATE INDEX IF NOT EXISTS idx_trades_mint_created ON public.trades(mint, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trades_trader ON public.trades(trader);

-- 3. Dynamic OHLCV Bar Aggregation Function
-- Aggregates real trades into TradingView lightweight-charts compatible OHLCV bars
CREATE OR REPLACE FUNCTION public.get_ohlcv(
    p_mint TEXT,
    p_interval_minutes INT DEFAULT 15,
    p_limit INT DEFAULT 100
)
RETURNS TABLE (
    "time" BIGINT,
    "open" NUMERIC,
    "high" NUMERIC,
    "low" NUMERIC,
    "close" NUMERIC,
    "volume" NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    WITH ranked_trades AS (
        SELECT
            EXTRACT(EPOCH FROM DATE_TRUNC('minute', created_at) - (CAST(EXTRACT(MINUTE FROM created_at) AS INT) % p_interval_minutes) * INTERVAL '1 minute')::BIGINT AS bucket_time,
            price_usd,
            quote_amount_usd,
            ROW_NUMBER() OVER (
                PARTITION BY EXTRACT(EPOCH FROM DATE_TRUNC('minute', created_at) - (CAST(EXTRACT(MINUTE FROM created_at) AS INT) % p_interval_minutes) * INTERVAL '1 minute')
                ORDER BY created_at ASC, id ASC
            ) as row_asc,
            ROW_NUMBER() OVER (
                PARTITION BY EXTRACT(EPOCH FROM DATE_TRUNC('minute', created_at) - (CAST(EXTRACT(MINUTE FROM created_at) AS INT) % p_interval_minutes) * INTERVAL '1 minute')
                ORDER BY created_at DESC, id DESC
            ) as row_desc
        FROM public.trades
        WHERE mint = p_mint
    ),
    aggregated AS (
        SELECT
            bucket_time,
            MAX(CASE WHEN row_asc = 1 THEN price_usd END) AS "open",
            MAX(price_usd) AS "high",
            MIN(price_usd) AS "low",
            MAX(CASE WHEN row_desc = 1 THEN price_usd END) AS "close",
            SUM(quote_amount_usd) AS "volume"
        FROM ranked_trades
        GROUP BY bucket_time
        ORDER BY bucket_time DESC
        LIMIT p_limit
    )
    SELECT * FROM aggregated ORDER BY bucket_time ASC;
END;
$$ LANGUAGE plpgsql STABLE;

-- 4. Row Level Security (RLS)
ALTER TABLE public.tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;

-- Anonymous users can read tokens and trades
CREATE POLICY "Allow public read access to tokens" ON public.tokens
    FOR SELECT USING (true);

CREATE POLICY "Allow public read access to trades" ON public.trades
    FOR SELECT USING (true);

-- Only backend service role (webhook) can insert/update
CREATE POLICY "Allow service role full access to tokens" ON public.tokens
    FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Allow service role full access to trades" ON public.trades
    FOR ALL USING (auth.role() = 'service_role');

-- 5. Supabase Realtime Replication
ALTER PUBLICATION supabase_realtime ADD TABLE public.trades;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tokens;

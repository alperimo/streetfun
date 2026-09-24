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
    quote_amount_usd NUMERIC(24, 6) NOT NULL,
    trader TEXT NOT NULL,
    slot BIGINT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Fast time-series queries
CREATE INDEX IF NOT EXISTS idx_trades_mint_created ON public.trades(mint, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_trades_trader ON public.trades(trader);

-- Current, on-chain verified redeemable collateral for each graduated vault.
CREATE TABLE IF NOT EXISTS public.vault_holdings (
    mint TEXT PRIMARY KEY REFERENCES public.tokens(mint) ON DELETE CASCADE,
    equity_mint TEXT NOT NULL,
    equity_symbol TEXT NOT NULL,
    equity_amount NUMERIC(36, 18) NOT NULL DEFAULT 0 CHECK (equity_amount >= 0),
    observed_slot BIGINT NOT NULL CHECK (observed_slot > 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS vault_holdings_equity_mint_idx ON public.vault_holdings(equity_mint);

-- Helius deliveries can arrive out of order. Keep the newest on-chain snapshot.
CREATE OR REPLACE FUNCTION public.upsert_vault_holding_snapshot(
    p_mint TEXT,
    p_equity_mint TEXT,
    p_equity_symbol TEXT,
    p_equity_amount NUMERIC,
    p_observed_slot BIGINT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'Service role required';
    END IF;
    INSERT INTO public.vault_holdings (mint, equity_mint, equity_symbol, equity_amount, observed_slot, updated_at)
    VALUES (p_mint, p_equity_mint, p_equity_symbol, p_equity_amount, p_observed_slot, NOW())
    ON CONFLICT (mint) DO UPDATE SET
        equity_mint = EXCLUDED.equity_mint,
        equity_symbol = EXCLUDED.equity_symbol,
        equity_amount = EXCLUDED.equity_amount,
        observed_slot = EXCLUDED.observed_slot,
        updated_at = NOW()
    WHERE public.vault_holdings.observed_slot <= EXCLUDED.observed_slot;
END;
$$;
REVOKE ALL ON FUNCTION public.upsert_vault_holding_snapshot(TEXT, TEXT, TEXT, NUMERIC, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_vault_holding_snapshot(TEXT, TEXT, TEXT, NUMERIC, BIGINT) TO service_role;

CREATE OR REPLACE FUNCTION public.get_treasury_summary()
RETURNS TABLE (
    graduated_vault_count BIGINT,
    redemption_count BIGINT,
    unique_redeemer_count BIGINT,
    collateral_asset_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        (SELECT COUNT(*) FROM public.tokens WHERE is_graduated IS TRUE),
        (SELECT COUNT(*) FROM public.trades WHERE trade_type = 'REDEEM' AND slot > 0
            AND tx_signature ~ '^[1-9A-HJ-NP-Za-km-z]{64,88}$'),
        (SELECT COUNT(DISTINCT trader) FROM public.trades WHERE trade_type = 'REDEEM' AND slot > 0
            AND tx_signature ~ '^[1-9A-HJ-NP-Za-km-z]{64,88}$'),
        (SELECT COUNT(DISTINCT equity_mint) FROM public.vault_holdings WHERE equity_amount > 0);
$$;
REVOKE ALL ON FUNCTION public.get_treasury_summary() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_treasury_summary() TO service_role;

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
    IF p_interval_minutes NOT IN (1, 5, 15, 60, 240, 1440) OR p_limit < 1 OR p_limit > 1000 THEN
        RAISE EXCEPTION 'Invalid chart interval or limit';
    END IF;
    RETURN QUERY
    WITH ranked_trades AS (
        SELECT
            (FLOOR(EXTRACT(EPOCH FROM created_at) / (p_interval_minutes * 60)) * (p_interval_minutes * 60))::BIGINT AS bucket_time,
            price_usd,
            quote_amount_usd,
            ROW_NUMBER() OVER (
                PARTITION BY (FLOOR(EXTRACT(EPOCH FROM created_at) / (p_interval_minutes * 60)) * (p_interval_minutes * 60))
                ORDER BY created_at ASC, id ASC
            ) as row_asc,
            ROW_NUMBER() OVER (
                PARTITION BY (FLOOR(EXTRACT(EPOCH FROM created_at) / (p_interval_minutes * 60)) * (p_interval_minutes * 60))
                ORDER BY created_at DESC, id DESC
            ) as row_desc
        FROM public.trades
        WHERE mint = p_mint AND trade_type IN ('BUY', 'SELL')
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
ALTER TABLE public.vault_holdings ENABLE ROW LEVEL SECURITY;

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

CREATE POLICY "Allow public read access to vault holdings" ON public.vault_holdings
    FOR SELECT USING (true);

CREATE POLICY "Allow service role full access to vault holdings" ON public.vault_holdings
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
GRANT SELECT ON public.vault_holdings TO anon, authenticated;

-- 5. Supabase Realtime Replication
ALTER PUBLICATION supabase_realtime ADD TABLE public.trades;
ALTER PUBLICATION supabase_realtime ADD TABLE public.tokens;
ALTER PUBLICATION supabase_realtime ADD TABLE public.vault_holdings;

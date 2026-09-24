-- Supports compound transactions, exact redemption units and small server-side aggregates.
BEGIN;
ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS instruction_index INTEGER NOT NULL DEFAULT 0 CHECK (instruction_index >= 0);
ALTER TABLE public.trades ADD COLUMN IF NOT EXISTS equity_amount NUMERIC(30, 12);
ALTER TABLE public.trades ALTER COLUMN price_usd TYPE NUMERIC(32, 16);
ALTER TABLE public.trades DROP CONSTRAINT IF EXISTS trades_tx_signature_key;
CREATE UNIQUE INDEX IF NOT EXISTS trades_signature_instruction_key ON public.trades(tx_signature, instruction_index);
CREATE INDEX IF NOT EXISTS trades_market_time ON public.trades(mint, created_at DESC, id DESC) WHERE trade_type IN ('BUY', 'SELL') AND slot > 0;

CREATE OR REPLACE FUNCTION public.get_verified_market_stats(p_mints TEXT[])
RETURNS TABLE (mint TEXT, volume_24h NUMERIC, latest_price NUMERIC)
LANGUAGE plpgsql STABLE SET search_path = public AS $$
BEGIN
  IF cardinality(p_mints) > 200 THEN RAISE EXCEPTION 'Too many markets'; END IF;
  RETURN QUERY SELECT t.mint, SUM(t.quote_amount_usd), (array_agg(t.price_usd ORDER BY t.created_at DESC, t.slot DESC, t.id DESC))[1]
    FROM public.trades t
    WHERE t.mint = ANY(p_mints) AND t.created_at >= now() - interval '24 hours'
      AND t.trade_type IN ('BUY', 'SELL') AND t.slot > 0
      AND t.tx_signature ~ '^[1-9A-HJ-NP-Za-km-z]{64,88}$'
    GROUP BY t.mint;
END $$;

CREATE OR REPLACE FUNCTION public.get_verified_ohlcv(p_mint TEXT, p_interval_minutes INT DEFAULT 15, p_limit INT DEFAULT 100)
RETURNS TABLE ("time" BIGINT, "open" NUMERIC, "high" NUMERIC, "low" NUMERIC, "close" NUMERIC, "volume" NUMERIC)
LANGUAGE plpgsql STABLE SET search_path = public AS $$
BEGIN
  IF p_interval_minutes NOT IN (1, 5, 15, 60, 240, 1440) OR p_limit < 1 OR p_limit > 1000 THEN RAISE EXCEPTION 'Invalid chart parameters'; END IF;
  RETURN QUERY WITH buckets AS (
    SELECT (floor(extract(epoch FROM t.created_at) / (p_interval_minutes * 60)) * p_interval_minutes * 60)::BIGINT bucket,
      t.price_usd, t.quote_amount_usd, t.created_at, t.slot, t.id
    FROM public.trades t WHERE t.mint = p_mint AND t.trade_type IN ('BUY', 'SELL') AND t.slot > 0
      AND t.tx_signature ~ '^[1-9A-HJ-NP-Za-km-z]{64,88}$'
  ), bars AS (
    SELECT bucket, (array_agg(price_usd ORDER BY created_at, slot, id))[1] o, max(price_usd) h, min(price_usd) l,
      (array_agg(price_usd ORDER BY created_at DESC, slot DESC, id DESC))[1] c, sum(quote_amount_usd) v
    FROM buckets GROUP BY bucket ORDER BY bucket DESC LIMIT p_limit
  ) SELECT * FROM bars ORDER BY bucket;
END $$;

-- Never add application clients to write policies. Provider delivery is server-only.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='tokens') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.tokens;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='trades') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.trades;
  END IF;
END $$;

-- The legacy alpha policy allowed clients to bypass signature verification and
-- read other wallets' signed messages. Only the server claim API needs this table.
DROP POLICY IF EXISTS "Allow insert on alpha_passes" ON public.alpha_passes;
DROP POLICY IF EXISTS "Allow public read access on alpha_passes" ON public.alpha_passes;
COMMIT;

BEGIN;

CREATE TABLE IF NOT EXISTS public.vault_holdings (
  mint TEXT PRIMARY KEY REFERENCES public.tokens(mint) ON DELETE CASCADE,
  equity_mint TEXT NOT NULL,
  equity_symbol TEXT NOT NULL,
  equity_amount NUMERIC(36, 18) NOT NULL DEFAULT 0 CHECK (equity_amount >= 0),
  observed_slot BIGINT NOT NULL CHECK (observed_slot > 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS vault_holdings_equity_mint_idx
  ON public.vault_holdings(equity_mint);

ALTER TABLE public.vault_holdings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read access to vault holdings" ON public.vault_holdings;
CREATE POLICY "Allow public read access to vault holdings" ON public.vault_holdings
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow service role full access to vault holdings" ON public.vault_holdings;
CREATE POLICY "Allow service role full access to vault holdings" ON public.vault_holdings
  FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
GRANT SELECT ON public.vault_holdings TO anon, authenticated;

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
    (SELECT COUNT(*) FROM public.trades
      WHERE trade_type = 'REDEEM' AND slot > 0
        AND tx_signature ~ '^[1-9A-HJ-NP-Za-km-z]{64,88}$'),
    (SELECT COUNT(DISTINCT trader) FROM public.trades
      WHERE trade_type = 'REDEEM' AND slot > 0
        AND tx_signature ~ '^[1-9A-HJ-NP-Za-km-z]{64,88}$'),
    (SELECT COUNT(DISTINCT equity_mint) FROM public.vault_holdings WHERE equity_amount > 0);
$$;
REVOKE ALL ON FUNCTION public.get_treasury_summary() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_treasury_summary() TO service_role;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'vault_holdings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.vault_holdings;
  END IF;
END $$;

COMMIT;

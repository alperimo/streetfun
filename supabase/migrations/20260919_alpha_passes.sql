-- Create Alpha Passes Table for Genesis Early Access
CREATE TABLE IF NOT EXISTS public.alpha_passes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pass_number SERIAL UNIQUE,
  wallet_address TEXT NOT NULL UNIQUE,
  signature TEXT NOT NULL,
  message TEXT NOT NULL,
  x_handle TEXT,
  shared_on_x BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Fast lookup by wallet address
CREATE INDEX IF NOT EXISTS idx_alpha_passes_wallet ON public.alpha_passes(wallet_address);

-- Enable RLS
ALTER TABLE public.alpha_passes ENABLE ROW LEVEL SECURITY;

-- Allow public read access to total counts & verified cards
CREATE POLICY "Allow public read access on alpha_passes"
  ON public.alpha_passes FOR SELECT
  USING (true);

-- Allow server insert via service key / anon
CREATE POLICY "Allow insert on alpha_passes"
  ON public.alpha_passes FOR INSERT
  WITH CHECK (true);

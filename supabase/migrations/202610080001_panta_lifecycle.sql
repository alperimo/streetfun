-- Canonical markets and durable create outbox. No browser can enqueue or sign.
BEGIN;
-- Apply before enabling Panta. One shared, atomic budget per StreetFun deployment.
create table if not exists public.panta_request_budgets (
  bucket text primary key,
  window_start timestamptz not null,
  requests integer not null check (requests > 0 and requests <= 60)
);
alter table public.panta_request_budgets enable row level security;
revoke all on public.panta_request_budgets from public, anon, authenticated;

create or replace function public.consume_panta_request_budget(p_bucket text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare changed integer;
begin
  if p_bucket is null or p_bucket !~ '^[a-f0-9]{64}$' then return false; end if;
  insert into public.panta_request_budgets (bucket, window_start, requests)
  values (p_bucket, date_trunc('minute', clock_timestamp()), 1)
  on conflict (bucket) do update
    set window_start = date_trunc('minute', clock_timestamp()),
        requests = case when panta_request_budgets.window_start < date_trunc('minute', clock_timestamp())
          then 1 else panta_request_budgets.requests + 1 end
    where panta_request_budgets.window_start < date_trunc('minute', clock_timestamp())
       or panta_request_budgets.requests < 60;
  get diagnostics changed = row_count;
  return changed = 1;
end;
$$;
revoke all on function public.consume_panta_request_budget(text) from public, anon, authenticated;
grant execute on function public.consume_panta_request_budget(text) to service_role;

CREATE TABLE public.panta_lifecycle_markets (
  network text NOT NULL CHECK (network IN ('devnet','mainnet-beta')),
  mint text NOT NULL REFERENCES public.tokens(mint),
  stage text NOT NULL CHECK (stage IN ('pre-graduation','post-graduation')),
  source_signature text NOT NULL CHECK (source_signature ~ '^[1-9A-HJ-NP-Za-km-z]{64,88}$'),
  source_slot bigint NOT NULL CHECK (source_slot > 0),
  anchor_time bigint NOT NULL CHECK (anchor_time > 0),
  deadline bigint NOT NULL CHECK (deadline > anchor_time),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','quoted','signed','registered','blocked')),
  question text NOT NULL CHECK (length(question) BETWEEN 1 AND 512),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 500),
  resolution_rule text NOT NULL CHECK (length(resolution_rule) BETWEEN 1 AND 2048),
  sources jsonb NOT NULL CHECK (jsonb_typeof(sources) = 'array'),
  description text NOT NULL,
  target_mint text NOT NULL,
  create_id text,
  market_id text,
  program_id text,
  usdc_mint text,
  payment_units text CHECK (payment_units ~ '^[0-9]{1,20}$'),
  signed_transaction text,
  create_signature text,
  last_valid_block_height bigint,
  quote_expires_at timestamptz,
  quote jsonb,
  baseline jsonb,
  final_snapshot jsonb,
  graduated_signature text,
  graduated_slot bigint,
  graduated_time bigint,
  failure_code text,
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_id uuid,
  lease_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (network,mint,stage),
  UNIQUE (network,market_id),
  CHECK (status <> 'registered' OR (market_id IS NOT NULL AND program_id IS NOT NULL AND usdc_mint IS NOT NULL AND create_signature IS NOT NULL)),
  CHECK (status <> 'signed' OR (signed_transaction IS NOT NULL AND create_signature IS NOT NULL AND last_valid_block_height IS NOT NULL))
);
ALTER TABLE public.panta_lifecycle_markets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.panta_lifecycle_markets FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.panta_lifecycle_markets TO service_role;
CREATE INDEX panta_lifecycle_pending ON public.panta_lifecycle_markets (next_attempt_at) WHERE status <> 'registered';

CREATE OR REPLACE FUNCTION public.lease_panta_lifecycle(p_network text, p_mint text, p_stage text, p_lease uuid)
RETURNS SETOF public.panta_lifecycle_markets LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  UPDATE public.panta_lifecycle_markets
  SET lease_id=p_lease, lease_until=now()+interval '90 seconds', attempts=attempts+1, updated_at=now()
  WHERE network=p_network AND mint=p_mint AND stage=p_stage AND status <> 'registered'
    AND next_attempt_at<=now() AND (lease_until IS NULL OR lease_until < now())
  RETURNING *;
$$;
REVOKE ALL ON FUNCTION public.lease_panta_lifecycle(text,text,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lease_panta_lifecycle(text,text,text,uuid) TO service_role;
COMMIT;

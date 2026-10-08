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

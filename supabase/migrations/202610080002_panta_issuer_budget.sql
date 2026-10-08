BEGIN;
CREATE TABLE public.panta_issuer_reservations (
  network text NOT NULL CHECK (network IN ('devnet','mainnet-beta')),
  mint text NOT NULL,
  stage text NOT NULL CHECK (stage IN ('pre-graduation','post-graduation')),
  reserved_day date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  units bigint NOT NULL CHECK (units > 0 AND units <= 20000000),
  PRIMARY KEY (network,mint,stage),
  FOREIGN KEY (network,mint,stage) REFERENCES public.panta_lifecycle_markets(network,mint,stage)
);
ALTER TABLE public.panta_issuer_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.panta_issuer_reservations FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.panta_issuer_reservations TO service_role;
CREATE OR REPLACE FUNCTION public.reserve_panta_issuer_budget(p_network text,p_mint text,p_stage text,p_units bigint,p_limit bigint)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE total bigint; existing bigint; today date := (now() AT TIME ZONE 'UTC')::date;
BEGIN
  IF p_units <= 0 OR p_units > 20000000 OR p_limit <= 0 OR p_limit > 1000000000 THEN RETURN false; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('panta-issuer:' || p_network || ':' || today::text));
  SELECT units INTO existing FROM public.panta_issuer_reservations WHERE network=p_network AND mint=p_mint AND stage=p_stage;
  IF existing IS NOT NULL THEN RETURN existing=p_units; END IF;
  SELECT coalesce(sum(units),0) INTO total FROM public.panta_issuer_reservations WHERE network=p_network AND reserved_day=today;
  IF total+p_units>p_limit THEN RETURN false; END IF;
  INSERT INTO public.panta_issuer_reservations(network,mint,stage,units,reserved_day) VALUES(p_network,p_mint,p_stage,p_units,today);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_panta_issuer_budget(text,text,text,bigint,bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_panta_issuer_budget(text,text,text,bigint,bigint) TO service_role;
COMMIT;

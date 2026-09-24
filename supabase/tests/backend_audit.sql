BEGIN;
INSERT INTO public.tokens(mint,name,symbol,target_equity_symbol,target_equity_mint,creator) VALUES ('audit-test','Audit','AUD','Test','test','test');
INSERT INTO public.trades(tx_signature,instruction_index,mint,trade_type,price_usd,tokens_amount,quote_amount_usd,trader,slot,created_at) VALUES
(repeat('2',88),0,'audit-test','BUY',0.0000000001234567,10,1,'test',1,now()-interval '2 seconds'),
(repeat('2',88),1,'audit-test','SELL',0.0000000002234567,10,2,'test',1,now()-interval '1 second'),
('sim_fake',0,'audit-test','BUY',100,10,999,'test',1,now()),
(repeat('3',88),0,'audit-test','REDEEM',0,10,999,'test',1,now());
DO $$ DECLARE v NUMERIC; o NUMERIC; c NUMERIC; BEGIN
  SELECT volume_24h INTO v FROM public.get_verified_market_stats(ARRAY['audit-test']);
  IF v <> 3 THEN RAISE EXCEPTION 'Incorrect market volume %',v; END IF;
  SELECT sum(volume), min(open), max(close) INTO v,o,c FROM public.get_verified_ohlcv('audit-test',1,100);
  IF v <> 3 OR o <> 0.0000000001234567 OR c <> 0.0000000002234567 THEN RAISE EXCEPTION 'Chart precision/aggregation failed'; END IF;
  IF EXISTS(SELECT 1 FROM pg_policies WHERE tablename='alpha_passes' AND policyname IN ('Allow insert on alpha_passes','Allow public read access on alpha_passes')) THEN RAISE EXCEPTION 'Unsafe alpha policy remains'; END IF;
END $$;
ROLLBACK;

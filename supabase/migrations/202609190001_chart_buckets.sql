ALTER TABLE public.trades ALTER COLUMN quote_amount_usd TYPE NUMERIC(24, 6);

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

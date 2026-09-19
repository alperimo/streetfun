"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  createChart,
  ColorType,
  IChartApi,
  ISeriesApi,
  LineStyle,
} from "lightweight-charts";
import { useTheme } from "@/context/ThemeContext";
import { TokenMetadata } from "@/lib/types";
import { getChartService, TimeframeOption, OHLCVBar } from "@/services";

interface TradingViewChartProps {
  token: TokenMetadata;
  floorPrice?: number;
}

export function TradingViewChart({
  token,
  floorPrice = 0,
}: TradingViewChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);

  const fittedScope = useRef("");

  const [timeframe, setTimeframe] = useState<TimeframeOption>("15m");
  const [loadingChart, setLoadingChart] = useState<boolean>(false);
  const [hasBars, setHasBars] = useState<boolean>(false);
  const [chartError, setChartError] = useState(false);
  const { themeConfig } = useTheme();

  const isGraduated = token.bondingCurve.isGraduated;

  // Initialize chart canvas once
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const { chart: chartTheme } = themeConfig;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: chartTheme.background },
        textColor: chartTheme.textColor,
      },
      grid: {
        vertLines: { color: chartTheme.gridColor },
        horzLines: { color: chartTheme.gridColor },
      },
      width: chartContainerRef.current.clientWidth,
      height: 380,
      timeScale: {
        borderColor: chartTheme.borderColor,
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: chartTheme.borderColor,
        scaleMargins: {
          top: 0.1,
          bottom: 0.25,
        },
      },
    });

    chartRef.current = chart;

    // Candlestick series
    const candlestickSeries = chart.addCandlestickSeries({
      priceFormat: { type: "price", precision: 8, minMove: 0.00000001 },
      upColor: themeConfig.colors.brandEmerald,
      downColor: themeConfig.colors.brandRose,
      borderUpColor: themeConfig.colors.brandEmerald,
      borderDownColor: themeConfig.colors.brandRose,
      wickUpColor: themeConfig.colors.brandEmerald,
      wickDownColor: themeConfig.colors.brandRose,
    });
    candlestickSeriesRef.current = candlestickSeries;

    // Volume histogram overlay on bottom scale
    const volumeSeries = chart.addHistogramSeries({
      priceFormat: {
        type: "volume",
      },
      priceScaleId: "", // overlay on separate scale
    });
    volumeSeriesRef.current = volumeSeries;

    chart.priceScale("").applyOptions({
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    });

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
      chartRef.current = null;
      candlestickSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, [themeConfig]);

  useEffect(() => {
    const series = candlestickSeriesRef.current;
    if (!series || !isGraduated || floorPrice <= 0) return;
    const line = series.createPriceLine({
      price: floorPrice,
      color: themeConfig.chart.floorLineColor,
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: false,
      title: "",
    });
    return () => {
      if (candlestickSeriesRef.current === series) series.removePriceLine(line);
    };
  }, [themeConfig, isGraduated, floorPrice]);

  // Fetch and update data when token or timeframe changes
  useEffect(() => {
    let isCancelled = false;
    const candlestickSeries = candlestickSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    let inFlight = false;
    const scope = `${token.mint}:${timeframe}:${themeConfig.id}`;

    async function loadData() {
      if (!candlestickSeries || !volumeSeries || inFlight) return;
      inFlight = true;
      setLoadingChart(true);
      try {
        const chartService = getChartService();
        const bars: OHLCVBar[] = await chartService.getOHLCV(token, timeframe);

        if (isCancelled) return;
        setHasBars(bars.length > 0);
        setChartError(false);

        // Set Candlestick data
        candlestickSeries.setData(
          bars.map((b) => ({
            time: b.time as any,
            open: b.open,
            high: b.high,
            low: b.low,
            close: b.close,
          }))
        );

        // Set Volume data
        volumeSeries.setData(
          bars.map((b) => ({
            time: b.time as any,
            value: b.volume,
            color: b.close >= b.open
              ? themeConfig.colors.brandEmerald
              : themeConfig.colors.brandRose,
          }))
        );

        if (chartRef.current && fittedScope.current !== scope && bars.length > 0) {
          fittedScope.current = scope;
          chartRef.current.timeScale().fitContent();
        }
      } catch (err) {
        console.error("Failed to load chart bars:", err);
        if (!isCancelled) {
          candlestickSeries.setData([]);
          volumeSeries.setData([]);
          setHasBars(false);
          setChartError(true);
        }
      } finally {
        inFlight = false;
        if (!isCancelled) setLoadingChart(false);
      }
    }

    loadData();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") loadData();
    }, 15_000);

    return () => {
      clearInterval(interval);
      isCancelled = true;
    };
  }, [token.mint, token.priceUsd, timeframe, themeConfig]);

  const timeframes: TimeframeOption[] = ["1m", "5m", "15m", "1h", "4h", "1D"];

  return (
    <div className="relative w-full rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-border text-xs">
        <div className="flex items-center gap-2">
          <span className="font-bold text-foreground">${token.symbol} / USDC · trade execution history</span>
          {isGraduated ? (
            <span className="rounded-md border border-border px-2 py-0.5 text-[10px] text-muted">
              Graduated curve
            </span>
          ) : (
            <span className="rounded-md border border-slate-700/50 bg-slate-800/30 px-2 py-0.5 text-[10px] tracking-wide font-mono font-medium text-slate-400">
              Bonding Curve Discovery
            </span>
          )}
          {loadingChart && (
            <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card-subtle px-2 py-0.5 text-[10px] font-mono text-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-cyan animate-pulse" />
              Syncing
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
            {timeframes.map((tf) => (
              <button
                key={tf}
                onClick={() => setTimeframe(tf)}
                className={`rounded px-2.5 py-1 text-[11px] font-mono transition-colors ${
                  timeframe === tf
                    ? "bg-brand-cyan/15 text-brand-cyan border border-brand-cyan/35 font-semibold"
                    : "text-muted hover:text-foreground hover:bg-card-hover"
                }`}
              >
                {tf}
              </button>
            ))}
        </div>
      </div>

      <div className="relative mt-3">
        <div ref={chartContainerRef} className="w-full" />
        {!loadingChart && !hasBars && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-muted">
            {chartError ? "Verified chart data unavailable" : "No verified trades for this chart yet"}
          </div>
        )}
      </div>
    </div>
  );
}

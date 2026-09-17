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
  floorPrice = 0.0031,
}: TradingViewChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);

  const [timeframe, setTimeframe] = useState<TimeframeOption>("15m");
  const [loadingChart, setLoadingChart] = useState<boolean>(false);
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
      upColor: "#10B981",
      downColor: "#F87171",
      borderUpColor: "#10B981",
      borderDownColor: "#F87171",
      wickUpColor: "#10B981",
      wickDownColor: "#F87171",
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

    // Floor price line for graduated tokens
    if (isGraduated) {
      candlestickSeries.createPriceLine({
        price: floorPrice,
        color: "#d97706",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: false,
        title: "",
      });
    }

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
  }, [themeConfig, isGraduated, floorPrice]);

  // Fetch and update data when token or timeframe changes
  useEffect(() => {
    let isCancelled = false;

    async function loadData() {
      if (!candlestickSeriesRef.current || !volumeSeriesRef.current) return;
      setLoadingChart(true);
      try {
        const chartService = getChartService();
        const bars: OHLCVBar[] = await chartService.getOHLCV(token, timeframe);

        if (isCancelled) return;

        // Set Candlestick data
        candlestickSeriesRef.current.setData(
          bars.map((b) => ({
            time: b.time as any,
            open: b.open,
            high: b.high,
            low: b.low,
            close: b.close,
          }))
        );

        // Set Volume data
        volumeSeriesRef.current.setData(
          bars.map((b) => ({
            time: b.time as any,
            value: b.volume,
            color:
              b.close >= b.open
                ? "rgba(16, 185, 129, 0.35)"
                : "rgba(248, 113, 113, 0.35)",
          }))
        );

        if (chartRef.current) {
          chartRef.current.timeScale().fitContent();
        }
      } catch (err) {
        console.error("Failed to load chart bars:", err);
      } finally {
        if (!isCancelled) setLoadingChart(false);
      }
    }

    loadData();

    return () => {
      isCancelled = true;
    };
  }, [token.mint, token.priceUsd, timeframe]);

  const timeframes: TimeframeOption[] = ["1m", "5m", "15m", "1h", "4h", "1D"];

  const [chartMode, setChartMode] = useState<"internal" | "gecko">("internal");

  return (
    <div className="relative w-full rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-border text-xs">
        <div className="flex items-center gap-2">
          <span className="font-bold text-foreground">${token.symbol} / USDC</span>
          {isGraduated ? (
            <div className="flex items-center gap-1.5">
              <span className="rounded-md border border-slate-700/60 bg-slate-800/50 px-2 py-0.5 text-[10px] font-medium text-slate-300">
                Meteora DLMM
              </span>
              <div className="flex items-center rounded-lg border border-border bg-card-subtle p-0.5 text-[10px]">
                <button
                  onClick={() => setChartMode("internal")}
                  className={`px-2 py-0.5 rounded ${
                    chartMode === "internal"
                      ? "bg-brand-cyan/20 text-brand-cyan font-bold border border-brand-cyan/30"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  Internal TV
                </button>
                <button
                  onClick={() => setChartMode("gecko")}
                  className={`px-2 py-0.5 rounded ${
                    chartMode === "gecko"
                      ? "bg-brand-cyan/20 text-brand-cyan font-bold border border-brand-cyan/30"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  GeckoTerminal
                </button>
              </div>
            </div>
          ) : (
            <span className="rounded-md border border-slate-700/50 bg-slate-800/30 px-2 py-0.5 text-[10px] tracking-wide font-mono font-medium text-slate-400">
              Bonding Curve Discovery
            </span>
          )}
          {loadingChart && (
            <span className="text-[10px] text-muted animate-pulse">Loading...</span>
          )}
        </div>

        {chartMode === "internal" && (
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
        )}
      </div>

      {isGraduated && chartMode === "gecko" ? (
        <div className="mt-3 w-full h-[380px] rounded-lg overflow-hidden border border-border bg-black/40">
          <iframe
            height="100%"
            width="100%"
            id="geckoterminal-embed"
            title="GeckoTerminal Embed"
            src={`https://www.geckoterminal.com/solana/pools/${token.mint}?embed=1&info=0&swaps=0`}
            frameBorder="0"
            allow="clipboard-write"
            allowFullScreen
          />
        </div>
      ) : (
        <div ref={chartContainerRef} className="mt-3 w-full" />
      )}
    </div>
  );
}

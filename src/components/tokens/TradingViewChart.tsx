"use client";

import React, { useEffect, useRef } from "react";
import { createChart, ColorType, IChartApi, LineStyle } from "lightweight-charts";
import { useTheme } from "@/context/ThemeContext";

interface TradingViewChartProps {
  tokenSymbol: string;
  initialPrice: number;
  floorPrice?: number;
  isGraduated?: boolean;
}

export function TradingViewChart({
  tokenSymbol,
  initialPrice,
  floorPrice = 0.0031,
  isGraduated = false,
}: TradingViewChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const { themeConfig } = useTheme();

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
      },
    });

    chartRef.current = chart;

    const areaSeries = chart.addAreaSeries({
      lineColor: chartTheme.lineColor,
      topColor: chartTheme.topColor,
      bottomColor: chartTheme.bottomColor,
      lineWidth: 2,
      priceLineVisible: false,
      autoscaleInfoProvider: (original: any) => {
        const res = original();
        if (res && res.priceRange) {
          return {
            priceRange: {
              minValue: 0,
              maxValue: res.priceRange.maxValue * 1.08,
            },
            margins: res.margins,
          };
        }
        return res;
      },
    });

    // Generate realistic bonding curve price curve progression
    const now = Math.floor(Date.now() / 1000);
    const dataPoints = [];
    let currentPrice = initialPrice * 0.4;

    for (let i = 40; i >= 0; i--) {
      const time = now - i * 300;
      // bonding curve escalating curve formula
      const growthFactor = 1 + (40 - i) * 0.035;
      const noise = (Math.random() - 0.45) * 0.03;
      currentPrice = initialPrice * 0.4 * growthFactor * (1 + noise);

      dataPoints.push({
        time: time as any,
        value: parseFloat(currentPrice.toFixed(6)),
      });
    }

    areaSeries.setData(dataPoints);

    // Vault NAV Floor Price Line (Turuncu / Amber kesikli çizgi, grafiğin tabanında durur)
    areaSeries.createPriceLine({
      price: floorPrice,
      color: "#f59e0b",
      lineWidth: 2,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: isGraduated ? "NAV Floor" : "Projected Floor",
    });

    chart.timeScale().fitContent();

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
    };
  }, [initialPrice, floorPrice, isGraduated, themeConfig]);

  return (
    <div className="relative w-full rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-border text-xs">
        <div className="flex items-center gap-2">
          <span className="font-bold text-foreground">${tokenSymbol} / USDC</span>
          {isGraduated ? (
            <span className="rounded-md border border-slate-700/60 bg-slate-800/50 px-2 py-0.5 text-[10px] font-medium text-slate-300">
              Meteora DLMM
            </span>
          ) : (
            <span className="rounded-md border border-slate-700/50 bg-slate-800/30 px-2 py-0.5 text-[10px] tracking-wide font-mono font-medium text-slate-400">
              Bonding Curve Discovery
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 rounded-md bg-amber-950/40 border border-amber-500/30 px-2.5 py-1 text-[11px] font-mono shadow-xs">
            <span className="inline-block w-3 border-b-2 border-dashed border-amber-400 mr-0.5 select-none" />
            <span className="text-amber-300 font-medium">
              {isGraduated
                ? `$${floorPrice.toFixed(4)} NAV Floor`
                : `Projected NAV Floor: ~$${floorPrice.toFixed(4)}`}
            </span>
          </div>
          <div className="hidden sm:flex items-center gap-2 font-mono text-muted text-[11px]">
            <span>Current: <strong className="text-foreground">${initialPrice.toFixed(6)}</strong></span>
            <span className="text-brand-emerald font-semibold">+47.7%</span>
          </div>
        </div>
      </div>

      <div ref={chartContainerRef} className="mt-3 w-full" />
    </div>
  );
}

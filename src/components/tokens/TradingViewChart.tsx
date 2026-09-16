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

    // Guaranteed Stock Floor (NAV Line)
    areaSeries.createPriceLine({
      price: floorPrice,
      color: chartTheme.floorLineColor,
      lineWidth: 2,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: "Guaranteed Stock Floor",
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
  }, [initialPrice, floorPrice, themeConfig]);

  return (
    <div className="relative w-full rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-border text-xs">
        <div className="flex items-center gap-2">
          <span className="font-bold text-foreground">${tokenSymbol} / USDC</span>
          {isGraduated ? (
            <span className="rounded-md bg-cyan-950/60 border border-cyan-500/30 px-2 py-0.5 text-[10px] font-medium text-cyan-200 shadow-xs">
              Meteora DLMM
            </span>
          ) : (
            <span className="rounded-md bg-cyan-950/20 border border-cyan-500/25 px-2 py-0.5 text-[10px] font-mono font-medium text-cyan-300/80">
              Bonding Curve Discovery
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 rounded-md bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-[10px] font-mono font-bold text-amber-500">
            <span className="inline-block w-2.5 h-0.5 bg-amber-500 border-b border-dashed" />
            <span>${floorPrice.toFixed(4)} Guaranteed Stock Floor</span>
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

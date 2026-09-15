"use client";

import React, { useEffect, useRef } from "react";
import { createChart, ColorType, IChartApi, LineStyle } from "lightweight-charts";

interface TradingViewChartProps {
  tokenSymbol: string;
  initialPrice: number;
  floorPrice?: number;
}

export function TradingViewChart({
  tokenSymbol,
  initialPrice,
  floorPrice = 0.0031,
}: TradingViewChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#080e14" },
        textColor: "#8295a5",
      },
      grid: {
        vertLines: { color: "#131f2b" },
        horzLines: { color: "#131f2b" },
      },
      width: chartContainerRef.current.clientWidth,
      height: 380,
      timeScale: {
        borderColor: "#182531",
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: "#182531",
      },
    });

    chartRef.current = chart;

    const areaSeries = chart.addAreaSeries({
      lineColor: "#00f0ff",
      topColor: "rgba(0, 240, 255, 0.35)",
      bottomColor: "rgba(0, 240, 255, 0.0)",
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

    // Guaranteed Stock Floor (NAV Line in Amber/Yellow)
    areaSeries.createPriceLine({
      price: floorPrice,
      color: "#f59e0b",
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
  }, [initialPrice, floorPrice]);

  return (
    <div className="relative w-full rounded-xl border border-border bg-[#080e14] p-4 shadow-lg">
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-border/60 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-bold text-white">${tokenSymbol} / USDC</span>
          <span className="rounded bg-brand-cyan/15 px-1.5 py-0.5 text-[10px] font-mono text-brand-cyan border border-brand-cyan/30">
            Bonding Curve Discovery
          </span>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 rounded-md bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-[10px] font-mono font-bold text-amber-400">
            <span className="inline-block w-2.5 h-0.5 bg-amber-400 border-b border-dashed" />
            <span>${floorPrice.toFixed(4)} Guaranteed Stock Floor</span>
          </div>
          <div className="hidden sm:flex items-center gap-2 font-mono text-muted text-[11px]">
            <span>Current: <strong className="text-white">${initialPrice.toFixed(6)}</strong></span>
            <span className="text-brand-emerald font-semibold">+47.7%</span>
          </div>
        </div>
      </div>

      <div ref={chartContainerRef} className="mt-3 w-full" />
    </div>
  );
}

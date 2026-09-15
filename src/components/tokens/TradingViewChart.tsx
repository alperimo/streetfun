"use client";

import React, { useEffect, useRef } from "react";
import { createChart, ColorType, IChartApi } from "lightweight-charts";

interface TradingViewChartProps {
  tokenSymbol: string;
  initialPrice: number;
}

export function TradingViewChart({
  tokenSymbol,
  initialPrice,
}: TradingViewChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#ffffff" },
        textColor: "#64748b",
      },
      grid: {
        vertLines: { color: "#f1f5f9" },
        horzLines: { color: "#f1f5f9" },
      },
      width: chartContainerRef.current.clientWidth,
      height: 380,
      timeScale: {
        borderColor: "#e2e8f0",
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: "#e2e8f0",
      },
    });

    chartRef.current = chart;

    const areaSeries = chart.addAreaSeries({
      lineColor: "#0284c7",
      topColor: "rgba(2, 132, 199, 0.2)",
      bottomColor: "rgba(2, 132, 199, 0.0)",
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
  }, [initialPrice]);

  return (
    <div className="relative w-full rounded-xl border border-border bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between pb-3 border-b border-border text-xs">
        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-900">${tokenSymbol} / USDC</span>
          <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-mono text-brand-cyan border border-sky-200">
            Bonding Curve Discovery
          </span>
        </div>
        <div className="flex items-center gap-3 font-mono text-muted text-[11px]">
          <span>Current: <strong className="text-slate-900">${initialPrice.toFixed(6)}</strong></span>
          <span className="text-brand-emerald font-semibold">+47.7%</span>
        </div>
      </div>

      <div ref={chartContainerRef} className="mt-3 w-full" />
    </div>
  );
}

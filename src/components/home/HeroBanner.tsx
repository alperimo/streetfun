"use client";

import React from "react";
import { TrendingUp } from "lucide-react";
import { BullArtwork } from "./BullArtwork";

import { useMarket } from "@/context/MarketContext";

export function HeroBanner() {
  const { tokens, isMock, error, loading } = useMarket();

  const totalVolume = tokens.reduce((sum, t) => sum + (t.volume24hUsd || 0), 0);
  const volumeAvailable = tokens.every((token) => token.volume24hAvailable !== false);
  const equityValuationAvailable = tokens.every(t => t.treasury.totalEquityLocked === 0 || t.treasury.valuationAvailable === true);
  const totalEquityTvl = tokens.reduce((sum, t) => sum + (t.treasury?.totalEquityValueUsd || 0), 0);
  const graduatedCount = tokens.filter((t) => t.bondingCurve?.isGraduated).length;

  const formatUsd = (num: number) => {
    if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`;
    if (num >= 1_000) return `$${(num / 1_000).toFixed(1)}K`;
    if (num > 0) return `$${num.toFixed(2)}`;
    return "$0";
  };

  const stats = [
    {
      label: "24h Volume",
      value: isMock ? "$4.82M" : !error && !loading && volumeAvailable ? formatUsd(totalVolume) : "—",
      change: isMock ? "+47.3%" : error ? "Unavailable" : "Live",
    },
    {
      label: "Equity TVL",
      value: isMock ? "$40.7M" : !error && !loading && equityValuationAvailable ? formatUsd(totalEquityTvl) : "—",
      change: isMock ? "+28.1%" : error || !equityValuationAvailable ? "Valuation unavailable" : "Tessera mark value",
    },
    {
      label: "Graduated",
      value: isMock ? "1,282" : error && tokens.length === 0 ? "—" : graduatedCount.toLocaleString(),
      change: isMock ? "+12.6%" : error ? "Unavailable" : "Live",
    },
  ];

  return (
    <section className="hero-section relative isolate min-h-[385px] overflow-hidden">
      <BullArtwork />
      <div className="relative mx-auto flex min-h-[385px] w-full max-w-[1350px] flex-col justify-start px-6 pt-12 pb-4 sm:px-10 lg:px-0 lg:pt-14 lg:pb-4">
        <div className="max-w-[650px]">
          <h1 className="max-w-[620px] text-4xl font-black leading-[0.98] tracking-[-0.055em] text-foreground sm:text-5xl lg:text-[64px]">
            Wall Street Floor
            <br />
            For <span className="text-brand-cyan">Memecoins</span>
          </h1>
          <p className="mt-4 max-w-lg text-base text-muted sm:text-lg">
            Trade viral momentum. Graduate to tokenized stocks.
          </p>
          <div className="mt-6 grid w-full max-w-[480px] grid-cols-3 items-stretch rounded-2xl border border-border bg-background/75 p-3 backdrop-blur-md sm:p-4">
            {stats.map((stat, index) => (
              <React.Fragment key={stat.label}>
                <div
                  className={`min-w-0 px-1 text-center sm:px-2 ${
                    index > 0 ? "border-l border-border" : ""
                  }`}
                >
                  <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
                    {stat.label}
                  </div>
                  <div className="mt-1 text-xl font-black tracking-tight text-foreground sm:text-2xl">
                    {stat.value}
                  </div>
                  <div className="mt-1 flex items-center justify-center gap-1 text-xs font-semibold text-emerald-400">
                    <TrendingUp className="h-3 w-3" />
                    {stat.change}
                  </div>
                </div>
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

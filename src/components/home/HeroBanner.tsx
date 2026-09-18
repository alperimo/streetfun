"use client";

import React from "react";
import Image from "next/image";
import { TrendingUp } from "lucide-react";

import { useMarket } from "@/context/MarketContext";

export function HeroBanner() {
  const { tokens, isMock } = useMarket();

  const totalVolume = tokens.reduce((sum, t) => sum + (t.volume24hUsd || 0), 0);
  const totalTvl = tokens.reduce((sum, t) => sum + (t.treasury?.totalEquityValueUsd || 0), 0);
  const graduatedCount = tokens.filter((t) => t.bondingCurve?.isGraduated).length;

  const formatUsd = (num: number) => {
    if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`;
    if (num >= 1_000) return `$${(num / 1_000).toFixed(1)}K`;
    return `$${num.toLocaleString()}`;
  };

  const stats = [
    {
      label: "24h Volume",
      value: isMock ? "$4.82M" : formatUsd(totalVolume),
      change: "+47.3%",
    },
    {
      label: "Equity TVL",
      value: isMock ? "$40.7M" : formatUsd(totalTvl),
      change: "+28.1%",
    },
    {
      label: "Graduated",
      value: isMock ? "1,282" : graduatedCount.toLocaleString(),
      change: "+12.6%",
    },
  ];

  return (
    <section className="hero-section relative isolate min-h-[400px] overflow-hidden">
      <Image
        src="/generated/hero-bull.png"
        alt="Black and white bull wearing neon green market glasses"
        fill
        priority
        className="hero-bull-image -z-20 object-cover object-[78%_68%]"
        sizes="(max-width: 1024px) 100vw, 1500px"
      />
      <div className="relative mx-auto flex min-h-[400px] w-full max-w-[1350px] flex-col justify-start px-6 py-9 sm:px-10 lg:px-0 lg:py-9">
        <div className="max-w-[650px]">
          <h1 className="max-w-[620px] text-4xl font-black leading-[0.98] tracking-[-0.055em] text-foreground sm:text-5xl lg:text-[64px]">
            Wall Street Floor
            <br />
            For <span className="text-brand-emerald">Memecoins</span>
          </h1>
          <p className="mt-4 max-w-lg text-base text-muted sm:text-lg">
            Trade viral momentum. Graduate to real tokenized equities.
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
                  <div className="mt-1 flex items-center justify-center gap-1 text-xs font-semibold text-brand-emerald">
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

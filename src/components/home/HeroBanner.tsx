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
    <section className="hero-section relative isolate min-h-[460px] overflow-hidden">
      <Image
        src="/generated/hero-bull.png"
        alt="Black and white bull wearing neon green market glasses"
        fill
        priority
        className="hero-bull-image -z-20 object-cover object-[78%_68%]"
        sizes="(max-width: 1024px) 100vw, 1500px"
      />
      <div className="relative mx-auto flex min-h-[460px] w-full max-w-[1350px] flex-col justify-between px-6 py-10 sm:px-10 lg:px-0">
        <div className="max-w-[650px]">
          <div className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-emerald">
            Memecoins For A Brighter Tomorrow
          </div>
          <h1 className="mt-2.5 max-w-[620px] text-4xl font-black leading-[0.98] tracking-[-0.055em] text-foreground sm:text-5xl lg:text-[62px]">
            Memecoins
            <br />
            With A <span className="text-brand-emerald">Wall Street Floor</span>
          </h1>
          <p className="mt-4 max-w-lg text-base text-muted sm:text-lg">
            Trade viral momentum. Graduate to real tokenized equities.
          </p>

          {/* Action CTAs */}
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <a
              href="#explore"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-brand-emerald px-5 text-sm font-bold text-background transition-all hover:brightness-110 shadow-sm"
            >
              <span>Launch a token</span>
              <span>&rarr;</span>
            </a>
            <a
              href="#explore"
              className="inline-flex h-11 items-center justify-center rounded-xl border border-border bg-card/80 px-5 text-sm font-semibold text-foreground backdrop-blur-sm transition-all hover:bg-card-hover hover:border-border-active"
            >
              Explore markets
            </a>
          </div>

          {/* Value Props Row */}
          <div className="mt-7 flex flex-wrap items-center gap-6 text-xs">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-emerald/15 text-brand-emerald">
                ⚡
              </span>
              <div>
                <div className="font-bold text-foreground">Fast trading</div>
                <div className="text-[11px] text-muted">Low fees, high speed</div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-emerald/15 text-brand-emerald">
                📊
              </span>
              <div>
                <div className="font-bold text-foreground">REAL DATA</div>
                <div className="text-[11px] text-muted">Transparent markets</div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-emerald/15 text-brand-emerald">
                👥
              </span>
              <div>
                <div className="font-bold text-foreground">BUILT FOR CREATORS</div>
                <div className="text-[11px] text-muted">From memes to milestones</div>
              </div>
            </div>
          </div>
        </div>

        {/* 4-Column Stats Box (Bottom Right / Embedded) */}
        <div className="mt-8 flex justify-start lg:justify-end">
          <div className="grid w-full max-w-[620px] grid-cols-4 items-stretch rounded-2xl border border-border bg-card/90 p-3 backdrop-blur-md sm:p-4 shadow-md">
            {stats.map((stat, index) => (
              <div
                key={stat.label}
                className={`min-w-0 px-2 text-center ${
                  index > 0 ? "border-l border-border" : ""
                }`}
              >
                <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted truncate">
                  {stat.label}
                </div>
                <div className="mt-1 text-lg font-black tracking-tight text-foreground sm:text-2xl">
                  {stat.value}
                </div>
                <div className="mt-1 flex items-center justify-center gap-1 text-xs font-semibold text-brand-emerald">
                  <span className="text-[10px]">▲</span>
                  {stat.change}
                </div>
              </div>
            ))}

            {/* 4th Column: Animated Green Bars + Label */}
            <div className="flex min-w-0 items-center justify-center gap-2.5 border-l border-border px-2">
              <div className="flex items-end gap-1 h-8">
                <div className="w-1.5 h-3 rounded-t bg-brand-emerald/60" />
                <div className="w-1.5 h-4.5 rounded-t bg-brand-emerald/75" />
                <div className="w-1.5 h-6 rounded-t bg-brand-emerald/90" />
                <div className="w-1.5 h-7.5 rounded-t bg-brand-emerald shadow-[0_0_8px_rgba(112,225,111,0.5)]" />
              </div>
              <div className="text-left font-mono text-[9px] font-bold uppercase leading-tight tracking-wider text-muted">
                Memes<br />Meet<br />Markets
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

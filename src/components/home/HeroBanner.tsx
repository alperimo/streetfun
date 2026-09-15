"use client";

import React from "react";
import { ArrowRight } from "lucide-react";

interface HeroBannerProps {
  onOpenLaunch: () => void;
}

export function HeroBanner({ onOpenLaunch }: HeroBannerProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-r from-sky-50/70 via-white to-sky-50/70 p-5 sm:p-6 shadow-sm mb-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5">
        {/* Left: Headline & Concise Description & Action */}
        <div className="flex flex-col gap-2 max-w-xl">
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 leading-tight">
            Memecoins With A{" "}
            <span className="text-brand-cyan">Wall Street Floor.</span>
          </h1>

          <p className="text-xs sm:text-sm text-muted">
            Trade viral momentum. Graduate to real tokenized equities.
          </p>

          <div className="pt-1">
            <button
              onClick={onOpenLaunch}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-cyan px-4 py-2 text-xs sm:text-sm font-bold text-white hover:bg-sky-700 transition-colors shadow-sm shadow-brand-cyan/20"
            >
              <span>Launch a token</span>
              <ArrowRight className="h-3.5 w-3.5 stroke-[2.5]" />
            </button>
          </div>
        </div>

        {/* Right: Compact Metrics Grid (balances horizontal space without empty voids) */}
        <div className="grid grid-cols-3 gap-3 w-full lg:w-auto shrink-0">
          <div className="rounded-xl border border-border bg-white/80 px-4 py-3 min-w-[120px] shadow-sm">
            <div className="text-[10px] text-muted uppercase font-semibold tracking-wider">
              24h Volume
            </div>
            <div className="mt-0.5 font-mono text-base sm:text-lg font-bold text-slate-900">
              $4.82M
            </div>
          </div>
          <div className="rounded-xl border border-border bg-white/80 px-4 py-3 min-w-[120px] shadow-sm">
            <div className="text-[10px] text-muted uppercase font-semibold tracking-wider">
              Equity TVL
            </div>
            <div className="mt-0.5 font-mono text-base sm:text-lg font-bold text-brand-cyan">
              $40.7M
            </div>
          </div>
          <div className="rounded-xl border border-border bg-white/80 px-4 py-3 min-w-[120px] shadow-sm">
            <div className="text-[10px] text-muted uppercase font-semibold tracking-wider">
              Graduated
            </div>
            <div className="mt-0.5 font-mono text-base sm:text-lg font-bold text-slate-900">
              1,282
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

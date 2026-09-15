"use client";

import React from "react";
import { ArrowRight } from "lucide-react";

interface HeroBannerProps {
  onOpenLaunch: () => void;
}

export function HeroBanner({ onOpenLaunch }: HeroBannerProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-r from-[#0b1319] via-[#091016] to-[#0b1319] px-8 py-12 sm:px-12 sm:py-16 shadow-xl">
      <div className="max-w-3xl flex flex-col items-start gap-5">
        <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-white leading-[1.15]">
          Launch coins backed by <br />
          <span className="text-brand-cyan">real equities</span>
        </h1>

        <p className="max-w-xl text-sm sm:text-base text-muted leading-relaxed">
          Create and trade onchain coins backed by tokenized stocks.
          Every graduated coin locks real equity in treasury, redeemable anytime.
        </p>

        <div className="mt-2 flex items-center gap-4">
          <button
            onClick={onOpenLaunch}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-cyan px-5 py-2.5 text-sm font-bold text-black hover:bg-cyan-300 transition-colors shadow-md shadow-brand-cyan/20"
          >
            <span>Launch a token</span>
            <ArrowRight className="h-4 w-4 stroke-[2.5]" />
          </button>
        </div>
      </div>

      {/* Clean, minimalist stats counter in bottom right */}
      <div className="mt-8 pt-8 border-t border-border/50 grid grid-cols-3 gap-6 max-w-lg">
        <div>
          <div className="text-[11px] text-muted uppercase font-medium">24h Volume</div>
          <div className="mt-0.5 font-mono text-xl font-bold text-white">$4.82M</div>
        </div>
        <div>
          <div className="text-[11px] text-muted uppercase font-medium">Equity TVL</div>
          <div className="mt-0.5 font-mono text-xl font-bold text-brand-emerald">$40.7M</div>
        </div>
        <div>
          <div className="text-[11px] text-muted uppercase font-medium">Graduated</div>
          <div className="mt-0.5 font-mono text-xl font-bold text-brand-cyan">1,282</div>
        </div>
      </div>
    </div>
  );
}

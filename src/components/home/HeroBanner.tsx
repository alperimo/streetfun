"use client";

import React from "react";
import Link from "next/link";
import { ArrowRight, ShieldCheck, TrendingUp, Sparkles } from "lucide-react";

interface HeroBannerProps {
  onOpenLaunch: () => void;
}

export function HeroBanner({ onOpenLaunch }: HeroBannerProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-b from-[#0e1720] via-[#091016] to-[#070b0f] p-6 sm:p-10 shadow-2xl">
      {/* Background ambient lighting */}
      <div className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-brand-cyan/10 blur-[100px]" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-brand-emerald/10 blur-[100px]" />

      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        {/* Left Headline & Action */}
        <div className="lg:col-span-7 flex flex-col items-start gap-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#1e3347] bg-[#111e29]/70 px-3 py-1 text-xs text-brand-cyan backdrop-blur-sm">
            <Sparkles className="h-3.5 w-3.5 text-brand-cyan" />
            <span className="font-semibold">The World&apos;s First Equity-Backed Memecoin Engine</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-white leading-tight">
            Launch coins backed by <br className="hidden sm:inline" />
            <span className="bg-gradient-to-r from-brand-cyan via-teal-300 to-brand-emerald bg-clip-text text-transparent">
              Wall Street Equities
            </span>
          </h1>

          <p className="max-w-xl text-sm sm:text-base text-muted leading-relaxed">
            Trade instant-liquidity memecoins backed by real tokenized stocks (SpaceX, Nvidia, Grindr).
            Upon graduation, 50% USDC locks real shares into an immutable Anchor PDA treasury.
            <strong className="text-white font-medium"> Tokens can never go to zero.</strong>
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-4">
            <button
              onClick={onOpenLaunch}
              className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-brand-cyan to-blue-500 px-5 py-3 text-sm font-bold text-black hover:opacity-90 transition-all shadow-lg shadow-brand-cyan/25"
            >
              <span>Launch a Stonk</span>
              <ArrowRight className="h-4 w-4 stroke-[2.5]" />
            </button>

            <Link
              href="/treasury"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-[#0b1218] px-4 py-3 text-sm font-medium text-white hover:border-border-active hover:bg-[#111c26] transition-all"
            >
              <ShieldCheck className="h-4 w-4 text-brand-emerald" />
              <span>Proof of Assets (TVL)</span>
            </Link>
          </div>
        </div>

        {/* Right Visual Trajectory Box matching StonkFun reference */}
        <div className="lg:col-span-5 relative">
          <div className="relative rounded-xl border border-border bg-[#0a1117]/80 p-5 backdrop-blur-sm shadow-xl">
            {/* SVG Trajectory curve */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-40">
              <svg
                viewBox="0 0 400 180"
                className="w-full h-full"
                preserveAspectRatio="none"
              >
                <path
                  d="M 10 140 Q 90 130 150 90 T 290 60 T 390 30"
                  fill="none"
                  stroke="#00f0ff"
                  strokeWidth="3"
                  strokeDasharray="6 4"
                />
                <circle cx="390" cy="30" r="5" fill="#f43f5e" />
              </svg>
            </div>

            {/* Floating Token Callout Card */}
            <div className="relative z-10 rounded-lg border border-border/80 bg-[#0f1922]/90 p-4 shadow-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center font-bold text-white text-base">
                    🚀
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-white text-sm">$MARS</span>
                      <span className="text-xs text-muted">SpaceX Colony</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-1">
                      <span className="text-[10px] text-muted">Backed by:</span>
                      <span className="rounded bg-brand-cyan/15 px-1.5 py-0.5 text-[10px] font-bold text-brand-cyan border border-brand-cyan/30">
                        SpaceX ($SPCX)
                      </span>
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="font-mono text-sm font-bold text-white">
                    $105.44M
                  </div>
                  <div className="font-mono text-xs font-semibold text-brand-emerald">
                    +47.7%
                  </div>
                </div>
              </div>

              {/* Progress to Graduation Gauge */}
              <div className="mt-3 pt-3 border-t border-border/50">
                <div className="flex items-center justify-between text-[11px] mb-1">
                  <span className="text-muted flex items-center gap-1">
                    <ShieldCheck className="h-3 w-3 text-brand-emerald" />
                    Graduation Status
                  </span>
                  <span className="font-mono font-bold text-brand-emerald">
                    100% Graduated
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-[#111d27]">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-brand-cyan to-brand-emerald"
                    style={{ width: "100%" }}
                  />
                </div>
                <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted font-mono">
                  <span>Vault: 139.27 $SPCX shares locked</span>
                  <span className="text-brand-cyan">Dual Floor Active</span>
                </div>
              </div>
            </div>

            {/* Quick Live Stats Ticker below curve */}
            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-lg bg-[#070d12] p-2 border border-border/50">
                <div className="text-[10px] text-muted uppercase">24h Vol</div>
                <div className="font-mono font-bold text-white">$4.82M</div>
              </div>
              <div className="rounded-lg bg-[#070d12] p-2 border border-border/50">
                <div className="text-[10px] text-muted uppercase">TVL Locked</div>
                <div className="font-mono font-bold text-brand-emerald">$40.7M</div>
              </div>
              <div className="rounded-lg bg-[#070d12] p-2 border border-border/50">
                <div className="text-[10px] text-muted uppercase">Graduated</div>
                <div className="font-mono font-bold text-brand-cyan">1,282</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

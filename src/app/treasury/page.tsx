"use client";

import React, { useState } from "react";
import { ArrowUpRight, Flame } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { SearchModal } from "@/components/modals/SearchModal";
import { LaunchModal } from "@/components/modals/LaunchModal";
import { INITIAL_TOKENS, INITIAL_TREASURY_STATS } from "@/lib/mockData";
import { TokenMetadata } from "@/lib/types";

export default function TreasuryPage() {
  const [tokens, setTokens] = useState<TokenMetadata[]>(INITIAL_TOKENS);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isLaunchOpen, setIsLaunchOpen] = useState(false);

  const stats = INITIAL_TREASURY_STATS;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header
        onOpenSearch={() => setIsSearchOpen(true)}
        onOpenLaunch={() => setIsLaunchOpen(true)}
      />

      <main className="mx-auto flex-1 w-full px-6 md:px-12 xl:px-[164px] py-8">
        <div className="flex flex-col gap-2 mb-8">
          <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
            Treasury
          </h1>
          <p className="max-w-2xl text-sm text-muted">
            Total tokenized equities held in protocol vaults from graduated coins.
          </p>
        </div>

        {/* 4 Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-border bg-[#0b1218] p-5">
            <div className="text-xs text-muted font-medium">Total Equity Locked</div>
            <div className="mt-1 font-mono text-2xl sm:text-3xl font-bold text-white tracking-tight">
              ${stats.totalEquityValueLockedUsd.toLocaleString()}
            </div>
            <div className="mt-1 text-[11px] text-muted">
              Value in vaults now
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-[#0b1218] p-5">
            <div className="text-xs text-muted font-medium">Total Distributed</div>
            <div className="mt-1 font-mono text-2xl sm:text-3xl font-bold text-brand-cyan tracking-tight">
              ${stats.totalRedemptionsUsd.toLocaleString()}
            </div>
            <div className="mt-1 text-[11px] text-muted">
              Paid to holders
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-[#0b1218] p-5">
            <div className="text-xs text-muted font-medium">Graduated Vaults</div>
            <div className="mt-1 font-mono text-2xl sm:text-3xl font-bold text-white tracking-tight">
              {stats.totalGraduatedCurves.toLocaleString()}
            </div>
            <div className="mt-1 text-[11px] text-muted">
              Active stock vaults
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-[#0b1218] p-5">
            <div className="text-xs text-muted font-medium">Holder Payouts</div>
            <div className="mt-1 font-mono text-2xl sm:text-3xl font-bold text-white tracking-tight">
              {stats.walletsRedeemed.toLocaleString()}
            </div>
            <div className="mt-1 text-[11px] text-muted">
              Redemptions executed
            </div>
          </div>
        </div>

        {/* Two Tables */}
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Table: Top Equity Holdings */}
          <div className="lg:col-span-7 rounded-2xl border border-border bg-[#0b1218] p-5">
            <div className="flex items-center justify-between border-b border-border/80 pb-3">
              <div>
                <h3 className="text-base font-bold text-white">
                  Top Vault Holdings
                </h3>
                <p className="text-xs text-muted">
                  Ranked by total stock value locked
                </p>
              </div>
            </div>

            <div className="mt-3 divide-y divide-border/50">
              {stats.assetBreakdown.map((asset, index) => (
                <div
                  key={asset.symbol}
                  className="py-3.5 flex items-center justify-between hover:bg-[#0f1922] px-2 rounded-lg transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs font-bold text-muted w-4">
                      {index + 1}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-sm">
                          {asset.name}
                        </span>
                        <span className="rounded bg-brand-cyan/15 px-1.5 py-0.2 text-[10px] font-bold text-brand-cyan">
                          {asset.symbol}
                        </span>
                      </div>
                      <div className="text-[11px] text-muted mt-0.5">
                        {asset.sharesLocked.toLocaleString()} shares · {asset.backingPercentage}% of TVL
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="font-mono text-sm font-bold text-white">
                      ${(asset.valueUsd / 1_000_000).toFixed(2)}M
                    </div>
                    <a
                      href="https://sunrise.trade"
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[10px] text-brand-cyan hover:underline"
                    >
                      <span>Explorer</span>
                      <ArrowUpRight className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Table: Recent Redemptions */}
          <div className="lg:col-span-5 rounded-2xl border border-border bg-[#0b1218] p-5">
            <div className="flex items-center justify-between border-b border-border/80 pb-3">
              <div>
                <h3 className="text-base font-bold text-white">
                  Recent Redemptions
                </h3>
                <p className="text-xs text-muted">
                  Holder stock payouts
                </p>
              </div>
              <span className="text-[10px] text-muted font-mono">Newest first</span>
            </div>

            <div className="mt-3 divide-y divide-border/50">
              {stats.recentRedemptions.map((rdm) => (
                <div
                  key={rdm.id}
                  className="py-3 flex items-center justify-between hover:bg-[#0f1922] px-2 rounded-lg transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#111e29] text-brand-rose border border-border">
                      <Flame className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="font-bold text-white text-xs">
                        Burned {rdm.burnedMemeAmount}
                      </div>
                      <div className="text-[11px] text-muted mt-0.5">
                        {rdm.redeemerAddress} · {rdm.timestamp}
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="font-mono text-xs font-bold text-brand-emerald">
                      +{rdm.sharesRedeemed.toFixed(2)} {rdm.equitySymbol}
                    </div>
                    <div className="text-[10px] font-mono text-muted">
                      {rdm.txHash}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      <Footer />

      <SearchModal
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        tokens={tokens}
      />
      <LaunchModal
        isOpen={isLaunchOpen}
        onClose={() => setIsLaunchOpen(false)}
        onTokenCreated={(t) => setTokens((prev) => [t, ...prev])}
      />
    </div>
  );
}

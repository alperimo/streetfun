"use client";

import React, { useState } from "react";
import Link from "next/link";
import { ShieldCheck, Landmark, ExternalLink, Flame, CheckCircle, ArrowUpRight } from "lucide-react";
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

      <main className="mx-auto flex-1 w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-8">
        {/* Page Title & Intro */}
        <div className="flex flex-col gap-2 mb-8">
          <div className="inline-flex items-center gap-1.5 self-start rounded-full border border-brand-cyan/30 bg-brand-cyan/10 px-3 py-1 text-xs text-brand-cyan font-semibold">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>Non-Custodial Anchor PDA Vaults</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
            Treasury &amp; Proof of Assets
          </h1>
          <p className="max-w-3xl text-sm text-muted leading-relaxed">
            Every graduated memecoin permanently locks 50% of its reserves into real tokenized Wall Street stocks custodied under New York UCC Article 8 via Backpack Securities. All equity holdings are verifiable on-chain and redeemable pro-rata at any time.
          </p>
        </div>

        {/* 4 Stats Cards matching reference image 2 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-xl border border-border bg-[#0b1218] p-5 shadow-lg">
            <div className="text-xs text-muted font-medium">Total Equity Value Locked</div>
            <div className="mt-1 font-mono text-2xl sm:text-3xl font-black text-white tracking-tight">
              ${stats.totalEquityValueLockedUsd.toLocaleString()}
            </div>
            <div className="mt-1 text-[11px] text-brand-emerald font-medium flex items-center gap-1">
              <CheckCircle className="h-3 w-3" /> Real stock held in PDAs
            </div>
          </div>

          <div className="rounded-xl border border-border bg-[#0b1218] p-5 shadow-lg">
            <div className="text-xs text-muted font-medium">Total Stock Redemptions</div>
            <div className="mt-1 font-mono text-2xl sm:text-3xl font-black text-brand-cyan tracking-tight">
              ${stats.totalRedemptionsUsd.toLocaleString()}
            </div>
            <div className="mt-1 text-[11px] text-muted">
              Paid out to holders via burn
            </div>
          </div>

          <div className="rounded-xl border border-border bg-[#0b1218] p-5 shadow-lg">
            <div className="text-xs text-muted font-medium">Graduated Active Vaults</div>
            <div className="mt-1 font-mono text-2xl sm:text-3xl font-black text-white tracking-tight">
              {stats.totalGraduatedCurves.toLocaleString()}
            </div>
            <div className="mt-1 text-[11px] text-muted">
              Passed $60K threshold
            </div>
          </div>

          <div className="rounded-xl border border-border bg-[#0b1218] p-5 shadow-lg">
            <div className="text-xs text-muted font-medium">Wallets Redeemed</div>
            <div className="mt-1 font-mono text-2xl sm:text-3xl font-black text-white tracking-tight">
              {stats.walletsRedeemed.toLocaleString()}
            </div>
            <div className="mt-1 text-[11px] text-muted">
              Exercised dual floor
            </div>
          </div>
        </div>

        {/* Two Tables Grid: Left Top Vaults / Right Recent Redemptions */}
        <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Table: Top Equity Vaults (7 cols) */}
          <div className="lg:col-span-7 rounded-xl border border-border bg-[#0b1218] p-5 shadow-xl">
            <div className="flex items-center justify-between border-b border-border/80 pb-3">
              <div>
                <h3 className="text-base font-bold text-white">
                  Top Equity Holdings in Vaults
                </h3>
                <p className="text-xs text-muted">
                  Ranked by total tokenized stock value held in Anchor PDAs
                </p>
              </div>
              <span className="text-[10px] text-muted font-mono uppercase">
                Custody: NY UCC Art. 8
              </span>
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
                        <span className="rounded bg-brand-cyan/15 px-1.5 py-0.5 text-[10px] font-bold text-brand-cyan border border-brand-cyan/30">
                          {asset.symbol}
                        </span>
                      </div>
                      <div className="text-[11px] text-muted mt-0.5">
                        {asset.sharesLocked.toLocaleString()} Shares locked in PDA · {asset.backingPercentage}% of TVL
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="font-mono text-sm font-bold text-white">
                      ${(asset.valueUsd / 1_000_000).toFixed(2)}M
                    </div>
                    <a
                      href="https://learn.backpack.exchange/articles/what-is-sunrise"
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[10px] text-brand-cyan hover:underline"
                    >
                      <span>Proof of Reserve</span>
                      <ArrowUpRight className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right Table: Recent Redemptions Live Ledger (5 cols) */}
          <div className="lg:col-span-5 rounded-xl border border-border bg-[#0b1218] p-5 shadow-xl">
            <div className="flex items-center justify-between border-b border-border/80 pb-3">
              <div>
                <h3 className="text-base font-bold text-white">
                  Recent Redemptions
                </h3>
                <p className="text-xs text-muted">
                  Live pro-rata burns and equity payouts
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
                        By {rdm.redeemerAddress} · {rdm.timestamp}
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="font-mono text-xs font-bold text-brand-emerald">
                      +{rdm.sharesRedeemed.toFixed(2)} {rdm.equitySymbol}
                    </div>
                    <div className="text-[10px] font-mono text-muted">
                      Tx: {rdm.txHash}
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

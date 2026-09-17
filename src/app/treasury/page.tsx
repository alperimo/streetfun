"use client";

import React, { useState } from "react";
import Image from "next/image";
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

      <main className="mx-auto flex-1 w-full max-w-[1350px] px-6 py-8 md:px-12 lg:px-0">
        <div className="flex flex-col gap-2 mb-8">
          <h1 className="text-3xl sm:text-4xl font-black text-foreground tracking-tight">
            Treasury
          </h1>
          <p className="max-w-2xl text-sm text-muted">
            Transparent, on-chain vaults holding real equity backing for graduated tokens. Verified on Solana via Pyth price feeds.
          </p>
        </div>

        {/* 4 Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="text-xs text-muted font-medium">Total Equity Locked</div>
            <div className="mt-1 font-mono text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
              ${stats.totalEquityValueLockedUsd.toLocaleString()}
            </div>
            <div className="mt-1 text-[11px] text-muted">
              Value in vaults now
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="text-xs text-muted font-medium">Total Distributed</div>
            <div className="mt-1 font-mono text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
              ${stats.totalRedemptionsUsd.toLocaleString()}
            </div>
            <div className="mt-1 text-[11px] text-muted">
              Paid to holders
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="text-xs text-muted font-medium">Graduated Vaults</div>
            <div className="mt-1 font-mono text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
              {stats.totalGraduatedCurves.toLocaleString()}
            </div>
            <div className="mt-1 text-[11px] text-muted">
              Active stock vaults
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="text-xs text-muted font-medium">Holder Payouts</div>
            <div className="mt-1 font-mono text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
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
          <div className="lg:col-span-7 rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-border/50 pb-3 mb-1">
                <h3 className="text-base font-bold text-foreground">
                  Top Vault Holdings
                </h3>
                <span className="text-xs text-muted font-mono">
                  Ranked by total stock value locked
                </span>
              </div>

              <div className="flex flex-col">
                {stats.assetBreakdown.map((asset, index) => (
                  <div
                    key={asset.symbol}
                    className="py-3 px-2 sm:px-2.5 flex items-center justify-between gap-4 hover:bg-card-hover/40 rounded-xl transition-colors border-b border-white/[0.05] last:border-b-0"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-mono text-xs font-bold text-muted w-4 flex-shrink-0 text-center">
                        {index + 1}
                      </span>
                      {asset.logoUrl && (
                        <div className="relative h-9 w-9 overflow-hidden rounded-full border border-border bg-card-subtle flex-shrink-0">
                          <Image
                            src={asset.logoUrl}
                            alt={asset.name}
                            fill
                            className="object-cover"
                            sizes="36px"
                          />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="font-bold text-foreground text-sm truncate">
                          {asset.name.split(" (")[0]}{" "}
                          {asset.name.includes(" (") && (
                            <span className="font-normal text-muted text-xs">
                              ({asset.name.split(" (")[1]}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted mt-0.5 truncate font-mono">
                          <span className="font-semibold text-slate-300">{asset.symbol}</span> • {asset.sharesLocked.toLocaleString()} shares • {asset.backingPercentage}% TVL
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-end min-w-[110px] flex-shrink-0 text-right">
                      <div className="font-mono text-sm font-bold text-foreground tabular-nums">
                        ${(asset.valueUsd / 1_000_000).toFixed(2)}M
                      </div>
                      <a
                        href="https://pyth.network"
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-foreground transition-colors mt-0.5"
                      >
                        <span>Pyth PoR</span>
                        <ArrowUpRight className="h-3 w-3" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Table: Recent Redemptions */}
          <div className="lg:col-span-5 rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-border/50 pb-3 mb-1">
                <h3 className="text-base font-bold text-foreground">
                  Recent Redemptions
                </h3>
                <span className="text-xs text-muted font-mono">
                  Newest first
                </span>
              </div>

              <div className="flex flex-col">
                {stats.recentRedemptions.map((rdm) => (
                  <div
                    key={rdm.id}
                    className="py-3 px-2 sm:px-2.5 flex items-center justify-between gap-4 hover:bg-card-hover/40 rounded-xl transition-colors border-b border-white/[0.05] last:border-b-0"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="relative h-9 w-9 flex-shrink-0">
                        {rdm.tokenAvatarUrl ? (
                          <div className="relative h-9 w-9 overflow-hidden rounded-full border border-border bg-card-subtle">
                            <Image
                              src={rdm.tokenAvatarUrl}
                              alt={rdm.tokenSymbol}
                              fill
                              className="object-cover"
                              sizes="36px"
                            />
                          </div>
                        ) : (
                          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card-subtle">
                            <Flame className="h-4 w-4 text-amber-500" />
                          </div>
                        )}
                        <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-card border border-border text-[9px] shadow-xs">
                          🔥
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-foreground text-xs truncate">
                          Burned {rdm.burnedMemeAmount}
                        </div>
                        <div className="text-[11px] text-muted font-mono mt-0.5 truncate">
                          {rdm.redeemerAddress} · <span className="text-muted/70">{rdm.timestamp}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-end min-w-[130px] flex-shrink-0 text-right">
                      <div className="font-mono text-xs font-medium text-white tabular-nums whitespace-nowrap">
                        +{rdm.sharesRedeemed.toFixed(2)} {rdm.equitySymbol}
                      </div>
                      <div className="text-[10px] font-mono text-muted whitespace-nowrap mt-0.5 tabular-nums">
                        {rdm.estimatedValueUsd ? `≈ $${rdm.estimatedValueUsd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : rdm.txHash}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
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

"use client";

import React, { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import { Flame } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { SearchModal } from "@/components/modals/SearchModal";
import { LaunchModal } from "@/components/modals/LaunchModal";
import { INITIAL_TREASURY_STATS } from "@/lib/mockData";
import { TokenMetadata } from "@/lib/types";
import { useMarket } from "@/context/MarketContext";
import { VERIFIED_TESSERA_PRE_IPO_ASSETS } from "@/sdk/constants";

export default function TreasuryPage() {
  const { tokens, isMock } = useMarket();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isLaunchOpen, setIsLaunchOpen] = useState(false);
  const [redemptions, setRedemptions] = useState<any[]>([]);

  useEffect(() => {
    async function loadRedemptions() {
      try {
        const res = await fetch("/api/trades/redemptions");
        if (res.ok) {
          const data = await res.json();
          setRedemptions(data.redemptions || []);
        }
      } catch (e) {
        console.warn("[Treasury] Could not fetch real redemptions:", e);
      }
    }
    loadRedemptions();
    const interval = setInterval(loadRedemptions, 4000);
    return () => clearInterval(interval);
  }, []);

  const stats = useMemo(() => {
    if (isMock) {
      return INITIAL_TREASURY_STATS;
    }

    // Live On-Chain & Indexed Protocol Stats
    const graduatedTokens = tokens.filter((t) => t.bondingCurve.isGraduated);
    const totalEquityValueLockedUsd = tokens.reduce(
      (acc, t) => acc + (t.treasury?.totalEquityValueUsd || 0),
      0
    );
    const totalGraduatedCurves = graduatedTokens.length;

    const totalRedemptionsUsd = redemptions.reduce(
      (acc, r) => acc + (Number(r.quote_amount_usd) || 0),
      0
    );
    const uniqueRedeemers = new Set(redemptions.map((r) => r.trader)).size;

    // Asset Breakdown by Supported Pre-IPO assets
    const assetBreakdown = VERIFIED_TESSERA_PRE_IPO_ASSETS.map((asset) => {
      const assetTokens = tokens.filter(
        (t) =>
          t.targetEquity.symbol.toLowerCase() === asset.symbol.toLowerCase() &&
          t.bondingCurve.isGraduated
      );
      const sharesLocked = assetTokens.reduce(
        (acc, t) => acc + (t.treasury?.totalEquityLocked || 0),
        0
      );
      const valueUsd = assetTokens.reduce(
        (acc, t) => acc + (t.treasury?.totalEquityValueUsd || 0),
        0
      );
      const backingPercentage =
        totalEquityValueLockedUsd > 0
          ? Number(((valueUsd / totalEquityValueLockedUsd) * 100).toFixed(1))
          : 0;

      return {
        symbol: asset.symbol,
        name: asset.name,
        sharesLocked,
        valueUsd,
        backingPercentage,
        mintAddress: asset.mintAddress,
        logoUrl: asset.logoUrl,
      };
    }).filter((asset) => asset.sharesLocked > 0).sort((a, b) => b.valueUsd - a.valueUsd);

    // Recent Redemptions mapped to UI format
    const recentRedemptions = redemptions.map((rdm, idx) => {
      const matchedToken = tokens.find(
        (t) => t.mint === rdm.mint
      );
      const sec = Math.max(
        1,
        Math.floor((Date.now() - new Date(rdm.created_at || Date.now()).getTime()) / 1000)
      );
      const timeAgo =
        sec < 60
          ? `${sec}s ago`
          : sec < 3600
          ? `${Math.floor(sec / 60)} mins ago`
          : `${Math.floor(sec / 3600)} hrs ago`;

      return {
        id: String(rdm.id || idx),
        timestamp: timeAgo,
        tokenSymbol: matchedToken?.symbol || "TOKEN",
        equitySymbol: matchedToken?.targetEquity.symbol || "$TSPACEX",
        burnedMemeAmount: `${Number(rdm.tokens_amount).toLocaleString("en-US", { maximumFractionDigits: 2 })} $${matchedToken?.symbol || "TOKEN"}`,
        sharesRedeemed:
          matchedToken?.targetEquity.stockPriceUsd && rdm.quote_amount_usd
            ? Number((rdm.quote_amount_usd / matchedToken.targetEquity.stockPriceUsd).toFixed(2))
            : 0,
        redeemerAddress: rdm.trader
          ? `${rdm.trader.slice(0, 4)}...${rdm.trader.slice(-4)}`
          : "Trader",
        txHash: rdm.tx_signature
          ? `${rdm.tx_signature.slice(0, 4)}...${rdm.tx_signature.slice(-4)}`
          : "tx",
        tokenAvatarUrl: matchedToken?.avatarUrl,
        estimatedValueUsd: Number(rdm.quote_amount_usd) || 0,
      };
    });

    return {
      totalEquityValueLockedUsd,
      totalGraduatedCurves,
      totalRedemptionsUsd,
      walletsRedeemed: uniqueRedeemers,
      assetBreakdown,
      recentRedemptions,
    };
  }, [tokens, redemptions, isMock]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header
        onOpenSearch={() => setIsSearchOpen(true)}
        onOpenLaunch={() => setIsLaunchOpen(true)}
      />

      <main className="mx-auto flex-1 w-full max-w-[1350px] px-6 py-8 sm:px-10 lg:px-0">
        <div className="flex flex-col gap-2 mb-8">
          <h1 className="text-3xl sm:text-4xl font-black text-foreground tracking-tight">
            Treasury
          </h1>
          <p className="max-w-2xl text-sm text-muted">
            On-chain treasury balances for graduated tokens. USD valuation is unavailable until a verified oracle is connected.
          </p>
        </div>

        {/* 4 Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="text-xs text-muted font-medium">Total Equity Locked</div>
            <div className="mt-1 font-mono text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
              {isMock ? `$${stats.totalEquityValueLockedUsd.toLocaleString("en-US")}` : "—"}
            </div>
            <div className="mt-1 text-[11px] text-muted">
              Value in vaults now
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="text-xs text-muted font-medium">Total Distributed</div>
            <div className="mt-1 font-mono text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
              {isMock ? `$${stats.totalRedemptionsUsd.toLocaleString("en-US")}` : "—"}
            </div>
            <div className="mt-1 text-[11px] text-muted">
              Paid to holders
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="text-xs text-muted font-medium">Graduated Vaults</div>
            <div className="mt-1 font-mono text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
              {stats.totalGraduatedCurves.toLocaleString("en-US")}
            </div>
            <div className="mt-1 text-[11px] text-muted">
              Active stock vaults
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="text-xs text-muted font-medium">Holder Payouts</div>
            <div className="mt-1 font-mono text-2xl sm:text-3xl font-bold text-foreground tracking-tight">
              {isMock ? stats.walletsRedeemed.toLocaleString("en-US") : "—"}
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
                          <span className="font-semibold text-slate-300">{asset.symbol}</span> • {asset.sharesLocked.toLocaleString("en-US")} shares • {asset.backingPercentage}% TVL
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col items-end min-w-[110px] flex-shrink-0 text-right">
                      <div className="font-mono text-sm font-bold text-foreground tabular-nums">
                        {asset.valueUsd >= 1_000_000
                          ? `$${(asset.valueUsd / 1_000_000).toFixed(2)}M`
                          : asset.valueUsd >= 1_000
                          ? `$${(asset.valueUsd / 1_000).toFixed(1)}K`
                          : `$${asset.valueUsd.toFixed(2)}`}
                      </div>
                      {!isMock && <span className="mt-0.5 text-[11px] text-muted">Oracle value unavailable</span>}
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

              {stats.recentRedemptions.length === 0 ? (
                <div className="py-12 flex flex-col items-center justify-center gap-2 text-center text-muted">
                  <div className="p-3 rounded-full bg-card-subtle border border-border">
                    <Flame className="h-5 w-5 text-amber-500/70" />
                  </div>
                  <span className="text-xs font-semibold text-foreground">No Redemptions Recorded Yet</span>
                  <span className="text-[11px] text-muted max-w-xs leading-relaxed">
                    Redemptions unlock on-chain when tokens graduate at $60,000 USDC and holders burn meme tokens to claim physical Pre-IPO stock.
                  </span>
                </div>
              ) : (
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
                          {rdm.estimatedValueUsd ? `≈ $${rdm.estimatedValueUsd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : rdm.txHash}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
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
      />
    </div>
  );
}

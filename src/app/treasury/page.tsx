"use client";

import React, { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { Activity, Flame, Landmark, Users } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { SearchModal } from "@/components/modals/SearchModal";
import { LaunchModal } from "@/components/modals/LaunchModal";
import { INITIAL_TREASURY_STATS } from "@/lib/mockData";
import { getOfficialEquityLogo } from "@/lib/assetLogos";
import { useMarket } from "@/context/MarketContext";
import { createBrowserSupabaseClient } from "@/lib/supabase";

interface VaultHolding {
  mint: string;
  tokenName: string;
  tokenSymbol: string;
  tokenAvatarUrl: string | null;
  equityMint: string;
  equitySymbol: string;
  equityAmount: string;
  observedSlot: number;
  updatedAt: string;
}

interface TreasuryRedemption {
  id: string;
  mint: string;
  tokenName: string;
  tokenSymbol: string;
  tokenAvatarUrl: string | null;
  equitySymbol: string;
  burnedAmount: string;
  equityAmount: string;
  redeemer: string;
  signature: string;
  createdAt: string;
}

interface TreasuryData {
  asOf: string | null;
  holdings: VaultHolding[];
  recentRedemptions: TreasuryRedemption[];
  graduatedVaultCount: number;
  redemptionCount: number;
  uniqueRedeemerCount: number;
  collateralAssetCount: number;
}

const compactNumber = new Intl.NumberFormat("en-US", { maximumFractionDigits: 4 });

function formatAmount(value: string | number): string {
  const amount = Number(typeof value === "string" ? value.replace(/,/g, "") : value);
  return Number.isFinite(amount) ? compactNumber.format(amount) : "0";
}

function shortAddress(value: string): string {
  return value.length > 12 ? `${value.slice(0, 4)}…${value.slice(-4)}` : value;
}

function timeAgo(value: string): string {
  const seconds = Math.max(1, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} mins ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hrs ago`;
  return `${Math.floor(seconds / 86400)} days ago`;
}

export default function TreasuryPage() {
  const { tokens, isMock } = useMarket();
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isLaunchOpen, setIsLaunchOpen] = useState(false);
  const [treasuryData, setTreasuryData] = useState<TreasuryData | null>(null);
  const [isLoading, setIsLoading] = useState(!isMock);
  const [hasLoadError, setHasLoadError] = useState(false);

  useEffect(() => {
    if (isMock) return;

    let disposed = false;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;

    const loadTreasury = async () => {
      try {
        const response = await fetch("/api/treasury", { cache: "no-store" });
        if (!response.ok) throw new Error("Treasury data is temporarily unavailable.");
        const data = (await response.json()) as TreasuryData;
        if (disposed) return;
        setTreasuryData(data);
        setHasLoadError(false);
      } catch (error) {
        if (disposed) return;
        console.warn("[Treasury] Could not load Supabase data:", error);
        setHasLoadError(true);
      } finally {
        if (!disposed) setIsLoading(false);
      }
    };

    const scheduleRefresh = () => {
      if (document.visibilityState !== "visible" || refreshTimer) return;
      refreshTimer = setTimeout(() => {
        refreshTimer = null;
        void loadTreasury();
      }, 300);
    };

    void loadTreasury();
    const interval = setInterval(() => {
      if (document.visibilityState === "visible") void loadTreasury();
    }, 20_000);
    const supabase = createBrowserSupabaseClient();
    const channel = supabase
      ?.channel("streetfun-live-treasury")
      .on("postgres_changes", { event: "*", schema: "public", table: "vault_holdings" }, scheduleRefresh)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "trades", filter: "trade_type=eq.REDEEM" }, scheduleRefresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "tokens" }, scheduleRefresh)
      .subscribe();

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void loadTreasury();
    };
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      disposed = true;
      clearInterval(interval);
      if (refreshTimer) clearTimeout(refreshTimer);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      if (supabase && channel) void supabase.removeChannel(channel);
    };
  }, [isMock]);

  const holdings = useMemo<VaultHolding[]>(() => {
    if (!isMock) return treasuryData?.holdings || [];
    return INITIAL_TREASURY_STATS.assetBreakdown.map((asset, index) => ({
      mint: `mock-vault-${index}`,
      tokenName: asset.name,
      tokenSymbol: asset.symbol,
      tokenAvatarUrl: asset.logoUrl || null,
      equityMint: asset.mintAddress,
      equitySymbol: asset.symbol,
      equityAmount: String(asset.sharesLocked),
      observedSlot: index + 1,
      updatedAt: new Date().toISOString(),
    }));
  }, [isMock, treasuryData]);

  const holdingGroups = useMemo(() => {
    const groups = new Map<string, {
      equityMint: string;
      equitySymbol: string;
      equityAmount: number;
      vaultCount: number;
    }>();

    for (const holding of holdings) {
      const key = holding.equityMint || holding.equitySymbol;
      const group = groups.get(key) || {
        equityMint: key,
        equitySymbol: holding.equitySymbol,
        equityAmount: 0,
        vaultCount: 0,
      };
      group.equityAmount += Number(holding.equityAmount) || 0;
      group.vaultCount += 1;
      groups.set(key, group);
    }

    return Array.from(groups.values()).sort((a, b) => a.equitySymbol.localeCompare(b.equitySymbol));
  }, [holdings]);

  const redemptions = useMemo<TreasuryRedemption[]>(() => {
    if (!isMock) return treasuryData?.recentRedemptions || [];
    return INITIAL_TREASURY_STATS.recentRedemptions.map((redemption, index) => ({
      id: redemption.id,
      mint: `mock-redemption-${index}`,
      tokenName: redemption.tokenSymbol,
      tokenSymbol: redemption.tokenSymbol,
      tokenAvatarUrl: redemption.tokenAvatarUrl || null,
      equitySymbol: redemption.equitySymbol,
      burnedAmount: redemption.burnedMemeAmount.replace(/[^0-9,.]/g, ""),
      equityAmount: String(redemption.sharesRedeemed),
      redeemer: redemption.redeemerAddress,
      signature: redemption.txHash,
      createdAt: new Date(Date.now() - (index + 1) * 5 * 60_000).toISOString(),
    }));
  }, [isMock, treasuryData]);

  const stats = {
    collateralAssetCount: isMock ? holdingGroups.length : treasuryData?.collateralAssetCount || 0,
    redemptionCount: isMock ? redemptions.length : treasuryData?.redemptionCount || 0,
    graduatedVaultCount: isMock
      ? INITIAL_TREASURY_STATS.totalGraduatedCurves
      : treasuryData?.graduatedVaultCount || 0,
    uniqueRedeemerCount: isMock
      ? INITIAL_TREASURY_STATS.walletsRedeemed
      : treasuryData?.uniqueRedeemerCount || 0,
  };

  const statCards = [
    {
      label: "Collateral assets",
      value: stats.collateralAssetCount,
      detail: "Distinct on-chain collateral types",
      icon: Landmark,
    },
    {
      label: "Completed redemptions",
      value: stats.redemptionCount,
      detail: "Confirmed on Solana",
      icon: Activity,
    },
    {
      label: "Graduated vaults",
      value: stats.graduatedVaultCount,
      detail: "Graduated StreetFun tokens",
      icon: Flame,
    },
    {
      label: "Unique redeemers",
      value: stats.uniqueRedeemerCount,
      detail: "Wallets that received collateral",
      icon: Users,
    },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header
        onOpenSearch={() => setIsSearchOpen(true)}
        onOpenLaunch={() => setIsLaunchOpen(true)}
      />

      <main className="mx-auto flex-1 w-full max-w-[1350px] px-6 py-8 sm:px-10 lg:px-0">
        <div className="mb-8 flex flex-col gap-2">
          <h1 className="text-3xl font-black tracking-tight text-foreground sm:text-4xl">Treasury</h1>
          <p className="max-w-2xl text-sm text-muted">
            On-chain collateral balances for graduated tokens. Holdings are shown in token units; USD marks require a verified price source.
          </p>
        </div>

        {hasLoadError && !isMock && (
          <div role="status" className="mb-5 rounded-xl border border-border bg-card px-4 py-3 text-sm text-muted">
            Current balances could not be verified. {treasuryData?.asOf ? `Showing the last verified snapshot from ${new Date(treasuryData.asOf).toLocaleString()}.` : "Retrying…"}
          </div>
        )}

        {!isMock && treasuryData?.asOf && (
          <p className="mb-4 text-xs text-muted">Balances verified {new Date(treasuryData.asOf).toLocaleString()}.</p>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {statCards.map(({ label, value, detail, icon: Icon }) => (
            <div key={label} className="rounded-2xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs font-medium text-muted">{label}</div>
                <Icon className="h-4 w-4 text-muted" aria-hidden="true" />
              </div>
              <div className="mt-1 font-mono text-2xl font-bold tracking-tight text-foreground sm:text-3xl tabular-nums">
                {isLoading && !isMock ? "…" : hasLoadError && !isMock ? "—" : value.toLocaleString("en-US")}
              </div>
              <div className="mt-1 text-[11px] text-muted">{detail}</div>
            </div>
          ))}
        </div>

        <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-12">
          <section className="flex flex-col rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6 lg:col-span-7">
            <div className="mb-1 flex items-center justify-between gap-3 border-b border-border/50 pb-3">
              <h2 className="text-base font-bold text-foreground">Top Vault Holdings</h2>
              <span className="text-right text-xs text-muted">Verified collateral balances by asset</span>
            </div>

            {isLoading && !isMock ? (
              <div className="flex flex-col gap-3 py-5" aria-label="Loading vault holdings">
                <div className="h-14 animate-pulse rounded-xl bg-card-hover/50" />
                <div className="h-14 animate-pulse rounded-xl bg-card-hover/50" />
              </div>
            ) : holdingGroups.length === 0 ? (
              <div className="flex min-h-40 flex-col items-center justify-center gap-2 text-center text-muted">
                <div className="rounded-full border border-border bg-card-subtle p-3">
                  <Landmark className="h-5 w-5" />
                </div>
                <span className="text-xs font-semibold text-foreground">No vault holdings recorded yet</span>
                <span className="max-w-xs text-[11px] leading-relaxed">
                  Collateral balances will appear here once token graduation is verified on-chain.
                </span>
              </div>
            ) : (
              <div className="flex flex-col">
                {holdingGroups.map((asset) => (
                  <div
                    key={asset.equityMint}
                    className="flex items-center justify-between gap-4 rounded-xl border-b border-border/40 px-2 py-3 transition-colors last:border-b-0 hover:bg-card-hover/40 sm:px-2.5"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="relative h-9 w-9 flex-shrink-0 overflow-hidden rounded-full border border-border bg-card-subtle">
                        <Image
                          src={getOfficialEquityLogo(asset.equitySymbol)}
                          alt=""
                          fill
                          className="object-cover"
                          sizes="36px"
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="truncate text-sm font-bold text-foreground">
                          {asset.equitySymbol.replace(/^\$/, "")}
                        </div>
                        <div className="mt-0.5 truncate font-mono text-xs text-muted">
                          {asset.vaultCount.toLocaleString("en-US")} {asset.vaultCount === 1 ? "vault" : "vaults"} · {formatAmount(asset.equityAmount)} collateral units
                        </div>
                      </div>
                    </div>
                    <div className="min-w-[120px] flex-shrink-0 text-right">
                      <div className="font-mono text-sm font-bold tabular-nums text-foreground">
                        {formatAmount(asset.equityAmount)} units
                      </div>
                      <div className="mt-0.5 text-[11px] text-muted">{hasLoadError ? "Last verified balance" : "Verified on-chain balance"}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="flex flex-col rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6 lg:col-span-5">
            <div className="mb-1 flex items-center justify-between gap-3 border-b border-border/50 pb-3">
              <h2 className="text-base font-bold text-foreground">Recent Redemptions</h2>
              <span className="text-xs text-muted">Newest first</span>
            </div>

            {isLoading && !isMock ? (
              <div className="flex flex-col gap-3 py-5" aria-label="Loading redemptions">
                <div className="h-14 animate-pulse rounded-xl bg-card-hover/50" />
                <div className="h-14 animate-pulse rounded-xl bg-card-hover/50" />
              </div>
            ) : redemptions.length === 0 ? (
              <div className="flex min-h-40 flex-col items-center justify-center gap-2 text-center text-muted">
                <div className="rounded-full border border-border bg-card-subtle p-3">
                  <Flame className="h-5 w-5 text-amber-500/70" />
                </div>
                <span className="text-xs font-semibold text-foreground">No redemptions recorded yet</span>
                <span className="max-w-xs text-[11px] leading-relaxed">
                  Confirmed collateral redemptions will appear here once executed on Solana.
                </span>
              </div>
            ) : (
              <div className="flex flex-col">
                {redemptions.slice(0, 8).map((redemption) => (
                  <div
                    key={redemption.id}
                    className="flex items-center justify-between gap-3 rounded-xl border-b border-border/40 px-2 py-3 transition-colors last:border-b-0 hover:bg-card-hover/40 sm:px-2.5"
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div className="relative h-9 w-9 flex-shrink-0">
                        {redemption.tokenAvatarUrl ? (
                          <div className="relative h-9 w-9 overflow-hidden rounded-full border border-border bg-card-subtle">
                            <Image
                              src={redemption.tokenAvatarUrl}
                              alt={redemption.tokenSymbol}
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
                        <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border border-border bg-card text-[9px] shadow-xs">🔥</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-bold text-foreground">
                          Burned {formatAmount(redemption.burnedAmount)} ${redemption.tokenSymbol.replace(/^\$/, "")}
                        </div>
                        <div className="mt-0.5 truncate font-mono text-[11px] text-muted">
                          {shortAddress(redemption.redeemer)} · <span className="text-muted/70">{timeAgo(redemption.createdAt)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="min-w-[118px] flex-shrink-0 text-right">
                      <div className="whitespace-nowrap font-mono text-xs font-medium tabular-nums text-foreground">
                        +{formatAmount(redemption.equityAmount)} {redemption.equitySymbol.replace(/^\$/, "")}
                      </div>
                      <div className="mt-0.5 whitespace-nowrap font-mono text-[10px] text-muted">
                        {shortAddress(redemption.signature)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
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

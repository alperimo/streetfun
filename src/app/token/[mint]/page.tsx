"use client";

import React, { useState, use, useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Copy, Check, ExternalLink } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { TradingViewChart } from "@/components/tokens/TradingViewChart";
import { TradeTerminal } from "@/components/tokens/TradeTerminal";
import { SearchModal } from "@/components/modals/SearchModal";
import { LaunchModal } from "@/components/modals/LaunchModal";
import { TokenMetadata } from "@/lib/types";
import { useMarket } from "@/context/MarketContext";
import { TokenDetailSkeleton } from "@/components/common/Skeletons";

interface PageProps {
  params: Promise<{ mint: string }>;
}

export default function TokenDetailPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const mint = resolvedParams.mint;

  const { tokens, getToken, loading } = useMarket();
  const [copied, setCopied] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isLaunchOpen, setIsLaunchOpen] = useState(false);
  const [trades, setTrades] = useState<any[]>([]);
  const [tradesLoading, setTradesLoading] = useState(true);

  const token =
    getToken(mint) ||
    tokens.find((t) => t.mint.toLowerCase() === mint.toLowerCase()) ||
    null;

  const fetchTrades = React.useCallback(async () => {
    const targetMint = mint || token?.mint;
    if (!targetMint) return;
    try {
      const res = await fetch(`/api/trades/${targetMint}`);
      if (res.ok) {
        const data = await res.json();
        setTrades(data.trades || []);
      }
    } catch (err) {
      console.warn("Could not load trades:", err);
    } finally {
      setTradesLoading(false);
    }
  }, [mint, token?.mint]);

  useEffect(() => {
    fetchTrades();
    const interval = setInterval(fetchTrades, 3000);
    return () => clearInterval(interval);
  }, [fetchTrades]);

  const handleCopyCa = () => {
    if (!token) return;
    navigator.clipboard.writeText(token.mint);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (!token) {
    return (
      <div className="flex min-h-screen flex-col bg-background">
        <Header
          onOpenSearch={() => setIsSearchOpen(true)}
          onOpenLaunch={() => setIsLaunchOpen(true)}
        />
        <TokenDetailSkeleton />
        <Footer />
      </div>
    );
  }

  // 1. Current Price & Market Cap
  const currentPrice =
    trades.length > 0 && trades[0]?.price_usd ? Number(trades[0].price_usd) : token.priceUsd;
  const currentMarketCap =
    trades.length > 0 && trades[0]?.price_usd
      ? currentPrice * 1_000_000_000
      : token.marketCapUsd;

  const formattedMarketCap =
    currentMarketCap >= 1_000_000
      ? `$${(currentMarketCap / 1_000_000).toFixed(2)}M`
      : `$${(currentMarketCap / 1_000).toFixed(1)}K`;

  const formattedPrice =
    currentPrice < 0.001 ? `$${currentPrice.toFixed(6)}` : `$${currentPrice.toFixed(4)}`;

  // 2. Dynamic Price Change %
  const initialCurvePrice = 30_000 / 1_073_000_000;
  const oldestPrice =
    trades.length > 0 && trades[trades.length - 1]?.price_usd
      ? Number(trades[trades.length - 1].price_usd)
      : initialCurvePrice;

  const computedChangePct =
    trades.length > 1
      ? ((currentPrice - oldestPrice) / oldestPrice) * 100
      : token.priceChange24h;

  const isNeutralChange = Math.abs(computedChangePct) < 0.01;
  const isPositiveChange = computedChangePct > 0;

  // 3. Dynamic Volume (from real indexed trades or token metadata)
  const tradesVolume = trades.reduce((acc, t) => acc + (Number(t.quote_amount_usd) || 0), 0);
  const totalVolume = Math.max(tradesVolume, token.volume24hUsd || 0);

  const formattedVolume =
    totalVolume >= 1_000_000
      ? `$${(totalVolume / 1_000_000).toFixed(2)}M`
      : totalVolume >= 1_000
      ? `$${(totalVolume / 1_000).toFixed(1)}K`
      : `$${totalVolume.toFixed(2)}`;

  // 4. Dynamic Bonding Reserves & Progress
  const totalBuys = trades
    .filter((t) => t.trade_type === "BUY")
    .reduce((acc, t) => acc + (Number(t.quote_amount_usd) || 0), 0);
  const totalSells = trades
    .filter((t) => t.trade_type === "SELL")
    .reduce((acc, t) => acc + (Number(t.quote_amount_usd) || 0), 0);

  const currentReserves = Math.max(
    token.bondingCurve.realQuoteReservesUsd,
    totalBuys - totalSells
  );

  const currentProgressPct = Math.min(100, (currentReserves / 60_000) * 100);

  const formattedProgress =
    currentProgressPct >= 1
      ? `${Math.round(currentProgressPct)}%`
      : currentProgressPct > 0
      ? `${currentProgressPct.toFixed(2)}%`
      : `0%`;

  const formattedReservesDetail =
    currentReserves >= 1_000
      ? `(${(currentReserves / 1_000).toFixed(1)}K / $60K)`
      : `($${currentReserves.toFixed(0)} / $60,000 USDC)`;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header
        onOpenSearch={() => setIsSearchOpen(true)}
        onOpenLaunch={() => setIsLaunchOpen(true)}
      />

      <main className="mx-auto flex-1 w-full max-w-[1350px] px-6 py-6 md:px-12 lg:px-0">
        <div className="mb-4">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Markets</span>
          </Link>
        </div>

        {/* Token Header */}
        <div className="rounded-2xl border border-border bg-card p-5 mb-6 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="relative h-14 w-14 overflow-hidden rounded-full border border-border bg-card-subtle flex-shrink-0">
                <Image
                  src={token.avatarUrl}
                  alt={token.name}
                  fill
                  className="object-cover"
                  sizes="56px"
                />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-black text-foreground tracking-tight">
                    ${token.symbol}
                  </h1>
                  <span className="text-sm text-muted font-medium">
                    {token.name}
                  </span>
                  {token.bondingCurve.isGraduated && (
                    <span className="rounded-md border border-slate-700/60 bg-slate-800/50 px-2 py-0.5 text-[10px] font-medium text-slate-300">
                      Graduated
                    </span>
                  )}
                </div>

                <div className="mt-1 flex items-center gap-2 text-xs flex-wrap">
                  <span className="text-muted">Backed with</span>
                  <span className="font-semibold text-foreground">
                    {token.targetEquity.name} ({token.targetEquity.symbol})
                  </span>
                  {token.targetEquity.isPreIpo && (
                    <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.2 text-[9px] font-bold text-amber-400">
                      Pre-IPO
                    </span>
                  )}
                  <button
                    onClick={handleCopyCa}
                    className="flex items-center gap-1 font-mono text-[11px] text-muted hover:text-foreground transition-colors"
                  >
                    <Copy className="h-3 w-3" />
                    <span>
                      {token.mint.slice(0, 4)}...{token.mint.slice(-4)}
                    </span>
                  </button>
                  {copied && (
                    <span className="text-[11px] text-emerald-400 font-medium">Copied!</span>
                  )}
                </div>
              </div>
            </div>

            {/* External Links */}
            <div className="flex items-center gap-2">
              <a
                href={token.bondingCurve.isGraduated ? "https://meteora.ag" : "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-lg border border-border bg-card-hover/40 px-3 py-1.5 text-xs text-muted hover:text-foreground hover:border-border-active transition-colors font-medium"
              >
                <span>{token.bondingCurve.isGraduated ? "Meteora" : "Bonding Curve"}</span>
                <ExternalLink className="h-3 w-3" />
              </a>
              <a
                href={`https://solscan.io/token/${token.mint}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-lg border border-border bg-card-hover/40 px-3 py-1.5 text-xs text-muted hover:text-foreground hover:border-border-active transition-colors font-medium"
              >
                <span>Solscan</span>
                <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>

          {/* Stonkfun 4-Column Horizontal Stats Bar */}
          <div className="mt-5 pt-4 border-t border-border grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-[11px] text-muted font-medium">Market cap</div>
              <div className="mt-1 font-mono text-xl font-bold text-foreground">
                {formattedMarketCap}
              </div>
            </div>

            <div>
              <div className="text-[11px] text-muted font-medium">Token price</div>
              <div className="mt-1 flex items-baseline gap-2 font-mono text-xl font-bold text-foreground">
                <span>{formattedPrice}</span>
                <span
                  className={`text-xs font-semibold ${
                    isNeutralChange
                      ? "text-muted"
                      : isPositiveChange
                      ? "text-emerald-400"
                      : "text-rose-400"
                  }`}
                >
                  {isPositiveChange && !isNeutralChange ? "+" : ""}
                  {computedChangePct.toFixed(1)}%
                </span>
              </div>
            </div>

            <div>
              <div className="text-[11px] text-muted font-medium">24h volume</div>
              <div className="mt-1 font-mono text-xl font-bold text-foreground">
                {formattedVolume}
              </div>
            </div>

            <div>
              {token.bondingCurve.isGraduated ? (
                <>
                  <div className="text-[11px] text-muted font-medium">NAV Floor</div>
                  <div className="mt-1 flex items-baseline gap-1.5 font-mono">
                    <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-base font-bold text-amber-300">
                      $0.0031
                    </span>
                    <span className="text-[10px] font-normal text-muted">/ token</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="text-[11px] text-muted font-medium">Bonding curve</div>
                  <div className="mt-1 font-mono text-xl font-bold text-foreground">
                    {formattedProgress}{" "}
                    <span className="text-xs font-normal text-muted">
                      {formattedReservesDetail}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Main 2-Column Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column (8 cols) */}
          <div className="lg:col-span-8 flex flex-col gap-6">
            <TradingViewChart
              token={token}
              floorPrice={0.0031}
            />

            {/* Graduation Progress vs Meteora DLMM Active Liquidity Band */}
            {token.bondingCurve.isGraduated ? (
              <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="flex h-2 w-2 relative">
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
                    </span>
                    <span className="font-bold text-foreground">Meteora DLMM Pool Active</span>
                    <span className="text-muted">· Dynamic Fee Tier 0.25%</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-muted font-mono text-[11px]">
                    <span>DLMM Liquidity: <strong className="text-foreground">$60,000 USDC</strong></span>
                    <span>LP Status: <strong className="text-emerald-400">Locked Protocol Reserve</strong></span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="text-muted font-medium">Graduation Progress</span>
                  <span className="font-mono font-bold text-foreground">
                    {formattedProgress} {formattedReservesDetail}
                  </span>
                </div>

                <div className="h-1.5 w-full overflow-hidden rounded-full bg-card-hover/40 border border-border">
                  <div
                    className="bg-gradient-to-r from-brand-cyan/70 to-brand-cyan h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(currentProgressPct, 100)}%` }}
                  />
                </div>
              </div>
            )}

            {/* Live Trades Table */}
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-bold text-foreground tracking-tight uppercase">
                    Live Trades
                  </h3>
                  <span className="flex h-1.5 w-1.5 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400"></span>
                  </span>
                </div>
              </div>

              <div className="mt-2.5 overflow-x-auto">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="text-muted border-b border-border text-[10px]">
                      <th className="pb-2 font-medium">Type</th>
                      <th className="pb-2 font-medium">Price</th>
                      <th className="pb-2 font-medium">Tokens</th>
                      <th className="pb-2 font-medium">Value (USDC)</th>
                      <th className="pb-2 font-medium text-right">Time</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {trades.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="py-8 text-center text-muted">
                          <div className="flex flex-col items-center justify-center gap-1">
                            <span className="text-xs font-semibold text-foreground">No Trades Recorded Yet</span>
                            <span className="text-[11px] text-muted">
                              Execute a trade on this curve to mint the first on-chain record.
                            </span>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      trades.map((trade, idx) => {
                        const isRedeem = trade.trade_type === "REDEEM";
                        const isBuy = trade.trade_type === "BUY";
                        const sec = Math.max(1, Math.floor((Date.now() - new Date(trade.created_at || Date.now()).getTime()) / 1000));
                        const timeAgo = sec < 60 ? `${sec}s ago` : sec < 3600 ? `${Math.floor(sec / 60)}m ago` : `${Math.floor(sec / 3600)}h ago`;
                        const formattedTradePrice =
                          Number(trade.price_usd) < 0.001
                            ? `$${Number(trade.price_usd).toFixed(6)}`
                            : `$${Number(trade.price_usd).toFixed(4)}`;
                        return (
                          <tr key={trade.id || idx} className="hover:bg-card-hover transition-colors">
                            <td className="py-2">
                              <span
                                className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
                                  isRedeem
                                    ? "bg-amber-500/10 text-amber-500 border border-amber-500/30"
                                    : isBuy
                                    ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                                    : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                                }`}
                              >
                                {trade.trade_type}
                              </span>
                            </td>
                            <td className="py-2 text-foreground">{formattedTradePrice}</td>
                            <td className="py-2 text-foreground">
                              {Number(trade.tokens_amount).toLocaleString("en-US", { maximumFractionDigits: 2 })} {token.symbol}
                            </td>
                            <td className="py-2 font-bold text-foreground">
                              ${Number(trade.quote_amount_usd).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                            <td className="py-2 text-right text-muted">{timeAgo}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Right Column (4 cols) */}
          <div className="lg:col-span-4 flex flex-col gap-6">
            <TradeTerminal
              token={token}
              onTradeSuccess={fetchTrades}
            />

            <div className="rounded-2xl border border-border bg-card p-4 text-xs space-y-2.5 shadow-sm">
              <div className="font-bold text-foreground pb-2 border-b border-border">
                Treasury & Security Details
              </div>
              <div className="flex justify-between text-muted">
                <span>Collateral Asset:</span>
                <span className="font-mono text-foreground font-semibold">
                  {token.targetEquity.name.replace(/\s*\(.*?\)/g, "").trim()} ({token.targetEquity.symbol.replace(/^\$/, "")})
                </span>
              </div>
              <div className="flex justify-between text-muted">
                <span>Asset Class:</span>
                <span className="font-mono text-foreground">
                  {token.targetEquity.isPreIpo ? "Pre-IPO Private Equity" : "Tokenized Public Stock"}
                </span>
              </div>
              <div className="flex justify-between text-muted">
                <span>Custodian Vault:</span>
                <span className="font-mono text-foreground">Tessera Protocol Custody</span>
              </div>
              <div className="flex justify-between text-muted">
                <span>Proof of Reserve:</span>
                <span className="font-mono text-slate-300 font-medium">Pyth / On-Chain Verified</span>
              </div>
              <div className="flex justify-between text-muted">
                <span>Legal Structure:</span>
                <span className="font-mono text-foreground truncate max-w-[180px]" title={token.targetEquity.legalFramework}>
                  {token.targetEquity.legalFramework}
                </span>
              </div>
              <div className="flex justify-between text-muted">
                <span>Total Supply:</span>
                <span className="font-mono text-foreground">1,000,000,000</span>
              </div>
              <div className="flex justify-between text-muted">
                <span>Graduation Split:</span>
                <span className="font-mono text-foreground">50% Stock Collateral · 50% DLMM Reserve</span>
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
      />
    </div>
  );
}

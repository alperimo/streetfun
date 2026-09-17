"use client";

import React, { useState, use } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Copy, Check, ExternalLink } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { TradingViewChart } from "@/components/tokens/TradingViewChart";
import { TradeTerminal } from "@/components/tokens/TradeTerminal";
import { SearchModal } from "@/components/modals/SearchModal";
import { LaunchModal } from "@/components/modals/LaunchModal";
import { INITIAL_TOKENS } from "@/lib/mockData";
import { TokenMetadata } from "@/lib/types";
import { useMarket } from "@/context/MarketContext";

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

  const token =
    getToken(mint) ||
    tokens.find((t) => t.mint.toLowerCase() === mint.toLowerCase()) ||
    INITIAL_TOKENS.find((t) => t.mint.toLowerCase() === mint.toLowerCase()) ||
    tokens[0] ||
    INITIAL_TOKENS[0];

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
        <main className="mx-auto flex-1 w-full max-w-[1350px] px-6 py-16 flex items-center justify-center md:px-12 lg:px-0">
          <div className="text-center">
            <div className="h-8 w-8 border-2 border-brand-cyan border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-sm text-muted font-mono">Loading token data...</p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const isPositive = token.priceChange24h >= 0;

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
                  <div className="relative h-4 w-4 overflow-hidden rounded-full border border-border flex-shrink-0">
                    <Image
                      src={token.targetEquity.logoUrl}
                      alt={token.targetEquity.name}
                      fill
                      className="object-cover"
                      sizes="16px"
                    />
                  </div>
                  <span className="font-bold text-foreground">
                    {token.targetEquity.name.replace(/\s*\(.*?\)/g, "").trim()}
                  </span>
                  <span className="font-mono text-muted text-xs">
                    ({token.targetEquity.symbol.startsWith("$") ? token.targetEquity.symbol : `$${token.targetEquity.symbol}`})
                  </span>
                  <span className="rounded-md border border-slate-700/50 bg-slate-800/30 px-2 py-0.5 text-[10px] tracking-wide font-mono font-medium text-slate-400">
                    {token.targetEquity.isPreIpo ? "Pre-IPO" : "xStocks"}
                  </span>

                  <button
                    onClick={handleCopyCa}
                    className="flex items-center gap-1 rounded border border-border-active/40 bg-card-hover/40 px-2 py-0.5 text-muted hover:text-foreground transition-colors font-mono text-[10px]"
                  >
                    {copied ? (
                      <Check className="h-3 w-3 text-brand-emerald" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                    <span>
                      {copied ? "Copied" : `${token.mint.slice(0, 4)}...${token.mint.slice(-4)}`}
                    </span>
                  </button>
                </div>
              </div>
            </div>

            {/* External Links */}
            <div className="flex items-center gap-2 self-start md:self-auto">
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
                ${(token.marketCapUsd / 1_000_000).toFixed(2)}M
              </div>
            </div>

            <div>
              <div className="text-[11px] text-muted font-medium">Token price</div>
              <div className="mt-1 flex items-baseline gap-2 font-mono text-xl font-bold text-foreground">
                <span>${token.priceUsd.toFixed(4)}</span>
                <span
                  className={`text-xs font-semibold ${
                    isPositive ? "text-brand-emerald" : "text-brand-rose"
                  }`}
                >
                  {isPositive ? "+" : ""}
                  {token.priceChange24h.toFixed(1)}%
                </span>
              </div>
            </div>

            <div>
              <div className="text-[11px] text-muted font-medium">24h volume</div>
              <div className="mt-1 font-mono text-xl font-bold text-foreground">
                ${token.volume24hUsd >= 1_000_000 ? `${(token.volume24hUsd / 1_000_000).toFixed(2)}M` : `${(token.volume24hUsd / 1_000).toFixed(0)}K`}
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
                    {token.bondingCurve.progressPct}%{" "}
                    <span className="text-xs font-normal text-muted">
                      (${(token.bondingCurve.realQuoteReservesUsd / 1_000).toFixed(1)}K / $60K)
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
                    {token.bondingCurve.progressPct}% (${(token.bondingCurve.realQuoteReservesUsd / 1_000).toFixed(1)}K / $60K USDC)
                  </span>
                </div>

                <div className="h-1.5 w-full overflow-hidden rounded-full bg-card-hover/40 border border-border">
                  <div
                    className="bg-gradient-to-r from-brand-cyan/70 to-brand-cyan h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(token.bondingCurve.progressPct, 100)}%` }}
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
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-emerald opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-brand-emerald"></span>
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
                    {[
                      { type: "BUY", price: token.priceUsd, tokens: 28450, usdc: 28450 * token.priceUsd, time: "12s ago", isBuy: true },
                      { type: "BUY", price: token.priceUsd * 0.995, tokens: 65120, usdc: 65120 * token.priceUsd * 0.995, time: "48s ago", isBuy: true },
                      { type: "REDEEM", price: 0.0031, tokens: 100000, usdc: 310.00, time: "2m ago", isRedeem: true },
                      { type: "SELL", price: token.priceUsd * 0.98, tokens: 14200, usdc: 14200 * token.priceUsd * 0.98, time: "4m ago", isBuy: false },
                      { type: "BUY", price: token.priceUsd * 0.97, tokens: 82000, usdc: 82000 * token.priceUsd * 0.97, time: "7m ago", isBuy: true },
                    ].map((trade, idx) => (
                      <tr key={idx} className="hover:bg-card-hover transition-colors">
                        <td className="py-2">
                          <span
                            className={`rounded px-1.5 py-0.5 text-[9px] font-bold ${
                              trade.isRedeem
                                ? "bg-amber-500/10 text-amber-500 border border-amber-500/30"
                                : trade.isBuy
                                ? "bg-emerald-500/10 text-brand-emerald border border-emerald-500/20"
                                : "bg-rose-500/10 text-brand-rose border border-rose-500/20"
                            }`}
                          >
                            {trade.type}
                          </span>
                        </td>
                        <td className="py-2 text-foreground">${trade.price.toFixed(4)}</td>
                        <td className="py-2 text-foreground">
                          {trade.tokens.toLocaleString()} {token.symbol}
                        </td>
                        <td className="py-2 font-bold text-foreground">
                          ${trade.usdc.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                        <td className="py-2 text-right text-muted">{trade.time}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Right Column (4 cols) */}
          <div className="lg:col-span-4 flex flex-col gap-6">
            <TradeTerminal
              token={token}
              onTradeSuccess={() => {}}
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

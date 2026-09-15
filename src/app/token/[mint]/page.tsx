"use client";

import React, { useState, use } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Copy, Check } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { TradingViewChart } from "@/components/tokens/TradingViewChart";
import { TradeTerminal } from "@/components/tokens/TradeTerminal";
import { SearchModal } from "@/components/modals/SearchModal";
import { LaunchModal } from "@/components/modals/LaunchModal";
import { INITIAL_TOKENS } from "@/lib/mockData";
import { TokenMetadata } from "@/lib/types";

interface PageProps {
  params: Promise<{ mint: string }>;
}

export default function TokenDetailPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const mint = resolvedParams.mint;

  const [tokens, setTokens] = useState<TokenMetadata[]>(INITIAL_TOKENS);
  const [copied, setCopied] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isLaunchOpen, setIsLaunchOpen] = useState(false);

  const token = tokens.find((t) => t.mint === mint) || tokens[0];

  const handleCopyCa = () => {
    navigator.clipboard.writeText(token.mint);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const isPositive = token.priceChange24h >= 0;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header
        onOpenSearch={() => setIsSearchOpen(true)}
        onOpenLaunch={() => setIsLaunchOpen(true)}
      />

      <main className="mx-auto flex-1 w-full px-6 md:px-12 xl:px-[164px] py-6">
        <div className="mb-4">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Explore</span>
          </Link>
        </div>

        {/* Token Header */}
        <div className="rounded-2xl border border-border bg-card p-5 mb-6 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
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
                  <span className="text-sm text-muted">
                    {token.name}
                  </span>
                  {token.bondingCurve.isGraduated && (
                    <span className="rounded bg-brand-cyan/10 border border-brand-cyan/25 px-2 py-0.5 text-[10px] font-bold text-brand-cyan">
                      GRADUATED
                    </span>
                  )}
                </div>

                <div className="mt-1 flex items-center gap-2 text-xs">
                  <span className="text-muted">Backed with</span>
                  <span className="font-semibold text-brand-cyan">
                    {token.targetEquity.name} ({token.targetEquity.symbol})
                  </span>

                  <button
                    onClick={handleCopyCa}
                    className="flex items-center gap-1 rounded border border-border bg-card-subtle px-2 py-0.5 text-muted hover:text-foreground transition-colors font-mono text-[10px]"
                  >
                    {copied ? (
                      <Check className="h-3 w-3 text-brand-emerald" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                    <span>
                      {token.mint.slice(0, 6)}...{token.mint.slice(-4)}
                    </span>
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-6 self-end md:self-auto border-t md:border-t-0 pt-3 md:pt-0 border-border">
              <div>
                <div className="text-[10px] uppercase text-muted">Price</div>
                <div className="font-mono text-xl font-bold text-foreground">
                  ${token.priceUsd.toFixed(4)}
                </div>
                <div
                  className={`font-mono text-xs font-semibold ${
                    isPositive ? "text-brand-emerald" : "text-brand-rose"
                  }`}
                >
                  {isPositive ? "+" : ""}
                  {token.priceChange24h.toFixed(1)}%
                </div>
              </div>

              <div className="border-l border-border pl-6">
                {token.bondingCurve.isGraduated ? (
                  <>
                    <div className="text-[10px] uppercase text-muted">Market Cap</div>
                    <div className="font-mono text-xl font-bold text-foreground">
                      ${(token.marketCapUsd / 1_000_000).toFixed(2)}M
                    </div>
                    <div className="font-mono text-xs text-muted">
                      Vol ${(token.volume24hUsd / 1_000).toFixed(0)}K
                    </div>
                  </>
                ) : (
                  <>
                    <div className="text-[10px] uppercase text-muted">Bonding Reserves</div>
                    <div className="font-mono text-xl font-bold text-foreground">
                      ${(token.bondingCurve.realQuoteReservesUsd / 1_000).toFixed(1)}K{" "}
                      <span className="text-xs font-normal text-muted">/ $60K</span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="rounded bg-brand-cyan/10 border border-brand-cyan/25 px-1.5 py-0.5 text-[10px] font-mono font-bold text-brand-cyan">
                        {(1 + (token.bondingCurve.progressPct / 100) * 1.8).toFixed(1)}x from genesis
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Main 2-Column Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column (8 cols) */}
          <div className="lg:col-span-8 flex flex-col gap-6">
            <TradingViewChart
              tokenSymbol={token.symbol}
              initialPrice={token.priceUsd}
              floorPrice={0.0031}
            />

            {/* Simplified Single-Line Progress Bar */}
            <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="text-muted font-medium">Graduation Progress</span>
                <span className="font-mono font-bold text-foreground">
                  {token.bondingCurve.isGraduated
                    ? "100% (Graduated to AMM)"
                    : `${token.bondingCurve.progressPct}% ($${(token.bondingCurve.realQuoteReservesUsd / 1_000).toFixed(1)}K / $60K USDC)`}
                </span>
              </div>

              <div className="h-1.5 w-full overflow-hidden rounded-full bg-card-subtle border border-border">
                <div
                  className="h-full rounded-full bg-brand-cyan transition-all duration-300"
                  style={{ width: `${Math.min(token.bondingCurve.progressPct, 100)}%` }}
                />
              </div>
            </div>

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
                Token details
              </div>
              <div className="flex justify-between text-muted">
                <span>Total supply:</span>
                <span className="font-mono text-foreground">1,000,000,000</span>
              </div>
              <div className="flex justify-between text-muted">
                <span>Bonding curve pool:</span>
                <span className="font-mono text-foreground">800,000,000 (80%)</span>
              </div>
              <div className="flex justify-between text-muted">
                <span>AMM pool reserve:</span>
                <span className="font-mono text-foreground">200,000,000 (20%)</span>
              </div>
              <div className="flex justify-between text-muted">
                <span>Underlying asset:</span>
                <span className="font-mono text-brand-cyan">{token.targetEquity.name}</span>
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

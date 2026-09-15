"use client";

import React, { useState, use } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Copy, Check } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { TradingViewChart } from "@/components/tokens/TradingViewChart";
import { TradeTerminal } from "@/components/tokens/TradeTerminal";
import { BurnRedeemModule } from "@/components/tokens/BurnRedeemModule";
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
            className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Explore</span>
          </Link>
        </div>

        {/* Token Header */}
        <div className="rounded-2xl border border-border bg-white p-5 mb-6 shadow-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="relative h-14 w-14 overflow-hidden rounded-full border border-border bg-slate-100">
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
                  <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                    ${token.symbol}
                  </h1>
                  <span className="text-sm text-muted">
                    {token.name}
                  </span>
                  {token.bondingCurve.isGraduated && (
                    <span className="rounded bg-sky-50 border border-sky-200 px-2 py-0.5 text-[10px] font-bold text-brand-cyan">
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
                    className="flex items-center gap-1 rounded border border-border bg-slate-50 px-2 py-0.5 text-muted hover:text-slate-900 transition-colors font-mono text-[10px]"
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
                <div className="font-mono text-xl font-bold text-slate-900">
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
                <div className="text-[10px] uppercase text-muted">Market Cap</div>
                <div className="font-mono text-xl font-bold text-slate-900">
                  ${(token.marketCapUsd / 1_000_000).toFixed(2)}M
                </div>
                <div className="font-mono text-xs text-muted">
                  Vol ${(token.volume24hUsd / 1_000).toFixed(0)}K
                </div>
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
            />

            {/* Progress Bar Card */}
            <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="text-muted">
                  Bonding curve progress
                </span>
                <span className="font-mono font-bold text-slate-900 text-sm">
                  {token.bondingCurve.progressPct}%
                </span>
              </div>

              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-sky-500 to-cyan-500 transition-all duration-300"
                  style={{ width: `${Math.min(token.bondingCurve.progressPct, 100)}%` }}
                />
              </div>

              <div className="mt-3 flex items-center justify-between text-xs font-mono text-muted">
                <span>
                  Reserves: ${token.bondingCurve.realQuoteReservesUsd.toLocaleString()} / $60,000 USDC
                </span>
                <span>
                  {token.bondingCurve.isGraduated ? "Graduated to AMM" : "50% buys stock at $60K"}
                </span>
              </div>
            </div>

            {/* Post-Graduation Module or Info */}
            {token.bondingCurve.isGraduated ? (
              <BurnRedeemModule token={token} />
            ) : (
              <div className="rounded-2xl border border-border bg-white p-5 text-xs text-muted shadow-sm">
                <div className="font-bold text-slate-900 mb-1">
                  Redemption Floor
                </div>
                At graduation, $30,000 USDC automatically buys real {token.targetEquity.name} ({token.targetEquity.symbol}) shares into treasury. Holders can then burn ${token.symbol} tokens to redeem stock shares pro-rata.
              </div>
            )}
          </div>

          {/* Right Column (4 cols) */}
          <div className="lg:col-span-4 flex flex-col gap-6">
            <TradeTerminal
              token={token}
              onTradeSuccess={() => {}}
            />

            <div className="rounded-2xl border border-border bg-white p-4 text-xs space-y-2.5 shadow-sm">
              <div className="font-bold text-slate-900 pb-2 border-b border-border">
                Token details
              </div>
              <div className="flex justify-between text-muted">
                <span>Total supply:</span>
                <span className="font-mono text-slate-900">1,000,000,000</span>
              </div>
              <div className="flex justify-between text-muted">
                <span>Bonding curve pool:</span>
                <span className="font-mono text-slate-900">800,000,000 (80%)</span>
              </div>
              <div className="flex justify-between text-muted">
                <span>AMM pool reserve:</span>
                <span className="font-mono text-slate-900">200,000,000 (20%)</span>
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

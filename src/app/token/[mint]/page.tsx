"use client";

import React, { useState, use } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, ShieldCheck, Copy, Check, ExternalLink, Sparkles, Flame } from "lucide-react";
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

  // Find token by mint or fallback to first token
  const token = tokens.find((t) => t.mint === mint) || tokens[0];

  const handleCopyCa = () => {
    navigator.clipboard.writeText(token.mint);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isPositive = token.priceChange24h >= 0;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header
        onOpenSearch={() => setIsSearchOpen(true)}
        onOpenLaunch={() => setIsLaunchOpen(true)}
      />

      <main className="mx-auto flex-1 w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-6">
        {/* Back Link */}
        <div className="mb-4">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-white transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Explore</span>
          </Link>
        </div>

        {/* Token Header Card */}
        <div className="rounded-2xl border border-border bg-[#0b1218] p-5 shadow-xl mb-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="relative h-16 w-16 overflow-hidden rounded-2xl border border-border bg-[#101b25] shadow-inner">
                <Image
                  src={token.avatarUrl}
                  alt={token.name}
                  fill
                  className="object-cover"
                  sizes="64px"
                />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-black text-white tracking-tight">
                    ${token.symbol}
                  </h1>
                  <span className="text-sm text-muted font-medium">
                    {token.name}
                  </span>
                  {token.bondingCurve.isGraduated && (
                    <span className="inline-flex items-center gap-1 rounded bg-brand-cyan/15 px-2 py-0.5 text-[10px] font-bold text-brand-cyan border border-brand-cyan/30">
                      <Sparkles className="h-3 w-3" />
                      GRADUATED &amp; LOCKED
                    </span>
                  )}
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                  {/* Backed by badge */}
                  <div className="inline-flex items-center gap-1.5 rounded-lg border border-[#1b2f42] bg-[#09141e] px-2.5 py-1 text-xs">
                    <ShieldCheck className="h-3.5 w-3.5 text-brand-cyan" />
                    <span className="text-muted">Backed by:</span>
                    <strong className="text-white font-semibold">
                      {token.targetEquity.name} ({token.targetEquity.symbol})
                    </strong>
                  </div>

                  {/* Copy CA */}
                  <button
                    onClick={handleCopyCa}
                    className="flex items-center gap-1 rounded-lg border border-border bg-[#091118] px-2 py-1 text-muted hover:text-white transition-colors font-mono text-[11px]"
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5 text-brand-emerald" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                    <span>
                      {token.mint.slice(0, 6)}...{token.mint.slice(-4)}
                    </span>
                  </button>
                </div>
              </div>
            </div>

            {/* Price & Market Cap stats */}
            <div className="flex items-center gap-6 self-end md:self-auto border-t md:border-t-0 pt-3 md:pt-0 border-border/60">
              <div>
                <div className="text-[10px] uppercase text-muted">Price</div>
                <div className="font-mono text-xl font-bold text-white">
                  ${token.priceUsd.toFixed(4)}
                </div>
                <div
                  className={`font-mono text-xs font-bold ${
                    isPositive ? "text-brand-emerald" : "text-brand-rose"
                  }`}
                >
                  {isPositive ? "+" : ""}
                  {token.priceChange24h.toFixed(1)}%
                </div>
              </div>

              <div className="border-l border-border/80 pl-6">
                <div className="text-[10px] uppercase text-muted">Market Cap</div>
                <div className="font-mono text-xl font-bold text-white">
                  ${(token.marketCapUsd / 1_000_000).toFixed(2)}M
                </div>
                <div className="font-mono text-xs text-muted">
                  Vol: ${(token.volume24hUsd / 1_000).toFixed(0)}K
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Main Grid: Left Chart & Modules / Right Terminal */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column (8 cols) */}
          <div className="lg:col-span-8 flex flex-col gap-6">
            {/* Lightweight TradingView Chart */}
            <TradingViewChart
              tokenSymbol={token.symbol}
              initialPrice={token.priceUsd}
            />

            {/* Graduation Progress Bar Card */}
            <div className="rounded-xl border border-border bg-[#0b1218] p-5 shadow-md">
              <div className="flex items-center justify-between text-xs mb-2">
                <span className="text-muted font-medium flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-brand-cyan" />
                  Bonding Curve Equity Graduation
                </span>
                <span className="font-mono font-bold text-brand-cyan text-sm">
                  {token.bondingCurve.progressPct}% Graduated
                </span>
              </div>

              <div className="h-2 w-full overflow-hidden rounded-full bg-[#080d12]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-brand-cyan to-brand-emerald transition-all duration-500"
                  style={{ width: `${Math.min(token.bondingCurve.progressPct, 100)}%` }}
                />
              </div>

              <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2 text-xs font-mono text-muted">
                <div>
                  Reserves:{" "}
                  <strong className="text-white">
                    ${token.bondingCurve.realQuoteReservesUsd.toLocaleString()} USDC
                  </strong>
                </div>
                <div>
                  Target:{" "}
                  <strong className="text-white">
                    ${token.bondingCurve.graduationThresholdUsd.toLocaleString()} USDC
                  </strong>
                </div>
                <div>
                  Equity Allocation:{" "}
                  <strong className="text-brand-emerald">50% to Stock PDA</strong>
                </div>
              </div>
            </div>

            {/* Post-Graduation "Burn & Redeem" Module (Differentiator #3) */}
            {token.bondingCurve.isGraduated ? (
              <BurnRedeemModule token={token} />
            ) : (
              <div className="rounded-xl border border-dashed border-border bg-[#0a1117] p-6 text-center">
                <Flame className="h-8 w-8 text-muted mx-auto mb-2 opacity-50" />
                <h4 className="text-sm font-bold text-white">
                  Burn &amp; Redeem Module Locked
                </h4>
                <p className="max-w-md text-xs text-muted mx-auto mt-1">
                  Once this bonding curve reaches $60,000 USDC, 50% automatically purchases real {token.targetEquity.name} ({token.targetEquity.symbol}) stock. Holders will be able to burn their ${token.symbol} for their pro-rata share of the stock vault.
                </p>
              </div>
            )}

            {/* About & Equity Custody Information */}
            <div className="rounded-xl border border-border bg-[#0b1218] p-5 shadow-md space-y-3">
              <h3 className="text-sm font-bold text-white">About ${token.symbol}</h3>
              <p className="text-xs text-muted leading-relaxed">
                {token.description}
              </p>

              <div className="mt-4 pt-3 border-t border-border/60 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="rounded-lg bg-[#070c10] p-3 border border-border/70">
                  <div className="text-muted text-[11px] mb-1">Target Stock Underpinning</div>
                  <div className="font-bold text-white">{token.targetEquity.name} ({token.targetEquity.symbol})</div>
                  <div className="text-[11px] text-brand-cyan mt-1">
                    Verified Sunrise Canonical SPL Mint
                  </div>
                </div>

                <div className="rounded-lg bg-[#070c10] p-3 border border-border/70">
                  <div className="text-muted text-[11px] mb-1">Legal Custody Standard</div>
                  <div className="font-bold text-white">{token.targetEquity.custodian}</div>
                  <div className="text-[11px] text-muted-foreground mt-1">
                    {token.targetEquity.legalFramework}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Right Column (4 cols): Trade Terminal */}
          <div className="lg:col-span-4 flex flex-col gap-6">
            <TradeTerminal
              token={token}
              onTradeSuccess={() => {
                // Trigger refresh if needed
              }}
            />

            {/* Tokenomics Summary Card */}
            <div className="rounded-xl border border-border bg-[#0b1218] p-4 text-xs space-y-2.5">
              <div className="font-bold text-white pb-2 border-b border-border/60">
                Bonding Curve Mechanics
              </div>
              <div className="flex justify-between text-muted">
                <span>Total Supply:</span>
                <span className="font-mono text-white">1,000,000,000</span>
              </div>
              <div className="flex justify-between text-muted">
                <span>Curve Allocation:</span>
                <span className="font-mono text-white">800,000,000 (80%)</span>
              </div>
              <div className="flex justify-between text-muted">
                <span>Raydium AMM Seed:</span>
                <span className="font-mono text-white">200,000,000 (20%)</span>
              </div>
              <div className="flex justify-between text-muted">
                <span>Protocol Swap Fee:</span>
                <span className="font-mono text-white">1.0%</span>
              </div>
              <div className="flex justify-between text-muted">
                <span>Redemption Floor:</span>
                <span className="font-mono text-brand-emerald">Guaranteed PDA Stock</span>
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

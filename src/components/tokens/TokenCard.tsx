"use client";

import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Copy, Check } from "lucide-react";
import { TokenMetadata } from "@/lib/types";

interface TokenCardProps {
  token: TokenMetadata;
}

export function TokenCard({ token }: TokenCardProps) {
  const [copied, setCopied] = useState(false);

  const handleCopyCa = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    navigator.clipboard.writeText(token.mint);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const isPositive = token.priceChange24h >= 0;

  return (
    <Link
      href={`/token/${token.mint}`}
      className="group relative flex flex-col justify-between rounded-2xl border border-border bg-card p-5 transition-all hover:border-border-active hover:bg-card-hover shadow-sm"
    >
      <div>
        {/* Top: Avatar, Name, CA button */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="relative h-12 w-12 overflow-hidden rounded-full border border-border bg-card-subtle">
              <Image
                src={token.avatarUrl}
                alt={token.name}
                fill
                className="object-cover"
                sizes="48px"
              />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-muted uppercase">
                  ${token.symbol}
                </span>
                {token.bondingCurve.isGraduated && (
                  <span className="rounded-md bg-cyan-950/60 border border-cyan-500/30 px-2 py-0.5 text-[10px] font-medium text-cyan-200 shadow-xs">
                    Graduated
                  </span>
                )}
              </div>
              <div className="text-sm font-bold text-foreground group-hover:text-brand-cyan transition-colors">
                {token.name}
              </div>
            </div>
          </div>

          <button
            onClick={handleCopyCa}
            title="Copy Contract Address"
            className="flex items-center gap-1 rounded-lg border border-border-active/40 bg-card-hover/40 px-2 py-1 text-[11px] text-muted hover:border-border-active hover:text-foreground hover:bg-card-hover transition-colors"
          >
            {copied ? (
              <Check className="h-3 w-3 text-brand-emerald" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
            <span className="font-mono">CA</span>
          </button>
        </div>

        {/* Backed by badge: Stock Logo + Plain Ticker (no $ sign, no bulky background) + subtle tag */}
        <div className="mt-3 flex items-center justify-between gap-1.5 text-xs">
          <div className="flex items-center gap-1.5">
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
              {token.targetEquity.symbol.replace(/^\$/, "")}
            </span>
            <span className="rounded-md bg-cyan-950/20 border border-cyan-500/25 px-2 py-0.5 text-[10px] font-mono font-medium text-cyan-300/80">
              {token.targetEquity.isPreIpo ? "Pre-IPO" : "xStocks"}
            </span>
          </div>
          <span className="font-mono text-xs font-medium text-muted">
            {token.bondingCurve.isGraduated ? "Graduated" : `${token.bondingCurve.progressPct}%`}
          </span>
        </div>

        {/* Progress Bar: Only highlight active bonding curve; graduated is muted */}
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-card-hover/40 border border-border">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              token.bondingCurve.isGraduated ? "bg-slate-600/70" : "bg-brand-cyan"
            }`}
            style={{ width: `${Math.min(token.bondingCurve.progressPct, 100)}%` }}
          />
        </div>

        {/* Primary Metric: Only graduated tokens show Market Cap; bonding tokens show Reserves & Multiplier */}
        <div className="mt-4">
          {token.bondingCurve.isGraduated ? (
            <div>
              <div className="text-[10px] text-muted uppercase font-semibold tracking-wider">
                Market Cap
              </div>
              <div className="mt-0.5 font-mono text-2xl font-extrabold text-foreground tracking-tight">
                ${(token.marketCapUsd / 1_000_000).toFixed(2)}M
              </div>
            </div>
          ) : (
            <div>
              <div className="text-[10px] text-muted uppercase font-semibold tracking-wider">
                Bonding Reserves
              </div>
              <div className="mt-0.5 flex items-baseline justify-between gap-2">
                <div className="font-mono text-2xl font-extrabold text-foreground tracking-tight">
                  ${(token.bondingCurve.realQuoteReservesUsd / 1_000).toFixed(1)}K{" "}
                  <span className="text-xs font-normal text-muted">/ $60K USDC</span>
                </div>
                <span className="font-mono text-xs font-medium text-emerald-400">
                  {(1 + (token.bondingCurve.progressPct / 100) * 1.8).toFixed(1)}x from genesis
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom: 24h Volume & Price Change */}
      <div className="mt-4 pt-3 border-t border-border flex items-center justify-between text-xs font-mono">
        <span className="text-muted">
          Vol ${(token.volume24hUsd / 1_000).toFixed(0)}K
        </span>
        <span
          className={`font-semibold ${
            isPositive ? "text-brand-emerald" : "text-brand-rose"
          }`}
        >
          {isPositive ? "+" : ""}
          {token.priceChange24h.toFixed(1)}%
        </span>
      </div>
    </Link>
  );
}

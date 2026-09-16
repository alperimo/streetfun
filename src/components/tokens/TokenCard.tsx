"use client";

import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Copy, Check } from "lucide-react";
import { TokenMetadata } from "@/lib/types";

interface TokenCardProps {
  token: TokenMetadata;
}

function formatVolume(vol: number): string {
  if (vol >= 1_000_000) {
    return `$${(vol / 1_000_000).toFixed(2)}M`;
  }
  if (vol >= 1_000) {
    return `$${(vol / 1_000).toFixed(0)}K`;
  }
  return `$${vol}`;
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
      className="group relative flex flex-col justify-between rounded-2xl border border-border bg-card p-4 sm:p-5 transition-all hover:border-border-active hover:bg-card-hover shadow-sm"
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
                  <span className="rounded-md border border-slate-700/60 bg-slate-800/50 px-2 py-0.5 text-[10px] font-medium text-slate-300">
                    Graduated
                  </span>
                )}
              </div>
              <div className="text-sm font-bold text-foreground">
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

        {/* Backed by badge: Stock Logo + Plain Ticker + subtle tag */}
        <div className="mt-3 flex items-center justify-between gap-1 text-[11px]">
          <div className="flex items-center gap-1.5">
            <span className="text-muted whitespace-nowrap">Backed with</span>
            <div className="relative h-3.5 w-3.5 overflow-hidden rounded-full border border-border flex-shrink-0">
              <Image
                src={token.targetEquity.logoUrl}
                alt={token.targetEquity.name}
                fill
                className="object-cover"
                sizes="14px"
              />
            </div>
            <span className="font-bold text-foreground whitespace-nowrap">
              {token.targetEquity.symbol.replace(/^\$/, "")}
            </span>
            <span className="rounded-md border border-slate-700/50 bg-slate-800/30 px-2 py-0.5 text-[10px] tracking-wide font-mono font-medium text-slate-400 whitespace-nowrap">
              {token.targetEquity.isPreIpo ? "Pre-IPO" : "xStocks"}
            </span>
          </div>
          {token.bondingCurve.isGraduated ? (
            <span className="font-mono text-[11px] font-medium text-slate-400 whitespace-nowrap pl-2">
              {token.targetEquity.symbol === "$TSPACEX"
                ? "Backed: $20.3M"
                : token.targetEquity.symbol === "$TOPAI"
                ? "Backed: $10.6M"
                : token.targetEquity.symbol === "$TSTRIPE"
                ? "Backed: $5.3M"
                : "Backed: $4.5M"}
            </span>
          ) : (
            <span className="font-mono text-[11px] font-medium text-muted whitespace-nowrap pl-2">
              {token.bondingCurve.progressPct}%
            </span>
          )}
        </div>

        {/* Progress Bar (bonding tokens) vs Clean Matching Divider (graduated tokens) */}
        {!token.bondingCurve.isGraduated ? (
          <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-card-hover/40 border border-border">
            <div
              className="bg-gradient-to-r from-[#0891B2] to-[#06B6D4] h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${Math.min(token.bondingCurve.progressPct, 100)}%` }}
            />
          </div>
        ) : (
          <div className="mt-3 mb-1 border-b border-border/80" />
        )}

        {/* Primary Metric */}
        <div className="mt-4">
          {token.bondingCurve.isGraduated ? (
            <div>
              <div className="text-[10px] text-muted uppercase font-semibold tracking-wider">
                Market Cap
              </div>
              <div className="mt-0.5 flex items-baseline justify-between gap-2">
                <div className="font-mono text-2xl font-extrabold text-foreground tracking-tight">
                  ${(token.marketCapUsd / 1_000_000).toFixed(2)}M
                </div>
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
          Vol {formatVolume(token.volume24hUsd)}
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

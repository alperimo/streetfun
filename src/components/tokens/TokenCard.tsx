"use client";

import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Star } from "lucide-react";
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

function formatMarketCap(mcap: number): string {
  if (mcap >= 1_000_000) {
    return `$${(mcap / 1_000_000).toFixed(2)}M`;
  }
  if (mcap >= 1_000) {
    return `$${(mcap / 1_000).toFixed(1)}K`;
  }
  return `$${mcap.toLocaleString()}`;
}

function getCardTagline(token: TokenMetadata): string {
  if (token.symbol === "MARS") return "Not just a meme. A multi-planet future.";
  if (token.symbol === "NVDU") return "Same chips. More memes.";
  if (token.symbol === "AIX") return "Decentralized AI for everyone.";
  if (token.symbol === "STRIP") return "Payments make memes real.";
  if (token.symbol === "CYBER") return "Robots, memes, real world value.";
  if (token.symbol === "DOGEFI") return "Much yield. Very utility.";
  if (token.symbol === "ORBIT") return "Autonomous freight network.";
  if (token.description) {
    const firstSentence = token.description.split(".")[0];
    return firstSentence ? `${firstSentence}.` : token.description;
  }
  return "Trade viral momentum backed by real assets.";
}

// Generates an upward trending sparkline path with subtle variation based on symbol
function getSparklinePoints(symbol: string): string {
  if (symbol === "MARS") return "M 2 18 Q 12 22, 22 14 T 42 16 T 60 12 T 76 4 T 88 7";
  if (symbol === "NVDU") return "M 2 19 Q 14 16, 28 15 T 50 11 T 70 8 T 88 3";
  if (symbol === "AIX") return "M 2 18 Q 15 20, 30 14 T 55 12 T 72 4 T 88 6";
  if (symbol === "STRIP") return "M 2 17 Q 16 19, 32 13 T 58 10 T 74 5 T 88 4";
  if (symbol === "CYBER") return "M 2 8 Q 18 10, 34 16 T 58 14 T 74 18 T 88 15";
  return "M 2 18 Q 15 21, 30 15 T 55 12 T 72 5 T 88 4";
}

export function TokenCard({ token }: TokenCardProps) {
  const [isFavorite, setIsFavorite] = useState(false);

  const handleToggleFavorite = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsFavorite((prev) => !prev);
  };

  const isPositive = token.priceChange24h >= 0;
  const tagline = getCardTagline(token);
  const sparklinePath = getSparklinePoints(token.symbol);

  // Approximate genesis multiple for in-curve tokens (e.g., 2.4x)
  const genesisMultiple = token.bondingCurve.isGraduated
    ? null
    : ((token.bondingCurve.progressPct / 35) + 1.2).toFixed(1);

  return (
    <Link
      href={`/token/${token.mint}`}
      className="group relative flex flex-col justify-between rounded-2xl border border-border bg-card p-4 sm:p-5 transition-all duration-200 hover:border-border-active hover:bg-card-hover shadow-sm"
    >
      <div>
        {/* Top: Avatar, Name, Tagline & Favorite Star */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-full border border-border bg-card-subtle">
              <Image
                src={token.avatarUrl}
                alt={token.name}
                fill
                className="object-cover"
                sizes="48px"
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-muted uppercase">
                  ${token.symbol}
                </span>
                <span className="rounded-md border border-border/80 bg-card-subtle/80 px-2 py-0.5 text-[10px] font-medium text-slate-300">
                  {token.bondingCurve.isGraduated ? "Graduated" : "In Curve"}
                </span>
              </div>
              <div className="mt-0.5 truncate text-sm font-bold text-foreground">
                {token.name}
              </div>
              <div className="mt-0.5 truncate text-xs text-muted">
                {tagline}
              </div>
            </div>
          </div>

          <button
            onClick={handleToggleFavorite}
            title={isFavorite ? "Remove from Watchlist" : "Add to Watchlist"}
            className="shrink-0 p-1 text-muted hover:text-foreground transition-colors"
          >
            <Star
              className={`h-4 w-4 transition-colors ${
                isFavorite
                  ? "fill-brand-emerald text-brand-emerald"
                  : "text-muted hover:text-foreground"
              }`}
            />
          </button>
        </div>

        {/* Backed with badge & Sparkline chart row */}
        <div className="mt-3.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-[11px] min-w-0">
            <span className="text-muted whitespace-nowrap">Backed with</span>
            <div className="relative h-3.5 w-3.5 shrink-0 overflow-hidden rounded-full border border-border">
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
            <span className="rounded-md border border-border bg-card-subtle/90 px-1.5 py-0.5 text-[10px] font-mono font-medium text-muted whitespace-nowrap">
              {token.targetEquity.isPreIpo ? "Pre-IPO" : "xStocks"}
            </span>
          </div>

          {/* Mini Sparkline Chart */}
          <div className="shrink-0 pr-1">
            <svg
              width="90"
              height="22"
              viewBox="0 0 90 22"
              className="overflow-visible"
              aria-hidden="true"
            >
              <path
                d={sparklinePath}
                fill="none"
                stroke={isPositive ? "#70e16f" : "#f43f5e"}
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={isPositive ? "drop-shadow-[0_0_6px_rgba(112,225,111,0.45)]" : "drop-shadow-[0_0_6px_rgba(244,63,94,0.35)]"}
              />
            </svg>
          </div>
        </div>
      </div>

      {/* Crisp Horizontal Divider */}
      <div className="mt-4 mb-3.5 border-t border-border" />

      {/* Bottom 3-Column Metrics Section */}
      {token.bondingCurve.isGraduated ? (
        <div className="grid grid-cols-3 items-end gap-2 text-left">
          <div>
            <div className="text-[10px] uppercase font-semibold text-muted tracking-wider">
              Market Cap
            </div>
            <div className="mt-1 font-mono text-base sm:text-lg font-black text-foreground tracking-tight">
              {formatMarketCap(token.marketCapUsd)}
            </div>
          </div>

          <div>
            <div className="text-[10px] uppercase font-semibold text-muted tracking-wider">
              24h Volume
            </div>
            <div className="mt-1 font-mono text-base sm:text-lg font-black text-foreground tracking-tight">
              {formatVolume(token.volume24hUsd)}
            </div>
          </div>

          <div className="text-right">
            <div
              className={`flex items-center justify-end gap-1 font-mono text-sm sm:text-base font-bold ${
                isPositive ? "text-brand-emerald" : "text-brand-rose"
              }`}
            >
              <span className="text-xs">{isPositive ? "▲" : "▼"}</span>
              {isPositive ? "+" : ""}
              {token.priceChange24h.toFixed(1)}%
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-3 items-end gap-2 text-left">
          <div>
            <div className="text-[10px] uppercase font-semibold text-muted tracking-wider">
              Bonding Reserves
            </div>
            <div className="mt-1 font-mono text-sm sm:text-base font-black text-foreground tracking-tight">
              ${(token.bondingCurve.realQuoteReservesUsd / 1_000).toFixed(1)}K
              <span className="text-[11px] font-normal text-muted"> / $60K</span>
            </div>
          </div>

          <div>
            <div className="text-[10px] uppercase font-semibold text-muted tracking-wider">
              24h Volume
            </div>
            <div className="mt-1 font-mono text-base sm:text-lg font-black text-foreground tracking-tight">
              {formatVolume(token.volume24hUsd)}
            </div>
          </div>

          <div className="text-right">
            <div className="text-[10px] font-semibold text-brand-emerald leading-none">
              {genesisMultiple}x from genesis
            </div>
            <div
              className={`mt-1 flex items-center justify-end gap-1 font-mono text-xs sm:text-sm font-bold ${
                isPositive ? "text-brand-emerald" : "text-brand-rose"
              }`}
            >
              <span className="text-[10px]">{isPositive ? "▲" : "▼"}</span>
              {isPositive ? "+" : ""}
              {token.priceChange24h.toFixed(1)}%
            </div>
          </div>
        </div>
      )}
    </Link>
  );
}

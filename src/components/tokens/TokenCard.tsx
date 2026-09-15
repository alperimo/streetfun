"use client";

import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ShieldCheck, Copy, Check, TrendingUp, Sparkles } from "lucide-react";
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
    setTimeout(() => setCopied(false), 2000);
  };

  const isPositive = token.priceChange24h >= 0;

  return (
    <Link
      href={`/token/${token.mint}`}
      className="group relative flex flex-col justify-between overflow-hidden rounded-xl border border-border bg-[#0b1218] p-5 transition-all hover:-translate-y-0.5 hover:border-[#2a3d4f] hover:bg-[#0e1720] hover:shadow-xl hover:shadow-cyan-950/20"
    >
      {/* Ambient background accent for graduated pools */}
      {token.bondingCurve.isGraduated && (
        <div className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-brand-cyan/5 blur-2xl transition-all group-hover:bg-brand-cyan/10" />
      )}

      <div>
        {/* Top Header: Avatar + Ticker/Name + CA Copy */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="relative h-12 w-12 overflow-hidden rounded-xl border border-border bg-[#111e29] shadow-inner">
              <Image
                src={token.avatarUrl}
                alt={token.name}
                fill
                className="object-cover transition-transform duration-300 group-hover:scale-105"
                sizes="48px"
              />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-white text-base tracking-tight group-hover:text-brand-cyan transition-colors">
                  ${token.symbol}
                </span>
                {token.bondingCurve.isGraduated && (
                  <span className="inline-flex items-center gap-1 rounded bg-brand-cyan/15 px-1.5 py-0.5 text-[9px] font-bold text-brand-cyan border border-brand-cyan/30">
                    <Sparkles className="h-2.5 w-2.5" />
                    GRADUATED
                  </span>
                )}
              </div>
              <div className="text-xs text-muted line-clamp-1">{token.name}</div>
            </div>
          </div>

          {/* Quick Copy CA Button */}
          <button
            onClick={handleCopyCa}
            title="Copy Contract Address"
            className="flex items-center gap-1 rounded-md border border-border/60 bg-[#101b25] px-2 py-1 text-[10px] text-muted hover:border-brand-cyan/50 hover:text-white transition-colors"
          >
            {copied ? (
              <Check className="h-3 w-3 text-brand-emerald" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
            <span>CA</span>
          </button>
        </div>

        {/* Market Cap & Price Change */}
        <div className="mt-4 flex items-baseline justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted">
              Market Cap
            </div>
            <div className="font-mono text-xl font-bold tracking-tight text-white">
              ${(token.marketCapUsd / 1_000_000).toFixed(2)}M
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-muted">
              24h Change
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
        </div>

        {/* Backed By Collateral Badge (Core Differentiator #1) */}
        <div className="mt-3 flex items-center justify-between rounded-lg border border-[#1b2b3a] bg-[#081017] px-3 py-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-brand-cyan flex-shrink-0" />
            <div className="text-xs">
              <span className="text-muted mr-1">Backed by:</span>
              <span className="font-semibold text-white">
                {token.targetEquity.name} ({token.targetEquity.symbol})
              </span>
            </div>
          </div>
          <span className="rounded bg-[#122230] px-1.5 py-0.5 text-[9px] font-mono font-medium text-brand-cyan border border-brand-cyan/20">
            Vault SVS-1
          </span>
        </div>
      </div>

      {/* Graduation Progress Bar (Core Differentiator #2) */}
      <div className="mt-4 pt-3 border-t border-border/50">
        <div className="flex items-center justify-between text-[11px] mb-1.5">
          <span className="text-muted">
            {token.bondingCurve.isGraduated ? (
              <span className="text-brand-emerald font-medium flex items-center gap-1">
                <Check className="h-3 w-3" /> Dual Floor Active
              </span>
            ) : (
              `$${token.bondingCurve.realQuoteReservesUsd.toLocaleString()} / $${token.bondingCurve.graduationThresholdUsd.toLocaleString()} USDC`
            )}
          </span>
          <span className="font-mono font-bold text-white">
            {token.bondingCurve.progressPct}% Graduated
          </span>
        </div>

        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#111c26]">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              token.bondingCurve.isGraduated
                ? "bg-gradient-to-r from-brand-cyan to-brand-emerald"
                : "bg-gradient-to-r from-blue-500 to-brand-cyan"
            }`}
            style={{ width: `${Math.min(token.bondingCurve.progressPct, 100)}%` }}
          />
        </div>

        <div className="mt-2.5 flex items-center justify-between text-[10px] text-muted font-mono">
          <span>Vol: ${(token.volume24hUsd / 1_000).toFixed(0)}K</span>
          <span>
            {token.bondingCurve.isGraduated
              ? `${token.treasury.totalEquityLocked.toFixed(1)} shares in Vault`
              : `Targets ~${(30_000 / token.targetEquity.stockPriceUsd).toFixed(0)} shares`}
          </span>
        </div>
      </div>
    </Link>
  );
}

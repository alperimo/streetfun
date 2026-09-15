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
      className="group relative flex flex-col justify-between rounded-2xl border border-border bg-[#0b1218] p-5 transition-all hover:border-[#25394b] hover:bg-[#0e1720]"
    >
      <div>
        {/* Top: Avatar, Name, CA button */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="relative h-12 w-12 overflow-hidden rounded-full border border-border bg-[#101b25]">
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
                  <span className="rounded bg-brand-cyan/15 px-1.5 py-0.2 text-[9px] font-bold text-brand-cyan">
                    GRADUATED
                  </span>
                )}
              </div>
              <div className="text-sm font-bold text-white group-hover:text-brand-cyan transition-colors">
                {token.name}
              </div>
            </div>
          </div>

          <button
            onClick={handleCopyCa}
            title="Copy Contract Address"
            className="flex items-center gap-1 rounded-md border border-border bg-[#0e1720] px-2 py-1 text-[11px] text-muted hover:border-brand-cyan hover:text-white transition-colors"
          >
            {copied ? (
              <Check className="h-3 w-3 text-brand-emerald" />
            ) : (
              <Copy className="h-3 w-3" />
            )}
            <span className="font-mono">CA</span>
          </button>
        </div>

        {/* Market Cap & Price Change */}
        <div className="mt-4">
          <div className="font-mono text-2xl font-extrabold text-white tracking-tight">
            ${(token.marketCapUsd / 1_000_000).toFixed(2)}M
          </div>
        </div>

        {/* Backed by badge */}
        <div className="mt-2.5 flex items-center gap-1.5 text-xs">
          <span className="text-muted">Backed with</span>
          <span className="inline-flex items-center gap-1 rounded-md bg-[#111e29] px-2 py-0.5 text-xs font-semibold text-brand-cyan border border-brand-cyan/20">
            {token.targetEquity.symbol}
          </span>
        </div>
      </div>

      {/* Bottom: Progress Bar + Vol / Change */}
      <div className="mt-5 pt-3 border-t border-border/50">
        <div className="flex items-center justify-between text-[11px] mb-1.5">
          <span className="text-muted">
            {token.bondingCurve.isGraduated
              ? "Graduated"
              : `$${token.bondingCurve.realQuoteReservesUsd.toLocaleString()} / $60,000`}
          </span>
          <span className="font-mono font-bold text-white">
            {token.bondingCurve.progressPct}%
          </span>
        </div>

        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#111c26]">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              token.bondingCurve.isGraduated
                ? "bg-brand-cyan"
                : "bg-gradient-to-r from-blue-500 to-brand-cyan"
            }`}
            style={{ width: `${Math.min(token.bondingCurve.progressPct, 100)}%` }}
          />
        </div>

        <div className="mt-3 flex items-center justify-between text-xs font-mono">
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
      </div>
    </Link>
  );
}

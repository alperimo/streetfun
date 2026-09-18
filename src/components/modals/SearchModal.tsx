"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Search, X, ShieldCheck, ArrowUpRight } from "lucide-react";
import { TokenMetadata } from "@/lib/types";

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  tokens: TokenMetadata[];
}

export function SearchModal({ isOpen, onClose, tokens }: SearchModalProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const filteredTokens = tokens.filter(
    (t) =>
      t.name.toLowerCase().includes(query.toLowerCase()) ||
      t.symbol.toLowerCase().includes(query.toLowerCase()) ||
      t.targetEquity.symbol.toLowerCase().includes(query.toLowerCase()) ||
      t.targetEquity.name.toLowerCase().includes(query.toLowerCase()) ||
      t.mint.toLowerCase().includes(query.toLowerCase())
  );

  const handleSelect = (token: TokenMetadata) => {
    onClose();
    router.push(`/token/${token.mint}`);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (isOpen) {
          onClose();
        }
      }
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
      if (isOpen && filteredTokens.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSelectedIndex((prev) => (prev < filteredTokens.length - 1 ? prev + 1 : prev));
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
        } else if (e.key === "Enter") {
          e.preventDefault();
          if (filteredTokens[selectedIndex]) {
            handleSelect(filteredTokens[selectedIndex]);
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, filteredTokens, selectedIndex]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 sm:pt-24 px-4 bg-black/30 backdrop-blur-[1px] animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-border/80 bg-card p-4 shadow-2xl transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Header */}
        <div className="relative flex items-center border-b border-border/60 pb-3">
          <Search className="h-4 w-4 text-muted absolute left-2" />
          <input
            autoFocus
            type="text"
            placeholder="Search tokens by name, ticker, or address"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            className="w-full bg-transparent pl-9 pr-8 text-sm text-foreground placeholder-muted/70 focus:outline-none"
          />
          <button
            onClick={onClose}
            className="rounded p-1 text-muted hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Token Results List */}
        <div className="mt-3 max-h-80 overflow-y-auto space-y-1">
          {filteredTokens.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted">
              No matching tokens found for &quot;{query}&quot;
            </div>
          ) : (
            filteredTokens.map((token, idx) => {
              const isPositive = token.priceChange24h >= 0;
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={token.mint}
                  onClick={() => handleSelect(token)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-colors ${
                    isSelected
                      ? "bg-card-hover border border-border-active/60 shadow-xs"
                      : "hover:bg-card-hover/50 border border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative h-9 w-9 overflow-hidden rounded-xl border border-border bg-card flex-shrink-0">
                      <Image
                        src={token.avatarUrl}
                        alt={token.name}
                        fill
                        className="object-cover"
                        sizes="36px"
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-foreground text-sm">
                          ${token.symbol}
                        </span>
                        <span className="rounded-md border border-slate-700/60 bg-slate-800/40 px-1.5 py-0.5 text-[10px] font-mono font-medium text-slate-300">
                          {token.targetEquity.symbol.replace(/^\$/, "")}
                        </span>
                        <span className="rounded-md border border-slate-700/40 bg-slate-800/20 px-1.5 py-0.5 text-[10px] font-mono text-slate-400">
                          {token.targetEquity.isPreIpo ? "Pre-IPO" : "xStocks"}
                        </span>
                      </div>
                      <div className="text-[11px] text-muted truncate">
                        {token.name} · backed with {token.targetEquity.name}
                      </div>
                    </div>
                  </div>

                  <div className="text-right flex-shrink-0 pl-2">
                    <div className="font-mono text-sm font-bold text-foreground">
                      {token.marketCapUsd >= 1_000_000
                        ? `$${(token.marketCapUsd / 1_000_000).toFixed(2)}M`
                        : `$${(token.marketCapUsd / 1_000).toFixed(1)}K`}
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
                </div>
              );
            })
          )}
        </div>

        {/* Modal Keyboard Shortcuts Footer */}
        <div className="mt-3 pt-2.5 border-t border-border/60 flex items-center justify-between text-[10px] text-muted font-mono">
          <div className="flex items-center gap-3">
            <span>↑↓ navigate</span>
            <span>↵ open</span>
            <span>esc close</span>
          </div>
          <span className="text-muted font-medium">StreetFun Search</span>
        </div>
      </div>
    </div>
  );
}

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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (isOpen) {
          onClose();
        } else {
          // Parent handles opening
        }
      }
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

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

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="w-full max-w-lg rounded-2xl border border-border bg-white p-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Header */}
        <div className="relative flex items-center border-b border-border pb-3">
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
            className="w-full bg-transparent pl-9 pr-8 text-sm text-slate-900 placeholder-muted focus:outline-none"
          />
          <button
            onClick={onClose}
            className="rounded p-1 text-muted hover:text-slate-900 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Token Results List */}
        <div className="mt-3 max-h-80 overflow-y-auto divide-y divide-border">
          {filteredTokens.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted">
              No matching tokens found for &quot;{query}&quot;
            </div>
          ) : (
            filteredTokens.map((token, idx) => {
              const isPositive = token.priceChange24h >= 0;
              return (
                <div
                  key={token.mint}
                  onClick={() => handleSelect(token)}
                  className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                    idx === selectedIndex ? "bg-slate-100" : "hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="relative h-9 w-9 overflow-hidden rounded-lg border border-border bg-slate-100">
                      <Image
                        src={token.avatarUrl}
                        alt={token.name}
                        fill
                        className="object-cover"
                        sizes="36px"
                      />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-slate-900 text-sm">
                          ${token.symbol}
                        </span>
                        <span className="rounded bg-sky-50 px-1.5 py-0.5 text-[9px] font-bold text-brand-cyan border border-sky-200">
                          {token.targetEquity.symbol}
                        </span>
                      </div>
                      <div className="text-[11px] text-muted">
                        {token.name} · backed with {token.targetEquity.name}
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="font-mono text-sm font-bold text-slate-900">
                      ${(token.marketCapUsd / 1_000_000).toFixed(2)}M
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
        <div className="mt-3 pt-2.5 border-t border-border flex items-center justify-between text-[10px] text-muted font-mono">
          <div className="flex items-center gap-3">
            <span>↑↓ navigate</span>
            <span>↵ open</span>
            <span>esc close</span>
          </div>
          <span className="text-brand-cyan font-semibold">Streetfun Search</span>
        </div>
      </div>
    </div>
  );
}

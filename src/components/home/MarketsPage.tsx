"use client";

import React, { useState, useMemo, useEffect } from "react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { HeroBanner } from "@/components/home/HeroBanner";
import { FilterBar, StatusFilter, SortOption } from "@/components/home/FilterBar";
import { TokenCard } from "@/components/tokens/TokenCard";
import { TokenCardSkeleton } from "@/components/common/Skeletons";
import { SearchModal } from "@/components/modals/SearchModal";
import { LaunchModal } from "@/components/modals/LaunchModal";
import { tokenCreatedAt } from "@/lib/marketFormat";
import { useMarket } from "@/context/MarketContext";

export function MarketsPage() {
  const { tokens, loading, error } = useMarket();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedTag, setSelectedTag] = useState("all");
  const [sortBy, setSortBy] = useState<SortOption>("mcap");

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isLaunchOpen, setIsLaunchOpen] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("launch") === "true") {
        setIsLaunchOpen(true);
      }
      if (params.get("search") === "true") {
        setIsSearchOpen(true);
      }
    }
  }, []);

  const equityTags = useMemo(() => {
    const names = new Set(tokens
      .filter(token => !token.bondingCurve.isGraduated || token.bondingCurve.meteoraPoolAddress)
      .filter(token => token.targetEquity.verifiedTessera || token.targetEquity.verifiedPreStocks || token.targetEquity.isTestCollateral)
      .map(token => token.targetEquity.name));
    return [{ id: "all", label: "All" }, ...Array.from(names).sort().map(name => ({
      id: name.toLowerCase().replace(/[^a-z0-9]/g, ""), label: name,
    }))];
  }, [tokens]);

  const filteredTokens = useMemo(() => {
    const now = Date.now();
    return tokens
      .filter((token) => {
        if (statusFilter === "graduated" && !token.bondingCurve.isGraduated) {
          return false;
        }
        if (statusFilter === "bonding" && token.bondingCurve.isGraduated) {
          return false;
        }
        // Exclude graduated tokens without verified AMM pool liquidity from the active trading feed
        if (token.bondingCurve.isGraduated && !token.bondingCurve.meteoraPoolAddress) {
          return false;
        }
        if (selectedTag !== "all") {
          const name = (token.targetEquity.name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
          if (name !== selectedTag) return false;
        }

        if (searchQuery.trim()) {
          const q = searchQuery.trim().toLowerCase();
          return (
            token.name.toLowerCase().includes(q) ||
            token.symbol.toLowerCase().includes(q) ||
            token.targetEquity.symbol.toLowerCase().includes(q) ||
            token.targetEquity.name.toLowerCase().includes(q) ||
            token.mint.toLowerCase().includes(q)
          );
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === "mcap") return b.marketCapUsd - a.marketCapUsd;
        if (sortBy === "newest") {
          return tokenCreatedAt(b.createdAt, now) - tokenCreatedAt(a.createdAt, now);
        }
        if (sortBy === "volume") return b.volume24hUsd - a.volume24hUsd;
        if (sortBy === "progress")
          return b.bondingCurve.progressPct - a.bondingCurve.progressPct;
        return 0;
      });
  }, [tokens, statusFilter, selectedTag, searchQuery, sortBy]);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header
        onOpenSearch={() => setIsSearchOpen(true)}
        onOpenLaunch={() => setIsLaunchOpen(true)}
      />

      <main className="flex-1 w-full bg-background pb-12">
        <HeroBanner />
        {error && tokens.length > 0 && (
          <div role="alert" className="mx-auto mt-4 w-full max-w-[1350px] rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-300">
            Live refresh failed. Showing the last verified snapshot; values may be stale: {error}
          </div>
        )}

        <div className="w-full bg-background">
          <div className="mx-auto w-full max-w-[1350px] px-6 pt-0 sm:px-10 lg:px-0">
            <FilterBar
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
              selectedTag={selectedTag}
              onTagChange={setSelectedTag}
              sortBy={sortBy}
              onSortChange={setSortBy}
              equityTags={equityTags}
            />
            {loading ? (
              <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                {[...Array(6)].map((_, i) => (
                  <TokenCardSkeleton key={i} />
                ))}
              </div>
            ) : (
              <>
                <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
                  {filteredTokens.map((token) => (
                    <TokenCard key={token.mint} token={token} />
                  ))}
                </div>
                {filteredTokens.length === 0 && (
                  <div className="mt-12 rounded-xl border border-border bg-card p-12 text-center shadow-sm">
                    <p className="text-sm font-semibold text-foreground">
                      {error ? "Live market data unavailable" : tokens.length > 0 ? "No tokens match your filters" : "No verified tokens found"}
                    </p>
                    <p className="mx-auto mt-2 max-w-xl text-xs leading-relaxed text-muted">
                      {error || (tokens.length > 0 ? "Try a different search or reset your filters." : "The configured Solana network has no verified StreetFun curve accounts.")}
                    </p>
                    {!error && (searchQuery || selectedTag !== "all" || statusFilter !== "all") && (
                      <button
                        onClick={() => {
                          setSearchQuery("");
                          setSelectedTag("all");
                          setStatusFilter("all");
                        }}
                        className="mt-3 text-xs font-bold text-brand-cyan hover:underline"
                      >
                        Reset filters
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
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
      />
    </div>
  );
}

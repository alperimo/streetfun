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
import { TokenMetadata } from "@/lib/types";
import { useMarket } from "@/context/MarketContext";

export default function MarketsPage() {
  const { tokens, loading } = useMarket();
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

  const filteredTokens = useMemo(() => {
    return tokens
      .filter((token) => {
        if (statusFilter === "graduated" && !token.bondingCurve.isGraduated) {
          return false;
        }
        if (statusFilter === "bonding" && token.bondingCurve.isGraduated) {
          return false;
        }
        if (
          selectedTag !== "all" &&
          token.targetEquity.symbol !== selectedTag &&
          token.targetEquity.symbol.replace("T", "") !== selectedTag.replace("T", "")
        ) {
          return false;
        }

        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
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

        <div className="w-full bg-background">
          <div className="mx-auto w-full max-w-[1350px] px-6 pt-4 sm:px-10 lg:px-0">
            <FilterBar
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
              selectedTag={selectedTag}
              onTagChange={setSelectedTag}
              sortBy={sortBy}
              onSortChange={setSortBy}
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
                    <p className="text-sm text-muted">No tokens found.</p>
                    <button
                      onClick={() => {
                        setSearchQuery("");
                        setSelectedTag("all");
                      }}
                      className="mt-2 text-xs font-bold text-brand-cyan hover:underline"
                    >
                      Reset filters
                    </button>
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

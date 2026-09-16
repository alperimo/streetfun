"use client";

import React, { useState, useMemo, useEffect } from "react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { HeroBanner } from "@/components/home/HeroBanner";
import { FilterBar } from "@/components/home/FilterBar";
import { TokenCard } from "@/components/tokens/TokenCard";
import { SearchModal } from "@/components/modals/SearchModal";
import { LaunchModal } from "@/components/modals/LaunchModal";
import { INITIAL_TOKENS } from "@/lib/mockData";
import { TokenMetadata } from "@/lib/types";

export default function ExplorePage() {
  const [tokens, setTokens] = useState<TokenMetadata[]>(INITIAL_TOKENS);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState("all");
  const [sortBy, setSortBy] = useState<"mcap" | "newest" | "volume" | "progress">("mcap");

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isLaunchOpen, setIsLaunchOpen] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("launch") === "true") {
      setIsLaunchOpen(true);
    }
  }, []);

  const filteredTokens = useMemo(() => {
    return tokens
      .filter((token) => {
        if (selectedTag === "graduated" && !token.bondingCurve.isGraduated) {
          return false;
        }
        if (selectedTag === "bonding" && token.bondingCurve.isGraduated) {
          return false;
        }
        if (
          selectedTag !== "all" &&
          selectedTag !== "graduated" &&
          selectedTag !== "bonding" &&
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
  }, [tokens, selectedTag, searchQuery, sortBy]);

  const handleTokenCreated = (newToken: TokenMetadata) => {
    setTokens((prev) => [newToken, ...prev]);
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header
        onOpenSearch={() => setIsSearchOpen(true)}
        onOpenLaunch={() => setIsLaunchOpen(true)}
      />

      <main className="mx-auto flex-1 w-full px-6 md:px-12 xl:px-[164px] py-6">
        <HeroBanner onOpenLaunch={() => setIsLaunchOpen(true)} />

        <FilterBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          selectedTag={selectedTag}
          onTagChange={setSelectedTag}
          sortBy={sortBy}
          onSortChange={setSortBy}
        />

        <div className="mt-8">
          <h2 className="text-xl font-bold text-foreground tracking-tight">
            All tokens
          </h2>
        </div>

        {/* 3 Columns Grid matching StonkFun */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
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
        onTokenCreated={handleTokenCreated}
      />
    </div>
  );
}

"use client";

import React from "react";
import { Search } from "lucide-react";

interface FilterBarProps {
  searchQuery: string;
  onSearchChange: (val: string) => void;
  selectedTag: string;
  onTagChange: (tag: string) => void;
  sortBy: "mcap" | "newest" | "volume" | "progress";
  onSortChange: (sort: "mcap" | "newest" | "volume" | "progress") => void;
}

const TAGS = [
  { id: "all", label: "All" },
  { id: "$TSPACEX", label: "SpaceX ($TSPACEX)" },
  { id: "$TOPAI", label: "OpenAI ($TOPAI)" },
  { id: "$TSTRIPE", label: "Stripe ($TSTRIPE)" },
  { id: "$NVDA", label: "Nvidia ($NVDA)" },
  { id: "$TSLA", label: "Tesla ($TSLA)" },
  { id: "graduated", label: "Graduated" },
  { id: "bonding", label: "In Curve" },
];

export function FilterBar({
  searchQuery,
  onSearchChange,
  selectedTag,
  onTagChange,
  sortBy,
  onSortChange,
}: FilterBarProps) {
  return (
    <div className="mt-8 flex flex-col gap-4">
      {/* Search Bar + Sort Options Row */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Search Input Box */}
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
          <input
            type="text"
            placeholder="Search name, ticker, or contract address"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full rounded-xl border border-border bg-card pl-10 pr-4 py-2.5 text-sm text-foreground placeholder-muted focus:border-border-active focus:outline-none focus:ring-1 focus:ring-border-active/40 transition-all shadow-xs"
          />
        </div>

        {/* Sort Segmented Control: StonkFun style (only active option is a pill, others are text) */}
        <div className="flex items-center gap-3 self-end sm:self-auto text-xs">
          <span className="text-muted mr-1 font-medium">Sort:</span>
          {(
            [
              { id: "mcap", label: "Market cap" },
              { id: "newest", label: "Newest" },
              { id: "volume", label: "24h volume" },
              { id: "progress", label: "% Graduated" },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              onClick={() => onSortChange(item.id)}
              className={`transition-all ${
                sortBy === item.id
                  ? "rounded-xl bg-card border border-border-active px-3 py-1.5 font-semibold text-foreground shadow-xs"
                  : "px-1 text-muted hover:text-foreground font-medium"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Target Equity Filter Tags: Inactive are transparent ghost pills, active is distinct with seafoam tint */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        <span className="text-muted whitespace-nowrap mr-1 font-medium">Backed with:</span>
        {TAGS.map((tag) => (
          <button
            key={tag.id}
            onClick={() => onTagChange(tag.id)}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 transition-all ${
              selectedTag === tag.id
                ? "bg-brand-cyan/15 text-white border border-brand-cyan/40 font-bold shadow-xs"
                : "border border-border/60 bg-transparent text-muted hover:border-border-active hover:text-foreground font-medium"
            }`}
          >
            {tag.label}
          </button>
        ))}
      </div>
    </div>
  );
}

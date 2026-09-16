"use client";

import React from "react";
import { Search } from "lucide-react";

export type StatusFilter = "all" | "bonding" | "graduated";
export type SortOption = "mcap" | "newest" | "volume" | "progress";

interface FilterBarProps {
  searchQuery: string;
  onSearchChange: (val: string) => void;
  statusFilter: StatusFilter;
  onStatusFilterChange: (status: StatusFilter) => void;
  selectedTag: string;
  onTagChange: (tag: string) => void;
  sortBy: SortOption;
  onSortChange: (sort: SortOption) => void;
}

const EQUITY_TAGS = [
  { id: "all", label: "All" },
  { id: "$TSPACEX", label: "SpaceX ($TSPACEX)" },
  { id: "$TOPAI", label: "OpenAI ($TOPAI)" },
  { id: "$TSTRIPE", label: "Stripe ($TSTRIPE)" },
  { id: "$NVDA", label: "Nvidia ($NVDA)" },
  { id: "$TSLA", label: "Tesla ($TSLA)" },
];

export function FilterBar({
  searchQuery,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  selectedTag,
  onTagChange,
  sortBy,
  onSortChange,
}: FilterBarProps) {
  return (
    <div className="mt-8 flex flex-col gap-4">
      {/* Top Controls Row: Search Input + Status Filter + Sort */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        {/* Search Input Box */}
        <div className="relative w-full lg:max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
          <input
            type="text"
            placeholder="Search name, ticker, or contract address"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full rounded-xl border border-border bg-card pl-10 pr-4 py-2.5 text-sm text-foreground placeholder-muted focus:border-border-active focus:outline-none focus:ring-1 focus:ring-border-active/40 transition-all shadow-xs"
          />
        </div>

        {/* Right Controls: Status Segments + Sort Segments */}
        <div className="flex flex-wrap items-center gap-4 text-xs">
          {/* Status Segmented Control (All / In Curve / Graduated) */}
          <div className="flex items-center rounded-xl border border-border bg-card p-1 shadow-xs">
            {(
              [
                { id: "all", label: "All status" },
                { id: "bonding", label: "In Curve" },
                { id: "graduated", label: "Graduated" },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                onClick={() => onStatusFilterChange(item.id)}
                className={`rounded-lg px-2.5 py-1 transition-all ${
                  statusFilter === item.id
                    ? "bg-card-hover border border-border-active/70 text-foreground font-semibold shadow-xs"
                    : "text-muted hover:text-foreground font-medium"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* Sort Segmented Control */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-muted font-medium">Sort:</span>
            <div className="flex items-center gap-1">
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
                      : "px-1.5 text-muted hover:text-foreground font-medium"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Target Equity Filter Tags: Clean StonkFun-aligned muted styling without harsh neon */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs scrollbar-none">
        <span className="text-muted whitespace-nowrap mr-1 font-medium">Backed with:</span>
        {EQUITY_TAGS.map((tag) => (
          <button
            key={tag.id}
            onClick={() => onTagChange(tag.id)}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 transition-all ${
              selectedTag === tag.id
                ? "bg-card-hover text-foreground border border-border-active font-semibold shadow-xs"
                : "border border-transparent bg-transparent text-muted hover:text-foreground hover:border-border/60 font-medium"
            }`}
          >
            {tag.label}
          </button>
        ))}
      </div>
    </div>
  );
}

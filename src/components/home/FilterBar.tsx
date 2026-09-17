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

const SORT_OPTIONS: { id: SortOption; label: string }[] = [
  { id: "mcap", label: "Market cap" },
  { id: "newest", label: "Newest" },
  { id: "volume", label: "24h volume" },
  { id: "progress", label: "% Graduated" },
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
    <div className="mt-8 flex flex-col gap-3.5">
      {/* Top Controls Row: Search Input + Status Filter + Sort */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-4">
        {/* Search Input Box */}
        <div className="relative w-full lg:flex-1 lg:max-w-[660px]">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
          <input
            type="text"
            placeholder="Search name, ticker, or contract address"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full rounded-lg border border-border bg-card pl-10 pr-4 py-2 text-sm text-foreground placeholder-muted focus:border-border-active focus:outline-none transition-colors shadow-xs"
          />
        </div>

        {/* Right Controls: Status Segments + Sort Segments */}
        <div className="flex min-w-0 flex-wrap items-center gap-4 text-xs">
          {/* Status Segmented Control (All / In Curve / Graduated) */}
          <div className="flex items-center rounded-lg border border-border bg-card/60 p-1 shadow-xs gap-1">
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
                className={`rounded-md px-2.5 py-1 text-xs transition-colors duration-150 ${
                  statusFilter === item.id
                    ? "bg-brand-cyan/10 border border-brand-cyan/40 text-brand-cyan font-medium shadow-xs"
                    : "border border-transparent text-muted hover:text-foreground hover:bg-card-hover font-medium"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* Sort Segmented Control */}
          <div className="flex w-full min-w-0 items-center gap-2 text-xs lg:w-auto">
            <span className="shrink-0 text-muted font-medium">Sort:</span>
            <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {SORT_OPTIONS.map((item) => (
                <button
                  key={item.id}
                  onClick={() => onSortChange(item.id)}
                  className={`whitespace-nowrap rounded-lg px-2.5 py-1 text-xs transition-colors duration-150 ${
                    sortBy === item.id
                      ? "bg-brand-cyan/10 border border-brand-cyan/40 text-brand-cyan font-medium shadow-xs"
                      : "border border-border bg-transparent text-muted font-medium hover:text-foreground hover:bg-card-hover"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Target Equity Filter Tags: Uniform Pill-Box Wrapper for every single category */}
      <div className="flex w-full min-w-0 items-center gap-2 overflow-x-auto pb-1 text-xs scrollbar-none">
        <span className="text-muted whitespace-nowrap mr-0.5 font-medium">Backed with:</span>
        {EQUITY_TAGS.map((tag) => (
          <button
            key={tag.id}
            onClick={() => onTagChange(tag.id)}
            className={`whitespace-nowrap rounded-lg px-3 py-1 text-xs transition-colors duration-150 ${
              selectedTag === tag.id
                ? "bg-brand-cyan/10 border border-brand-cyan/40 text-brand-cyan font-medium shadow-xs"
                : "border border-border bg-transparent text-muted font-medium hover:text-foreground hover:bg-card-hover"
            }`}
          >
            {tag.label}
          </button>
        ))}
      </div>
    </div>
  );
}

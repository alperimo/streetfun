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
  { id: "$SPCX", label: "SpaceX ($SPCX)" },
  { id: "$NVDA", label: "Nvidia ($NVDA)" },
  { id: "$GRND", label: "Grindr ($GRND)" },
  { id: "$SNDK", label: "SanDisk ($SNDK)" },
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
            className="w-full rounded-xl border border-border bg-white pl-10 pr-4 py-2.5 text-sm text-slate-900 placeholder-muted focus:border-brand-cyan focus:outline-none focus:ring-1 focus:ring-brand-cyan/30 transition-all shadow-sm"
          />
        </div>

        {/* Sort Pills */}
        <div className="flex items-center gap-1.5 self-end sm:self-auto text-xs">
          <span className="text-muted mr-1">Sort:</span>
          <button
            onClick={() => onSortChange("mcap")}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
              sortBy === "mcap"
                ? "bg-sky-50 text-brand-cyan border border-sky-200"
                : "text-muted hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            Market cap
          </button>
          <button
            onClick={() => onSortChange("newest")}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
              sortBy === "newest"
                ? "bg-sky-50 text-brand-cyan border border-sky-200"
                : "text-muted hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            Newest
          </button>
          <button
            onClick={() => onSortChange("volume")}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
              sortBy === "volume"
                ? "bg-sky-50 text-brand-cyan border border-sky-200"
                : "text-muted hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            24h volume
          </button>
          <button
            onClick={() => onSortChange("progress")}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
              sortBy === "progress"
                ? "bg-sky-50 text-brand-cyan border border-sky-200"
                : "text-muted hover:text-slate-900 hover:bg-slate-100"
            }`}
          >
            % Graduated
          </button>
        </div>
      </div>

      {/* Target Equity Filter Tags */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        <span className="text-muted whitespace-nowrap mr-1">Backed with:</span>
        {TAGS.map((tag) => (
          <button
            key={tag.id}
            onClick={() => onTagChange(tag.id)}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 font-medium transition-all ${
              selectedTag === tag.id
                ? "bg-sky-50 text-brand-cyan border border-sky-200 shadow-sm font-semibold"
                : "border border-border bg-white text-muted hover:border-slate-300 hover:text-slate-900"
            }`}
          >
            {tag.label}
          </button>
        ))}
      </div>
    </div>
  );
}

"use client";

import React from "react";
import { ArrowDownUp, Check, Search, SlidersHorizontal } from "lucide-react";

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
  equityTags: { id: string; label: string }[];
}

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
  equityTags,
}: FilterBarProps) {
  return (
    <div className="mt-2 flex flex-col gap-4">
      <div className="flex w-full flex-col gap-3 rounded-2xl border border-border bg-card/70 p-2 shadow-xs lg:flex-row lg:items-center lg:justify-between">
        <div className="relative min-w-0 flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
          <input
            type="text"
            placeholder="Search name, ticker, or contract address"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="h-11 w-full rounded-xl border border-transparent bg-card-subtle pl-10 pr-4 text-sm text-foreground placeholder-muted transition-colors focus:border-border-active focus:outline-none"
          />
        </div>

        <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-2 px-1 xl:flex-nowrap">
          <span className="hidden shrink-0 items-center gap-1.5 px-2 text-[11px] font-semibold text-muted lg:flex">
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Status
          </span>
          <div className="flex min-w-0 items-center gap-1 overflow-x-auto rounded-xl bg-card-subtle p-1 scrollbar-none lg:flex-none">
            {(
              [
                { id: "all", label: "All" },
                { id: "bonding", label: "In Curve" },
                { id: "graduated", label: "Graduated" },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                onClick={() => onStatusFilterChange(item.id)}
                className={`flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-xs transition-colors duration-150 lg:flex-none ${
                  statusFilter === item.id
                    ? "border border-brand-cyan/40 bg-brand-cyan/10 font-semibold text-brand-cyan shadow-xs"
                    : "border border-transparent font-medium text-muted hover:bg-card-hover hover:text-foreground"
                }`}
              >
                {statusFilter === item.id && <Check className="mr-1 inline-block h-3.5 w-3.5" />}
                {item.label}
              </button>
            ))}
          </div>

          <span className="hidden shrink-0 items-center gap-1.5 px-2 text-[11px] font-semibold text-muted lg:flex">
            <ArrowDownUp className="h-3.5 w-3.5" />
            Sort
          </span>
          <div className="flex min-w-0 items-center gap-1 overflow-x-auto rounded-xl bg-card-subtle p-1 scrollbar-none lg:flex-none">
            {SORT_OPTIONS.map((item) => (
              <button
                key={item.id}
                onClick={() => onSortChange(item.id)}
                className={`flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-xs transition-colors duration-150 lg:flex-none ${
                  sortBy === item.id
                    ? "border border-brand-cyan/40 bg-brand-cyan/10 font-semibold text-brand-cyan shadow-xs"
                    : "border border-transparent font-medium text-muted hover:bg-card-hover hover:text-foreground"
                }`}
              >
                {sortBy === item.id && <Check className="mr-1 inline-block h-3.5 w-3.5" />}
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex w-full min-w-0 items-center gap-2 overflow-x-auto px-1 pb-1 text-xs scrollbar-none">
        <span className="mr-1 whitespace-nowrap text-[11px] font-semibold text-muted">Target asset</span>
        {equityTags.map((tag) => (
          <button
            key={tag.id}
            onClick={() => onTagChange(tag.id)}
            className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs transition-colors duration-150 ${
              selectedTag === tag.id
                ? "border-brand-cyan/40 bg-brand-cyan/10 font-semibold text-brand-cyan shadow-xs"
                : "border-border bg-transparent font-medium text-muted hover:bg-card-hover hover:text-foreground"
            }`}
          >
            {tag.label}
          </button>
        ))}
      </div>
    </div>
  );
}

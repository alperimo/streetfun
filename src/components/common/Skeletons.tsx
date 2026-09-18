import React from "react";

export function TokenCardSkeleton() {
  return (
    <div className="flex flex-col justify-between rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-sm">
      <div>
        {/* Top: Avatar, Name, Tagline & Star */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="h-12 w-12 rounded-full bg-card-hover/80 animate-pulse shrink-0 border border-border" />
            <div className="flex flex-col gap-1.5 min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <div className="h-3 w-12 rounded bg-card-hover/60 animate-pulse" />
                <div className="h-4 w-14 rounded-md bg-card-hover/80 animate-pulse" />
              </div>
              <div className="h-4 w-32 rounded bg-card-hover/80 animate-pulse" />
              <div className="h-3 w-40 rounded bg-card-hover/50 animate-pulse" />
            </div>
          </div>
          <div className="h-4 w-4 rounded bg-card-hover/60 animate-pulse shrink-0" />
        </div>

        {/* Backing Badge & Sparkline placeholder */}
        <div className="mt-3.5 flex items-center justify-between gap-2">
          <div className="h-4 w-28 rounded bg-card-hover/60 animate-pulse" />
          <div className="h-5 w-20 rounded bg-card-hover/40 animate-pulse" />
        </div>
      </div>

      {/* Divider */}
      <div className="mt-4 mb-3.5 border-t border-border" />

      {/* Bottom 3-Column Metrics */}
      <div className="grid grid-cols-3 items-end gap-2">
        <div>
          <div className="h-2.5 w-16 rounded bg-card-hover/50 animate-pulse" />
          <div className="mt-1.5 h-5 w-20 rounded bg-card-hover/80 animate-pulse" />
        </div>
        <div>
          <div className="h-2.5 w-16 rounded bg-card-hover/50 animate-pulse" />
          <div className="mt-1.5 h-5 w-16 rounded bg-card-hover/80 animate-pulse" />
        </div>
        <div className="flex justify-end">
          <div className="h-5 w-14 rounded bg-card-hover/80 animate-pulse" />
        </div>
      </div>
    </div>
  );
}

export function TokenDetailSkeleton() {
  return (
    <div className="mx-auto flex-1 w-full max-w-[1350px] px-6 py-6 md:px-12 lg:px-0">
      {/* Back Button Skeleton */}
      <div className="h-4 w-20 rounded bg-card-hover/60 animate-pulse mb-6" />

      {/* Token Header Banner */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-sm mb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-full bg-card-hover/80 animate-pulse border border-border shrink-0" />
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="h-6 w-36 rounded bg-card-hover/80 animate-pulse" />
                <div className="h-5 w-20 rounded-md bg-card-hover/60 animate-pulse" />
              </div>
              <div className="h-4 w-52 rounded bg-card-hover/60 animate-pulse" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-8 w-24 rounded-lg bg-card-hover/60 animate-pulse" />
            <div className="h-8 w-24 rounded-lg bg-card-hover/60 animate-pulse" />
          </div>
        </div>

        {/* 4 Stats Grid */}
        <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4 border-t border-border pt-5">
          {[...Array(4)].map((_, idx) => (
            <div key={idx} className="space-y-1.5">
              <div className="h-3 w-20 rounded bg-card-hover/50 animate-pulse" />
              <div className="h-6 w-28 rounded bg-card-hover/80 animate-pulse" />
            </div>
          ))}
        </div>
      </div>

      {/* 2-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Chart & Live Trades */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          {/* Chart Container Skeleton */}
          <div className="w-full h-[430px] rounded-xl border border-border bg-card p-4 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="h-4 w-36 rounded bg-card-hover/80 animate-pulse" />
              <div className="flex gap-1.5">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className="h-6 w-9 rounded bg-card-hover/60 animate-pulse" />
                ))}
              </div>
            </div>
            <div className="flex-1 my-4 rounded-lg bg-card-hover/30 animate-pulse flex items-center justify-center">
              <span className="text-xs font-mono text-muted/50">Loading on-chain chart engine...</span>
            </div>
          </div>

          {/* Live Trades Table Skeleton */}
          <div className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-3">
            <div className="h-4 w-28 rounded bg-card-hover/80 animate-pulse border-b border-border pb-3" />
            <div className="space-y-2.5 pt-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-border/40">
                  <div className="h-4 w-12 rounded bg-card-hover/80 animate-pulse" />
                  <div className="h-4 w-16 rounded bg-card-hover/60 animate-pulse" />
                  <div className="h-4 w-24 rounded bg-card-hover/60 animate-pulse" />
                  <div className="h-4 w-20 rounded bg-card-hover/70 animate-pulse" />
                  <div className="h-4 w-12 rounded bg-card-hover/50 animate-pulse" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Terminal Skeleton */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          <div className="h-[460px] rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
            <div className="flex gap-2 border-b border-border pb-3">
              <div className="h-8 flex-1 rounded-lg bg-card-hover/80 animate-pulse" />
              <div className="h-8 flex-1 rounded-lg bg-card-hover/50 animate-pulse" />
            </div>
            <div className="h-20 w-full rounded-xl bg-card-subtle animate-pulse" />
            <div className="h-12 w-full rounded-xl bg-card-subtle animate-pulse" />
            <div className="h-10 w-full rounded-xl bg-card-hover/40 animate-pulse" />
            <div className="h-12 w-full rounded-xl bg-brand-cyan/20 border border-brand-cyan/30 animate-pulse mt-auto" />
          </div>

          <div className="h-44 rounded-2xl border border-border bg-card p-4 space-y-2 shadow-sm">
            <div className="h-4 w-36 rounded bg-card-hover/80 animate-pulse pb-2 border-b border-border" />
            <div className="h-3 w-full rounded bg-card-hover/40 animate-pulse pt-2" />
            <div className="h-3 w-3/4 rounded bg-card-hover/40 animate-pulse" />
            <div className="h-3 w-5/6 rounded bg-card-hover/40 animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function TreasuryCardSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm flex flex-col justify-between">
      <div className="space-y-4">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-card-hover/80 animate-pulse border border-border" />
            <div className="space-y-1.5">
              <div className="h-4 w-28 rounded bg-card-hover/80 animate-pulse" />
              <div className="h-3 w-16 rounded bg-card-hover/60 animate-pulse" />
            </div>
          </div>
          <div className="h-5 w-16 rounded-md bg-card-hover/60 animate-pulse" />
        </div>
        <div className="space-y-2 border-t border-border/50 pt-4">
          <div className="flex justify-between">
            <div className="h-3 w-20 rounded bg-card-hover/50 animate-pulse" />
            <div className="h-4 w-24 rounded bg-card-hover/80 animate-pulse" />
          </div>
          <div className="flex justify-between">
            <div className="h-3 w-20 rounded bg-card-hover/50 animate-pulse" />
            <div className="h-4 w-20 rounded bg-card-hover/80 animate-pulse" />
          </div>
        </div>
      </div>
      <div className="mt-6 h-10 w-full rounded-xl bg-card-hover/60 animate-pulse" />
    </div>
  );
}

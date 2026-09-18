"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import { Search, Plus, Wallet } from "lucide-react";

import { StreetFunLogo } from "@/components/common/StreetFunLogo";

const WalletButton = dynamic(
  () => import("./WalletButton").then((mod) => mod.WalletButton),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-11 w-11 cursor-pointer select-none items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm font-semibold text-foreground sm:w-auto sm:px-4">
        <Wallet className="h-4 w-4 text-muted" />
        <span className="hidden sm:inline">Connect wallet</span>
      </div>
    ),
  }
);

interface HeaderProps {
  onOpenSearch: () => void;
  onOpenLaunch: () => void;
}

export function Header({ onOpenSearch, onOpenLaunch }: HeaderProps) {
  const pathname = usePathname();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        onOpenSearch();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onOpenSearch]);

  return (
    <header className="site-header sticky top-0 z-40 w-full backdrop-blur-md">
      <div className="mx-auto flex h-[80px] w-full max-w-[1350px] items-center justify-between gap-4 px-6 sm:px-10 lg:px-0">
        {/* Left: Brand & Treasury */}
        <div className="flex min-w-0 items-center gap-8">
          <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="StreetFun home">
            <StreetFunLogo size={34} className="h-[34px] w-[34px] flex-shrink-0 text-brand-cyan" />
            <span className="text-[21px] font-bold tracking-[-0.04em] text-foreground">
              StreetFun
            </span>
          </Link>

          <nav className="flex items-center text-[15px]">
            <Link
              href="/treasury"
              className={`py-2 font-medium transition-colors ${
                pathname === "/treasury"
                  ? "font-semibold text-brand-cyan"
                  : "text-muted hover:text-foreground"
              }`}
            >
              Treasury
            </Link>
          </nav>
        </div>

        {/* Right: Search bar, Launch CTA, and Wallet */}
        <div className="flex shrink-0 items-center gap-2.5 sm:gap-3">
          {/* Search bar with slightly smaller width per user request */}
          <button
            onClick={onOpenSearch}
            type="button"
            aria-label="Search"
            className="flex h-11 w-11 sm:w-40 md:w-44 items-center justify-between gap-2 rounded-xl border border-border bg-card px-3 text-sm text-muted transition-all hover:border-border-hover hover:bg-card-hover hover:text-foreground"
          >
            <div className="flex items-center gap-2">
              <Search className="h-4 w-4 shrink-0 text-muted" />
              <span className="hidden text-sm sm:inline">Search</span>
            </div>
            <kbd className="hidden sm:inline-flex items-center rounded-md border border-border bg-card-subtle px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted">
              Ctrl K
            </kbd>
          </button>

          {/* Launch token CTA */}
          <button
            onClick={onOpenLaunch}
            aria-label="Launch token"
            title="Launch token"
            className="flex h-11 w-11 items-center justify-center gap-2 rounded-xl border border-brand-cyan bg-gradient-to-r from-brand-cyan to-brand-cyan-hover text-sm font-bold text-background shadow-md shadow-brand-cyan/20 transition-all hover:brightness-110 hover:shadow-brand-cyan/30 sm:w-auto sm:px-4"
          >
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-background text-brand-cyan">
              <Plus className="h-3.5 w-3.5 stroke-[3]" />
            </span>
            <span className="hidden sm:inline">Launch token</span>
          </button>

          {/* Connect wallet */}
          <WalletButton />
        </div>
      </div>
    </header>
  );
}

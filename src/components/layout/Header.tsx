"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import { Search, Plus, Wallet } from "lucide-react";

import { StreetFunLogo } from "@/components/common/StreetFunLogo";
import { useAlphaPass } from "@/context/AlphaPassContext";

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
  onOpenHowItWorks?: () => void;
  onOpenWaitlist?: () => void;
}

export function Header({ onOpenSearch, onOpenLaunch, onOpenHowItWorks, onOpenWaitlist }: HeaderProps) {
  const pathname = usePathname();
  const { passData, openWaitlist: contextOpenWaitlist } = useAlphaPass();
  const handleOpenWaitlist = onOpenWaitlist || contextOpenWaitlist;

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
    <header className="site-header sticky top-0 z-40 w-full bg-background backdrop-blur-md">
      <div className="mx-auto flex h-[80px] w-full max-w-[1350px] items-center justify-between gap-2 px-4 sm:gap-4 sm:px-10 lg:px-0">
        {/* Left: Brand & Navigation */}
        <div className="flex h-full min-w-0 items-center gap-4 sm:gap-8">
          <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="StreetFun home">
            <StreetFunLogo size={34} className="h-[34px] w-[34px] flex-shrink-0 text-brand-cyan" />
            <span className="hidden text-[21px] font-bold tracking-[-0.04em] text-foreground sm:inline">
              StreetFun
            </span>
          </Link>

          <nav className="flex h-full items-center gap-4 sm:gap-6 text-[15px]">
            <Link
              href="/treasury"
              className={`relative flex h-full items-center px-1 transition-colors ${
                pathname === "/treasury"
                  ? "font-semibold text-foreground"
                  : "font-medium text-muted hover:text-foreground"
              }`}
            >
              <span>Treasury</span>
              {pathname === "/treasury" && (
                <span
                  className="absolute -bottom-[1px] left-0 right-0 h-[2px] rounded-full bg-brand-cyan shadow-[0_0_8px_rgba(199,242,132,0.4)]"
                  aria-hidden="true"
                />
              )}
            </Link>

            {onOpenHowItWorks && (
              <button
                type="button"
                onClick={onOpenHowItWorks}
                className="relative flex h-full items-center px-1 font-medium text-muted hover:text-foreground transition-colors cursor-pointer"
              >
                <span>How It Works</span>
              </button>
            )}
          </nav>
        </div>

        {/* Right: Search bar, Launch CTA, and Wallet */}
        <div className="flex shrink-0 items-center gap-2.5 sm:gap-3">
          {(process.env.NEXT_PUBLIC_SOLANA_NETWORK || "devnet") === "devnet" && (
            <div className="hidden lg:flex h-11 items-center gap-2 rounded-xl border border-border bg-card px-3 text-xs font-mono font-medium text-muted select-none shadow-xs">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              <span>Devnet</span>
            </div>
          )}

          {/* Mainnet Waitlist button */}
          {passData ? (
            <button
              onClick={handleOpenWaitlist}
              type="button"
              aria-label={`Waitlist Pass #${String(passData.passNumber).padStart(4, "0")}`}
              className="flex h-11 items-center justify-center rounded-xl border border-brand-cyan/40 bg-card hover:bg-card-hover px-4 text-xs font-mono font-bold text-brand-cyan transition-colors cursor-pointer shrink-0 shadow-sm"
            >
              Pass #{String(passData.passNumber).padStart(4, "0")}
            </button>
          ) : (
            <button
              onClick={handleOpenWaitlist}
              type="button"
              className="flex h-11 items-center justify-center rounded-xl border border-border bg-card hover:bg-card-hover hover:border-brand-cyan/50 hover:text-foreground px-4 text-xs font-semibold text-foreground transition-all cursor-pointer shrink-0 shadow-sm"
            >
              Mainnet Waitlist
            </button>
          )}

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

"use client";

import React from "react";
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

  return (
    <header className="site-header sticky top-0 z-40 w-full backdrop-blur-md">
      <div className="mx-auto flex h-[80px] w-full max-w-[1350px] items-center justify-between gap-5 px-5 sm:px-8 lg:px-0">
        {/* Left: Brand */}
        <div className="flex min-w-0 items-center gap-7">
          <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="StreetFun home">
            <StreetFunLogo size={34} className="h-[34px] w-[34px] flex-shrink-0 text-brand-emerald" />
            <span className="text-[21px] font-bold tracking-[-0.04em] text-foreground">
              StreetFun
            </span>
          </Link>
        </div>

        {/* Center: Primary navigation and search */}
        <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-8 text-[15px] xl:flex">
            <Link
              href="/"
              className={`relative py-2 font-medium transition-colors ${
                pathname === "/"
                  ? "font-semibold text-foreground"
                  : "text-muted hover:text-foreground"
              }`}
            >
              MARKETS
            </Link>

            <Link
              href="/treasury"
              className={`py-2 font-medium transition-colors ${
                pathname === "/treasury"
                  ? "font-semibold text-brand-emerald"
                  : "text-muted hover:text-foreground"
              }`}
            >
              TREASURY
            </Link>
            <button
              onClick={onOpenSearch}
              aria-label="Search"
              title="Search"
              className="flex h-11 w-11 items-center justify-center rounded-xl text-muted transition-colors hover:bg-card hover:text-foreground"
            >
              <Search className="h-5 w-5" />
            </button>
        </nav>

        {/* Right: launch CTA and wallet */}
        <div className="flex shrink-0 items-center gap-2">
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

"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import { Search, Plus, TrendingUp, Send } from "lucide-react";

import { StreetFunLogo } from "@/components/common/StreetFunLogo";

const WalletButton = dynamic(
  () => import("./WalletButton").then((mod) => mod.WalletButton),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-9 items-center gap-1.5 rounded-lg bg-[#5eb0c5] px-3.5 text-xs font-bold text-slate-950 opacity-80">
        <span>Connect wallet</span>
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
    <header className="sticky top-0 z-40 w-full border-b border-border bg-background/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full items-center justify-between px-6 md:px-12 xl:px-[164px]">
        {/* Left: Brand + Nav */}
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2.5">
            <StreetFunLogo size={28} className="h-7 w-7 flex-shrink-0" />
            <span className="text-lg font-black tracking-tight text-foreground">
              StreetFun
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-1 text-sm">
            <Link
              href="/"
              className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                pathname === "/"
                  ? "bg-card text-foreground font-semibold border border-border"
                  : "text-muted hover:text-foreground"
              }`}
            >
              Explore
            </Link>

            <Link
              href="/treasury"
              className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                pathname === "/treasury"
                  ? "bg-card text-foreground font-semibold border border-border"
                  : "text-muted hover:text-foreground"
              }`}
            >
              Treasury
            </Link>
          </nav>
        </div>

        {/* Right: Search, Socials, Launch CTA, Wallet */}
        <div className="flex items-center gap-2">
          {/* Search textfield */}
          <button
            onClick={onOpenSearch}
            className="flex h-9 w-40 items-center justify-between rounded-lg border border-[#1f3042] bg-[#0f1922] px-2.5 text-xs text-muted hover:border-border-active hover:text-foreground transition-all"
          >
            <div className="flex items-center gap-2">
              <Search className="h-3.5 w-3.5 text-muted" />
              <span className="text-xs">Search</span>
            </div>
            <kbd className="rounded border border-[#1f3042] bg-[#090e13] px-1.5 py-0.5 text-[10px] text-muted font-mono">
              ⌘ K
            </kbd>
          </button>

          {/* Telegram */}
          <a
            href="https://t.me"
            target="_blank"
            rel="noreferrer"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#1f3042] bg-[#0f1922] text-slate-200 hover:border-border-active hover:text-white transition-all"
            title="Telegram"
          >
            <Send className="h-3.5 w-3.5 -rotate-12 translate-y-[-0.5px]" />
          </a>

          {/* X */}
          <a
            href="https://x.com"
            target="_blank"
            rel="noreferrer"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#1f3042] bg-[#0f1922] text-slate-200 hover:border-border-active hover:text-white transition-all"
            title="X"
          >
            <svg className="h-3.5 w-3.5 fill-current" viewBox="0 0 24 24">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          </a>

          {/* Launch token CTA */}
          <button
            onClick={onOpenLaunch}
            className="flex h-9 items-center gap-1.5 rounded-lg bg-[#5eb0c5] px-3.5 text-xs font-bold text-slate-950 hover:bg-[#52a1b5] transition-colors"
          >
            <Plus className="h-3.5 w-3.5 stroke-[2.5]" />
            <span>Launch token</span>
          </button>

          {/* Connect wallet */}
          <WalletButton />
        </div>
      </div>
    </header>
  );
}

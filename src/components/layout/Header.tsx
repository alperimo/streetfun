"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import { Search, Plus, TrendingUp, Send, Twitter } from "lucide-react";

const WalletMultiButton = dynamic(
  async () =>
    (await import("@solana/wallet-adapter-react-ui")).WalletMultiButton,
  { ssr: false }
);

interface HeaderProps {
  onOpenSearch: () => void;
  onOpenLaunch: () => void;
}

export function Header({ onOpenSearch, onOpenLaunch }: HeaderProps) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 w-full border-b border-border bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full items-center justify-between px-6 md:px-12 xl:px-[164px]">
        {/* Left: Brand + Nav */}
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-cyan text-white font-bold">
              <TrendingUp className="h-4 w-4 stroke-[2.5]" />
            </div>
            <span className="text-lg font-black tracking-tight text-slate-900">
              Street<span className="text-brand-cyan">Fun</span>
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-1 text-sm">
            <Link
              href="/"
              className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                pathname === "/"
                  ? "bg-slate-100 text-brand-cyan"
                  : "text-muted hover:text-slate-900"
              }`}
            >
              Explore
            </Link>

            <Link
              href="/treasury"
              className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                pathname === "/treasury"
                  ? "bg-slate-100 text-brand-cyan"
                  : "text-muted hover:text-slate-900"
              }`}
            >
              Treasury
            </Link>
          </nav>
        </div>

        {/* Right: Search, Socials, Launch CTA, Wallet */}
        <div className="flex items-center gap-3">
          <button
            onClick={onOpenSearch}
            className="flex items-center gap-2.5 rounded-lg border border-border bg-slate-50 px-3.5 py-1.5 text-xs text-muted hover:border-border-active hover:text-slate-900 hover:bg-slate-100 transition-colors"
          >
            <Search className="h-3.5 w-3.5 text-muted" />
            <span className="hidden sm:inline">Search token, ticker, address...</span>
            <kbd className="rounded border border-border bg-white px-1.5 py-0.5 text-[10px] text-muted font-mono">
              Ctrl K
            </kbd>
          </button>

          <div className="hidden lg:flex items-center gap-1 border-x border-border/60 px-2">
            <a
              href="https://t.me"
              target="_blank"
              rel="noreferrer"
              className="p-1.5 text-muted hover:text-slate-900 rounded-md hover:bg-slate-100 transition-colors"
            >
              <Send className="h-4 w-4" />
            </a>
            <a
              href="https://x.com"
              target="_blank"
              rel="noreferrer"
              className="p-1.5 text-muted hover:text-slate-900 rounded-md hover:bg-slate-100 transition-colors"
            >
              <Twitter className="h-4 w-4" />
            </a>
          </div>

          <button
            onClick={onOpenLaunch}
            className="flex items-center gap-1.5 rounded-lg bg-brand-cyan px-3.5 py-2 text-xs font-bold text-white hover:bg-sky-700 transition-colors shadow-sm"
          >
            <Plus className="h-4 w-4 stroke-[2.5]" />
            <span>Launch token</span>
          </button>

          <WalletMultiButton />
        </div>
      </div>
    </header>
  );
}

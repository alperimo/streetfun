"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import { Search, Plus, ShieldCheck, TrendingUp, Landmark, Send, Twitter } from "lucide-react";

// Dynamic import for WalletMultiButton to prevent SSR hydration mismatch
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
    <header className="sticky top-0 z-40 w-full border-b border-border bg-[#060a0e]/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Left: Brand + Nav Links */}
        <div className="flex items-center gap-8">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-brand-cyan to-blue-600 font-bold text-black shadow-lg shadow-brand-cyan/20">
              <TrendingUp className="h-5 w-5 text-black stroke-[2.5]" />
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-black tracking-tight text-white">
                Street<span className="text-brand-cyan">Fun</span>
              </span>
              <span className="text-[10px] font-medium tracking-wider text-muted uppercase">
                Equity-Backed Meme Engine
              </span>
            </div>
          </Link>

          {/* Nav Tabs */}
          <nav className="hidden md:flex items-center gap-1">
            <Link
              href="/"
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                pathname === "/"
                  ? "bg-[#111e29] text-brand-cyan border border-[#1e3347]"
                  : "text-muted hover:text-white hover:bg-[#0f171f]"
              }`}
            >
              Explore
            </Link>

            <Link
              href="/treasury"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                pathname === "/treasury"
                  ? "bg-[#111e29] text-brand-cyan border border-[#1e3347]"
                  : "text-muted hover:text-white hover:bg-[#0f171f]"
              }`}
            >
              <Landmark className="h-4 w-4 text-brand-emerald" />
              Treasury / Proof of Assets
            </Link>
          </nav>
        </div>

        {/* Right: Search, Socials, Launch CTA, Wallet */}
        <div className="flex items-center gap-3">
          {/* Quick Search Button */}
          <button
            onClick={onOpenSearch}
            className="flex items-center gap-2.5 rounded-lg border border-border bg-[#0b1218] px-3 py-1.5 text-xs text-muted hover:border-border-active hover:text-white transition-all shadow-inner"
          >
            <Search className="h-3.5 w-3.5 text-muted" />
            <span className="hidden sm:inline">Search token, ticker, equity...</span>
            <kbd className="rounded border border-border bg-[#111c26] px-1.5 py-0.5 text-[10px] text-muted-foreground font-mono">
              Ctrl K
            </kbd>
          </button>

          {/* Social Links */}
          <div className="hidden lg:flex items-center gap-1 border-x border-border/60 px-2">
            <a
              href="https://t.me"
              target="_blank"
              rel="noreferrer"
              className="p-1.5 text-muted hover:text-white rounded-md hover:bg-[#111e29] transition-colors"
            >
              <Send className="h-4 w-4" />
            </a>
            <a
              href="https://x.com"
              target="_blank"
              rel="noreferrer"
              className="p-1.5 text-muted hover:text-white rounded-md hover:bg-[#111e29] transition-colors"
            >
              <Twitter className="h-4 w-4" />
            </a>
          </div>

          {/* Launch Token Button */}
          <button
            onClick={onOpenLaunch}
            className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-brand-cyan to-blue-500 px-3.5 py-2 text-xs font-semibold text-black hover:opacity-90 transition-opacity shadow-md shadow-brand-cyan/20"
          >
            <Plus className="h-4 w-4 stroke-[2.5]" />
            <span className="hidden sm:inline">Launch a Stonk</span>
            <span className="sm:hidden">Launch</span>
          </button>

          {/* Solana Wallet Multi Button */}
          <WalletMultiButton />
        </div>
      </div>
    </header>
  );
}

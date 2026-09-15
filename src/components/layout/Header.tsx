"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import dynamic from "next/dynamic";
import { Search, Plus, TrendingUp, Send, Twitter } from "lucide-react";

import { StreetFunLogo } from "@/components/common/StreetFunLogo";

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
        <div className="flex items-center gap-2.5">
          <button
            onClick={onOpenSearch}
            className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-xs text-muted hover:border-border-active hover:text-foreground transition-all shadow-xs"
          >
            <Search className="h-3.5 w-3.5 text-muted" />
            <span className="text-xs">Search</span>
            <kbd className="rounded border border-border bg-card-hover/60 px-1.5 py-0.5 text-[10px] text-muted font-mono ml-1">
              ⌘ K
            </kbd>
          </button>

          <a
            href="https://t.me"
            target="_blank"
            rel="noreferrer"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-muted hover:border-border-active hover:text-foreground hover:bg-card-hover transition-all shadow-xs"
            title="Telegram"
          >
            <Send className="h-4 w-4" />
          </a>

          <a
            href="https://x.com"
            target="_blank"
            rel="noreferrer"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card text-muted hover:border-border-active hover:text-foreground hover:bg-card-hover transition-all shadow-xs"
            title="Twitter / X"
          >
            <Twitter className="h-4 w-4" />
          </a>

          <button
            onClick={onOpenLaunch}
            className="flex items-center gap-1.5 rounded-xl bg-brand-cyan px-3.5 py-2 text-xs font-bold text-slate-950 hover:opacity-90 transition-opacity shadow-sm"
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

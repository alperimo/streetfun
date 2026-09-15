import React from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";

export function Footer() {
  return (
    <footer className="mt-20 border-t border-border bg-[#060a0e] py-8 text-xs text-muted">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6 lg:px-8">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-brand-cyan" />
          <span>
            Underpinned by New York UCC Article 8 custody via Backpack Securities & Sunrise SPL canonical equity mints.
          </span>
        </div>
        <div className="flex items-center gap-6">
          <Link href="/" className="hover:text-white transition-colors">
            Explore
          </Link>
          <Link href="/treasury" className="hover:text-white transition-colors">
            Proof of Assets
          </Link>
          <a
            href="https://learn.backpack.exchange/articles/what-is-sunrise"
            target="_blank"
            rel="noreferrer"
            className="hover:text-white transition-colors"
          >
            Sunrise Docs
          </a>
        </div>
      </div>
    </footer>
  );
}

import React from "react";
import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-20 border-t border-border bg-[#060a0e] py-8 text-xs text-muted">
      <div className="mx-auto flex w-full flex-col items-center justify-between gap-4 px-6 md:px-12 xl:px-[164px] sm:flex-row">
        <span>Streetfun · Equity-backed memecoin launchpad</span>
        <div className="flex items-center gap-6">
          <Link href="/" className="hover:text-white transition-colors">
            Explore
          </Link>
          <Link href="/treasury" className="hover:text-white transition-colors">
            Treasury
          </Link>
          <a
            href="https://sunrise.trade"
            target="_blank"
            rel="noreferrer"
            className="hover:text-white transition-colors"
          >
            Sunrise
          </a>
        </div>
      </div>
    </footer>
  );
}

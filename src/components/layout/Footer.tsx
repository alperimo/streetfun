"use client";

import React, { useState } from "react";
import Link from "next/link";
import { TermsModal } from "@/components/modals/TermsModal";

export function Footer() {
  const [isTermsOpen, setIsTermsOpen] = useState(false);

  React.useEffect(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("terms") === "true") {
      setIsTermsOpen(true);
    }
  }, []);

  return (
    <>
      <footer className="mt-20 border-t border-border bg-card py-6 text-xs text-muted">
        <div className="mx-auto flex w-full items-center justify-center gap-6 sm:gap-8 px-6 md:px-12 xl:px-[164px]">
          <a
            href="https://x.com"
            target="_blank"
            rel="noreferrer"
            className="hover:text-foreground transition-colors font-medium"
          >
            X
          </a>
          <Link href="/" className="hover:text-foreground transition-colors font-medium">
            Explore
          </Link>
          <Link href="/treasury" className="hover:text-foreground transition-colors font-medium">
            Treasury
          </Link>
          <button
            onClick={() => setIsTermsOpen(true)}
            className="hover:text-foreground transition-colors font-medium"
          >
            Terms
          </button>
        </div>
      </footer>

      <TermsModal isOpen={isTermsOpen} onClose={() => setIsTermsOpen(false)} />
    </>
  );
}

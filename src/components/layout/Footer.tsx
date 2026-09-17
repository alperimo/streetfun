"use client";

import React, { useState } from "react";
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
      <footer className="site-footer mt-0 py-6 text-xs text-muted">
        <div className="mx-auto flex w-full max-w-[1350px] items-center justify-center gap-6 px-6 sm:gap-8 md:px-12 lg:px-0">
          <a
            href="https://x.com"
            target="_blank"
            rel="noreferrer"
            className="hover:text-foreground transition-colors font-medium"
          >
            X
          </a>
          <button
            onClick={() => setIsTermsOpen(true)}
            className="hover:text-foreground transition-colors font-medium"
          >
            Terms of Service
          </button>
        </div>
      </footer>

      <TermsModal isOpen={isTermsOpen} onClose={() => setIsTermsOpen(false)} />
    </>
  );
}

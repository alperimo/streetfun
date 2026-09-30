"use client";

import React, { useState } from "react";
import { TermsModal } from "@/components/modals/TermsModal";
import { HowItWorksModal } from "@/components/modals/HowItWorksModal";

interface FooterProps {
  onOpenHowItWorks?: () => void;
}

export function Footer({ onOpenHowItWorks }: FooterProps = {}) {
  const [isTermsOpen, setIsTermsOpen] = useState(false);
  const [localHowItWorksOpen, setLocalHowItWorksOpen] = useState(false);

  React.useEffect(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("terms") === "true") {
      setIsTermsOpen(true);
    }
  }, []);

  const handleOpenHowItWorks = () => {
    if (onOpenHowItWorks) {
      onOpenHowItWorks();
    } else {
      setLocalHowItWorksOpen(true);
    }
  };

  return (
    <>
      <footer className="site-footer mt-auto w-full border-t border-border bg-background py-6 text-xs text-muted">
        <div className="mx-auto flex w-full max-w-[1350px] items-center justify-center gap-6 px-6 sm:gap-8 md:px-12 lg:px-0">
          <button
            onClick={handleOpenHowItWorks}
            className="hover:text-foreground transition-colors font-medium cursor-pointer"
          >
            How It Works
          </button>
          <a
            href="https://x.com/streetfunxyz"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground transition-colors font-medium"
          >
            X
          </a>
          <button
            onClick={() => setIsTermsOpen(true)}
            className="hover:text-foreground transition-colors font-medium cursor-pointer"
          >
            Terms of Service
          </button>
        </div>
      </footer>

      <TermsModal isOpen={isTermsOpen} onClose={() => setIsTermsOpen(false)} />
      {!onOpenHowItWorks && (
        <HowItWorksModal
          isOpen={localHowItWorksOpen}
          onClose={() => setLocalHowItWorksOpen(false)}
        />
      )}
    </>
  );
}


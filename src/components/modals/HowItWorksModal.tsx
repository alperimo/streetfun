"use client";

import React, { useEffect } from "react";
import { X, TrendingUp, Landmark, Coins, Sparkles } from "lucide-react";

interface HowItWorksModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function HowItWorksModal({ isOpen, onClose }: HowItWorksModalProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleAcknowledge = () => {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem("streetfun:onboarded", "true");
      } catch {
        // storage disabled fallback
      }
    }
    onClose();
  };

  return (
    <div
      onClick={handleAcknowledge}
      role="dialog"
      aria-modal="true"
      aria-label="How StreetFun Works"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-[1px] animate-in fade-in duration-150"
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl max-h-[92vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-card-hover text-brand-cyan border border-border">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">How StreetFun Works</h2>
              <p className="text-xs text-muted">
                Equity-backed memecoin launchpad on Solana
              </p>
            </div>
          </div>
          <button
            onClick={handleAcknowledge}
            aria-label="Close dialog"
            className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-card-subtle transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 3 Clear Steps */}
        <div className="mt-5 space-y-3.5">
          {/* Step 1 */}
          <div className="rounded-xl border border-border bg-card-hover/40 p-4 transition-colors">
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-[11px] font-bold text-muted">
                STEP 01
              </span>
              <span className="rounded-md border border-brand-cyan/20 bg-brand-cyan/10 px-2 py-0.5 text-[10px] font-mono font-medium text-brand-cyan">
                LAUNCH & TRADE
              </span>
            </div>
            <div className="flex items-center gap-2 mb-1.5">
              <div className="flex h-6 w-6 items-center justify-center rounded-md border border-brand-cyan/20 bg-brand-cyan/10 text-brand-cyan">
                <TrendingUp className="h-3.5 w-3.5" />
              </div>
              <h3 className="text-sm font-bold text-foreground">
                Launch & Trade with Momentum
              </h3>
            </div>
            <p className="text-xs leading-relaxed text-muted pl-8">
              Launch a new token linked to pre-IPO stock (like SpaceX or OpenAI) or trade on the fair bonding curve paired with USDC.
            </p>
          </div>

          {/* Step 2 */}
          <div className="rounded-xl border border-border bg-card-hover/40 p-4 transition-colors">
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-[11px] font-bold text-muted">
                STEP 02
              </span>
              <span className="rounded-md border border-brand-cyan/20 bg-brand-cyan/10 px-2 py-0.5 text-[10px] font-mono font-medium text-brand-cyan">
                GRADUATION
              </span>
            </div>
            <div className="flex items-center gap-2 mb-1.5">
              <div className="flex h-6 w-6 items-center justify-center rounded-md border border-brand-cyan/20 bg-brand-cyan/10 text-brand-cyan">
                <Landmark className="h-3.5 w-3.5" />
              </div>
              <h3 className="text-sm font-bold text-foreground">
                Automatic Stock Backing
              </h3>
            </div>
            <p className="text-xs leading-relaxed text-muted pl-8">
              When the curve completes, 50% of liquidity acquires tokenized equity for the vault, and the token graduates to Meteora DEX.
            </p>
          </div>

          {/* Step 3 (Gold / Amber per AGENTS.md rule for Treasury & Redemption) */}
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 transition-colors">
            <div className="flex items-center justify-between mb-2">
              <span className="font-mono text-[11px] font-bold text-amber-300/80">
                STEP 03
              </span>
              <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-mono font-medium text-amber-300">
                VAULT FLOOR & REDEEM
              </span>
            </div>
            <div className="flex items-center gap-2 mb-1.5">
              <div className="flex h-6 w-6 items-center justify-center rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-300">
                <Coins className="h-3.5 w-3.5" />
              </div>
              <h3 className="text-sm font-bold text-foreground">
                Vault Floor & Equity Redemption
              </h3>
            </div>
            <p className="text-xs leading-relaxed text-muted pl-8">
              The acquired equity establishes a vault NAV floor. Token holders can burn their tokens at any time to redeem pro-rata underlying stock directly.
            </p>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-6">
          <button
            type="button"
            onClick={handleAcknowledge}
            className="w-full rounded-xl bg-brand-cyan py-3 text-sm font-bold text-slate-950 hover:opacity-90 transition-opacity shadow-md shadow-brand-cyan/20 cursor-pointer"
          >
            Got it, explore markets
          </button>
        </div>
      </div>
    </div>
  );
}

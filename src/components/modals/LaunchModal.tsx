"use client";

import React, { useState } from "react";
import Image from "next/image";
import { X, Rocket, ShieldCheck, Info } from "lucide-react";
import { VERIFIED_TOKENIZED_EQUITIES } from "@/sdk/constants";
import { TokenMetadata } from "@/lib/types";

interface LaunchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTokenCreated: (token: TokenMetadata) => void;
}

export function LaunchModal({
  isOpen,
  onClose,
  onTokenCreated,
}: LaunchModalProps) {
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [avatarUrl, setAvatarUrl] = useState(
    "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=160&q=80"
  );
  const [selectedEquitySymbol, setSelectedEquitySymbol] = useState("$SPCX");
  const [initialBuyUsdc, setInitialBuyUsdc] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const selectedEquity =
    VERIFIED_TOKENIZED_EQUITIES.find(
      (e) => e.symbol === selectedEquitySymbol
    ) || VERIFIED_TOKENIZED_EQUITIES[0];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !symbol) return;

    setIsSubmitting(true);

    setTimeout(() => {
      const randomMint = "SF" + Math.random().toString(36).substring(2, 12).toUpperCase() + "Mint";
      const initialBuyAmount = parseFloat(initialBuyUsdc) || 0;
      const initialQuoteReserves = initialBuyAmount;
      const progress = Math.min(Math.round((initialQuoteReserves / 60_000) * 100), 100);

      const newToken: TokenMetadata = {
        mint: randomMint,
        name,
        symbol: symbol.toUpperCase(),
        description: description || `Decentralized culture coin backed by ${selectedEquity.name} ($${selectedEquity.symbol}) via Backpack Securities UCC Article 8 custody.`,
        avatarUrl: avatarUrl || "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=160&q=80",
        creator: "You (Connected Wallet)",
        createdAt: "Just now",
        marketCapUsd: 150_000 + initialBuyAmount * 5,
        priceUsd: 0.00015,
        priceChange24h: 0.0,
        volume24hUsd: initialBuyAmount,
        targetEquity: {
          symbol: selectedEquity.symbol,
          name: selectedEquity.name,
          mintAddress: selectedEquity.mintAddress,
          custodian: selectedEquity.custodian,
          legalFramework: selectedEquity.legalFramework,
          logoUrl: selectedEquity.logoUrl,
          stockPriceUsd: selectedEquity.currentStockPriceUsd,
        },
        bondingCurve: {
          realQuoteReservesUsd: initialQuoteReserves,
          graduationThresholdUsd: 60_000,
          progressPct: progress,
          virtualQuoteReserves: "30000000000",
          virtualTokenReserves: "1073000000000000",
          realTokenReserves: "800000000000000",
          isGraduated: false,
        },
        treasury: {
          totalEquityLocked: 0,
          totalEquityValueUsd: 0,
          vaultPda: `${randomMint.slice(0, 4)}...Vault`,
        },
      };

      onTokenCreated(newToken);
      setIsSubmitting(false);
      onClose();
    }, 1000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-cyan/10 text-brand-cyan border border-brand-cyan/25">
              <Rocket className="h-4 w-4 stroke-[2.5]" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">Launch a Stonk</h2>
              <p className="text-xs text-muted">
                Create an instant bonding curve backed by real tokenized equity
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-5 space-y-4 text-xs">
          {/* Token Name & Ticker */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-muted font-medium mb-1">
                Token Name *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Mars Colony"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-border bg-card-subtle px-3 py-2 text-sm text-foreground placeholder-muted focus:border-brand-cyan focus:bg-card focus:outline-none shadow-xs"
              />
            </div>
            <div>
              <label className="block text-muted font-medium mb-1">
                Ticker Symbol *
              </label>
              <input
                type="text"
                required
                placeholder="e.g. MARS"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                className="w-full rounded-lg border border-border bg-card-subtle px-3 py-2 text-sm text-foreground placeholder-muted uppercase focus:border-brand-cyan focus:bg-card focus:outline-none shadow-xs"
              />
            </div>
          </div>

          {/* Target Backed Equity Selection */}
          <div>
            <label className="block text-muted font-medium mb-1 flex items-center justify-between">
              <span>Target Equity Backing</span>
              <span className="text-[10px] text-brand-emerald flex items-center gap-1 font-semibold">
                <ShieldCheck className="h-3.5 w-3.5" /> Verified Equity Vault
              </span>
            </label>
            <div className="grid grid-cols-3 gap-2">
              {VERIFIED_TOKENIZED_EQUITIES.map((eq) => {
                const isSelected = selectedEquitySymbol === eq.symbol;
                return (
                  <button
                    type="button"
                    key={eq.symbol}
                    onClick={() => setSelectedEquitySymbol(eq.symbol)}
                    className={`flex flex-col items-start p-2.5 rounded-lg border text-left transition-all ${
                      isSelected
                        ? "border-brand-cyan bg-brand-cyan/10 text-foreground shadow-sm"
                        : "border-border bg-card text-muted hover:border-brand-cyan/40 hover:text-foreground"
                    }`}
                  >
                    <div className="flex items-center gap-1.5 w-full">
                      <div className="relative h-4 w-4 rounded-full overflow-hidden flex-shrink-0">
                        <Image
                          src={eq.logoUrl}
                          alt={eq.name}
                          fill
                          className="object-cover"
                          sizes="16px"
                        />
                      </div>
                      <span className="font-bold text-xs">{eq.symbol}</span>
                    </div>
                    <span className="text-[10px] text-muted truncate w-full mt-1">
                      {eq.name}
                    </span>
                    <span className="text-[9px] font-mono text-slate-300 mt-0.5">
                      ${eq.currentStockPriceUsd}/sh
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-muted font-medium mb-1">
              Description
            </label>
            <textarea
              rows={2}
              placeholder="Tell the community about your thesis, meme lore, and equity redemption goal..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-border bg-card-subtle px-3 py-2 text-xs text-foreground placeholder-muted focus:border-border-active focus:bg-card focus:outline-none shadow-xs"
            />
          </div>

          {/* Avatar Image URL */}
          <div>
            <label className="block text-muted font-medium mb-1">
              Logo / Avatar URL
            </label>
            <input
              type="url"
              placeholder="https://..."
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              className="w-full rounded-lg border border-border bg-card-subtle px-3 py-2 text-xs text-foreground placeholder-muted focus:border-border-active focus:bg-card focus:outline-none shadow-xs"
            />
          </div>

          {/* Initial Snipe / Creator Buy */}
          <div>
            <label className="block text-muted font-medium mb-1 flex items-center justify-between">
              <span>Initial Buy (Optional)</span>
              <span className="text-[10px] text-muted">Protects against snipers</span>
            </label>
            <div className="relative">
              <input
                type="number"
                step="any"
                min="0"
                placeholder="0.00"
                value={initialBuyUsdc}
                onChange={(e) => setInitialBuyUsdc(e.target.value)}
                className="w-full rounded-lg border border-border bg-card-subtle pl-3 pr-16 py-2 text-sm text-foreground placeholder-muted focus:border-border-active focus:bg-card focus:outline-none shadow-xs"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-xs font-bold text-slate-300">
                USDC
              </span>
            </div>
          </div>

          {/* Mechanism Explainer Alert */}
          <div className="rounded-lg border border-border bg-card-subtle p-3 text-[11px] text-muted flex items-start gap-2">
            <Info className="h-4 w-4 text-slate-400 flex-shrink-0 mt-0.5" />
            <span>
              When $60,000 USDC is reached, 50% automatically buys real {selectedEquity.symbol} shares into an immutable treasury vault for token burning.
            </span>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-brand-cyan py-3 text-sm font-bold text-slate-950 hover:opacity-90 transition-opacity disabled:opacity-50 shadow-md shadow-brand-cyan/20 flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <span>Deploying to Solana...</span>
            ) : (
              <>
                <Rocket className="h-4 w-4 stroke-[2.5]" />
                <span>Launch Stonk on Solana</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

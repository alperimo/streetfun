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
  const [selectedEquitySymbol, setSelectedEquitySymbol] = useState("$TSPACEX");
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
        description: description || `Decentralized culture coin backed by ${selectedEquity.name} ($${selectedEquity.symbol}) via ${selectedEquity.issuer || "Tessera Private Equity"} ${selectedEquity.legalFramework}.`,
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
          issuer: selectedEquity.issuer,
          custodian: selectedEquity.custodian,
          legalFramework: selectedEquity.legalFramework,
          proofOfReserve: selectedEquity.proofOfReserve,
          meteoraPoolAddress: selectedEquity.meteoraPoolAddress,
          logoUrl: selectedEquity.logoUrl,
          stockPriceUsd: selectedEquity.currentStockPriceUsd,
          isPreIpo: selectedEquity.isPreIpo,
        },
        bondingCurve: {
          realQuoteReservesUsd: initialQuoteReserves,
          graduationThresholdUsd: 60_000,
          progressPct: progress,
          virtualQuoteReserves: "30000000000",
          virtualTokenReserves: "1073000000000000",
          realTokenReserves: "800000000000000",
          isGraduated: false,
          meteoraPoolAddress: `METdbc${randomMint.slice(0, 6)}Pool`,
          dynamicFeeBps: 20,
          equityPurchaseBudgetUsd: 30_000,
          ammLiquidityBudgetUsd: 30_000,
        },
        treasury: {
          totalEquityLocked: 0,
          totalEquityValueUsd: 0,
          vaultPda: `${randomMint.slice(0, 4)}...Vault`,
          proofOfReserveVerified: true,
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
            <div className="p-2 rounded-lg bg-brand-cyan/15 text-brand-cyan border border-brand-cyan/30">
              <Rocket className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">Launch on Meteora DBC</h2>
              <p className="text-xs text-muted">
                Dynamic Bonding Curve with Tessera Pre-IPO Treasury Backing
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-card-subtle transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="mt-5 space-y-4 text-xs">
          {/* Token Name & Ticker */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-muted font-medium mb-1">
                Token Name <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. Starship Doge"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-border bg-card-subtle px-3 py-2 text-xs text-foreground placeholder-muted focus:border-border-active focus:bg-card focus:outline-none shadow-xs"
              />
            </div>
            <div>
              <label className="block text-muted font-medium mb-1">
                Ticker Symbol <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                required
                placeholder="e.g. STAR"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                className="w-full rounded-lg border border-border bg-card-subtle px-3 py-2 text-xs text-foreground placeholder-muted focus:border-border-active focus:bg-card focus:outline-none uppercase shadow-xs"
              />
            </div>
          </div>

          {/* Target Backed Equity Selection */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-muted font-medium">
                Select Backing Asset (Tessera Pre-IPO / Tokenized Equity)
              </label>
              <span className="text-[10px] text-slate-300 font-mono flex items-center gap-1">
                <ShieldCheck className="h-3 w-3 text-slate-400" /> Pyth / On-Chain Verified
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {VERIFIED_TOKENIZED_EQUITIES.map((eq) => {
                const isSelected = selectedEquitySymbol === eq.symbol;
                return (
                  <button
                    type="button"
                    key={eq.symbol}
                    onClick={() => setSelectedEquitySymbol(eq.symbol)}
                    className={`flex flex-col items-start p-2.5 rounded-xl border text-left transition-all ${
                      isSelected
                        ? "border-brand-cyan bg-brand-cyan/10 text-foreground shadow-sm"
                        : "border-border bg-card text-muted hover:border-brand-cyan/40 hover:text-foreground"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-1.5">
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
                      {eq.isPreIpo ? (
                        <span className="text-[8px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-md bg-slate-800/40 text-slate-400 border border-slate-700/50 font-mono">
                          Pre-IPO
                        </span>
                      ) : null}
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
          <div className="rounded-xl border border-border bg-card-subtle p-3 text-[11px] text-muted flex items-start gap-2">
            <Info className="h-4 w-4 text-brand-cyan flex-shrink-0 mt-0.5" />
            <span className="leading-relaxed">
              <strong>Meteora DBC Graduation:</strong> At 60,000 USDC, 50% ($30k) spot-buys {selectedEquity.symbol} shares via Jupiter/Meteora into the Anchor Treasury PDA, and 50% ($30k) + leftover meme supply migrates to a permanent Meteora DLMM pool.
            </span>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-xl bg-brand-cyan py-3 text-sm font-bold text-slate-950 hover:opacity-90 transition-opacity disabled:opacity-50 shadow-md shadow-brand-cyan/20 flex items-center justify-center gap-2"
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

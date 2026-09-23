"use client";

import React, { useState } from "react";
import Image from "next/image";
import { X, Rocket, ShieldCheck, Info } from "lucide-react";
import { VERIFIED_TOKENIZED_EQUITIES } from "@/sdk/constants";
import { useRouter } from "next/navigation";
import { TokenMetadata } from "@/lib/types";
import { useMarket } from "@/context/MarketContext";

interface LaunchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTokenCreated?: (token: TokenMetadata) => void;
}

export function LaunchModal({
  isOpen,
  onClose,
  onTokenCreated,
}: LaunchModalProps) {
  const router = useRouter();
  const { launchToken, isMock } = useMarket();
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [avatarUrl, setAvatarUrl] = useState(
    "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=160&q=80"
  );
  const [selectedEquitySymbol, setSelectedEquitySymbol] = useState("$TSPACEX");
  const [initialBuyUsdc, setInitialBuyUsdc] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);

  if (!isOpen) return null;

  const selectedEquity =
    VERIFIED_TOKENIZED_EQUITIES.find(
      (e) => e.symbol === selectedEquitySymbol
    ) || VERIFIED_TOKENIZED_EQUITIES[0];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !symbol) return;

    setIsSubmitting(true);
    setLaunchError(null);

    try {
      const initialBuyAmount = parseFloat(initialBuyUsdc) || 0;
      const newToken = await launchToken({
        name,
        symbol: symbol.toUpperCase(),
        description:
          description ||
          `Decentralized culture coin backed by ${selectedEquity.name} ($${selectedEquity.symbol}) via ${
            selectedEquity.issuer || "Tessera Private Equity"
          } ${selectedEquity.legalFramework}.`,
        avatarUrl:
          avatarUrl ||
          "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=160&q=80",
        targetEquitySymbol: selectedEquity.symbol,
        initialBuyUsdc: initialBuyAmount,
      });

      if (onTokenCreated) {
        onTokenCreated(newToken);
      }
      onClose();
      router.push(`/token/${newToken.mint}`);
    } catch (err) {
      console.error("Failed to launch token:", err);
      setLaunchError(err instanceof Error ? err.message : "Token launch failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-[1px] animate-in fade-in duration-150">
      <div
        className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-card-hover text-brand-cyan border border-border">
              <Rocket className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">Launch Token</h2>
              <p className="text-xs text-muted">
                Create an on-chain equity-backed token deployed to Solana Devnet
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
          {launchError && <p role="alert" className="text-rose-400">{launchError}</p>}
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
                Select Backing Asset
              </label>
              <span className="text-[10px] text-slate-300 font-mono flex items-center gap-1">
                <ShieldCheck className="h-3 w-3 text-slate-400" />
                {isMock ? "Demo asset catalog" : "Target asset catalog"}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {VERIFIED_TOKENIZED_EQUITIES.map((eq) => {
                const isSelected = selectedEquitySymbol === eq.symbol;
                return (
                  <button
                    type="button"
                    key={eq.symbol}
                    onClick={() => setSelectedEquitySymbol(eq.symbol)}
                    className={`flex flex-col justify-between p-3 rounded-xl border text-left transition-all ${
                      isSelected
                        ? "border-brand-cyan bg-brand-cyan/10 text-foreground shadow-xs"
                        : "border-border bg-card text-muted hover:border-brand-cyan/40 hover:text-foreground"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="relative h-5 w-5 rounded-full overflow-hidden flex-shrink-0 border border-border">
                          <Image
                            src={eq.logoUrl}
                            alt={eq.name}
                            fill
                            className="object-cover"
                            sizes="20px"
                          />
                        </div>
                        <span className="font-bold text-xs text-foreground tracking-tight">{eq.symbol}</span>
                      </div>
                      <span className="text-[9px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-md bg-slate-800/70 text-slate-300 border border-slate-700/60 font-mono whitespace-nowrap">
                        {eq.isPreIpo ? "Pre-IPO" : "Public"}
                      </span>
                    </div>
                    <div className="flex items-center justify-between w-full mt-2 pt-1.5 border-t border-border/40">
                      <span className="text-[11px] font-medium text-slate-300">
                        {eq.name}
                      </span>
                      <span className="text-[11px] font-mono font-medium text-muted">
                        ${eq.currentStockPriceUsd}/sh
                      </span>
                    </div>
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
            <label className="block text-muted font-medium mb-1">
              Initial Buy (Optional)
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
              <strong className="text-foreground">Graduation Mechanism:</strong> At 60 USDC graduation, 50% ($30) automatically acquires {selectedEquity.symbol} equity shares into the treasury vault, and 50% ($30) funds permanent liquidity.
            </span>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-xl bg-brand-cyan py-3 text-sm font-bold text-slate-950 hover:opacity-90 transition-opacity disabled:opacity-50 shadow-md shadow-brand-cyan/20 flex items-center justify-center gap-2 cursor-pointer"
          >
            {isSubmitting ? (
              <span>Deploying to Devnet...</span>
            ) : (
              <>
                <Rocket className="h-4 w-4 stroke-[2.5]" />
                <span>Launch Token</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

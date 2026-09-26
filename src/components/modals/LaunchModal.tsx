"use client";

import React, { useState, useEffect } from "react";
import Image from "next/image";
import { X, Rocket, ShieldCheck, Info } from "lucide-react";
import type { TesseraPreIpoAsset } from "@/sdk/constants";
import { DEMO_TOKENIZED_EQUITIES } from "@/lib/demoAssets";
import { useRouter } from "next/navigation";
import { TokenMetadata } from "@/lib/types";
import { useMarket } from "@/context/MarketContext";

interface LaunchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTokenCreated?: (token: TokenMetadata) => void;
}

type LaunchAsset = TesseraPreIpoAsset & {
  currentStockPriceUsd: number;
  launchEnabled?: boolean;
  unavailableReason?: string;
  provider?: string;
  priceSource?: string;
  testCollateral?: boolean;
};

export function LaunchModal({
  isOpen,
  onClose,
  onTokenCreated,
}: LaunchModalProps) {
  const router = useRouter();
  const { launchToken, isMock } = useMarket();
  const isDevnet = (process.env.NEXT_PUBLIC_SOLANA_NETWORK || "devnet") === "devnet";
  const usesDevnetTestAssets = isDevnet && !isMock;
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [selectedEquitySymbol, setSelectedEquitySymbol] = useState("$TSPACEX");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);

  const [providerFilter, setProviderFilter] = useState<"prestocks" | "tessera" | "all">("all");
  const [liveAssets, setLiveAssets] = useState<LaunchAsset[]>([]);
  const [assetError, setAssetError] = useState<string | null>(null);
  const [isLoadingAssets, setIsLoadingAssets] = useState(false);
  const assets: LaunchAsset[] = isMock ? DEMO_TOKENIZED_EQUITIES : liveAssets;

  const filteredAssets = assets.filter((eq: any) => {
    if (providerFilter === "all") return true;
    if (providerFilter === "prestocks") return eq.provider === "prestocks" || eq.issuer?.includes("PreStocks");
    if (providerFilter === "tessera") {
      return usesDevnetTestAssets
        ? eq.testCollateral === true
        : eq.provider !== "prestocks" && !eq.issuer?.includes("PreStocks");
    }
    return true;
  });

  useEffect(() => {
    if (!isOpen || isMock) return;
    const controller = new AbortController();
    setAssetError(null);
    setIsLoadingAssets(true);
    fetch("/api/assets", { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error(usesDevnetTestAssets
        ? "Devnet test collateral is unavailable."
        : "Verified Pre-IPO assets are unavailable.");
      const data = await response.json();
      setLiveAssets(data.assets);
      if (!data.assets.some((asset: any) => asset.launchEnabled)) {
        setAssetError(data.assets.some((asset: any) => asset.existsOnConfiguredNetwork)
          ? "No backing market can currently quote the configured graduation allocation."
          : usesDevnetTestAssets
            ? "No StreetFun Devnet test collateral is available on this network."
            : "No verified provider asset exists on this Solana network.");
      }
      const first = data.assets.find((a: any) => a.launchEnabled) || data.assets[0];
      if (first) setSelectedEquitySymbol(first.symbol);
    }).catch(error => { if (!controller.signal.aborted) setAssetError(error.message); })
      .finally(() => { setIsLoadingAssets(false); });
    return () => controller.abort();
  }, [isOpen, isMock]);
  useEffect(() => {
    if (!isOpen) return;
    const dismiss = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", dismiss);
    return () => window.removeEventListener("keydown", dismiss);
  }, [isOpen, onClose]);
  if (!isOpen) return null;

  const selectedEquity =
    filteredAssets.find((e) => e.symbol === selectedEquitySymbol) ||
    assets.find((e) => e.symbol === selectedEquitySymbol) ||
    filteredAssets[0] ||
    assets[0];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !symbol || !selectedEquity) return;

    setIsSubmitting(true);
    setLaunchError(null);

    try {
      const newToken = await launchToken({
        name,
        symbol: symbol.toUpperCase(),
        description: description || `${name.trim()} is a StreetFun token targeting ${selectedEquity.name} (${selectedEquity.symbol}).`,
        avatarUrl: avatarUrl.trim(),
        targetEquitySymbol: selectedEquity.symbol,
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
    <div onClick={onClose} role="dialog" aria-modal="true" aria-label="Launch Token" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/30 backdrop-blur-[1px] animate-in fade-in duration-150">
      <div
        className="w-full max-w-lg rounded-2xl border border-border bg-card p-6 shadow-2xl max-h-[92vh] overflow-y-auto"
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
                Choose a backing asset for your token
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
          {assetError && <p role="alert" className="text-rose-400">{assetError}</p>}
          {!isMock && Boolean(selectedEquity && "unavailableReason" in selectedEquity && (selectedEquity as any).unavailableReason) && (
            <p role="status" className="text-amber-300">{String((selectedEquity as any).unavailableReason)}</p>
          )}
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

          {/* Target Asset Selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-muted font-medium">
                Select Target Asset
              </label>
              {usesDevnetTestAssets ? (
                <p className="max-w-56 text-right text-[10px] leading-relaxed text-muted">
                  StreetFun test collateral; not issued by PreStocks or Tessera.
                </p>
              ) : (
                <div className="flex items-center gap-1 rounded-lg border border-border bg-card-subtle p-0.5">
                  <button
                    type="button"
                    onClick={() => setProviderFilter("prestocks")}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all ${
                      providerFilter === "prestocks"
                        ? "bg-brand-cyan/20 border border-brand-cyan/40 text-brand-cyan"
                        : "text-muted hover:text-foreground"
                    }`}
                  >
                    PreStocks (Official)
                  </button>
                  <button
                    type="button"
                    onClick={() => setProviderFilter("tessera")}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all ${
                      providerFilter === "tessera"
                        ? "bg-brand-cyan/20 border border-brand-cyan/40 text-brand-cyan"
                        : "text-muted hover:text-foreground"
                    }`}
                  >
                    Tessera
                  </button>
                  <button
                    type="button"
                    onClick={() => setProviderFilter("all")}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition-all ${
                      providerFilter === "all"
                        ? "bg-brand-cyan/20 border border-brand-cyan/40 text-brand-cyan"
                        : "text-muted hover:text-foreground"
                    }`}
                  >
                    All
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-56 overflow-y-auto pr-1">
              {isLoadingAssets ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex flex-col justify-between p-3 rounded-xl border border-border bg-card animate-pulse"
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className="flex items-center gap-2">
                        <div className="h-5 w-5 rounded-full bg-card-hover flex-shrink-0" />
                        <div className="h-3 w-14 rounded bg-card-hover" />
                      </div>
                      <div className="h-4 w-12 rounded-md bg-card-hover" />
                    </div>
                    <div className="flex items-center justify-between w-full mt-2 pt-1.5 border-t border-border/40">
                      <div className="h-3 w-20 rounded bg-card-hover" />
                      <div className="h-3 w-16 rounded bg-card-hover" />
                    </div>
                  </div>
                ))
              ) : filteredAssets.length === 0 ? (
                <p className="rounded-xl border border-border bg-card p-4 text-muted">
                  {usesDevnetTestAssets
                    ? "No test collateral is available on this network."
                    : "No launchable assets from this provider on the configured network."}
                </p>
              ) : (
                filteredAssets.map((eq) => {
                  const isSelected = selectedEquitySymbol === eq.symbol;
                  const price = Number.isFinite(eq.currentStockPriceUsd) && eq.currentStockPriceUsd > 0
                    ? eq.currentStockPriceUsd
                    : 0;
                  const priceLabel = eq.testCollateral
                    ? "test market"
                    : eq.priceSource === "prestocks-api"
                      ? "provider mark"
                      : "mark";
                  return (
                    <button
                      type="button"
                      key={eq.symbol}
                      disabled={!isMock && !eq.launchEnabled}
                      onClick={() => setSelectedEquitySymbol(eq.symbol)}
                      className={`flex flex-col justify-between p-3 rounded-xl border text-left transition-all ${
                        isSelected
                          ? "border-brand-cyan bg-brand-cyan/10 text-foreground shadow-xs"
                          : !isMock && !eq.launchEnabled
                            ? "border-border bg-card text-muted opacity-55 cursor-not-allowed"
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
                          {eq.testCollateral ? "Devnet test" : eq.isPreIpo ? "Pre-IPO" : "Public"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between w-full mt-2 pt-1.5 border-t border-border/40">
                        <span className="text-[11px] font-medium text-slate-300 truncate max-w-[120px]">
                          {eq.name}
                        </span>
                        <span className="text-[11px] font-mono font-medium text-muted">
                          {price > 0 ? `$${price.toLocaleString()} ${priceLabel}` : "No live quote"}
                        </span>
                      </div>
                    </button>
                  );
                })
              )}
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

          {/* Mechanism Explainer Alert */}
          <div className="rounded-xl border border-border bg-card-subtle p-3 text-[11px] text-muted flex items-start gap-2">
            <Info className="h-4 w-4 text-brand-cyan flex-shrink-0 mt-0.5" />
            <span className="leading-relaxed">
              <strong className="text-foreground">Graduation:</strong> The curve migrates to Meteora DAMM v2, then settlement verifies the collateral swap and resulting pool before marking the token graduated.
            </span>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting || (!isMock && (!selectedEquity || !("launchEnabled" in selectedEquity) || !selectedEquity.launchEnabled))}
            className="w-full rounded-xl bg-brand-cyan py-3 text-sm font-bold text-slate-950 hover:opacity-90 transition-opacity disabled:opacity-50 shadow-md shadow-brand-cyan/20 flex items-center justify-center gap-2 cursor-pointer"
          >
            {isSubmitting ? (
              <span>Preparing launch...</span>
            ) : (
              <>
                <Rocket className="h-4 w-4 stroke-[2.5]" />
                <span>{selectedEquity && "testCollateral" in selectedEquity && selectedEquity.testCollateral ? "Launch Devnet Token" : "Launch Token"}</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

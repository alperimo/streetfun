"use client";

import React, { useState } from "react";
import { Check, Copy, Share2, Sparkles, ShieldCheck, Zap, Layers } from "lucide-react";
import { StreetFunLogo } from "@/components/common/StreetFunLogo";

interface AlphaPassCardProps {
  passNumber: number;
  walletAddress: string;
  xHandle?: string;
  onUpdateXHandle?: (handle: string) => Promise<void>;
}

export function AlphaPassCard({
  passNumber,
  walletAddress,
  xHandle: initialXHandle,
  onUpdateXHandle,
}: AlphaPassCardProps) {
  const [copied, setCopied] = useState(false);
  const [xHandleInput, setXHandleInput] = useState(initialXHandle || "");
  const [isSavingX, setIsSavingX] = useState(false);
  const [xSaved, setXSaved] = useState(Boolean(initialXHandle));

  const truncatedWallet = `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`;
  const formattedPassNumber = String(passNumber).padStart(4, "0");

  const handleCopyWallet = () => {
    navigator.clipboard.writeText(walletAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShareOnX = () => {
    const tweetText = `Just claimed my @streetfunxyz Alpha Pass #${formattedPassNumber} 🐂\n\nWall Street is coming to Solana memecoins with tokenized equity backing.\n\nClaim your Day-1 0% fee pass: https://streetfun.fun`;
    const shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
    window.open(shareUrl, "_blank", "noopener,noreferrer");
  };

  const handleSaveXHandle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!xHandleInput.trim() || !onUpdateXHandle) return;
    setIsSavingX(true);
    try {
      await onUpdateXHandle(xHandleInput.trim());
      setXSaved(true);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSavingX(false);
    }
  };

  return (
    <div className="w-full max-w-[500px] animate-in fade-in-0 zoom-in-95 duration-300">
      {/* The Holographic VIP Alpha Pass Card */}
      <div className="group relative overflow-hidden rounded-3xl border border-brand-cyan/40 bg-gradient-to-b from-[#101722] via-[#0c121a] to-[#070b10] p-6 sm:p-8 shadow-[0_20px_50px_-15px_rgba(0,0,0,0.9),0_0_30px_-5px_rgba(199,242,132,0.15)]">
        {/* Holographic Angle Sheen */}
        <div
          className="pointer-events-none absolute -inset-full bg-gradient-to-tr from-transparent via-brand-cyan/[0.07] to-transparent opacity-70 group-hover:opacity-100 transition-opacity duration-500 rotate-12"
          aria-hidden="true"
        />
        {/* Top Edge Bevel */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-cyan/50 to-transparent"
          aria-hidden="true"
        />

        {/* Card Header: Brand & Pass Tag */}
        <div className="relative flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <StreetFunLogo size={32} className="h-8 w-8 text-brand-cyan drop-shadow-[0_0_8px_rgba(199,242,132,0.4)]" />
            <div>
              <div className="text-base font-black tracking-tight text-foreground">StreetFun</div>
              <div className="text-[10px] font-mono tracking-widest uppercase text-muted">Solana Equity Engine</div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 rounded-full border border-brand-cyan/30 bg-brand-cyan/10 px-3 py-1 text-[11px] font-semibold text-brand-cyan shadow-[0_0_10px_rgba(199,242,132,0.2)]">
            <Sparkles className="h-3 w-3 animate-pulse text-brand-cyan" />
            <span>GENESIS PASS</span>
          </div>
        </div>

        {/* Pass Number Display */}
        <div className="relative mt-8 text-center sm:text-left">
          <div className="text-xs font-mono font-medium tracking-wider text-muted uppercase">
            Alpha Member Identifier
          </div>
          <div className="mt-1 flex items-baseline justify-center sm:justify-start gap-2">
            <span className="font-mono text-4xl sm:text-5xl font-black tracking-tighter text-foreground drop-shadow-sm">
              #{formattedPassNumber}
            </span>
            <span className="font-mono text-sm font-semibold text-muted">/ 1,000</span>
          </div>
        </div>

        {/* Wallet Address Bar */}
        <div className="relative mt-6 flex items-center justify-between rounded-xl border border-border bg-card/60 px-3.5 py-2.5 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]" />
            <span className="text-xs font-mono font-medium text-foreground">{truncatedWallet}</span>
          </div>

          <button
            onClick={handleCopyWallet}
            title="Copy wallet address"
            className="flex items-center gap-1 rounded-lg border border-border bg-card-subtle px-2 py-1 text-[11px] font-mono text-muted hover:text-foreground transition-colors"
          >
            {copied ? (
              <>
                <Check className="h-3 w-3 text-emerald-400" />
                <span className="text-emerald-400">Copied</span>
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                <span>Copy</span>
              </>
            )}
          </button>
        </div>

        {/* Unlocked Perks Matrix */}
        <div className="relative mt-6 space-y-2 border-t border-border/60 pt-5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">
            Unlocked Genesis Privileges
          </div>

          <div className="grid grid-cols-1 gap-2 text-xs">
            <div className="flex items-center gap-2.5 rounded-lg border border-border/40 bg-card/30 p-2.5">
              <Zap className="h-4 w-4 shrink-0 text-brand-cyan" />
              <span className="text-foreground font-medium">Day-1 0% Platform Launch Fees</span>
            </div>
            <div className="flex items-center gap-2.5 rounded-lg border border-border/40 bg-card/30 p-2.5">
              <ShieldCheck className="h-4 w-4 shrink-0 text-brand-cyan" />
              <span className="text-foreground font-medium">Genesis Equity Vault Whitelist (Pre-IPO)</span>
            </div>
            <div className="flex items-center gap-2.5 rounded-lg border border-border/40 bg-card/30 p-2.5">
              <Layers className="h-4 w-4 shrink-0 text-brand-cyan" />
              <span className="text-foreground font-medium">Devnet Closed Beta VIP Access</span>
            </div>
          </div>
        </div>
      </div>

      {/* Action: Share on X / Boost */}
      <div className="mt-5 space-y-3">
        <button
          onClick={handleShareOnX}
          className="flex w-full items-center justify-center gap-2.5 rounded-2xl border border-brand-cyan bg-brand-cyan px-5 py-3.5 text-sm font-bold text-background shadow-lg shadow-brand-cyan/25 transition-all hover:brightness-110 hover:shadow-brand-cyan/40 cursor-pointer"
        >
          <Share2 className="h-4 w-4 stroke-[2.5]" />
          <span>Share Alpha Pass on X (Boost Rank)</span>
        </button>

        {/* Optional X Handle Linking */}
        {!xSaved ? (
          <form onSubmit={handleSaveXHandle} className="flex items-center gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xs text-muted font-mono">@</span>
              <input
                type="text"
                placeholder="twitter_handle (optional)"
                value={xHandleInput}
                onChange={(e) => setXHandleInput(e.target.value)}
                className="w-full rounded-xl border border-border bg-card pl-8 pr-3 py-2 text-xs text-foreground placeholder-muted focus:border-brand-cyan focus:outline-none transition-colors"
              />
            </div>
            <button
              type="submit"
              disabled={isSavingX || !xHandleInput.trim()}
              className="rounded-xl border border-border bg-card-hover px-3 py-2 text-xs font-semibold text-foreground hover:border-border-active disabled:opacity-50 transition-colors"
            >
              {isSavingX ? "Saving..." : "Link Handle"}
            </button>
          </form>
        ) : (
          <div className="text-center text-xs text-emerald-400 font-mono">
            ✓ X handle linked: @{xHandleInput.replace(/^@/, "")}
          </div>
        )}
      </div>
    </div>
  );
}

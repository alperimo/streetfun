"use client";

import React, { useEffect } from "react";
import { X, ShieldCheck, Zap, Layers, Wallet, ArrowRight, Loader2 } from "lucide-react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { AlphaPassCard } from "@/components/alpha/AlphaPassCard";
import { useAlphaPass } from "@/context/AlphaPassContext";

export function WaitlistModal() {
  const { connected, publicKey } = useWallet();
  const { setVisible: setWalletModalVisible } = useWalletModal();
  const {
    passData,
    isWaitlistOpen,
    closeWaitlist,
    claimPass,
    isSigning,
    errorMsg,
    updateXHandle,
    clearError,
  } = useAlphaPass();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isWaitlistOpen) {
        closeWaitlist();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isWaitlistOpen, closeWaitlist]);

  if (!isWaitlistOpen) return null;

  const truncatedWallet = publicKey
    ? `${publicKey.toBase58().slice(0, 4)}...${publicKey.toBase58().slice(-4)}`
    : "";

  return (
    <div
      onClick={closeWaitlist}
      role="dialog"
      aria-modal="true"
      aria-label="Mainnet Genesis Waitlist"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-150 overflow-y-auto"
    >
      <div
        className="w-full max-w-lg rounded-3xl border border-border bg-card p-6 sm:p-7 shadow-2xl my-auto transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Top Bar */}
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-brand-cyan/30 bg-brand-cyan/10 text-brand-cyan">
              <Layers className="h-4.5 w-4.5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-foreground">Mainnet Waitlist</h2>
                <span className="rounded-full border border-brand-cyan/30 bg-brand-cyan/10 px-2 py-0.5 text-[10px] font-mono font-medium text-brand-cyan">
                  EARLY ACCESS
                </span>
              </div>
              <p className="text-xs text-muted">
                Early access & platform launch privileges
              </p>
            </div>
          </div>
          <button
            onClick={closeWaitlist}
            aria-label="Close dialog"
            className="p-1.5 rounded-lg text-muted hover:text-foreground hover:bg-card-subtle transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        {passData ? (
          <div className="mt-5 flex flex-col items-center">
            <div className="mb-4 text-center">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400">
                Waitlist Confirmed
              </span>
              <p className="mt-1.5 text-xs text-muted">
                Your pass is registered in the database for Mainnet launch.
              </p>
            </div>
            <AlphaPassCard
              passNumber={passData.passNumber}
              walletAddress={passData.walletAddress}
              xHandle={passData.xHandle}
              onUpdateXHandle={updateXHandle}
            />
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            {/* Description Card */}
            <div className="rounded-2xl border border-border bg-card-hover/40 p-4 sm:p-5">
              <p className="text-xs leading-relaxed text-muted">
                StreetFun is currently live on <strong className="text-foreground">Solana Devnet</strong>. Join the waitlist for early access and zero platform fees when we launch on Solana Mainnet.
              </p>

              <div className="mt-4 space-y-2.5">
                <div className="flex items-start gap-2.5 text-xs">
                  <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-brand-cyan/20 bg-brand-cyan/10 text-brand-cyan">
                    <Zap className="h-3 w-3" />
                  </div>
                  <div>
                    <span className="font-semibold text-foreground">Day-1 0% Platform Launch Fees</span>
                    <p className="text-[11px] text-muted">Trade fair bonding curves without platform fees at launch.</p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5 text-xs">
                  <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-brand-cyan/20 bg-brand-cyan/10 text-brand-cyan">
                    <ShieldCheck className="h-3 w-3" />
                  </div>
                  <div>
                    <span className="font-semibold text-foreground">Platform Early Access</span>
                    <p className="text-[11px] text-muted">Priority access when new equity-backed markets launch.</p>
                  </div>
                </div>

                <div className="flex items-start gap-2.5 text-xs">
                  <div className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-brand-cyan/20 bg-brand-cyan/10 text-brand-cyan">
                    <Layers className="h-3 w-3" />
                  </div>
                  <div>
                    <span className="font-semibold text-foreground">Numbered Member Pass</span>
                    <p className="text-[11px] text-muted">Numbered member pass limited to the first 1,000 signups.</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Error Message */}
            {errorMsg && (
              <div role="alert" className="flex items-center justify-between rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-300">
                <span>{errorMsg}</span>
                <button
                  onClick={clearError}
                  className="text-[11px] font-bold underline hover:no-underline ml-2"
                >
                  Dismiss
                </button>
              </div>
            )}

            {/* Action Buttons */}
            <div className="pt-1">
              {!connected ? (
                <button
                  type="button"
                  onClick={() => setWalletModalVisible(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-cyan py-3.5 text-sm font-bold text-slate-950 shadow-md shadow-brand-cyan/20 transition-opacity hover:opacity-90 cursor-pointer"
                >
                  <Wallet className="h-4 w-4" />
                  <span>Connect Wallet to Join</span>
                  <ArrowRight className="h-4 w-4 ml-1" />
                </button>
              ) : (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between rounded-xl border border-border bg-card-subtle px-3 py-2 text-xs font-mono">
                    <span className="text-muted">Connected wallet:</span>
                    <span className="font-semibold text-foreground">{truncatedWallet}</span>
                  </div>

                  <button
                    type="button"
                    onClick={claimPass}
                    disabled={isSigning}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-cyan py-3.5 text-sm font-bold text-slate-950 shadow-md shadow-brand-cyan/20 transition-all hover:opacity-90 disabled:opacity-50 cursor-pointer"
                  >
                    {isSigning ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Confirm in wallet...</span>
                      </>
                    ) : (
                      <>
                        <span>Join Waitlist</span>
                        <ArrowRight className="h-4 w-4 ml-1" />
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

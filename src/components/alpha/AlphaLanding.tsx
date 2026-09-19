"use client";

import React, { useState, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import bs58 from "bs58";
import { Wallet, Share2, RefreshCw } from "lucide-react";
import { StreetFunLogo } from "@/components/common/StreetFunLogo";
import { BullArtwork } from "@/components/home/BullArtwork";
import { TermsModal } from "@/components/modals/TermsModal";

interface PassData {
  passNumber: number;
  walletAddress: string;
  xHandle?: string;
  createdAt: string;
  isNew?: boolean;
}

export function AlphaLanding() {
  const { connected, publicKey, signMessage, disconnect } = useWallet();
  const { setVisible: setWalletModalVisible } = useWalletModal();

  const [passData, setPassData] = useState<PassData | null>(null);
  const [isSigning, setIsSigning] = useState(false);
  const [isTermsOpen, setIsTermsOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Check demo_pass query or existing pass in localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("demo_pass") === "true") {
        setPassData({
          passNumber: 421,
          walletAddress: "7xKpQvD9mZaN8bK3YwE5cF2rL4pG1sT6vU8xW9zB2n",
          createdAt: new Date().toISOString(),
          isNew: true,
        });
        return;
      }
    }

    if (publicKey) {
      const stored = localStorage.getItem(`streetfun_alpha_${publicKey.toBase58()}`);
      if (stored) {
        try {
          setPassData(JSON.parse(stored));
        } catch {
          // ignore
        }
      } else {
        setPassData(null);
      }
    } else {
      setPassData(null);
    }
  }, [publicKey]);

  const handleClaimPass = async () => {
    if (!connected || !publicKey) {
      setWalletModalVisible(true);
      return;
    }

    if (!signMessage) {
      setErrorMsg("Your wallet does not support message signing.");
      return;
    }

    setIsSigning(true);
    setErrorMsg(null);

    try {
      const walletAddress = publicKey.toBase58();
      const nonce = Math.random().toString(36).substring(2, 10);
      const timestamp = new Date().toISOString();

      const messageText = `streetfun.fun wants you to sign in with your Solana account:\n${walletAddress}\n\nI accept the StreetFun Terms of Service and claim my StreetFun Genesis Alpha Pass.\n\nNonce: ${nonce}\nIssued At: ${timestamp}`;

      const messageBytes = new TextEncoder().encode(messageText);
      const signatureBytes = await signMessage(messageBytes);
      const signatureBase58 = bs58.encode(signatureBytes);

      const res = await fetch("/api/alpha/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress,
          signature: signatureBase58,
          message: messageText,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to claim");
      }

      setPassData(data.pass);
      localStorage.setItem(`streetfun_alpha_${walletAddress}`, JSON.stringify(data.pass));
    } catch (err: any) {
      console.error("Alpha Pass Claim error:", err);
      if (err.name === "WalletSignMessageError" || err.message?.includes("User rejected")) {
        setErrorMsg("Signature cancelled.");
      } else {
        setErrorMsg(err.message || "Failed to verify signature.");
      }
    } finally {
      setIsSigning(false);
    }
  };

  const handleShareOnX = () => {
    if (!passData) return;
    const formattedNum = String(passData.passNumber).padStart(4, "0");
    const tweetText = `Just claimed my @StreetFunSol Alpha Pass #${formattedNum} 🐂\n\nWall Street is coming to Solana memecoins.\n\nGet early access: https://streetfun.fun`;
    const shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;
    window.open(shareUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="relative min-h-screen flex flex-col bg-background text-foreground selection:bg-brand-cyan/20 selection:text-brand-cyan overflow-x-hidden">
      {/* Top Header - Ultra Minimalist */}
      <header className="site-header sticky top-0 z-40 w-full border-b border-border bg-background backdrop-blur-md">
        <div className="mx-auto flex h-[80px] w-full max-w-[1350px] items-center justify-between px-6 sm:px-10 lg:px-0">
          <div className="flex items-center gap-3">
            <StreetFunLogo size={34} className="h-[34px] w-[34px] text-brand-cyan" />
            <span className="text-[21px] font-bold tracking-[-0.04em] text-foreground">
              StreetFun
            </span>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="hero-section relative isolate flex-1 flex flex-col justify-center py-12 sm:py-20 overflow-hidden">
        {/* Wall Street Bull Artwork */}
        <BullArtwork />

        <div className="relative mx-auto w-full max-w-[1350px] px-6 sm:px-10 lg:px-0 z-10">
          <div className="max-w-[620px]">
            <h1 className="text-4xl sm:text-6xl lg:text-[68px] font-black leading-[0.98] tracking-[-0.05em] text-foreground">
              Wall Street Floor <br />
              For <span className="text-brand-cyan">Memecoins</span>
            </h1>

            <p className="mt-4 text-base sm:text-lg text-muted">
              Trade viral momentum. Graduate to real equities.
            </p>

            {/* Single Elegant Action Area */}
            <div className="mt-8 max-w-[380px]">
              {!passData ? (
                <div>
                  {!connected ? (
                    <div>
                      <button
                        onClick={() => setWalletModalVisible(true)}
                        className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-brand-cyan bg-brand-cyan px-6 py-3.5 text-sm font-bold text-background shadow-md shadow-brand-cyan/20 transition-all hover:brightness-110 hover:shadow-brand-cyan/30 cursor-pointer"
                      >
                        <Wallet className="h-4 w-4" />
                        <span>Connect Wallet for Alpha Access</span>
                      </button>

                      <div className="mt-3 text-[11px] text-muted text-center sm:text-left">
                        By connecting, you agree to the{" "}
                        <button
                          onClick={() => setIsTermsOpen(true)}
                          className="text-foreground underline hover:text-brand-cyan"
                        >
                          Terms
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between rounded-xl border border-border bg-card px-3.5 py-2 text-xs font-mono">
                        <span className="text-muted">
                          {publicKey?.toBase58().slice(0, 4)}...{publicKey?.toBase58().slice(-4)}
                        </span>
                        <button
                          onClick={() => disconnect()}
                          className="text-muted hover:text-foreground text-[11px]"
                        >
                          Disconnect
                        </button>
                      </div>

                      <button
                        onClick={handleClaimPass}
                        disabled={isSigning}
                        className="flex w-full items-center justify-center gap-2 rounded-xl border border-brand-cyan bg-brand-cyan px-6 py-3.5 text-sm font-bold text-background transition-all hover:brightness-110 disabled:opacity-60 cursor-pointer"
                      >
                        {isSigning ? (
                          <>
                            <RefreshCw className="h-4 w-4 animate-spin" />
                            <span>Confirming in Wallet...</span>
                          </>
                        ) : (
                          <span>Get Alpha Access</span>
                        )}
                      </button>

                      {errorMsg && (
                        <div className="text-xs text-rose-400 text-center font-mono">
                          {errorMsg}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Clean, Refined Terminal Badge (No Amateur Snackbars) */}
                  <div className="flex items-center justify-between rounded-xl border border-border bg-card px-4 py-3">
                    <div>
                      <div className="text-[10px] font-mono uppercase text-muted tracking-wider">
                        Alpha Pass
                      </div>
                      <div className="font-mono text-2xl font-black text-foreground">
                        #{String(passData.passNumber).padStart(4, "0")}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-[11px] font-mono text-muted">
                        {passData.walletAddress.slice(0, 4)}...{passData.walletAddress.slice(-4)}
                      </div>
                      <div className="text-xs font-semibold text-brand-cyan">
                        Day-1 0% Fee Unlocked
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={handleShareOnX}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-brand-cyan bg-brand-cyan px-5 py-3 text-sm font-bold text-background transition-all hover:brightness-110 cursor-pointer"
                  >
                    <Share2 className="h-4 w-4" />
                    <span>Share on X</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Clean Footer */}
      <footer className="w-full border-t border-border bg-background py-5 text-xs text-muted">
        <div className="mx-auto flex w-full max-w-[1350px] items-center justify-between px-6 sm:px-10 lg:px-0">
          <div className="font-mono text-[11px] text-muted">StreetFun © 2026</div>
          <button
            onClick={() => setIsTermsOpen(true)}
            className="hover:text-foreground transition-colors font-medium text-[11px]"
          >
            Terms of Service
          </button>
        </div>
      </footer>

      <TermsModal isOpen={isTermsOpen} onClose={() => setIsTermsOpen(false)} />
    </div>
  );
}

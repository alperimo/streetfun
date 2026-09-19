"use client";

import { createPortal } from "react-dom";
import React, { useState, useRef, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletReadyState } from "@solana/wallet-adapter-base";
import { Wallet, Copy, Check, LogOut, Terminal, ExternalLink } from "lucide-react";
import { useMarket } from "@/context/MarketContext";
import { useWalletConnectionError } from "./WalletProvider";

export function WalletButton() {
  const { connected, publicKey, disconnect, connecting, wallets, select } = useWallet();
  const { isWalletConnected, walletPublicKey, connectDevWallet, disconnectDevWallet, isMock, walletDialogOpen: connectMenuOpen, setWalletDialogOpen: setConnectMenuOpen } = useMarket();
  const { error: walletError, clearError: clearWalletError } = useWalletConnectionError();
  const [copied, setCopied] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const effectiveConnected = connected || isWalletConnected;
  const effectivePublicKey = publicKey || walletPublicKey;
  const detectedWallets = wallets.filter(({ readyState }) => readyState !== WalletReadyState.NotDetected);
  const walletErrorMessage = walletError === "Unexpected error"
    ? "Your wallet extension could not connect. Finish setting it up or unlock it, then try again."
    : walletError
      ? `${walletError.replace(/[.!?]+$/, "")}. Check your wallet extension and try again.`
      : null;

  useEffect(() => {
    if (effectiveConnected && connectMenuOpen) setConnectMenuOpen(false);
  }, [effectiveConnected, connectMenuOpen, setConnectMenuOpen]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!connectMenuOpen) return;

    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const controls = () => Array.from(dialogRef.current?.querySelectorAll<HTMLElement>("button:not(:disabled), a[href]") || []);
    controls()[0]?.focus();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setConnectMenuOpen(false);
      if (["Tab", "ArrowDown", "ArrowUp"].includes(e.key)) {
        const items = controls();
        if (!items.length) return;
        e.preventDefault();
        const backwards = e.key === "ArrowUp" || (e.key === "Tab" && e.shiftKey);
        const index = items.indexOf(document.activeElement as HTMLElement);
        items[(index + (backwards ? -1 : 1) + items.length) % items.length].focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [connectMenuOpen]);

  const handleCopy = () => {
    if (effectivePublicKey) {
      navigator.clipboard.writeText(effectivePublicKey.toBase58());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDisconnect = () => {
    disconnect();
    disconnectDevWallet();
    setDropdownOpen(false);
  };

  const isLocalnet = process.env.NEXT_PUBLIC_SOLANA_NETWORK === "localnet";

  if (!effectiveConnected) {
    return (
      <div className="relative">
        <button
          onClick={() => {
            clearWalletError();
            setConnectMenuOpen(!connectMenuOpen);
          }}
          disabled={connecting}
          aria-label={connecting ? "Connecting wallet" : "Connect wallet"}
          className="flex h-11 w-11 items-center justify-center gap-2 rounded-xl border border-brand-cyan bg-gradient-to-r from-brand-cyan to-brand-cyan-hover text-sm font-bold text-background shadow-md shadow-brand-cyan/20 transition-all hover:brightness-110 hover:shadow-brand-cyan/30 active:scale-[0.98] sm:w-auto sm:px-4"
        >
          <Wallet className="h-4 w-4 stroke-[2.5]" />
          <span className="hidden sm:inline">{connecting ? "Connecting..." : "Connect wallet"}</span>
        </button>

        {connectMenuOpen && createPortal(
          <div
            ref={dialogRef}
            className="fixed inset-0 z-[100] flex h-dvh min-h-screen items-center justify-center overflow-y-auto bg-black/30 p-4 backdrop-blur-[1px]"
            role="dialog"
            aria-modal="true"
            aria-labelledby="connect-wallet-title"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setConnectMenuOpen(false);
            }}
          >
            <div className="my-auto w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl sm:p-6">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div>
                  <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-xl border border-brand-cyan/30 bg-brand-cyan/10">
                    <Wallet className="h-5 w-5 text-brand-cyan" />
                  </div>
                  <h2 id="connect-wallet-title" className="text-lg font-bold text-foreground">
                    Connect a Solana wallet
                  </h2>
                  <p className="mt-1 text-sm leading-relaxed text-muted">
                    A wallet is needed to trade and launch tokens on StreetFun.
                  </p>
                </div>
                <button
                  onClick={() => setConnectMenuOpen(false)}
                  aria-label="Close wallet dialog"
                  className="rounded-lg p-1.5 text-muted transition-colors hover:bg-card-hover hover:text-foreground"
                >
                  <span aria-hidden="true" className="text-xl leading-none">×</span>
                </button>
              </div>

              {walletErrorMessage && (
                <p role="alert" className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">
                  {walletErrorMessage}
                </p>
              )}

              {detectedWallets.length > 0 ? (
                <div className="space-y-2">
                  {detectedWallets.map(({ adapter }) => (
                    <button
                      key={adapter.name}
                      onClick={() => {
                        clearWalletError();
                        select(adapter.name);
                      }}
                      disabled={connecting}
                      className="flex w-full items-center gap-3 rounded-xl border border-border bg-card-subtle p-3.5 text-left text-foreground transition-colors hover:border-brand-cyan/50 hover:bg-card-hover"
                    >
                      {adapter.name === "Localnet Dev Wallet"
                        ? <Terminal className="h-10 w-10 rounded-xl border border-border bg-card p-2 text-emerald-400" />
                        : <img src={adapter.icon} alt="" className="h-10 w-10 rounded-xl" />}
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold">{adapter.name}</div>
                        <div className="mt-0.5 text-xs text-brand-cyan">
                          {adapter.name === "Localnet Dev Wallet" ? "Test funds added on connect" : "Detected"}
                        </div>
                      </div>
                      <span className="text-sm text-muted">{connecting ? "Connecting..." : "Connect"}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted">No browser wallet detected. Install or enable a Solana wallet extension in this browser, then reload this page. Your validator keypair does not connect automatically.</p>
                  <a
                    href="https://phantom.com/download"
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => setConnectMenuOpen(false)}
                    className="flex w-full items-center gap-3 rounded-xl border border-brand-cyan/30 bg-brand-cyan/10 p-3.5 text-left text-foreground transition-colors hover:bg-brand-cyan/15"
                  >
                    <Wallet className="h-5 w-5 shrink-0 text-brand-cyan" />
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">Get Phantom</div>
                      <div className="mt-0.5 text-xs text-muted">Recommended for new users</div>
                    </div>
                    <ExternalLink className="h-4 w-4 shrink-0 text-muted" />
                  </a>
                </div>
              )}

              {isLocalnet && isMock && (
              <button
                onClick={() => {
                  setConnectMenuOpen(false);
                  connectDevWallet();
                }}
                className="mt-4 flex w-full items-center gap-2.5 border-t border-border/50 px-1 pt-4 text-left text-foreground transition-colors hover:text-emerald-300"
              >
                <Terminal className="h-4 w-4 text-emerald-400" />
                <div>
                  <div className="flex items-center gap-1.5 font-semibold">
                    Localnet Dev Wallet
                    <span className="rounded border border-emerald-500/20 bg-emerald-500/10 px-1 py-0.2 font-mono text-[9px] text-emerald-400">
                      Funded
                    </span>
                  </div>
                  <div className="font-mono text-[10px] text-muted">519j..Cv2 (500M SOL)</div>
                </div>
              </button>
            )}
            </div>
          </div>,
          document.body
        )}
      </div>
    );
  }

  const base58 = effectivePublicKey?.toBase58();
  const shortAddress = base58 ? `${base58.slice(0, 4)}..${base58.slice(-4)}` : "Connected";

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setDropdownOpen(!dropdownOpen)}
        aria-label={`Wallet ${shortAddress}`}
        className="flex h-11 w-11 items-center justify-center gap-2 rounded-xl border border-brand-cyan bg-gradient-to-r from-brand-cyan to-brand-cyan-hover text-sm font-bold text-background shadow-md shadow-brand-cyan/20 transition-all hover:brightness-110 sm:w-auto sm:px-4"
      >
        <Wallet className="h-4 w-4 stroke-[2.5]" />
        <span className="hidden sm:inline font-mono">{shortAddress}</span>
      </button>

      {dropdownOpen && (
        <div className="absolute right-0 mt-1.5 w-48 rounded-xl border border-border bg-card p-1 shadow-xl z-50 text-xs">
          <div className="px-3 py-2 border-b border-border/60">
            <span className="text-[10px] text-muted uppercase font-mono tracking-wider block">Connected</span>
            <span className="text-xs font-mono text-foreground font-semibold truncate block mt-0.5">{shortAddress}</span>
          </div>
          <button
            onClick={handleCopy}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-muted hover:bg-card-hover hover:text-foreground transition-colors mt-1"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copied ? "Copied!" : "Copy address"}</span>
          </button>
          <button
            onClick={handleDisconnect}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-rose-400 hover:bg-rose-950/20 transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Disconnect</span>
          </button>
        </div>
      )}
    </div>
  );
}

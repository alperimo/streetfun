"use client";

import React, { useState, useRef, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Wallet, Copy, Check, LogOut, Terminal } from "lucide-react";
import { useMarket } from "@/context/MarketContext";

export function WalletButton() {
  const { connected, publicKey, disconnect, connecting } = useWallet();
  const { setVisible } = useWalletModal();
  const { isWalletConnected, walletPublicKey, connectDevWallet, disconnectDevWallet } = useMarket();
  const [copied, setCopied] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [connectMenuOpen, setConnectMenuOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const connectRef = useRef<HTMLDivElement>(null);

  const effectiveConnected = connected || isWalletConnected;
  const effectivePublicKey = publicKey || walletPublicKey;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
      if (connectRef.current && !connectRef.current.contains(e.target as Node)) {
        setConnectMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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

  if (!effectiveConnected) {
    return (
      <div className="relative" ref={connectRef}>
        <button
          onClick={() => setConnectMenuOpen(!connectMenuOpen)}
          disabled={connecting}
          aria-label={connecting ? "Connecting wallet" : "Connect wallet"}
          className="flex h-11 w-11 items-center justify-center gap-2 rounded-xl bg-brand-cyan text-brand-cyan-foreground font-semibold text-sm transition-all hover:bg-brand-cyan-hover active:scale-[0.98] sm:w-auto sm:px-4 shadow-sm"
        >
          <Wallet className="h-4 w-4" />
          <span className="hidden sm:inline">{connecting ? "Connecting..." : "Connect wallet"}</span>
        </button>

        {connectMenuOpen && (
          <div className="absolute right-0 mt-1.5 w-60 rounded-xl border border-border bg-card p-1.5 shadow-xl z-50 text-xs">
            <button
              onClick={() => {
                setConnectMenuOpen(false);
                setVisible(true);
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-foreground hover:bg-card-hover transition-colors"
            >
              <Wallet className="h-4 w-4 text-brand-cyan" />
              <div>
                <div className="font-semibold">Browser Extension</div>
                <div className="text-[10px] text-muted">Backpack, Phantom, Solflare</div>
              </div>
            </button>
            <button
              onClick={() => {
                setConnectMenuOpen(false);
                connectDevWallet();
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-foreground hover:bg-card-hover transition-colors border-t border-border/50 mt-1 pt-2"
            >
              <Terminal className="h-4 w-4 text-emerald-400" />
              <div>
                <div className="font-semibold flex items-center gap-1.5">
                  Localnet Dev Wallet
                  <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                    Funded
                  </span>
                </div>
                <div className="text-[10px] text-muted font-mono">519j..Cv2 (500M SOL)</div>
              </div>
            </button>
          </div>
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
        className="flex h-11 w-11 items-center justify-center gap-2 rounded-xl bg-brand-cyan text-brand-cyan-foreground font-semibold text-sm transition-all hover:bg-brand-cyan-hover sm:w-auto sm:px-4 shadow-sm"
      >
        <Wallet className="h-4 w-4" />
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

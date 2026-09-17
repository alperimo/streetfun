"use client";

import React, { useState, useRef, useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Wallet, Copy, Check, LogOut } from "lucide-react";

export function WalletButton() {
  const { connected, publicKey, disconnect, connecting } = useWallet();
  const { setVisible } = useWalletModal();
  const [copied, setCopied] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleCopy = () => {
    if (publicKey) {
      navigator.clipboard.writeText(publicKey.toBase58());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!connected) {
    return (
      <button
        onClick={() => setVisible(true)}
        disabled={connecting}
        aria-label={connecting ? "Connecting wallet" : "Connect wallet"}
        className="flex h-11 w-11 items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm font-semibold text-foreground transition-colors hover:border-border-active hover:bg-card-hover sm:w-auto sm:px-4"
      >
        <Wallet className="h-4 w-4 text-muted" />
        <span className="hidden sm:inline">{connecting ? "Connecting..." : "Connect wallet"}</span>
      </button>
    );
  }

  const base58 = publicKey?.toBase58();
  const shortAddress = base58 ? `${base58.slice(0, 4)}..${base58.slice(-4)}` : "Connected";

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setDropdownOpen(!dropdownOpen)}
        aria-label={`Wallet ${shortAddress}`}
        className="flex h-11 w-11 items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm font-semibold text-foreground transition-colors hover:border-border-active hover:bg-card-hover sm:w-auto sm:px-4"
      >
        <Wallet className="h-4 w-4 text-muted" />
        <span className="hidden sm:inline">{shortAddress}</span>
      </button>

      {dropdownOpen && (
        <div className="absolute right-0 mt-1.5 w-44 rounded-lg border border-border bg-card p-1 shadow-lg z-50 text-xs">
          <button
            onClick={handleCopy}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-muted hover:bg-card-hover hover:text-foreground transition-colors"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copied ? "Copied!" : "Copy address"}</span>
          </button>
          <button
            onClick={() => {
              disconnect();
              setDropdownOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-rose-400 hover:bg-rose-950/20 transition-colors"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Disconnect</span>
          </button>
        </div>
      )}
    </div>
  );
}

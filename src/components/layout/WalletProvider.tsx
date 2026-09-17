"use client";

import React, { useMemo } from "react";
import {
  ConnectionProvider,
  WalletProvider as SolanaWalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { clusterApiUrl } from "@solana/web3.js";

import "@solana/wallet-adapter-react-ui/styles.css";

export function WalletProvider({ children }: { children: React.ReactNode }) {
  // Node 25 exposes an experimental localStorage getter that warns unless a
  // persistence file is configured. Wallet Adapter probes globalThis storage
  // during SSR, so hide the browser-only API from the server render.
  if (typeof window === "undefined") {
    Object.defineProperty(globalThis, "localStorage", {
      value: undefined,
      configurable: true,
    });
  }

  const endpoint = useMemo(
    () => process.env.NEXT_PUBLIC_SOLANA_RPC || clusterApiUrl("devnet"),
    []
  );

  // Modern Wallet Standard auto-discovers Backpack, Phantom, Solflare without manual legacy adapters
  const wallets = useMemo(() => [], []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <SolanaWalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </SolanaWalletProvider>
    </ConnectionProvider>
  );
}

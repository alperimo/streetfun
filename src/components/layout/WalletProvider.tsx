"use client";

import React, { createContext, useContext, useMemo, useState } from "react";
import {
  ConnectionProvider,
  WalletProvider as SolanaWalletProvider,
} from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { clusterApiUrl } from "@solana/web3.js";

import { LocalnetWalletAdapter } from "./LocalnetWalletAdapter";

const WalletConnectionErrorContext = createContext<{
  error: string | null;
  clearError: () => void;
} | null>(null);

export function useWalletConnectionError() {
  const context = useContext(WalletConnectionErrorContext);
  if (!context) throw new Error("Wallet connection error context is unavailable");
  return context;
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [error, setError] = useState<string | null>(null);
  // Node 25 exposes an experimental localStorage getter that warns unless a
  // persistence file is configured. Wallet Adapter probes globalThis storage
  // during SSR, so hide the browser-only API from the server render.
  if (typeof window === "undefined") {
    Object.defineProperty(globalThis, "localStorage", {
      value: undefined,
      configurable: true,
    });
  }

  const endpoint = useMemo(() => {
    // If in the browser on a public domain, NEVER route to 127.0.0.1 / localhost (triggers Chrome PNA permission prompt)
    if (typeof window !== "undefined") {
      const hostname = window.location.hostname;
      const isLocalhost =
        hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname.endsWith(".local");

      if (!isLocalhost) {
        const configuredRpc = process.env.NEXT_PUBLIC_SOLANA_RPC;
        if (
          configuredRpc &&
          !configuredRpc.includes("127.0.0.1") &&
          !configuredRpc.includes("localhost")
        ) {
          return configuredRpc;
        }
        return clusterApiUrl("devnet");
      }
    }
    return process.env.NEXT_PUBLIC_SOLANA_RPC || clusterApiUrl("devnet");
  }, []);

  // Wallet Standard discovers browser extensions; the disposable signer is only
  // available against a validator running on this computer in local development.
  const wallets = useMemo(() => {
    if (process.env.NODE_ENV !== "development") {
      return [];
    }
    const rpcHost = new URL(endpoint).hostname;
    const localnet = process.env.NEXT_PUBLIC_SOLANA_NETWORK === "localnet";
    const loopback = rpcHost === "localhost" || rpcHost === "127.0.0.1";
    return localnet && loopback && process.env.NEXT_PUBLIC_USE_MOCK_DATA !== "true"
      ? [new LocalnetWalletAdapter()]
      : [];
  }, [endpoint]);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <SolanaWalletProvider
        wallets={wallets}
        autoConnect
        onError={(walletError) => {
          setError(walletError.message || walletError.name || "Wallet connection failed");
          console.error("[Wallet]", walletError);
        }}
      >
        <WalletConnectionErrorContext.Provider value={{ error, clearError: () => setError(null) }}>
          <WalletModalProvider>{children}</WalletModalProvider>
        </WalletConnectionErrorContext.Provider>
      </SolanaWalletProvider>
    </ConnectionProvider>
  );
}

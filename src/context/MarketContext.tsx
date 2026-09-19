"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { TokenMetadata } from "@/lib/types";
import {
  TokenLaunchParams,
  TradeParams,
  TradeResult,
  RedeemParams,
  RedeemResult,
  getTokenService,
  getTradeService,
  getRedeemService,
  isMockMode,
} from "@/services";
import { usePathname } from "next/navigation";
import { INITIAL_TOKENS } from "@/lib/mockData";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { PROGRAM_ID } from "@/sdk/constants";

import { PublicKey } from "@solana/web3.js";

const LOCAL_DEV_PUBKEY = new PublicKey("519jca26LioEQiPhwoHCkC8mNZiCF7cDmtaXdp98iCv2");

interface MarketContextType {
  tokens: TokenMetadata[];
  loading: boolean;
  error: string | null;
  isMock: boolean;
  isWalletConnected: boolean;
  walletDialogOpen: boolean;
  setWalletDialogOpen: React.Dispatch<React.SetStateAction<boolean>>;
  walletPublicKey: PublicKey | null;
  connectDevWallet: () => void;
  disconnectDevWallet: () => void;
  refreshTokens: () => Promise<void>;
  getToken: (mint: string) => TokenMetadata | undefined;
  launchToken: (params: TokenLaunchParams) => Promise<TokenMetadata>;
  executeTrade: (params: TradeParams) => Promise<TradeResult>;
  executeRedeem: (params: RedeemParams) => Promise<RedeemResult>;
}

const MarketContext = createContext<MarketContextType | undefined>(undefined);

interface MarketProviderProps {
  children: ReactNode;
  initialTokens?: TokenMetadata[];
}

export function MarketProvider({ children, initialTokens = [] }: MarketProviderProps) {
  const isMock = isMockMode();
  const [tokens, setTokens] = useState<TokenMetadata[]>(() => {
    if (isMock) return INITIAL_TOKENS;
    return initialTokens.filter((token) => token.dataSource === "onchain");
  });
  const [loading, setLoading] = useState(!isMock && initialTokens.length === 0);
  const [error, setError] = useState<string | null>(null);
  const wallet = useWallet();
  const { connection } = useConnection();
  const [walletDialogOpen, setWalletDialogOpen] = useState(false);
  const [devWalletConnected, setDevWalletConnected] = useState(false);
  const isFetchingRef = React.useRef(false);
  const mutationVersion = React.useRef(0);
  const isMutating = React.useRef(false);

  const isWalletConnected = wallet.connected || (isMock && devWalletConnected);
  const activePublicKey = wallet.publicKey || (isMock && devWalletConnected ? LOCAL_DEV_PUBKEY : null);

  const pathname = usePathname();
  const isAlphaRoute = pathname?.startsWith("/alpha");

  const connectDevWallet = useCallback(() => {
    setDevWalletConnected(true);
  }, []);

  const disconnectDevWallet = useCallback(() => {
    setDevWalletConnected(false);
  }, []);

  const refreshTokens = useCallback(async () => {
    if (isAlphaRoute || isFetchingRef.current || isMutating.current) return;
    const version = mutationVersion.current;
    isFetchingRef.current = true;
    try {
      const tokenService = getTokenService();
      const list = await tokenService.getTokens();
      if (version !== mutationVersion.current) return;
      setTokens([...list]);
      setError(null);
    } catch (err) {
      if (version !== mutationVersion.current) return;
      console.warn("Failed to fetch tokens:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Live Solana market data is temporarily unavailable."
      );
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, [isAlphaRoute]);

  useEffect(() => {
    if (isAlphaRoute) return;
    refreshTokens();
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refreshTokens();
    };
    const interval = setInterval(refreshWhenVisible, isMock ? 4_000 : 10_000);
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [isMock, isAlphaRoute, refreshTokens]);

  useEffect(() => {
    if (isMock || isAlphaRoute) return;

    let programSubscriptionId: number | null = null;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRefresh = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => refreshTokens(), 150);
    };

    try {
      programSubscriptionId = connection.onProgramAccountChange(
        PROGRAM_ID,
        scheduleRefresh,
        "confirmed"
      );
    } catch (subscriptionError) {
      console.warn("Could not subscribe to Solana account updates:", subscriptionError);
    }

    const supabase = createBrowserSupabaseClient();
    const channel = supabase
      ?.channel("streetfun-live-market")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "trades" },
        scheduleRefresh
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tokens" },
        scheduleRefresh
      )
      .subscribe();

    return () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      if (programSubscriptionId !== null) {
        connection.removeProgramAccountChangeListener(programSubscriptionId).catch(() => {});
      }
      if (supabase && channel) supabase.removeChannel(channel);
    };
  }, [connection, isMock, refreshTokens]);

  const getToken = useCallback(
    (mint: string) => {
      return tokens.find((t) => t.mint === mint);
    },
    [tokens]
  );

  const launchToken = useCallback(
    async (params: TokenLaunchParams) => {
      if (isMutating.current) throw new Error("Another order is already in progress.");
      isMutating.current = true;
      mutationVersion.current += 1;
      try {
        const tokenService = getTokenService();
        const newToken = await tokenService.launchToken(params, activePublicKey);
        setTokens((prev) => [newToken, ...prev.filter((t) => t.mint !== newToken.mint)]);
        return newToken;
      } finally {
        mutationVersion.current += 1;
        isMutating.current = false;
      }
    },
    [activePublicKey]
  );

  const executeTrade = useCallback(
    async (params: TradeParams) => {
      if (isMutating.current) throw new Error("Another order is already in progress.");
      isMutating.current = true;
      mutationVersion.current += 1;
      try {
        const tradeService = getTradeService();
        const walletIdentity =
          !isMock && wallet.publicKey
            ? {
                publicKey: wallet.publicKey,
                sendTransaction: wallet.sendTransaction,
              }
            : activePublicKey;
        const result = await tradeService.executeTrade(params, walletIdentity);
        if (result.success && result.updatedToken) {
          setTokens((prev) =>
            prev.map((t) => (t.mint === result.updatedToken.mint ? result.updatedToken : t))
          );
        }
        return result;
      } finally {
        mutationVersion.current += 1;
        isMutating.current = false;
      }
    },
    [activePublicKey, isMock, wallet.publicKey, wallet.sendTransaction]
  );

  const executeRedeem = useCallback(
    async (params: RedeemParams) => {
      if (isMutating.current) throw new Error("Another order is already in progress.");
      isMutating.current = true;
      mutationVersion.current += 1;
      try {
        const redeemService = getRedeemService();
        const walletIdentity =
          !isMock && wallet.publicKey
            ? {
                publicKey: wallet.publicKey,
                sendTransaction: wallet.sendTransaction,
              }
            : activePublicKey;
        const result = await redeemService.executeRedeem(params, walletIdentity);
        if (result.success && result.updatedToken) {
          setTokens((prev) =>
            prev.map((t) => (t.mint === result.updatedToken.mint ? result.updatedToken : t))
          );
        }
        return result;
      } finally {
        mutationVersion.current += 1;
        isMutating.current = false;
      }
    },
    [activePublicKey, isMock, wallet.publicKey, wallet.sendTransaction]
  );

  return (
    <MarketContext.Provider
      value={{
        tokens,
        loading,
        error,
        isMock,
        isWalletConnected,
        walletDialogOpen,
        setWalletDialogOpen,
        walletPublicKey: activePublicKey,
        connectDevWallet,
        disconnectDevWallet,
        refreshTokens,
        getToken,
        launchToken,
        executeTrade,
        executeRedeem,
      }}
    >
      {children}
    </MarketContext.Provider>
  );
}

export function useMarket() {
  const context = useContext(MarketContext);
  if (!context) {
    throw new Error("useMarket must be used within a MarketProvider");
  }
  return context;
}

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

export function MarketProvider({ children }: { children: ReactNode }) {
  const isMock = isMockMode();
  const [tokens, setTokens] = useState<TokenMetadata[]>(isMock ? INITIAL_TOKENS : []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const wallet = useWallet();
  const { connection } = useConnection();
  const [devWalletConnected, setDevWalletConnected] = useState(false);
  const isFetchingRef = React.useRef(false);

  const isWalletConnected = wallet.connected || devWalletConnected;
  const activePublicKey = wallet.publicKey || (devWalletConnected ? LOCAL_DEV_PUBKEY : null);

  const connectDevWallet = useCallback(() => {
    setDevWalletConnected(true);
  }, []);

  const disconnectDevWallet = useCallback(() => {
    setDevWalletConnected(false);
  }, []);

  const refreshTokens = useCallback(async () => {
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;
    try {
      const tokenService = getTokenService();
      const list = await tokenService.getTokens();
      setTokens([...list]);
      setError(null);
    } catch (err) {
      console.error("Failed to fetch tokens:", err);
      setError(
        err instanceof Error
          ? err.message
          : "Live Solana market data is temporarily unavailable."
      );
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    refreshTokens();
    const interval = setInterval(refreshTokens, isMock ? 4_000 : 15_000);
    return () => clearInterval(interval);
  }, [isMock, refreshTokens]);

  useEffect(() => {
    if (isMock) return;

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
      return tokens.find((t) => t.mint.toLowerCase() === mint.toLowerCase());
    },
    [tokens]
  );

  const launchToken = useCallback(
    async (params: TokenLaunchParams) => {
      const tokenService = getTokenService();
      const newToken = await tokenService.launchToken(params, activePublicKey);
      setTokens((prev) => [newToken, ...prev.filter((t) => t.mint !== newToken.mint)]);
      return newToken;
    },
    [activePublicKey]
  );

  const executeTrade = useCallback(
    async (params: TradeParams) => {
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
    },
    [activePublicKey, isMock, wallet.publicKey, wallet.sendTransaction]
  );

  const executeRedeem = useCallback(
    async (params: RedeemParams) => {
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

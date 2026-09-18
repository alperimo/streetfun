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
import { useWallet } from "@solana/wallet-adapter-react";

import { PublicKey } from "@solana/web3.js";

const LOCAL_DEV_PUBKEY = new PublicKey("519jca26LioEQiPhwoHCkC8mNZiCF7cDmtaXdp98iCv2");

interface MarketContextType {
  tokens: TokenMetadata[];
  loading: boolean;
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

const TOKENS_CACHE_KEY = "streetfun_tokens_v2";

interface MarketProviderProps {
  children: ReactNode;
  initialTokens?: TokenMetadata[];
}

export function MarketProvider({ children, initialTokens = [] }: MarketProviderProps) {
  const isMock = isMockMode();

  // Instant hydration: SSR tokens -> localStorage cache -> empty
  const [tokens, setTokens] = useState<TokenMetadata[]>(() => {
    if (isMock) return INITIAL_TOKENS;
    if (initialTokens && initialTokens.length > 0) return initialTokens;
    if (typeof window !== "undefined") {
      try {
        const cached = localStorage.getItem(TOKENS_CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch (_e) {}
    }
    return [];
  });

  const [loading, setLoading] = useState(() => {
    if (isMock) return false;
    if (initialTokens && initialTokens.length > 0) return false;
    if (typeof window !== "undefined") {
      try {
        const cached = localStorage.getItem(TOKENS_CACHE_KEY);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) return false;
        }
      } catch (_e) {}
    }
    return true;
  });

  const wallet = useWallet();
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
      if (list && list.length > 0) {
        setTokens(list);
        if (typeof window !== "undefined") {
          try {
            localStorage.setItem(TOKENS_CACHE_KEY, JSON.stringify(list));
          } catch (_e) {}
        }
      }
    } catch (err) {
      console.error("Failed to fetch tokens:", err);
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    refreshTokens();

    // Only poll when tab is active and visible to prevent wasted egress
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        refreshTokens();
      }
    }, 4000);

    // Immediately revalidate when user switches back to this tab
    const handleVisibilityOrFocus = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        refreshTokens();
      }
    };

    window.addEventListener("focus", handleVisibilityOrFocus);
    document.addEventListener("visibilitychange", handleVisibilityOrFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", handleVisibilityOrFocus);
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
    };
  }, [refreshTokens]);

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
      const result = await tradeService.executeTrade(params, activePublicKey);
      if (result.success && result.updatedToken) {
        setTokens((prev) =>
          prev.map((t) => (t.mint === result.updatedToken.mint ? result.updatedToken : t))
        );
      }
      return result;
    },
    [activePublicKey]
  );

  const executeRedeem = useCallback(
    async (params: RedeemParams) => {
      const redeemService = getRedeemService();
      const result = await redeemService.executeRedeem(params, activePublicKey);
      if (result.success && result.updatedToken) {
        setTokens((prev) =>
          prev.map((t) => (t.mint === result.updatedToken.mint ? result.updatedToken : t))
        );
      }
      return result;
    },
    [activePublicKey]
  );

  return (
    <MarketContext.Provider
      value={{
        tokens,
        loading,
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

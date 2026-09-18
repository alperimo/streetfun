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

export function MarketProvider({ children }: { children: ReactNode }) {
  const isMock = isMockMode();
  const [tokens, setTokens] = useState<TokenMetadata[]>(isMock ? INITIAL_TOKENS : []);
  const [loading, setLoading] = useState(!isMock);
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
    const interval = setInterval(refreshTokens, 5000);
    return () => clearInterval(interval);
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

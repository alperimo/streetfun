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

interface MarketContextType {
  tokens: TokenMetadata[];
  loading: boolean;
  isMock: boolean;
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
  const wallet = useWallet();

  const refreshTokens = useCallback(async () => {
    try {
      const tokenService = getTokenService();
      const list = await tokenService.getTokens();
      setTokens(list);
    } catch (err) {
      console.error("Failed to fetch tokens:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshTokens();
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
      const newToken = await tokenService.launchToken(params, wallet.publicKey);
      setTokens((prev) => [newToken, ...prev.filter((t) => t.mint !== newToken.mint)]);
      return newToken;
    },
    [wallet.publicKey]
  );

  const executeTrade = useCallback(
    async (params: TradeParams) => {
      const tradeService = getTradeService();
      const result = await tradeService.executeTrade(params, wallet.publicKey);
      if (result.success && result.updatedToken) {
        setTokens((prev) =>
          prev.map((t) => (t.mint === result.updatedToken.mint ? result.updatedToken : t))
        );
      }
      return result;
    },
    [wallet.publicKey]
  );

  const executeRedeem = useCallback(
    async (params: RedeemParams) => {
      const redeemService = getRedeemService();
      const result = await redeemService.executeRedeem(params, wallet.publicKey);
      if (result.success && result.updatedToken) {
        setTokens((prev) =>
          prev.map((t) => (t.mint === result.updatedToken.mint ? result.updatedToken : t))
        );
      }
      return result;
    },
    [wallet.publicKey]
  );

  return (
    <MarketContext.Provider
      value={{
        tokens,
        loading,
        isMock,
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

"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import bs58 from "bs58";
import { alphaClaimMessage, normalizeHandle } from "@/lib/alphaClaim";

export interface PassData {
  passNumber: number;
  walletAddress: string;
  xHandle?: string;
  createdAt: string;
  isNew?: boolean;
}

interface AlphaPassContextType {
  passData: PassData | null;
  loading: boolean;
  isSigning: boolean;
  errorMsg: string | null;
  isWaitlistOpen: boolean;
  openWaitlist: () => void;
  closeWaitlist: () => void;
  claimPass: () => Promise<void>;
  updateXHandle: (handle: string) => Promise<void>;
  clearError: () => void;
}

const AlphaPassContext = createContext<AlphaPassContextType | undefined>(undefined);

export function AlphaPassProvider({ children }: { children: React.ReactNode }) {
  const { connected, publicKey, signMessage } = useWallet();
  const { setVisible: setWalletModalVisible } = useWalletModal();

  const [passData, setPassData] = useState<PassData | null>(null);
  const [loading, setLoading] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isWaitlistOpen, setIsWaitlistOpen] = useState(false);

  // Sync pass whenever publicKey changes or demo_pass is set
  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("demo_pass") === "true") {
        setPassData({
          passNumber: 42,
          walletAddress: "7xKpQvD9mZaN8bK3YwE5cF2rL4pG1sT6vU8xW9zB2n",
          createdAt: new Date().toISOString(),
          isNew: false,
          xHandle: "streetfun_vip",
        });
        return;
      }
    }

    if (!publicKey) {
      setPassData(null);
      return;
    }

    const walletAddress = publicKey.toBase58();
    const stored = typeof window !== "undefined" ? localStorage.getItem(`streetfun_alpha_${walletAddress}`) : null;
    if (stored) {
      try {
        setPassData(JSON.parse(stored));
      } catch {
        // storage fallback
      }
    }

    let isCancelled = false;
    setLoading(true);

    fetch(`/api/alpha/claim?wallet=${walletAddress}`)
      .then((res) => res.json())
      .then((data) => {
        if (isCancelled) return;
        if (data.hasPass && data.pass) {
          setPassData(data.pass);
          if (typeof window !== "undefined") {
            localStorage.setItem(`streetfun_alpha_${walletAddress}`, JSON.stringify(data.pass));
          }
        }
      })
      .catch((err) => {
        console.warn("[AlphaPassProvider] Failed to check pass:", err);
      })
      .finally(() => {
        if (!isCancelled) setLoading(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [publicKey]);

  const openWaitlist = useCallback(() => {
    setErrorMsg(null);
    setIsWaitlistOpen(true);
  }, []);

  const closeWaitlist = useCallback(() => {
    setIsWaitlistOpen(false);
    setErrorMsg(null);
  }, []);

  const claimPass = useCallback(async () => {
    if (!connected || !publicKey) {
      setWalletModalVisible(true);
      return;
    }

    if (!signMessage) {
      setErrorMsg("Your wallet does not support message signing.");
      return;
    }

    setIsSigning(true);
    setErrorMsg(null);

    try {
      const walletAddress = publicKey.toBase58();
      const nonce = crypto.randomUUID();
      const timestamp = new Date().toISOString();

      const messageText = alphaClaimMessage(walletAddress, "", nonce, timestamp);
      const messageBytes = new TextEncoder().encode(messageText);
      const signatureBytes = await signMessage(messageBytes);
      const signatureBase58 = bs58.encode(signatureBytes);

      const res = await fetch("/api/alpha/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walletAddress,
          signature: signatureBase58,
          message: messageText,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to claim");
      }

      setPassData(data.pass);
      if (typeof window !== "undefined") {
        localStorage.setItem(`streetfun_alpha_${walletAddress}`, JSON.stringify(data.pass));
      }
    } catch (err: any) {
      console.error("Alpha Pass Claim error:", err);
      if (err.name === "WalletSignMessageError" || err.message?.includes("User rejected")) {
        setErrorMsg("Signature cancelled.");
      } else {
        setErrorMsg(err.message || "Failed to claim pass.");
      }
    } finally {
      setIsSigning(false);
    }
  }, [connected, publicKey, signMessage, setWalletModalVisible]);

  const updateXHandle = useCallback(
    async (handle: string) => {
      if (!passData) return;
      const cleanHandle = normalizeHandle(handle);
      const updated = { ...passData, xHandle: cleanHandle };
      setPassData(updated);
      if (typeof window !== "undefined") {
        localStorage.setItem(`streetfun_alpha_${passData.walletAddress}`, JSON.stringify(updated));
      }
    },
    [passData]
  );

  return (
    <AlphaPassContext.Provider
      value={{
        passData,
        loading,
        isSigning,
        errorMsg,
        isWaitlistOpen,
        openWaitlist,
        closeWaitlist,
        claimPass,
        updateXHandle,
        clearError: () => setErrorMsg(null),
      }}
    >
      {children}
    </AlphaPassContext.Provider>
  );
}

export function useAlphaPass() {
  const context = useContext(AlphaPassContext);
  if (!context) {
    throw new Error("useAlphaPass must be used within an AlphaPassProvider");
  }
  return context;
}

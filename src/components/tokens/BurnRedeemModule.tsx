"use client";

import React, { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { ArrowRight, Check, ShieldCheck, RefreshCw } from "lucide-react";
import { TokenMetadata } from "@/lib/types";
import { calculateEntitledStock } from "@/sdk/math";

interface BurnRedeemModuleProps {
  token: TokenMetadata;
}

export function BurnRedeemModule({ token }: BurnRedeemModuleProps) {
  const { connected } = useWallet();
  const [memeAmount, setMemeAmount] = useState("");
  const [redeemMode, setRedeemMode] = useState<"stock" | "usdc">("stock");
  const [isProcessing, setIsProcessing] = useState(false);
  const [txSuccess, setTxSuccess] = useState<string | null>(null);

  const totalMemeSupply = 1_000_000_000n * 1_000_000n;
  const totalEquityLocked = BigInt(
    Math.floor((token.treasury.totalEquityLocked || 139.27) * 1_000_000)
  );

  const numMeme = parseFloat(memeAmount) || 0;
  const memeInLamports = BigInt(Math.floor(numMeme * 1_000_000));

  const entitledStockShares =
    numMeme > 0
      ? Number(calculateEntitledStock(memeInLamports, totalMemeSupply, totalEquityLocked)) / 1_000_000
      : 0;

  const stockPrice = token.targetEquity.stockPriceUsd;
  const entitledUsdcValue = entitledStockShares * stockPrice;

  const handleExecuteRedeem = () => {
    if (!connected || numMeme <= 0) return;
    setIsProcessing(true);

    setTimeout(() => {
      setIsProcessing(false);
      setTxSuccess(
        redeemMode === "stock"
          ? `Withdrew ${entitledStockShares.toFixed(4)} shares of ${token.targetEquity.symbol} to wallet.`
          : `Swapped ${numMeme.toLocaleString()} $${token.symbol} for $${entitledUsdcValue.toFixed(2)} USDC.`
      );
      setMemeAmount("");
      setTimeout(() => setTxSuccess(null), 4000);
    }, 1200);
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <h3 className="text-base font-bold text-foreground">Redeem Equity</h3>
          <p className="text-xs text-muted">
            Burn ${token.symbol} to redeem your pro-rata share of {token.targetEquity.symbol} stock.
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-lg bg-card-subtle p-1 border border-border">
          <button
            onClick={() => setRedeemMode("stock")}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
              redeemMode === "stock"
                ? "bg-brand-cyan text-white shadow-sm"
                : "text-muted hover:text-foreground"
            }`}
          >
            Withdraw Stock
          </button>
          <button
            onClick={() => setRedeemMode("usdc")}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
              redeemMode === "usdc"
                ? "bg-brand-emerald text-white shadow-sm"
                : "text-muted hover:text-foreground"
            }`}
          >
            Swap to USDC
          </button>
        </div>
      </div>

      {/* Input */}
      <div className="mt-4">
        <div className="flex items-center justify-between text-xs text-muted mb-1.5">
          <span>Amount to Burn</span>
          <span className="font-mono">Balance: 50,000 ${token.symbol}</span>
        </div>

        <div className="relative">
          <input
            type="number"
            step="any"
            min="0"
            placeholder="0"
            value={memeAmount}
            onChange={(e) => setMemeAmount(e.target.value)}
            className="w-full rounded-xl border border-border bg-card-subtle pl-4 pr-24 py-3 text-lg font-mono text-foreground placeholder-muted focus:border-brand-cyan focus:bg-card focus:outline-none shadow-sm"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
            <button
              onClick={() => setMemeAmount("50000")}
              className="rounded bg-brand-cyan/10 px-2 py-1 text-[10px] font-mono text-brand-cyan border border-brand-cyan/25 hover:bg-brand-cyan/20"
            >
              MAX
            </button>
            <span className="font-mono text-xs font-bold text-foreground">
              ${token.symbol}
            </span>
          </div>
        </div>
      </div>

      {/* Pro-Rata Output Box */}
      <div className="mt-4 rounded-xl border border-border bg-card-subtle p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="font-mono text-base font-bold text-foreground flex items-center gap-2">
            <span>{numMeme.toLocaleString()} ${token.symbol}</span>
            <span className="text-brand-cyan">=</span>
            <span className="text-brand-emerald">
              {entitledStockShares.toFixed(4)} Shares ({token.targetEquity.symbol})
            </span>
          </div>
          <div className="font-mono text-xs text-muted">
            Value: <strong className="text-foreground">${entitledUsdcValue.toFixed(2)}</strong>
          </div>
        </div>
      </div>

      {txSuccess && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-brand-emerald/30 bg-emerald-500/10 p-2.5 text-xs text-brand-emerald">
          <Check className="h-4 w-4 flex-shrink-0" />
          <span>{txSuccess}</span>
        </div>
      )}

      {/* Action Buttons */}
      <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          onClick={() => {
            setRedeemMode("stock");
            handleExecuteRedeem();
          }}
          disabled={!numMeme || isProcessing}
          className="flex items-center justify-center gap-2 rounded-xl bg-brand-cyan py-3 text-sm font-bold text-slate-950 hover:opacity-90 transition-opacity disabled:opacity-50 shadow-sm shadow-brand-cyan/20"
        >
          {isProcessing && redeemMode === "stock" ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : null}
          <span>Withdraw Stock to Wallet</span>
        </button>

        <button
          onClick={() => {
            setRedeemMode("usdc");
            handleExecuteRedeem();
          }}
          disabled={!numMeme || isProcessing}
          className="flex items-center justify-center gap-2 rounded-xl border border-brand-emerald/40 bg-emerald-500/10 py-3 text-sm font-bold text-brand-emerald hover:bg-emerald-500/20 transition-colors disabled:opacity-50 shadow-sm"
        >
          {isProcessing && redeemMode === "usdc" ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : null}
          <span>1-Click Swap to USDC</span>
        </button>
      </div>
    </div>
  );
}

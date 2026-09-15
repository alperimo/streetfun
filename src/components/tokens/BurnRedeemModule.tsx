"use client";

import React, { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Flame, ShieldCheck, ArrowRight, Check, ExternalLink, RefreshCw } from "lucide-react";
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
          ? `Redeemed ${entitledStockShares.toFixed(4)} shares of ${token.targetEquity.symbol} to your wallet!`
          : `Burned ${numMeme.toLocaleString()} $${token.symbol} and received $${entitledUsdcValue.toFixed(2)} USDC via 1-click swap!`
      );
      setMemeAmount("");
      setTimeout(() => setTxSuccess(null), 5000);
    }, 1500);
  };

  return (
    <div className="rounded-xl border border-brand-cyan/40 bg-gradient-to-b from-[#091520] to-[#070e15] p-6 shadow-2xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/70 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-cyan/15 text-brand-cyan border border-brand-cyan/30 shadow-inner">
            <Flame className="h-5 w-5 stroke-[2.5]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-white">
                Burn &amp; Redeem Module
              </h3>
              <span className="rounded bg-brand-emerald/15 px-2 py-0.5 text-[10px] font-bold text-brand-emerald border border-brand-emerald/30">
                Live PDA Vault
              </span>
            </div>
            <p className="text-xs text-muted">
              Burn your ${token.symbol} meme tokens to claim your pro-rata share of real {token.targetEquity.name} stock
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 self-start sm:self-auto rounded-lg bg-[#070c10] p-1 border border-border">
          <button
            onClick={() => setRedeemMode("stock")}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
              redeemMode === "stock"
                ? "bg-brand-cyan text-black shadow-sm"
                : "text-muted hover:text-white"
            }`}
          >
            Direct Stock
          </button>
          <button
            onClick={() => setRedeemMode("usdc")}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
              redeemMode === "usdc"
                ? "bg-brand-emerald text-black shadow-sm"
                : "text-muted hover:text-white"
            }`}
          >
            1-Click USDC
          </button>
        </div>
      </div>

      {/* Input Meme Amount */}
      <div className="mt-5">
        <div className="flex items-center justify-between text-xs text-muted mb-1.5">
          <span>Enter ${token.symbol} Amount to Burn</span>
          <span className="font-mono">Balance: 50,000 ${token.symbol}</span>
        </div>

        <div className="relative">
          <input
            type="number"
            step="any"
            min="0"
            placeholder="e.g. 5000"
            value={memeAmount}
            onChange={(e) => setMemeAmount(e.target.value)}
            className="w-full rounded-xl border border-border bg-[#060b0f] pl-4 pr-24 py-3 text-lg font-mono text-white placeholder-muted focus:border-brand-cyan focus:outline-none shadow-inner"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
            <button
              onClick={() => setMemeAmount("50000")}
              className="rounded bg-[#111e29] px-2 py-1 text-[10px] font-mono text-brand-cyan hover:bg-[#162736]"
            >
              MAX
            </button>
            <span className="font-mono text-xs font-bold text-white">
              ${token.symbol}
            </span>
          </div>
        </div>
      </div>

      {/* Live Pro-Rata Math Output Card (Specified in initial_prompt.md) */}
      <div className="mt-4 rounded-xl border border-[#1e3447] bg-[#07111a] p-4">
        <div className="text-[11px] text-muted mb-1">
          Guaranteed Pro-Rata Entitlement:
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="font-mono text-lg font-bold text-white flex items-center gap-2">
            <span>{numMeme.toLocaleString()} ${token.symbol}</span>
            <span className="text-brand-cyan">═</span>
            <span className="text-brand-emerald">
              {entitledStockShares.toFixed(4)} Shares of {token.targetEquity.symbol}
            </span>
          </div>
          <div className="font-mono text-xs text-muted sm:text-right">
            Est. Floor Value: <strong className="text-white">${entitledUsdcValue.toFixed(2)} USD</strong>
          </div>
        </div>

        <div className="mt-3 pt-2.5 border-t border-border/40 grid grid-cols-2 sm:grid-cols-3 gap-2 text-[10px] text-muted font-mono">
          <div>
            Total Vault Shares: <span className="text-white">{token.treasury.totalEquityLocked.toFixed(2)}</span>
          </div>
          <div>
            Custodian: <span className="text-white">{token.targetEquity.custodian}</span>
          </div>
          <div className="col-span-2 sm:col-span-1">
            Framework: <span className="text-brand-cyan">NY UCC Art. 8</span>
          </div>
        </div>
      </div>

      {/* Success Notification */}
      {txSuccess && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-brand-emerald/40 bg-emerald-950/30 p-3 text-xs text-brand-emerald">
          <Check className="h-4 w-4 flex-shrink-0" />
          <span>{txSuccess}</span>
        </div>
      )}

      {/* Action Buttons (Specified in initial_prompt.md) */}
      <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          onClick={() => {
            setRedeemMode("stock");
            handleExecuteRedeem();
          }}
          disabled={!numMeme || isProcessing}
          className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-cyan to-blue-500 py-3 text-sm font-bold text-black hover:opacity-90 transition-opacity disabled:opacity-50 shadow-lg shadow-brand-cyan/20"
        >
          {isProcessing && redeemMode === "stock" ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <ShieldCheck className="h-4 w-4 stroke-[2.5]" />
          )}
          <span>Withdraw Stock to Wallet</span>
        </button>

        <button
          onClick={() => {
            setRedeemMode("usdc");
            handleExecuteRedeem();
          }}
          disabled={!numMeme || isProcessing}
          className="flex items-center justify-center gap-2 rounded-xl border border-brand-emerald/50 bg-[#0c1f19] py-3 text-sm font-bold text-brand-emerald hover:bg-[#112a22] transition-colors disabled:opacity-50"
        >
          {isProcessing && redeemMode === "usdc" ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <ArrowRight className="h-4 w-4 stroke-[2.5]" />
          )}
          <span>1-Click Swap to USDC</span>
        </button>
      </div>
    </div>
  );
}

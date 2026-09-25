"use client";

import React, { useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { ArrowRight, Check, ShieldCheck, RefreshCw } from "lucide-react";
import { TokenMetadata } from "@/lib/types";
import { calculateEntitledStock } from "@/sdk/math";
import { netAfterTransferFee } from "@/sdk/transferFee";
import { useMarket } from "@/context/MarketContext";

interface BurnRedeemModuleProps {
  token: TokenMetadata;
}

export function BurnRedeemModule({ token }: BurnRedeemModuleProps) {
  const { connected: walletAdapterConnected } = useWallet();
  const { isWalletConnected, executeRedeem } = useMarket();
  const connected = walletAdapterConnected || isWalletConnected;
  const [memeAmount, setMemeAmount] = useState("");
  const [redeemMode, setRedeemMode] = useState<"stock" | "usdc">("stock");
  const [isProcessing, setIsProcessing] = useState(false);
  const [txSuccess, setTxSuccess] = useState<string | null>(null);
  const [txError, setTxError] = useState<string | null>(null);

  const totalMemeSupply = BigInt(Math.floor((token.totalSupply || 0) * 1_000_000));
  const equityDecimals = token.targetEquity.decimals ?? 6;
  const equityScale = 10 ** equityDecimals;
  const totalEquityLocked = BigInt(
    Math.floor((token.treasury.totalEquityLocked || 0) * equityScale)
  );

  const parsedAmount = Number(memeAmount);
  const numMeme = Number.isFinite(parsedAmount) && parsedAmount > 0 ? parsedAmount : 0;
  const memeInLamports = BigInt(Math.floor(numMeme * 1_000_000));

  const entitledGrossRaw =
    numMeme > 0 && totalMemeSupply > 0n && memeInLamports <= totalMemeSupply
      ? calculateEntitledStock(memeInLamports, totalMemeSupply, totalEquityLocked)
      : 0n;
  const transferFee = token.targetEquity.transferFee;
  const estimatedTransferFeeRaw = transferFee && entitledGrossRaw > 0n
    ? entitledGrossRaw - netAfterTransferFee(entitledGrossRaw, transferFee.basisPoints, BigInt(transferFee.maximumFeeRaw))
    : 0n;
  const entitledNetRaw = transferFee ? entitledGrossRaw - estimatedTransferFeeRaw : entitledGrossRaw;
  const entitledStockShares = Number(entitledNetRaw) / equityScale;
  const transferFeeDisclosure = transferFee === undefined
    ? "Current transfer fee is unavailable; the transaction enforces a minimum net receipt on-chain."
    : transferFee === null
      ? "No Token-2022 transfer fee is configured for this collateral."
      : `Net estimate after the current ${(transferFee.basisPoints / 100).toFixed(2)}% transfer fee; the fee may change before signing.`;

  const stockPrice = token.targetEquity.stockPriceUsd;
  const entitledUsdcValue = entitledStockShares * stockPrice;
  const totalMemeSupplyUnits = token.totalSupply || 0;
  const navFloorPerToken = totalMemeSupplyUnits > 0
    ? token.treasury.totalEquityValueUsd / totalMemeSupplyUnits
    : 0;

  const handleExecuteRedeem = async (mode: "stock" | "usdc" = redeemMode) => {
    if (!connected || numMeme <= 0) return;
    setIsProcessing(true);
    setTxError(null);

    try {
      const res = await executeRedeem({
        token,
        memeAmount: numMeme,
        actionType: mode,
      });

      if (res.success) {
        setTxSuccess(res.message);
        setMemeAmount("");
      } else {
        setTxError(res.message || "Redemption failed");
      }
    } catch (err: any) {
      setTxError(err?.message || "Redemption failed");
    } finally {
      setIsProcessing(false);
      setTimeout(() => setTxSuccess(null), 5000);
    }
  };

  return (
    <div className="rounded-2xl border border-amber-500/30 bg-card p-6 shadow-sm">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-foreground">Redeem Collateral</h3>
            {navFloorPerToken > 0 && <span className="rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-mono font-medium text-amber-300">
              NAV Floor Backed
            </span>}
          </div>
          <p className="text-xs text-muted mt-0.5">
            Burn ${token.symbol} to withdraw your pro-rata {token.targetEquity.symbol} collateral tokens.
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-lg bg-card-subtle p-1 border border-border">
          <button
            onClick={() => setRedeemMode("stock")}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
              redeemMode === "stock"
                ? "border border-amber-500/30 bg-amber-500/15 text-amber-300 shadow-sm"
                : "text-muted hover:text-foreground"
            }`}
          >
            Withdraw Collateral
          </button>
          <button
            disabled
            onClick={() => setRedeemMode("usdc")}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
              redeemMode === "usdc"
                ? "bg-emerald-500 hover:bg-emerald-600 text-white shadow-sm"
                : "text-muted hover:text-foreground"
            }`}
          >
            USDC swap unavailable
          </button>
        </div>
      </div>

      {/* Input */}
      <div className="mt-4">
        <div className="flex items-center justify-between text-xs text-muted mb-1.5">
          <span>Amount to Burn</span>
          <span className="font-mono">Balance: check connected wallet</span>
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
              disabled
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

      {/* Pro-Rata Output Box & Formula */}
      <div className="mt-4 rounded-xl border border-border bg-card-subtle p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="font-mono text-base font-bold text-foreground flex items-center gap-2">
            <span>{numMeme.toLocaleString()} ${token.symbol}</span>
            <span className="text-brand-cyan">=</span>
            <span className="text-emerald-400">
              {entitledStockShares.toLocaleString("en-US", { maximumFractionDigits: Math.min(equityDecimals, 9) })} {token.targetEquity.symbol}
            </span>
          </div>
          <div className="font-mono text-xs text-muted">
            Indicative mark: <strong className="text-foreground">{stockPrice > 0 ? `$${entitledUsdcValue.toFixed(2)}` : "—"}</strong>
          </div>
        </div>

        <div className="pt-2 border-t border-border/60 flex flex-col sm:flex-row sm:items-center justify-between text-[11px] text-muted gap-2">
          <span className="font-mono">
            Formula: (Burn Amount / Total Supply) × {token.treasury.totalEquityLocked} {token.targetEquity.symbol}
          </span>
          <span className="flex items-center gap-1 text-slate-300 font-mono font-medium">
            <ShieldCheck className="h-3.5 w-3.5 text-slate-400" />
            {token.treasury.proofOfReserveVerified ? "Reserve verified" : "Reserve verification unavailable"}
          </span>
        </div>
        <p className="text-[10px] text-muted">{transferFeeDisclosure}</p>
      </div>

      {txSuccess && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-xs text-emerald-400">
          <Check className="h-4 w-4 flex-shrink-0" />
          <span>{txSuccess}</span>
        </div>
      )}

      {txError && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-400">
          <Check className="h-4 w-4 flex-shrink-0" />
          <span>{txError}</span>
        </div>
      )}

      {/* Action Buttons with explicit routing description */}
      <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          onClick={() => {
            setRedeemMode("stock");
            handleExecuteRedeem("stock");
          }}
          disabled={!numMeme || isProcessing}
          className="flex flex-col items-center justify-center gap-1 rounded-xl border border-amber-500/40 bg-amber-500/15 py-3 px-4 text-xs font-bold text-amber-300 hover:bg-amber-500/25 transition-colors disabled:opacity-50 shadow-sm"
        >
          <div className="flex items-center gap-1.5">
            {isProcessing && redeemMode === "stock" ? (
              <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
            ) : null}
            <span className="text-sm">{isProcessing && redeemMode === "stock" ? "Processing..." : `Withdraw ${token.targetEquity.symbol} to Wallet`}</span>
          </div>
          <span className="text-[10px] text-amber-400/80 font-normal">
            Direct SPL token transfer to your address
          </span>
        </button>

        <button
          disabled
          className="flex flex-col items-center justify-center gap-1 rounded-xl border border-emerald-500/40 bg-emerald-500/10 py-3 px-4 text-xs font-bold text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-50 shadow-sm"
        >
          <div className="flex items-center gap-1.5">
            <span className="text-sm">USDC conversion unavailable</span>
          </div>
          <span className="text-[10px] text-emerald-400 font-normal">
            No conversion is submitted; withdraw collateral tokens directly.
          </span>
        </button>
      </div>
    </div>
  );
}

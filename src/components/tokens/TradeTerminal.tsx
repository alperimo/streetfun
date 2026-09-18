"use client";

import React, { useState, useMemo, useEffect } from "react";
import Image from "next/image";
import { useWallet } from "@solana/wallet-adapter-react";
import { Settings, AlertCircle, Check } from "lucide-react";
import { TokenMetadata } from "@/lib/types";
import { simulateBuyTokensOut, simulateSellQuoteOut } from "@/sdk/math";
import { useMarket } from "@/context/MarketContext";
import { TradeReceipt } from "./TradeReceipt";
import { receiptFromTrade, receiptFromRedemption, receiptPreview, type TradeReceiptData } from "./tradeReceiptModel";

interface TradeTerminalProps {
  token: TokenMetadata;
  onTradeSuccess?: () => void;
}

export function TradeTerminal({ token, onTradeSuccess }: TradeTerminalProps) {
  const { connected: walletAdapterConnected } = useWallet();
  const { isWalletConnected, executeTrade, executeRedeem, isMock } = useMarket();
  const connected = walletAdapterConnected || isWalletConnected;
  const [receipt, setReceipt] = useState<TradeReceiptData | null>(null);
  useEffect(() => setReceipt(null), [token.mint]);
  const [tradeMode, setTradeMode] = useState<"buy" | "sell" | "redeem">("buy");
  const [amount, setAmount] = useState("");
  const [slippage, setSlippage] = useState<number>(1.0); // 1%
  const [showSettings, setShowSettings] = useState(false);
  const [isTrading, setIsTrading] = useState(false);
  const [tradeSuccessMsg, setTradeSuccessMsg] = useState<string | null>(null);
  const [tradeErrorMsg, setTradeErrorMsg] = useState<string | null>(null);
  const [redeemActionType, setRedeemActionType] = useState<"stock" | "usdc">("stock");

  const virtualQuote = BigInt(token.bondingCurve.virtualQuoteReserves);
  const virtualTokens = BigInt(token.bondingCurve.virtualTokenReserves);
  const realTokens = BigInt(token.bondingCurve.realTokenReserves);

  // Stock Redemption calculation
  const totalMemeSupply = 1_000_000_000;
  const numTokensToRedeem = parseFloat(amount) || 0;
  const targetStockPrice = token.targetEquity.stockPriceUsd || 128.5;
  // At $60k graduation, $30k buys stock:
  const totalStockSharesInVault = token.treasury.totalEquityLocked || (30_000 / targetStockPrice);
  const entitledStockShares = numTokensToRedeem > 0 ? (numTokensToRedeem / totalMemeSupply) * totalStockSharesInVault : 0;
  const entitledUsdcValue = entitledStockShares * targetStockPrice;
  const floorPricePerToken = 0.0031;

  // Simulation calculation
  const simulation = useMemo(() => {
    if (tradeMode === "redeem") return null;
    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) return null;

    try {
      if (tradeMode === "buy") {
        const quoteIn = BigInt(Math.floor(numAmount * 1_000_000));
        return {
          type: "buy" as const,
          ...simulateBuyTokensOut(quoteIn, virtualQuote, virtualTokens, realTokens, 100),
        };
      } else {
        const tokensIn = BigInt(Math.floor(numAmount * 1_000_000));
        const realQuote = BigInt(Math.floor(token.bondingCurve.realQuoteReservesUsd * 1_000_000));
        return {
          type: "sell" as const,
          ...simulateSellQuoteOut(tokensIn, virtualQuote, virtualTokens, realQuote, 100),
        };
      }
    } catch (err: any) {
      return { error: err.message };
    }
  }, [amount, tradeMode, virtualQuote, virtualTokens, realTokens, token.bondingCurve.realQuoteReservesUsd]);

  const handleExecuteTrade = async () => {
    if (!connected) return;
    setIsTrading(true);
    setTradeErrorMsg(null);
    setReceipt(null);

    try {
      if (tradeMode === "redeem") {
        const res = await executeRedeem({
          token,
          memeAmount: numTokensToRedeem,
          actionType: redeemActionType,
        });

        if (res.success) {
          setReceipt(receiptFromRedemption(token, redeemActionType, numTokensToRedeem, res, isMock));
          setTradeSuccessMsg(res.message);
          setAmount("");
          if (onTradeSuccess) onTradeSuccess();
        } else {
          setTradeErrorMsg(res.message || "Redemption failed");
        }
      } else {
        const numAmount = parseFloat(amount);
        const res = await executeTrade({
          token,
          tradeMode,
          amount: numAmount,
          slippagePct: slippage,
        });

        if (res.success) {
          setReceipt(receiptFromTrade(token, tradeMode, res, isMock));
          setTradeSuccessMsg(res.message);
          setAmount("");
          if (onTradeSuccess) onTradeSuccess();
        } else {
          setTradeErrorMsg(res.message || "Trade failed");
        }
      }
    } catch (err: any) {
      setTradeErrorMsg(err?.message || "Operation failed");
    } finally {
      setIsTrading(false);
      setTimeout(() => setTradeSuccessMsg(null), 5000);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      {/* 3-Tab Switch: Buy / Sell / Redeem Stock */}
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex items-center gap-1 rounded-lg bg-card-subtle p-1 border border-border/80">
          <button
            onClick={() => {
              setTradeMode("buy");
              setAmount("");
            }}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              tradeMode === "buy"
                ? "bg-emerald-500/15 text-emerald-400 font-semibold border border-emerald-500/30"
                : "text-muted hover:text-foreground"
            }`}
          >
            Buy
          </button>
          <button
            onClick={() => {
              setTradeMode("sell");
              setAmount("");
            }}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              tradeMode === "sell"
                ? "bg-rose-500/15 text-rose-400 font-semibold border border-rose-500/30"
                : "text-muted hover:text-foreground"
            }`}
          >
            Sell
          </button>
          <button
            onClick={() => {
              setTradeMode("redeem");
              setAmount("50000");
            }}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1 ${
              tradeMode === "redeem"
                ? "bg-amber-500/15 text-amber-300 font-semibold border border-amber-500/30"
                : "text-muted hover:text-foreground"
            }`}
          >
            <span>Redeem Stock</span>
            <span className="rounded bg-amber-500/20 text-amber-300 px-1 text-[9px] font-bold">NAV</span>
          </button>
        </div>

        {/* Slippage Settings Toggle (only for buy/sell) */}
        {tradeMode !== "redeem" && (
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="flex items-center gap-1 text-xs text-muted hover:text-foreground transition-colors"
          >
            <Settings className="h-3.5 w-3.5" />
            <span className="font-mono">{slippage}%</span>
          </button>
        )}
      </div>

      {/* Slippage drawer */}
      {showSettings && tradeMode !== "redeem" && (
        <div className="mt-3 rounded-lg bg-card-subtle p-3 border border-border/80 text-xs flex items-center justify-between">
          <span className="text-muted">Max Slippage:</span>
          <div className="flex items-center gap-1">
            {[0.5, 1.0, 2.5].map((s) => (
              <button
                key={s}
                onClick={() => setSlippage(s)}
                className={`px-2 py-0.5 rounded font-mono text-[11px] transition-colors ${
                  slippage === s
                    ? "bg-card-hover text-foreground font-semibold"
                    : "bg-card-hover/40 text-muted hover:text-foreground"
                }`}
              >
                {s}%
              </button>
            ))}
          </div>
        </div>
      )}

      {tradeMode === "redeem" ? (
        <div className="mt-4 space-y-4">
          {/* Dual Action Toggle */}
          <div className="flex items-center gap-1 rounded-lg bg-card-subtle p-1 border border-border/80">
            <button
              onClick={() => setRedeemActionType("stock")}
              className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${
                redeemActionType === "stock"
                  ? "bg-card-hover text-foreground font-semibold border border-border-active"
                  : "text-muted hover:text-foreground"
              }`}
            >
              Redeem {token.targetEquity.symbol} Stock
            </button>
            <button
              onClick={() => setRedeemActionType("usdc")}
              className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${
                redeemActionType === "usdc"
                  ? "bg-card-hover text-foreground font-semibold border border-border-active"
                  : "text-muted hover:text-foreground"
              }`}
            >
              Instant USDC Exit
            </button>
          </div>

          {/* Input Box */}
          <div>
            <div className="flex items-center justify-between text-xs text-muted mb-1.5">
              <span>Amount to Redeem (${token.symbol})</span>
              <span className="font-mono">Balance: 500,000 ${token.symbol}</span>
            </div>

            <div className="relative flex items-center rounded-lg border border-border bg-card-subtle transition-colors focus-within:border-border-active">
              <input
                type="number"
                step="any"
                min="0"
                placeholder="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-transparent pl-3.5 pr-28 py-2.5 text-lg sm:text-xl font-mono font-medium text-foreground placeholder:text-muted/40 focus:outline-none"
              />
              <div className="absolute right-2 flex items-center gap-1.5 rounded-md bg-card border border-border px-2 py-1 text-xs font-semibold text-foreground">
                <div className="relative h-4 w-4 overflow-hidden rounded-full border border-border flex-shrink-0">
                  <Image
                    src={token.avatarUrl}
                    alt={token.symbol}
                    fill
                    className="object-cover"
                    sizes="16px"
                  />
                </div>
                <span className="font-mono">${token.symbol}</span>
              </div>
            </div>

            {/* Quick Burn Chips - Borderless, muted hover */}
            <div className="mt-2 grid grid-cols-4 gap-1.5 text-center text-xs font-mono">
              {["10000", "50000", "100000", "500000"].map((val) => (
                <button
                  key={val}
                  onClick={() => setAmount(val)}
                  className="rounded-md bg-card-hover/40 py-1.5 text-muted hover:bg-card-hover hover:text-foreground transition-colors"
                >
                  {parseInt(val) >= 1000 ? `${parseInt(val) / 1000}K` : val}
                </button>
              ))}
            </div>
          </div>

          {/* Interactive Calculation Card */}
          <div className="rounded-lg border border-border/80 bg-card-subtle p-3.5 space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted">Collateral Stock:</span>
              <span className="font-semibold text-foreground flex items-center gap-1">
                {token.targetEquity.name} ({token.targetEquity.symbol})
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-muted">You Receive:</span>
              <span className="font-mono font-bold text-amber-300 text-sm">
                {entitledStockShares.toFixed(4)} Shares
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-muted">Redemption Value:</span>
              <span className="font-mono font-bold text-emerald-400 text-sm">
                ${entitledUsdcValue.toFixed(2)} USDC
              </span>
            </div>

            <div className="flex items-center justify-between border-t border-border/80 pt-2 text-[11px]">
              <span className="text-muted">Vault Floor:</span>
              <span className="font-mono text-amber-300 font-medium">
                ${floorPricePerToken} / token
              </span>
            </div>
          </div>

          {/* Success Notification */}
          {tradeSuccessMsg && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-xs text-emerald-400">
              <Check className="h-4 w-4 flex-shrink-0" />
              <span>{tradeSuccessMsg}</span>
            </div>
          )}

          {/* Error Notification */}
          {tradeErrorMsg && (
            <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-400">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{tradeErrorMsg}</span>
            </div>
          )}

          {/* Action Button */}
          <button
            onClick={handleExecuteTrade}
            disabled={!numTokensToRedeem || isTrading}
            className={`w-full rounded-lg py-3 text-sm font-semibold transition-colors shadow-xs disabled:opacity-50 ${
              !connected
                ? "bg-card-hover/50 border border-border text-foreground hover:bg-card-hover"
                : "bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold"
            }`}
          >
            {isTrading
              ? "Executing on Solana..."
              : !connected
              ? "Connect Wallet to Redeem"
              : redeemActionType === "stock"
              ? `Burn & Redeem ${entitledStockShares.toFixed(4)} ${token.targetEquity.symbol} Stock`
              : `Burn & Swap to $${entitledUsdcValue.toFixed(2)} USDC`}
          </button>
        </div>
      ) : (
        <>
          {/* Bonding Curve Progress Indicator */}
          <div className="mt-4 rounded-lg border border-border/80 bg-card-subtle p-3 text-xs">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="font-semibold text-foreground flex items-center gap-1.5 whitespace-nowrap">
                <span className="h-2 w-2 rounded-full bg-brand-cyan" />
                Bonding Progress
              </span>
              <span className="font-mono text-slate-300 font-semibold whitespace-nowrap">
                {token.bondingCurve.progressPct}% Funded
              </span>
            </div>
            {/* Progress bar */}
            <div className="h-1.5 w-full rounded-full bg-border overflow-hidden">
              <div
                className="bg-gradient-to-r from-brand-cyan/70 to-brand-cyan h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(token.bondingCurve.progressPct, 100)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[10px] text-muted mt-1.5 font-mono">
              <span>${token.bondingCurve.realQuoteReservesUsd.toLocaleString("en-US")} / $60,000 USDC</span>
              <span>50% Stock Purchase · 50% Liquidity</span>
            </div>
          </div>

          {/* Input Box */}
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-muted mb-1.5">
              <span>{tradeMode === "buy" ? "You Pay (USDC)" : `You Sell (${token.symbol})`}</span>
              <span className="font-mono">
                Balance: {tradeMode === "buy" ? "10,000.00 USDC" : `500,000 ${token.symbol}`}
              </span>
            </div>

            <div className="relative flex items-center rounded-lg border border-border bg-card-subtle transition-colors focus-within:border-border-active">
              <input
                type="number"
                step="any"
                min="0"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full bg-transparent pl-3.5 pr-28 py-2.5 text-lg sm:text-xl font-mono font-medium text-foreground placeholder:text-muted/40 focus:outline-none"
              />
              <div className="absolute right-2 flex items-center gap-1.5 rounded-md bg-card border border-border px-2 py-1 text-xs font-semibold text-foreground">
                {tradeMode === "buy" ? (
                  <>
                    <div className="h-4 w-4 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-[10px] font-bold">
                      $
                    </div>
                    <span className="font-mono">USDC</span>
                  </>
                ) : (
                  <>
                    <div className="relative h-4 w-4 overflow-hidden rounded-full border border-border flex-shrink-0">
                      <Image
                        src={token.avatarUrl}
                        alt={token.symbol}
                        fill
                        className="object-cover"
                        sizes="16px"
                      />
                    </div>
                    <span className="font-mono">${token.symbol}</span>
                  </>
                )}
              </div>
            </div>

            {/* Quick Amount Chips - Borderless, subtle hover */}
            <div className="mt-2 grid grid-cols-4 gap-1.5 text-center text-xs font-mono">
              {tradeMode === "buy"
                ? ["50", "250", "1000", "5000"].map((val) => (
                    <button
                      key={val}
                      onClick={() => setAmount(val)}
                      className="rounded-md bg-card-hover/40 py-1.5 text-muted hover:bg-card-hover hover:text-foreground transition-colors"
                    >
                      ${val}
                    </button>
                  ))
                : ["25%", "50%", "75%", "100%"].map((pct) => (
                    <button
                      key={pct}
                      onClick={() => {
                        const frac = parseInt(pct) / 100;
                        setAmount((500_000 * frac).toString());
                      }}
                      className="rounded-md bg-card-hover/40 py-1.5 text-muted hover:bg-card-hover hover:text-foreground transition-colors"
                    >
                      {pct}
                    </button>
                  ))}
            </div>
          </div>

          {/* Trade Simulation Breakdown */}
          {simulation && !("error" in simulation) && (
            <div className="mt-4 rounded-lg bg-card-subtle p-3 border border-border/80 space-y-2 text-xs">
              <div className="flex items-center justify-between text-muted">
                <span>You Receive (Estimated):</span>
                <span className="font-mono font-bold text-foreground">
                  {simulation.type === "buy"
                    ? `${(Number(simulation.tokensOut) / 1_000_000).toLocaleString("en-US", { maximumFractionDigits: 2 })} ${token.symbol}`
                    : `${(Number(simulation.netQuoteOut) / 1_000_000).toFixed(2)} USDC`}
                </span>
              </div>

              <div className="flex items-center justify-between text-muted text-[11px]">
                <span>Effective Price:</span>
                <span className="font-mono text-foreground">
                  ${simulation.effectivePriceUsd.toFixed(6)}
                </span>
              </div>

              <div className="flex items-center justify-between text-muted text-[11px]">
                <span>Price Impact:</span>
                <span
                  className={`font-mono ${
                    simulation.priceImpactPct > 5
                      ? "text-rose-400 font-bold"
                      : "text-emerald-400"
                  }`}
                >
                  {simulation.priceImpactPct.toFixed(2)}%
                </span>
              </div>

              <div className="flex items-center justify-between text-muted text-[11px]">
                <span>Protocol Fee (1%):</span>
                <span className="font-mono text-foreground">
                  ${(Number(simulation.feeQuote) / 1_000_000).toFixed(2)} USDC
                </span>
              </div>
            </div>
          )}

          {/* Simulation Error */}
          {simulation && "error" in simulation && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-400">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{simulation.error}</span>
            </div>
          )}

          {/* Success Notification */}
          {tradeSuccessMsg && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-xs text-emerald-400">
              <Check className="h-4 w-4 flex-shrink-0" />
              <span>{tradeSuccessMsg}</span>
            </div>
          )}

          {/* Trade Error Notification */}
          {tradeErrorMsg && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-400">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{tradeErrorMsg}</span>
            </div>
          )}

          {/* Action Button */}
          <button
            onClick={handleExecuteTrade}
            disabled={!amount || isTrading || Boolean(simulation && "error" in simulation)}
            className={`mt-4 w-full rounded-lg py-3 text-sm font-bold transition-colors shadow-xs disabled:opacity-50 ${
              !connected
                ? "bg-brand-cyan hover:bg-brand-cyan-hover text-background font-semibold"
                : tradeMode === "buy"
                ? "bg-emerald-500 hover:bg-emerald-600 text-white"
                : "bg-rose-500 hover:bg-rose-600 text-white"
            }`}
          >
            {isTrading
              ? "Confirming on Solana..."
              : !connected
              ? "Connect Wallet to Trade"
              : tradeMode === "buy"
              ? `Buy $${token.symbol}`
              : `Sell $${token.symbol}`}
          </button>
        </>
      )}
      {receipt && receipt.token.mint === token.mint && <TradeReceipt key={receipt.timestamp} data={receipt} onDismiss={() => setReceipt(null)} />}
      {!receipt && <button type="button" disabled={isTrading} onClick={() => setReceipt(receiptPreview(token))} className="mt-4 w-full text-center text-[10px] text-muted underline decoration-border underline-offset-4 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-cyan">Preview receipt</button>}
    </div>
  );
}

"use client";

import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddress } from "@solana/spl-token";
import { Settings, AlertCircle, Check, TrendingUp } from "lucide-react";
import { TokenMetadata } from "@/lib/types";
import { simulateBuyTokensOut, simulateSellQuoteOut } from "@/sdk/math";
import { useMarket } from "@/context/MarketContext";
import { TradeReceipt } from "./TradeReceipt";
import { receiptFromTrade, receiptFromRedemption, receiptPreview, type TradeReceiptData } from "./tradeReceiptModel";
import { formatBondingProgress, formatTokenPrice, formatUsd } from "@/lib/marketFormat";

interface TradeTerminalProps {
  token: TokenMetadata;
  onTradeSuccess?: () => void;
}

export function TradeTerminal({ token, onTradeSuccess }: TradeTerminalProps) {
  const { connection } = useConnection();
  const { connected: walletAdapterConnected, publicKey } = useWallet();
  const { isWalletConnected, executeTrade, executeRedeem, isMock } = useMarket();
  const connected = isMock ? walletAdapterConnected || isWalletConnected : walletAdapterConnected;
  const [receipt, setReceipt] = useState<TradeReceiptData | null>(null);
  useEffect(() => setReceipt(null), [token.mint]);
  const [tradeMode, setTradeMode] = useState<"buy" | "sell" | "redeem">("buy");
  const [amount, setAmount] = useState("");
  const [slippage, setSlippage] = useState<number>(1.0); // 1%
  const [showSettings, setShowSettings] = useState(false);
  const [isTrading, setIsTrading] = useState(false);
  const [tradeErrorMsg, setTradeErrorMsg] = useState<string | null>(null);
  const [redeemActionType, setRedeemActionType] = useState<"stock" | "usdc">("stock");
  const [buyAnimation, setBuyAnimation] = useState<"idle" | "success">("idle");
  const [quoteBalance, setQuoteBalance] = useState<number | null>(null);
  const [tokenBalance, setTokenBalance] = useState<number | null>(null);
  const buyAnimationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (buyAnimationTimer.current) clearTimeout(buyAnimationTimer.current);
    };
  }, []);

  const virtualQuote = BigInt(token.bondingCurve.virtualQuoteReserves);
  const virtualTokens = BigInt(token.bondingCurve.virtualTokenReserves);
  const realTokens = BigInt(token.bondingCurve.realTokenReserves);

  const loadBalances = useCallback(async () => {
    if (!publicKey || !token.bondingCurve.quoteMint) {
      setQuoteBalance(null);
      setTokenBalance(null);
      return;
    }
    try {
      const quoteMint = new PublicKey(token.bondingCurve.quoteMint);
      const memeMint = new PublicKey(token.mint);
      const [quoteAccount, memeAccount] = await Promise.all([
        getAssociatedTokenAddress(quoteMint, publicKey),
        getAssociatedTokenAddress(memeMint, publicKey),
      ]);
      const [quoteInfo, memeInfo] = await Promise.all([
        connection.getTokenAccountBalance(quoteAccount, "confirmed").catch(() => null),
        connection.getTokenAccountBalance(memeAccount, "confirmed").catch(() => null),
      ]);
      setQuoteBalance(quoteInfo?.value.uiAmount ?? 0);
      setTokenBalance(memeInfo?.value.uiAmount ?? 0);
    } catch {
      setQuoteBalance(null);
      setTokenBalance(null);
    }
  }, [connection, publicKey, token.bondingCurve.quoteMint, token.mint]);

  useEffect(() => {
    loadBalances();
    if (!publicKey) return;
    const interval = setInterval(loadBalances, 10_000);
    return () => clearInterval(interval);
  }, [loadBalances, publicKey]);

  // Stock Redemption calculation
  const totalMemeSupply = token.totalSupply || 0;
  const numTokensToRedeem = parseFloat(amount) || 0;
  const targetStockPrice = token.targetEquity.stockPriceUsd || 0;
  const totalStockSharesInVault = token.treasury.totalEquityLocked;
  const entitledStockShares =
    numTokensToRedeem > 0 && totalMemeSupply > 0
      ? (numTokensToRedeem / totalMemeSupply) * totalStockSharesInVault
      : 0;
  const entitledUsdcValue = entitledStockShares * targetStockPrice;
  const floorPricePerToken =
    totalMemeSupply > 0 ? token.treasury.totalEquityValueUsd / totalMemeSupply : 0;

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
          ...simulateBuyTokensOut(
            quoteIn,
            virtualQuote,
            virtualTokens,
            realTokens,
            token.bondingCurve.dynamicFeeBps ?? 100
          ),
        };
      } else {
        const tokensIn = BigInt(Math.floor(numAmount * 1_000_000));
        const realQuote = BigInt(Math.floor(token.bondingCurve.realQuoteReservesUsd * 1_000_000));
        return {
          type: "sell" as const,
          ...simulateSellQuoteOut(
            tokensIn,
            virtualQuote,
            virtualTokens,
            realQuote,
            token.bondingCurve.dynamicFeeBps ?? 100
          ),
        };
      }
    } catch (err: any) {
      return { error: err.message };
    }
  }, [amount, tradeMode, virtualQuote, virtualTokens, realTokens, token.bondingCurve.realQuoteReservesUsd, token.bondingCurve.dynamicFeeBps]);

  const handleExecuteTrade = async () => {
    if (!connected) return;
    const submittedMode = tradeMode;
    setIsTrading(true);
    setBuyAnimation("idle");
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
          if (!isMock && (!res.tokensAmount || res.message.includes("index"))) {
            setTradeErrorMsg(res.message);
          }
          setAmount("");
          await loadBalances();
          if (submittedMode === "buy") {
            setBuyAnimation("success");
            if (buyAnimationTimer.current) clearTimeout(buyAnimationTimer.current);
            buyAnimationTimer.current = setTimeout(() => setBuyAnimation("idle"), 1800);
          }
          if (onTradeSuccess) onTradeSuccess();
        } else {
          setTradeErrorMsg(res.message || "Trade failed");
        }
      }
    } catch (err: any) {
      setTradeErrorMsg(err?.message || "Operation failed");
    } finally {
      setIsTrading(false);
    }
  };

  if (!isMock && token.bondingCurve.isGraduated) {
    return (
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-sm font-bold text-foreground">Trading route unavailable</h2>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          This curve is graduated. A verified AMM trading and equity redemption route is not configured,
          so StreetFun will not submit or simulate an order here.
        </p>
        {token.bondingCurve.meteoraPoolAddress && (
          <span className="mt-3 block break-all font-mono text-[10px] text-muted">
            Pool: {token.bondingCurve.meteoraPoolAddress}
          </span>
        )}
      </div>
    );
  }

  return (
    <div
      className={`trade-terminal rounded-xl border border-border bg-card p-5 shadow-sm ${
        buyAnimation === "success" ? "trade-terminal-buy-success" : ""
      }`}
    >
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
              <span className="font-mono">
                Balance: {tokenBalance === null ? "—" : `${tokenBalance.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${token.symbol}`}
              </span>
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
                {floorPricePerToken > 0 ? `${formatTokenPrice(floorPricePerToken)} / token` : "Oracle unavailable"}
              </span>
            </div>
          </div>

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
                {formatBondingProgress(token.bondingCurve.progressPct)} Funded
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
              <span>{formatUsd(token.bondingCurve.realQuoteReservesUsd)} / {formatUsd(token.bondingCurve.graduationThresholdUsd)} USDC</span>
              <span>50% Stock Purchase · 50% Liquidity</span>
            </div>
          </div>

          {/* Input Box */}
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-muted mb-1.5">
              <span>{tradeMode === "buy" ? "You Pay (USDC)" : `You Sell (${token.symbol})`}</span>
              <span className="font-mono">
                Balance: {tradeMode === "buy"
                  ? quoteBalance === null ? "—" : `${quoteBalance.toLocaleString("en-US", { maximumFractionDigits: 2 })} USDC`
                  : tokenBalance === null ? "—" : `${tokenBalance.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${token.symbol}`}
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
                        setAmount(((tokenBalance || 0) * frac).toString());
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
                  {formatTokenPrice(simulation.effectivePriceUsd)}
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
                <span>Protocol Fee ({((token.bondingCurve.dynamicFeeBps || 0) / 100).toFixed(2)}%):</span>
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
            disabled={!amount || isTrading || buyAnimation === "success" || Boolean(simulation && "error" in simulation)}
            data-buy-state={tradeMode === "buy" ? (isTrading ? "confirming" : buyAnimation) : undefined}
            className={`trade-action-button relative mt-4 w-full overflow-visible rounded-lg py-3 text-sm font-bold transition-colors shadow-xs disabled:opacity-50 ${
              !connected
                ? "bg-brand-cyan hover:bg-brand-cyan-hover text-background font-semibold"
                : tradeMode === "buy"
                ? "buy-action bg-brand-cyan hover:bg-brand-cyan-hover text-background"
                : "bg-rose-500 hover:bg-rose-600 text-white"
            }`}
          >
            {tradeMode === "buy" && connected && (
              <span className="buy-particles pointer-events-none absolute inset-0" aria-hidden="true">
                {Array.from({ length: 7 }).map((_, index) => <span key={index} />)}
              </span>
            )}
            <span className="relative z-10 inline-flex items-center justify-center gap-2">
            {buyAnimation === "success" && tradeMode === "buy"
              ? <><span className="buy-success-check inline-flex h-5 w-5 items-center justify-center rounded-full border border-background/30"><Check className="h-3.5 w-3.5" strokeWidth={3} /></span>Order filled</>
              : isTrading
              ? <><span className="buy-confirming-icon inline-flex h-4 w-4 items-center justify-center"><TrendingUp className="h-4 w-4" /></span>Confirming on Solana...</>
              : !connected
              ? "Connect Wallet to Trade"
              : tradeMode === "buy"
              ? `Buy $${token.symbol}`
              : `Sell $${token.symbol}`}
            </span>
          </button>
        </>
      )}
      {receipt && receipt.token.mint === token.mint && <TradeReceipt key={receipt.timestamp} data={receipt} onDismiss={() => setReceipt(null)} />}
      {isMock && !receipt && <button type="button" disabled={isTrading} onClick={() => setReceipt(receiptPreview(token))} className="mt-4 w-full text-center text-[10px] text-muted underline decoration-border underline-offset-4 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-cyan">Preview receipt</button>}
    </div>
  );
}

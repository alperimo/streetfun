"use client";

import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { SubmittedTransactionError, pendingTradeKey, savePendingTrade } from "@/services/solana/transactionConfirmation";
import { toTokenUnits } from "@/sdk/amounts";
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
import { GraduationStepPendingError, graduateToken } from "@/services/solana/solanaGraduationService";

function formatCollateralUnits(value: number, decimals: number): string {
  if (!Number.isFinite(value)) return "—";
  return value.toLocaleString("en-US", { maximumFractionDigits: Math.max(0, Math.min(decimals, 9)) });
}

interface TradeTerminalProps {
  token: TokenMetadata;
  onTradeSuccess?: () => void;
}

export function TradeTerminal({ token, onTradeSuccess }: TradeTerminalProps) {
  const { connection } = useConnection();
  const { connected: walletAdapterConnected, publicKey, sendTransaction } = useWallet();
  const { isWalletConnected, executeTrade, executeRedeem, isMock, refreshTokens, setWalletDialogOpen } = useMarket();
  const isDbcCreator = Boolean(publicKey && token.bondingCurve.protocol === "meteora-dbc" && token.creator === publicKey.toBase58());
  const [unixNow, setUnixNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const timer = window.setInterval(() => setUnixNow(Math.floor(Date.now() / 1000)), 15_000);
    return () => window.clearInterval(timer);
  }, []);
  const isDbcFallbackOpen = Boolean(
    token.bondingCurve.protocol === "meteora-dbc" &&
    token.bondingCurve.dbcSettlementFallbackAt &&
    unixNow >= token.bondingCurve.dbcSettlementFallbackAt,
  );
  const canSettleDbc = isDbcCreator || isDbcFallbackOpen;
  const connected = walletAdapterConnected || isWalletConnected;
  const [receipt, setReceipt] = useState<TradeReceiptData | null>(null);
  const [tradeMode, setTradeMode] = useState<"buy" | "sell" | "redeem">(
    token.bondingCurve.isGraduated && token.bondingCurve.protocol !== "meteora-dbc" ? "redeem" : "buy"
  );
  useEffect(() => {
    setReceipt(null);
    setTradeMode(token.bondingCurve.isGraduated && token.bondingCurve.protocol !== "meteora-dbc" ? "redeem" : "buy");
  }, [token.mint, token.bondingCurve.isGraduated, token.bondingCurve.protocol]);
  const [amount, setAmount] = useState("");
  const [slippage, setSlippage] = useState<number>(1.0); // 1%
  const [showSettings, setShowSettings] = useState(false);
  const [isTrading, setIsTrading] = useState(false);
  const [tradeErrorMsg, setTradeErrorMsg] = useState<string | null>(null);
  const [buyAnimation, setBuyAnimation] = useState<"idle" | "success">("idle");
  const [quoteBalance, setQuoteBalance] = useState<number | null>(null);
  const [tokenBalance, setTokenBalance] = useState<number | null>(null);
  const [liveQuote, setLiveQuote] = useState<any>(null);
  const [liveQuoteError, setLiveQuoteError] = useState<string | null>(null);
  const [liveQuoteLoading, setLiveQuoteLoading] = useState(false);
  const [pendingSignature, setPendingSignature] = useState<string | null>(null);
  const [pendingGraduationSignature, setPendingGraduationSignature] = useState<string | null>(null);
  const [pendingGraduationStep, setPendingGraduationStep] = useState<"migration" | "settlement">("settlement");
  const orderInFlight = useRef(false);
  const pendingKey = pendingTradeKey(publicKey?.toBase58(), token.mint);
  useEffect(() => {
    try { setPendingSignature(sessionStorage.getItem(pendingKey)); } catch {}
  }, [pendingKey]);
  const graduationPendingKey = `streetfun:graduation:${publicKey?.toBase58()}:${token.mint}`;
  useEffect(() => {
    try {
      setPendingGraduationSignature(sessionStorage.getItem(graduationPendingKey));
      setPendingGraduationStep(sessionStorage.getItem(`${graduationPendingKey}:step`) === "migration" ? "migration" : "settlement");
    } catch {}
  }, [graduationPendingKey]);
  const savePending = (signature: string | null) => {
    setPendingSignature(signature);
    savePendingTrade(pendingKey, signature);
  };
  const checkPending = async () => {
    if (!pendingSignature || orderInFlight.current) return;
    orderInFlight.current = true;
    setIsTrading(true);
    try {
      const result = await connection.getSignatureStatuses([pendingSignature], { searchTransactionHistory: true });
      const status = result.value[0];
      if (status?.err) {
        savePending(null);
        setTradeErrorMsg("The submitted transaction failed. You can review the amount and try again.");
      } else if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") {
        savePending(null);
        setAmount("");
        setTradeErrorMsg("Transaction confirmed. Your balances and trade history are updating.");
        if (!isMock) {
          // Recover indexing as well as balances when the original confirmation timed out.
          await fetch("/api/trades/confirm", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ signature: pendingSignature, mint: token.mint, protocol: token.bondingCurve.protocol }),
          }).catch(() => null);
        }
        await Promise.all([refreshTokens(), loadBalances()]);
        onTradeSuccess?.();
      } else setTradeErrorMsg("Confirmation is still pending. Keep this transaction signature and check again.");
    } catch { setTradeErrorMsg("Could not check confirmation. Your submitted order has not been retried."); }
    finally { orderInFlight.current = false; setIsTrading(false); }
  };
  const buyAnimationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (buyAnimationTimer.current) clearTimeout(buyAnimationTimer.current);
    };
  }, []);

  const virtualQuote = BigInt(token.bondingCurve.virtualQuoteReserves || "0");
  const virtualTokens = BigInt(token.bondingCurve.virtualTokenReserves || "0");
  const realTokens = BigInt(token.bondingCurve.realTokenReserves || "0");

  useEffect(() => {
    if (token.bondingCurve.protocol !== "meteora-dbc" || tradeMode === "redeem" || !amount || Number(amount) <= 0) {
      setLiveQuote(null);
      setLiveQuoteError(null);
      setLiveQuoteLoading(false);
      return;
    }
    const controller = new AbortController();
    setLiveQuote(null);
    setLiveQuoteError(null);
    setLiveQuoteLoading(true);
    const timer = setTimeout(async () => {
      try {
        const response = await fetch("/api/trade/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          signal: controller.signal,
          body: JSON.stringify({ mint: token.mint, direction: tradeMode, amount, slippageBps: Math.round(slippage * 100) }),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.error || "Live Meteora quote is unavailable.");
        setLiveQuote(payload);
      } catch (error) {
        if (!controller.signal.aborted) setLiveQuoteError(error instanceof Error ? error.message : "Live Meteora quote is unavailable.");
      } finally {
        if (!controller.signal.aborted) setLiveQuoteLoading(false);
      }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [amount, slippage, token.bondingCurve.protocol, token.mint, tradeMode]);

  const balanceRequest = useRef(0);
  const loadBalances = useCallback(async () => {
    const request = ++balanceRequest.current;
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
      if (request !== balanceRequest.current) return;
      setQuoteBalance(quoteInfo?.value.uiAmount ?? 0);
      setTokenBalance(memeInfo?.value.uiAmount ?? 0);
    } catch {
      if (request !== balanceRequest.current) return;
      setQuoteBalance(0);
      setTokenBalance(0);
    }
  }, [connection, publicKey, token.bondingCurve.quoteMint, token.mint]);

  useEffect(() => {
    setQuoteBalance(null);
    setTokenBalance(null);
    loadBalances();
    const interval = setInterval(loadBalances, 10_000);
    return () => { clearInterval(interval); balanceRequest.current += 1; };
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
  const entitledMarkValueUsd = entitledStockShares * targetStockPrice;
  const floorPricePerToken =
    totalMemeSupply > 0 ? token.treasury.totalEquityValueUsd / totalMemeSupply : 0;

  // Simulation calculation
  const simulation = useMemo(() => {
    if (tradeMode === "redeem") return null;
    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) return null;

    if (token.bondingCurve.protocol === "meteora-dbc") {
      if (liveQuoteError) return { error: liveQuoteError };
      if (!liveQuote) return null;
      const outputRaw = BigInt(liveQuote.outputAmountRaw);
      return {
        type: tradeMode,
        tokensOut: tradeMode === "buy" ? outputRaw : BigInt(0),
        netQuoteOut: tradeMode === "sell" ? outputRaw : BigInt(0),
        effectivePriceUsd: Number(liveQuote.effectivePriceUsd),
        priceImpactPct: Number(liveQuote.priceImpactPct || 0),
        feeQuote: BigInt(0),
      };
    }

    try {
      if (tradeMode === "buy") {
        const quoteIn = toTokenUnits(numAmount);
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
        const tokensIn = toTokenUnits(numAmount);
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
  }, [amount, tradeMode, virtualQuote, virtualTokens, realTokens, token.bondingCurve.realQuoteReservesUsd, token.bondingCurve.dynamicFeeBps, token.bondingCurve.protocol, liveQuote, liveQuoteError]);

  const numAmount = parseFloat(amount) || 0;
  const remainingQuoteUsd = Math.max(
    0,
    token.bondingCurve.graduationThresholdUsd - token.bondingCurve.realQuoteReservesUsd
  );
  const isNearCap =
    !token.bondingCurve.isGraduated &&
    token.bondingCurve.progressPct < 100 &&
    remainingQuoteUsd > 0 &&
    remainingQuoteUsd < 50;
  const exceedsCap =
    tradeMode === "buy" &&
    !token.bondingCurve.isGraduated &&
    remainingQuoteUsd > 0 &&
    numAmount > remainingQuoteUsd;

  const hasInsufficientUsdc =
    connected && tradeMode === "buy" && numAmount > 0 && quoteBalance !== null && numAmount > quoteBalance;
  const hasInsufficientTokens =
    connected && tradeMode === "sell" && numAmount > 0 && tokenBalance !== null && numAmount > tokenBalance;

  const handleExecuteTrade = async () => {
    if (!connected) { setWalletDialogOpen(true); return; }
    if (orderInFlight.current || pendingSignature) return;
    if (tradeMode === "buy" && exceedsCap) {
      setTradeErrorMsg(
        `Amount exceeds remaining curve capacity ($${remainingQuoteUsd < 0.01 ? remainingQuoteUsd.toFixed(4) : remainingQuoteUsd.toFixed(2)} USDC remaining).`
      );
      return;
    }
    if (tradeMode === "buy" && hasInsufficientUsdc) {
      setTradeErrorMsg("Insufficient USDC balance in your wallet.");
      return;
    }
    if (tradeMode === "sell" && hasInsufficientTokens) {
      setTradeErrorMsg(`Insufficient $${token.symbol} balance in your wallet.`);
      return;
    }
    try { toTokenUnits(Number(amount)); }
    catch (error) { setTradeErrorMsg((error as Error).message); return; }
    orderInFlight.current = true;
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
          actionType: "stock",
        });

        if (res.success) {
          setReceipt(receiptFromRedemption(token, "stock", numTokensToRedeem, res, isMock));
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
          if (submittedMode === "buy" && res.tokensAmount > 0) {
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
      if (err instanceof SubmittedTransactionError) savePending(err.signature);
      setTradeErrorMsg(err?.message || "Operation failed");
    } finally {
      orderInFlight.current = false;
      setIsTrading(false);
    }
  };

  const handleGraduation = async () => {
    if (!walletAdapterConnected || !publicKey || !sendTransaction) {
      setWalletDialogOpen(true);
      return;
    }
    if (orderInFlight.current || isTrading || pendingSignature) return;
    orderInFlight.current = true;
    setIsTrading(true);
    setTradeErrorMsg(null);
    try {
      if (pendingGraduationSignature) {
        const statuses = await connection.getSignatureStatuses([pendingGraduationSignature], { searchTransactionHistory: true });
        const status = statuses.value[0];
        if (status?.err) {
          sessionStorage.removeItem(graduationPendingKey);
          sessionStorage.removeItem(`${graduationPendingKey}:step`);
          setPendingGraduationSignature(null);
          setPendingGraduationStep("settlement");
          throw new Error("The pending graduation transaction failed on Solana. Review the settlement route and try again.");
        }
        if (!status || (status.confirmationStatus !== "confirmed" && status.confirmationStatus !== "finalized")) {
          setTradeErrorMsg(`Graduation is still pending. Transaction: ${pendingGraduationSignature}`);
          return;
        }
        sessionStorage.removeItem(graduationPendingKey);
        sessionStorage.removeItem(`${graduationPendingKey}:step`);
        setPendingGraduationSignature(null);
        if (pendingGraduationStep === "migration" && token.bondingCurve.protocol === "meteora-dbc") {
          const result = await graduateToken(token.mint, { publicKey, sendTransaction }, 100, "meteora-dbc");
          await refreshTokens();
          setTradeErrorMsg(`DBC migration and equity settlement confirmed. DAMM v2 pool ${result.poolAddress}; settlement ${result.signature}`);
          onTradeSuccess?.();
          return;
        }
        await refreshTokens();
        setTradeErrorMsg(`Graduation confirmed. DAMM v2 pool: ${token.bondingCurve.meteoraPoolAddress || "refreshing"}`);
        onTradeSuccess?.();
        return;
      }

      const result = await graduateToken(token.mint, { publicKey, sendTransaction }, 100, token.bondingCurve.protocol);
      await refreshTokens();
      setTradeErrorMsg(`Graduation confirmed. ${result.migrationSignature ? `Meteora migration ${result.migrationSignature}; ` : ""}DAMM v2 pool ${result.poolAddress}; settlement ${result.signature}`);
      onTradeSuccess?.();
    } catch (error) {
      if (error instanceof SubmittedTransactionError) {
        setPendingGraduationSignature(error.signature);
        const step = error instanceof GraduationStepPendingError ? error.step : "settlement";
        setPendingGraduationStep(step);
        try {
          sessionStorage.setItem(graduationPendingKey, error.signature);
          sessionStorage.setItem(`${graduationPendingKey}:step`, step);
        } catch {}
        setTradeErrorMsg(`The DBC ${step} transaction was submitted and is awaiting confirmation. Check its status before retrying: ${error.signature}`);
      } else {
        setTradeErrorMsg(error instanceof Error ? error.message : "Graduation settlement failed.");
      }
    } finally {
      orderInFlight.current = false;
      setIsTrading(false);
    }
  };

  return (
    <div
      className={`trade-terminal rounded-xl border border-border bg-card p-5 shadow-sm ${
        buyAnimation === "success" ? "trade-terminal-buy-success" : ""
      }`}
    >
      {pendingSignature && (
        <div role="status" className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
          <p>An order was submitted. Verify its status before placing another.</p>
          <p className="mt-2 break-all font-mono">{pendingSignature}</p>
          <button onClick={checkPending} disabled={isTrading} className="mt-2 font-semibold underline disabled:opacity-50">Check transaction status</button>
        </div>
      )}
      {/* 3-Tab Switch: Buy / Sell / Redeem collateral */}
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex items-center gap-1 rounded-lg bg-card-subtle p-1 border border-border/80">
          <button
            disabled={isTrading || Boolean(pendingSignature)}
            onClick={() => {
              setTradeErrorMsg(null);
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
            disabled={isTrading || Boolean(pendingSignature)}
            onClick={() => {
              setTradeErrorMsg(null);
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
            disabled={isTrading || Boolean(pendingSignature)}
            onClick={() => {
              setTradeErrorMsg(null);
              setTradeMode("redeem");
              setAmount("50000");
            }}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex items-center gap-1 ${
              tradeMode === "redeem"
                ? "bg-amber-500/15 text-amber-300 font-semibold border border-amber-500/30"
                : "text-muted hover:text-foreground"
            }`}
          >
            <span>Redeem collateral</span>
            {floorPricePerToken > 0 && <span className="rounded bg-amber-500/20 text-amber-300 px-1 text-[9px] font-bold">NAV</span>}
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
          <p className="text-[11px] text-muted">Withdraws your pro-rata balance of the collateral token held in the vault. USDC conversion is unavailable.</p>

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
              <span className="text-muted">Collateral token:</span>
              <span className="font-semibold text-foreground flex items-center gap-1">
                {token.targetEquity.name} ({token.targetEquity.symbol})
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-muted">Pro-rata withdrawal:</span>
              <span className="font-mono font-bold text-amber-300 text-sm">
                {token.treasury.totalEquityLocked > 0
                  ? `${formatCollateralUnits(entitledStockShares, token.targetEquity.decimals ?? 6)} ${token.targetEquity.symbol}`
                  : "No collateral recorded"}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-muted">Indicative mark value:</span>
              <span className="font-mono font-bold text-emerald-400 text-sm">
                {targetStockPrice > 0 ? formatUsd(entitledMarkValueUsd) : "—"}
              </span>
            </div>

            <div className="flex items-center justify-between border-t border-border/80 pt-2 text-[11px]">
              <span className="text-muted">Vault Floor:</span>
              <span className="font-mono text-amber-300 font-medium">
                {floorPricePerToken > 0 ? `${formatTokenPrice(floorPricePerToken)} / token` : "Verified mark unavailable"}
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
            disabled={isTrading || Boolean(pendingSignature) || !token.bondingCurve.isGraduated || (connected && (!Number.isFinite(numTokensToRedeem) || numTokensToRedeem <= 0))}
            className={`w-full rounded-lg py-3 text-sm font-semibold transition-colors shadow-xs disabled:opacity-50 ${
              !connected
                ? "bg-card-hover/50 border border-border text-foreground hover:bg-card-hover"
                : "bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold"
            }`}
          >
            {isTrading
              ? "Executing on Solana..."
              : !token.bondingCurve.isGraduated
              ? "Available after graduation"
              : !connected
              ? "Connect Wallet to Redeem"
              : `Burn & Withdraw ${formatCollateralUnits(entitledStockShares, token.targetEquity.decimals ?? 6)} ${token.targetEquity.symbol}`}
          </button>
        </div>
      ) : token.bondingCurve.isGraduated && token.bondingCurve.protocol !== "meteora-dbc" ? (
        <div className="mt-4 rounded-xl border border-border/80 bg-card-subtle p-5 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-brand-cyan/10 text-brand-cyan">
            <TrendingUp className="h-5 w-5" />
          </div>
          <h3 className="mt-3 text-sm font-bold text-foreground">Curve trading closed</h3>
          <p className="mt-1.5 text-xs text-muted leading-relaxed">
            This legacy curve is marked graduated, but no verified Meteora liquidity is available.
            Collateral redemption depends on the token balance held in its vault.
          </p>
          <div className="mt-4 flex flex-col sm:flex-row items-center justify-center gap-2">
            <button
              onClick={() => {
                setTradeErrorMsg(null);
                setTradeMode("redeem");
              }}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 px-3.5 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-500/25 transition-colors"
            >
              Switch to collateral redemption
            </button>
            <a
              href={token.bondingCurve.meteoraPoolAddress ? `https://app.meteora.ag/dammv2/${token.bondingCurve.meteoraPoolAddress}` : "https://docs.meteora.ag/developer-guides/damm-v2"}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-lg bg-card-hover border border-border px-3.5 py-2 text-xs font-semibold text-foreground hover:bg-card-hover/80 transition-colors"
            >
              Meteora pool ↗
            </a>
          </div>
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
              <span>
                {formatUsd(token.bondingCurve.realQuoteReservesUsd)} / {formatUsd(token.bondingCurve.graduationThresholdUsd)} USDC
                {isNearCap && (
                  <button
                    type="button"
                    onClick={() => setAmount(remainingQuoteUsd < 0.01 ? remainingQuoteUsd.toFixed(4) : remainingQuoteUsd.toFixed(2))}
                    className="ml-1.5 text-brand-cyan hover:underline cursor-pointer"
                  >
                    ({remainingQuoteUsd < 0.01 ? `$${remainingQuoteUsd.toFixed(4)}` : `$${remainingQuoteUsd.toFixed(2)}`} left)
                  </button>
                )}
              </span>
              <span>{token.bondingCurve.isGraduated ? "DAMM v2 market active" : token.bondingCurve.settlementPending ? "Meteora migration complete; equity settlement is pending" : token.bondingCurve.progressPct >= 100 ? "Ready to migrate into Meteora DAMM v2" : "Settlement starts at the funding threshold"}</span>
            </div>
            {!isMock && !token.bondingCurve.isGraduated && token.bondingCurve.progressPct >= 100 && token.bondingCurve.protocol === "meteora-dbc" && !canSettleDbc && (
              <p className="mt-3 text-center text-[10px] text-muted">
                The creator can settle now. Any wallet can complete settlement 24 hours after Meteora records curve completion.
              </p>
            )}
            {!isMock && !token.bondingCurve.isGraduated && token.bondingCurve.progressPct >= 100 && (token.bondingCurve.protocol !== "meteora-dbc" || canSettleDbc) && (
              <>
                <button
                  type="button"
                  onClick={handleGraduation}
                  disabled={isTrading || Boolean(pendingSignature)}
                  className="mt-3 w-full rounded-xl bg-brand-cyan px-4 py-3 text-sm font-semibold text-background transition hover:bg-brand-cyan-hover disabled:opacity-50"
                >
                  {isTrading ? "Settling graduation…" : pendingGraduationSignature ? "Check graduation status" : walletAdapterConnected ? "Complete settlement" : "Connect wallet to settle"}
                </button>
                <p className="mt-2 text-center text-[10px] text-muted">
                  {token.bondingCurve.protocol === "meteora-dbc" && !isDbcCreator
                    ? "Any wallet may settle after the fallback period; the on-chain minimum is tied to the pool’s live spot price with up to 10% tolerance."
                    : "Two wallet approvals are required: prepare settlement, then finalize it."}
                </p>
              </>
            )}
          </div>

          {/* Input Box */}
          <div className="mt-4">
            <div className="flex items-center justify-between text-xs text-muted mb-1.5">
              <span>{tradeMode === "buy" ? "You Pay (USDC)" : `You Sell (${token.symbol})`}</span>
              <span className="font-mono">
                Balance: {tradeMode === "buy"
                  ? quoteBalance === null ? (connected ? "0.00 USDC" : "—") : `${quoteBalance.toLocaleString("en-US", { maximumFractionDigits: 2 })} USDC`
                  : tokenBalance === null ? (connected ? `0.00 ${token.symbol}` : "—") : `${tokenBalance.toLocaleString("en-US", { maximumFractionDigits: 2 })} ${token.symbol}`}
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
                ? isNearCap
                  ? ["25%", "50%", "75%", "Max"].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => {
                          const frac = pct === "Max" ? 1 : parseInt(pct, 10) / 100;
                          const val = remainingQuoteUsd * frac;
                          setAmount(val < 0.01 ? val.toFixed(4) : val.toFixed(2));
                        }}
                        className="rounded-md bg-card-hover/40 py-1.5 text-muted hover:bg-card-hover hover:text-foreground transition-colors cursor-pointer"
                      >
                        {pct}
                      </button>
                    ))
                  : ["50", "250", "1000", "5000"].map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setAmount(val)}
                        className="rounded-md bg-card-hover/40 py-1.5 text-muted hover:bg-card-hover hover:text-foreground transition-colors cursor-pointer"
                      >
                        ${val}
                      </button>
                    ))
                : ["25%", "50%", "75%", "100%"].map((pct) => (
                    <button
                      key={pct}
                      type="button"
                      onClick={() => {
                        const frac = parseInt(pct) / 100;
                        setAmount(((tokenBalance || 0) * frac).toString());
                      }}
                      className="rounded-md bg-card-hover/40 py-1.5 text-muted hover:bg-card-hover hover:text-foreground transition-colors cursor-pointer"
                    >
                      {pct}
                    </button>
                  ))}
            </div>

            {/* Exceeds Cap Notice */}
            {exceedsCap && (
              <div className="mt-2.5 flex items-center justify-between gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                <div className="flex items-center gap-1.5">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                  <span>Remaining curve cap is {remainingQuoteUsd < 0.01 ? `$${remainingQuoteUsd.toFixed(4)}` : `$${remainingQuoteUsd.toFixed(2)}`} USDC</span>
                </div>
                <button
                  type="button"
                  onClick={() => setAmount(remainingQuoteUsd < 0.01 ? remainingQuoteUsd.toFixed(4) : remainingQuoteUsd.toFixed(2))}
                  className="shrink-0 font-semibold underline hover:text-white cursor-pointer"
                >
                  Fill cap
                </button>
              </div>
            )}
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
            disabled={
              isTrading ||
              Boolean(pendingSignature) ||
              buyAnimation === "success" ||
              (connected && (!simulation || "error" in simulation || hasInsufficientUsdc || hasInsufficientTokens || exceedsCap))
            }
            data-buy-state={tradeMode === "buy" ? (isTrading ? "confirming" : buyAnimation) : undefined}
            className={`trade-action-button relative mt-4 w-full overflow-visible rounded-lg py-3 text-sm font-bold transition-colors shadow-xs disabled:opacity-50 ${
              !connected
                ? "bg-brand-cyan hover:bg-brand-cyan-hover text-background font-semibold"
                : hasInsufficientUsdc || hasInsufficientTokens || exceedsCap
                ? "bg-card-subtle border border-border text-muted cursor-not-allowed"
                : tradeMode === "buy"
                ? "buy-action bg-brand-cyan hover:bg-brand-cyan-hover text-background"
                : "bg-rose-500 hover:bg-rose-600 text-white"
            }`}
          >
            {tradeMode === "buy" && connected && !hasInsufficientUsdc && !exceedsCap && (
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
              : hasInsufficientUsdc
              ? "Insufficient USDC Balance"
              : hasInsufficientTokens
              ? `Insufficient $${token.symbol} Balance`
              : exceedsCap
              ? `Exceeds Cap (${remainingQuoteUsd < 0.01 ? `$${remainingQuoteUsd.toFixed(4)}` : `$${remainingQuoteUsd.toFixed(2)}`} Max)`
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

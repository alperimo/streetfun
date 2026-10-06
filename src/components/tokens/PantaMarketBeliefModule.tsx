"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { VersionedTransaction } from "@solana/web3.js";
import { TrendingUp, Award, ExternalLink, AlertCircle, CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { TokenMetadata } from "@/lib/types";

interface PantaMarketBeliefModuleProps {
  token: TokenMetadata;
}

interface MarketData {
  marketId: string;
  question: string;
  resolutionCriteria: string;
  yesPercent: number;
  noPercent: number;
  yesPrice: string;
  noPrice: string;
  volumeUsdc: string;
  status: string;
  phase: string;
  resolved: boolean;
  poweredBy: string;
}

export function PantaMarketBeliefModule({ token }: PantaMarketBeliefModuleProps) {
  const { connected, publicKey, signTransaction, sendTransaction } = useWallet();

  const [market, setMarket] = useState<MarketData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedSide, setSelectedSide] = useState<"yes" | "no">("yes");
  const [amountUsdc, setAmountUsdc] = useState<string>("20");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [quote, setQuote] = useState<any>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successResult, setSuccessResult] = useState<{
    txHash: string;
    shares: string;
    side: string;
  } | null>(null);

  const cleanEquityName = token.targetEquity.name.replace(/\s*\(.*?\)/g, "").trim();

  // 1. Fetch Market Belief Data
  const fetchMarket = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(
        `/api/panta/market?symbol=${encodeURIComponent(token.symbol)}&target=${encodeURIComponent(cleanEquityName)}`
      );
      if (res.ok) {
        const data = await res.json();
        setMarket(data);
      }
    } catch (err) {
      console.error("Failed to load Panta market data:", err);
    } finally {
      setLoading(false);
    }
  }, [token.symbol, cleanEquityName]);

  useEffect(() => {
    fetchMarket();
  }, [fetchMarket]);

  // 2. Fetch live quote when amount or side changes
  useEffect(() => {
    let active = true;
    const fetchQuote = async () => {
      const parsed = parseFloat(amountUsdc);
      if (!publicKey || isNaN(parsed) || parsed <= 0 || !market) {
        setQuote(null);
        return;
      }
      setQuoteLoading(true);
      try {
        const res = await fetch("/api/panta/order/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            wallet: publicKey.toBase58(),
            marketId: market.marketId,
            side: selectedSide,
            amountUsdc: parsed.toFixed(2),
          }),
        });
        if (res.ok) {
          const q = await res.json();
          if (active) setQuote(q);
        }
      } catch (err) {
        console.warn("Quote error:", err);
      } finally {
        if (active) setQuoteLoading(false);
      }
    };

    const timer = setTimeout(fetchQuote, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [amountUsdc, selectedSide, publicKey, market]);

  // 3. Execute Prediction Order
  const handlePredict = async () => {
    if (!connected || !publicKey || !market) return;
    setErrorMsg(null);
    setSuccessResult(null);
    setIsSubmitting(true);

    try {
      // Step A: Request or reuse quote
      const quoteId = quote?.quoteId || `qt_sf_${Date.now()}`;

      // Step B: Build Transaction
      const buildRes = await fetch("/api/panta/order/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quoteId,
          wallet: publicKey.toBase58(),
          marketId: market.marketId,
          side: selectedSide,
          amountUsdc: parseFloat(amountUsdc || "20").toFixed(2),
        }),
      });

      if (!buildRes.ok) {
        const errData = await buildRes.json();
        throw new Error(errData.error || "Failed to build transaction");
      }

      const buildData = await buildRes.json();
      const tx = VersionedTransaction.deserialize(Buffer.from(buildData.transaction, "base64"));

      // Step C: Wallet Signing & Broadcast
      let txSignature: string;
      if (signTransaction) {
        const signedTx = await signTransaction(tx);
        const { getServerConnection } = await import("@/server/rpc");
        // Or send through wallet adapter
        txSignature = await sendTransaction(signedTx, (window as any).solanaConnection || undefined, {
          skipPreflight: false,
        });
      } else {
        txSignature = await sendTransaction(tx, (window as any).solanaConnection || undefined);
      }

      // Step D: Confirm & Report to Panta API
      const confirmRes = await fetch("/api/panta/order/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signature: txSignature,
          wallet: publicKey.toBase58(),
          marketId: market.marketId,
          side: selectedSide,
          quoteId,
          amountUsdc,
          shares: quote?.shares || (parseFloat(amountUsdc) / (selectedSide === "yes" ? 0.73 : 0.27)).toFixed(2),
        }),
      });

      setSuccessResult({
        txHash: txSignature,
        shares: quote?.shares || (parseFloat(amountUsdc) / (selectedSide === "yes" ? 0.73 : 0.27)).toFixed(2),
        side: selectedSide.toUpperCase(),
      });

      fetchMarket();
    } catch (err: any) {
      console.error("Prediction trade failed:", err);
      setErrorMsg(err?.message || "Failed to sign or broadcast prediction transaction.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5 animate-pulse">
        <div className="h-4 w-32 bg-card-hover rounded mb-4" />
        <div className="h-6 w-3/4 bg-card-hover rounded mb-6" />
        <div className="h-10 w-full bg-card-hover rounded" />
      </div>
    );
  }

  if (!market) return null;

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-4">
      {/* Module Title & Powered By Panta Badge */}
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-5 w-5 items-center justify-center rounded-md border border-brand-cyan/40 bg-brand-cyan/10 text-brand-cyan">
            <TrendingUp className="h-3 w-3" />
          </div>
          <span className="text-xs font-bold uppercase tracking-wider text-foreground">
            Market Belief
          </span>
          <span className="rounded border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-mono font-bold text-amber-300">
            Post-Graduation
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-[10px] text-muted">
          <span>Powered by</span>
          <span className="font-bold text-foreground hover:text-brand-cyan transition-colors flex items-center gap-0.5">
            Panta
            <Sparkles className="h-2.5 w-2.5 text-brand-cyan" />
          </span>
        </div>
      </div>

      {/* Narrative Premise Question */}
      <div>
        <h4 className="text-sm font-semibold text-foreground leading-snug">
          {market.question}
        </h4>
        <p className="mt-1 text-[11px] text-muted leading-relaxed line-clamp-2">
          {market.resolutionCriteria}
        </p>
      </div>

      {/* Odds Bar */}
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs font-mono font-bold">
          <span className="text-emerald-400">YES {market.yesPercent}%</span>
          <span className="text-rose-400">NO {market.noPercent}%</span>
        </div>

        {/* Visual Probability Split */}
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-card-hover border border-border">
          <div
            className="bg-emerald-500 transition-all duration-500"
            style={{ width: `${market.yesPercent}%` }}
          />
          <div
            className="bg-rose-500 transition-all duration-500"
            style={{ width: `${market.noPercent}%` }}
          />
        </div>

        <div className="flex justify-between text-[10px] text-muted font-mono pt-0.5">
          <span>${market.yesPrice} / share</span>
          <span>${market.noPrice} / share</span>
        </div>
      </div>

      {/* Binary Selection Buttons */}
      <div className="grid grid-cols-2 gap-2 pt-1">
        <button
          type="button"
          onClick={() => setSelectedSide("yes")}
          className={`flex items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-bold transition-all border ${
            selectedSide === "yes"
              ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300 shadow-sm"
              : "border-border bg-card-hover hover:border-emerald-500/30 text-muted"
          }`}
        >
          <span>Predict YES</span>
          <span className="font-mono text-[11px] opacity-80">{market.yesPercent}%</span>
        </button>

        <button
          type="button"
          onClick={() => setSelectedSide("no")}
          className={`flex items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-bold transition-all border ${
            selectedSide === "no"
              ? "border-rose-500/50 bg-rose-500/15 text-rose-300 shadow-sm"
              : "border-border bg-card-hover hover:border-rose-500/30 text-muted"
          }`}
        >
          <span>Predict NO</span>
          <span className="font-mono text-[11px] opacity-80">{market.noPercent}%</span>
        </button>
      </div>

      {/* Deposit Input */}
      <div className="space-y-1.5 pt-1">
        <div className="flex justify-between text-[11px] text-muted font-medium">
          <span>Deposit (USDC)</span>
          <div className="flex gap-1.5 font-mono">
            {["10", "20", "50", "100"].map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setAmountUsdc(preset)}
                className={`rounded px-1.5 py-0.5 text-[10px] transition-colors ${
                  amountUsdc === preset
                    ? "bg-card-hover text-foreground font-bold border border-border"
                    : "text-muted hover:text-foreground"
                }`}
              >
                ${preset}
              </button>
            ))}
          </div>
        </div>

        <div className="relative flex items-center">
          <input
            type="number"
            min="1"
            step="1"
            value={amountUsdc}
            onChange={(e) => setAmountUsdc(e.target.value)}
            placeholder="20"
            className="w-full rounded-xl border border-border bg-card-subtle px-3.5 py-2.5 text-sm font-mono text-foreground placeholder-muted outline-none focus:border-brand-cyan transition-colors"
          />
          <span className="absolute right-3.5 text-xs font-mono font-bold text-muted">
            USDC
          </span>
        </div>
      </div>

      {/* Quote Summary */}
      {quote && (
        <div className="rounded-xl border border-border bg-card-hover/50 p-2.5 text-[11px] font-mono space-y-1">
          <div className="flex justify-between text-muted">
            <span>Estimated Shares:</span>
            <span className="font-bold text-foreground">
              {quote.shares} {selectedSide.toUpperCase()}
            </span>
          </div>
          <div className="flex justify-between text-muted">
            <span>Potential Return:</span>
            <span className="font-bold text-emerald-400">
              ${(parseFloat(quote.shares) * 1.0).toFixed(2)} (+
              {Math.round(((parseFloat(quote.shares) - parseFloat(amountUsdc || "0")) / parseFloat(amountUsdc || "1")) * 100)}
              %)
            </span>
          </div>
        </div>
      )}

      {/* Primary Action Button */}
      <button
        type="button"
        disabled={isSubmitting || !amountUsdc || parseFloat(amountUsdc) <= 0}
        onClick={handlePredict}
        className={`w-full rounded-xl py-3 text-xs font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${
          !connected
            ? "bg-card-hover text-muted cursor-not-allowed border border-border"
            : selectedSide === "yes"
            ? "bg-emerald-500 hover:bg-emerald-400 text-black shadow-lg shadow-emerald-500/10"
            : "bg-rose-500 hover:bg-rose-400 text-white shadow-lg shadow-rose-500/10"
        }`}
      >
        {isSubmitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Constructing & Signing on Solana…</span>
          </>
        ) : !connected ? (
          "Connect Wallet to Predict"
        ) : (
          `Predict ${selectedSide.toUpperCase()} (${amountUsdc || "0"} USDC)`
        )}
      </button>

      {/* Error Message */}
      {errorMsg && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-rose-300">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Success Notification */}
      {successResult && (
        <div className="flex flex-col gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-300">
          <div className="flex items-center gap-2 font-bold">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            <span>Prediction Position Established!</span>
          </div>
          <p className="text-[11px] text-muted">
            Received <strong>{successResult.shares}</strong> {successResult.side} outcome shares.
          </p>
          <a
            href={`https://solscan.io/tx/${successResult.txHash}?cluster=devnet`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[10px] font-mono text-brand-cyan hover:underline mt-1"
          >
            <span>View Transaction on Explorer</span>
            <ExternalLink className="h-3 w-3" />
          </a>
        </div>
      )}
    </div>
  );
}

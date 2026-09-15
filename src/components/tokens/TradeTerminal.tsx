"use client";

import React, { useState, useMemo } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { ArrowDownUp, Settings, ShieldCheck, AlertCircle, Check } from "lucide-react";
import { TokenMetadata } from "@/lib/types";
import { simulateBuyTokensOut, simulateSellQuoteOut } from "@/sdk/math";

interface TradeTerminalProps {
  token: TokenMetadata;
  onTradeSuccess: () => void;
}

export function TradeTerminal({ token, onTradeSuccess }: TradeTerminalProps) {
  const { connected } = useWallet();
  const [tradeMode, setTradeMode] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [slippage, setSlippage] = useState<number>(1.0); // 1%
  const [showSettings, setShowSettings] = useState(false);
  const [isTrading, setIsTrading] = useState(false);
  const [tradeSuccessMsg, setTradeSuccessMsg] = useState<string | null>(null);

  const virtualQuote = BigInt(token.bondingCurve.virtualQuoteReserves);
  const virtualTokens = BigInt(token.bondingCurve.virtualTokenReserves);
  const realTokens = BigInt(token.bondingCurve.realTokenReserves);

  // Simulation calculation
  const simulation = useMemo(() => {
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

  const handleExecuteTrade = () => {
    if (!connected) return;
    setIsTrading(true);

    setTimeout(() => {
      setIsTrading(false);
      setTradeSuccessMsg(
        tradeMode === "buy"
          ? `Successfully purchased $${token.symbol} tokens!`
          : `Successfully sold $${token.symbol} for USDC!`
      );
      setAmount("");
      onTradeSuccess();
      setTimeout(() => setTradeSuccessMsg(null), 4000);
    }, 1200);
  };

  const isGraduated = token.bondingCurve.isGraduated;

  if (isGraduated) {
    return (
      <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-5 shadow-sm">
        <div className="flex items-center gap-2 text-brand-cyan font-bold text-sm mb-2">
          <ShieldCheck className="h-5 w-5" />
          <span>Bonding Curve Graduated</span>
        </div>
        <p className="text-xs text-muted leading-relaxed">
          This curve reached the $60,000 threshold. 50% USDC was swapped into {token.targetEquity.name} ({token.targetEquity.symbol}) stock and locked into the Treasury PDA.
        </p>
        <div className="mt-4 rounded-lg bg-white border border-border p-3 text-xs shadow-sm">
          <div className="text-muted">Total Stock Locked in Vault:</div>
          <div className="font-mono text-base font-bold text-slate-900 mt-0.5">
            {token.treasury.totalEquityLocked.toFixed(2)} Shares (${token.treasury.totalEquityValueUsd.toLocaleString()} USD)
          </div>
        </div>
        <div className="mt-4 text-xs text-muted-foreground">
          Use the <strong className="text-slate-900">&quot;Burn &amp; Redeem&quot;</strong> module below to burn your meme tokens for your pro-rata share of real stock.
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-white p-5 shadow-sm">
      {/* Mode Switch (Buy / Sell) */}
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 border border-border">
          <button
            onClick={() => {
              setTradeMode("buy");
              setAmount("");
            }}
            className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${
              tradeMode === "buy"
                ? "bg-brand-emerald text-white shadow-sm"
                : "text-muted hover:text-slate-900"
            }`}
          >
            Buy
          </button>
          <button
            onClick={() => {
              setTradeMode("sell");
              setAmount("");
            }}
            className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${
              tradeMode === "sell"
                ? "bg-brand-rose text-white shadow-sm"
                : "text-muted hover:text-slate-900"
            }`}
          >
            Sell
          </button>
        </div>

        {/* Slippage Settings Toggle */}
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="flex items-center gap-1 text-xs text-muted hover:text-slate-900 transition-colors"
        >
          <Settings className="h-3.5 w-3.5" />
          <span className="font-mono">{slippage}%</span>
        </button>
      </div>

      {/* Slippage drawer */}
      {showSettings && (
        <div className="mt-3 rounded-lg bg-slate-50 p-3 border border-border text-xs flex items-center justify-between">
          <span className="text-muted">Max Slippage:</span>
          <div className="flex items-center gap-1">
            {[0.5, 1.0, 2.5].map((s) => (
              <button
                key={s}
                onClick={() => setSlippage(s)}
                className={`px-2 py-0.5 rounded font-mono text-[11px] ${
                  slippage === s
                    ? "bg-brand-cyan text-white font-bold"
                    : "bg-slate-200/70 text-muted hover:text-slate-900"
                }`}
              >
                {s}%
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input Box */}
      <div className="mt-4">
        <div className="flex items-center justify-between text-xs text-muted mb-1.5">
          <span>{tradeMode === "buy" ? "You Pay (USDC)" : `You Sell (${token.symbol})`}</span>
          <span className="font-mono">
            Balance: {tradeMode === "buy" ? "10,000.00 USDC" : `500,000 ${token.symbol}`}
          </span>
        </div>

        <div className="relative">
          <input
            type="number"
            step="any"
            min="0"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full rounded-xl border border-border bg-slate-50 pl-3.5 pr-20 py-3 text-lg font-mono text-slate-900 placeholder-muted focus:border-brand-cyan focus:bg-white focus:outline-none shadow-sm"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 font-mono text-xs font-bold text-brand-cyan">
            {tradeMode === "buy" ? "USDC" : token.symbol}
          </div>
        </div>

        {/* Quick Amount Chips */}
        <div className="mt-2 grid grid-cols-4 gap-1.5 text-center text-xs font-mono">
          {tradeMode === "buy"
            ? ["50", "250", "1000", "5000"].map((val) => (
                <button
                  key={val}
                  onClick={() => setAmount(val)}
                  className="rounded-md border border-border bg-white py-1 text-muted hover:border-brand-cyan hover:text-slate-900 transition-colors shadow-xs"
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
                  className="rounded-md border border-border bg-white py-1 text-muted hover:border-brand-rose hover:text-slate-900 transition-colors shadow-xs"
                >
                  {pct}
                </button>
              ))}
        </div>
      </div>

      {/* Trade Simulation Breakdown */}
      {simulation && !("error" in simulation) && (
        <div className="mt-4 rounded-lg bg-slate-50 p-3 border border-border space-y-2 text-xs">
          <div className="flex items-center justify-between text-muted">
            <span>You Receive (Estimated):</span>
            <span className="font-mono font-bold text-slate-900">
              {simulation.type === "buy"
                ? `${(Number(simulation.tokensOut) / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${token.symbol}`
                : `${(Number(simulation.netQuoteOut) / 1_000_000).toFixed(2)} USDC`}
            </span>
          </div>

          <div className="flex items-center justify-between text-muted text-[11px]">
            <span>Effective Price:</span>
            <span className="font-mono text-slate-900">
              ${simulation.effectivePriceUsd.toFixed(6)}
            </span>
          </div>

          <div className="flex items-center justify-between text-muted text-[11px]">
            <span>Price Impact:</span>
            <span
              className={`font-mono ${
                simulation.priceImpactPct > 5
                  ? "text-brand-rose font-bold"
                  : "text-brand-emerald"
              }`}
            >
              {simulation.priceImpactPct.toFixed(2)}%
            </span>
          </div>

          <div className="flex items-center justify-between text-muted text-[11px]">
            <span>Protocol Fee (1%):</span>
            <span className="font-mono text-slate-900">
              ${(Number(simulation.feeQuote) / 1_000_000).toFixed(2)} USDC
            </span>
          </div>
        </div>
      )}

      {/* Simulation Error */}
      {simulation && "error" in simulation && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-brand-rose/30 bg-rose-50 p-2.5 text-xs text-brand-rose">
          <AlertCircle className="h-4 w-4 flex-shrink-0" />
          <span>{simulation.error}</span>
        </div>
      )}

      {/* Success Notification */}
      {tradeSuccessMsg && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-brand-emerald/30 bg-emerald-50 p-2.5 text-xs text-brand-emerald">
          <Check className="h-4 w-4 flex-shrink-0" />
          <span>{tradeSuccessMsg}</span>
        </div>
      )}

      {/* Action Button */}
      <button
        onClick={handleExecuteTrade}
        disabled={!amount || isTrading || Boolean(simulation && "error" in simulation)}
        className={`mt-4 w-full rounded-xl py-3 text-sm font-bold text-white transition-all shadow-sm disabled:opacity-50 ${
          tradeMode === "buy"
            ? "bg-brand-emerald hover:bg-emerald-600 shadow-emerald-600/20"
            : "bg-brand-rose hover:bg-rose-600 shadow-rose-600/20"
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

      {/* Backing Badge Note */}
      <div className="mt-3 flex items-center justify-center gap-1.5 text-[10px] text-muted">
        <ShieldCheck className="h-3 w-3 text-brand-cyan" />
        <span>Dual floor backed by {token.targetEquity.name}</span>
      </div>
    </div>
  );
}

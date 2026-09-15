"use client";

import React, { useState, useMemo } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Settings, AlertCircle, Check } from "lucide-react";
import { TokenMetadata } from "@/lib/types";
import { simulateBuyTokensOut, simulateSellQuoteOut } from "@/sdk/math";

interface TradeTerminalProps {
  token: TokenMetadata;
  onTradeSuccess: () => void;
}

export function TradeTerminal({ token, onTradeSuccess }: TradeTerminalProps) {
  const { connected } = useWallet();
  const [tradeMode, setTradeMode] = useState<"buy" | "sell" | "redeem">(
    token.bondingCurve.isGraduated ? "redeem" : "buy"
  );
  const [amount, setAmount] = useState("");
  const [slippage, setSlippage] = useState<number>(1.0); // 1%
  const [showSettings, setShowSettings] = useState(false);
  const [isTrading, setIsTrading] = useState(false);
  const [tradeSuccessMsg, setTradeSuccessMsg] = useState<string | null>(null);
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

  const handleExecuteTrade = () => {
    if (!connected) return;
    setIsTrading(true);

    setTimeout(() => {
      setIsTrading(false);
      if (tradeMode === "redeem") {
        setTradeSuccessMsg(
          redeemActionType === "stock"
            ? `Burned ${numTokensToRedeem.toLocaleString()} $${token.symbol} for ${entitledStockShares.toFixed(4)} shares of ${token.targetEquity.symbol}!`
            : `Burned ${numTokensToRedeem.toLocaleString()} $${token.symbol} for $${entitledUsdcValue.toFixed(2)} USDC!`
        );
      } else {
        setTradeSuccessMsg(
          tradeMode === "buy"
            ? `Successfully purchased $${token.symbol} tokens!`
            : `Successfully sold $${token.symbol} for USDC!`
        );
      }
      setAmount("");
      onTradeSuccess();
      setTimeout(() => setTradeSuccessMsg(null), 4000);
    }, 1200);
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      {/* 3-Tab Switch: Buy / Sell / Redeem Stock */}
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex items-center gap-1 rounded-lg bg-card-subtle p-1 border border-border">
          <button
            onClick={() => {
              setTradeMode("buy");
              setAmount("");
            }}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
              tradeMode === "buy"
                ? "bg-brand-emerald text-white shadow-sm"
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
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
              tradeMode === "sell"
                ? "bg-brand-rose text-white shadow-sm"
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
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-1 ${
              tradeMode === "redeem"
                ? "bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 shadow-sm font-black"
                : "text-amber-500 hover:text-amber-400 font-medium"
            }`}
          >
            <span>Redeem Stock</span>
            <span className="rounded bg-black/10 px-1 text-[9px] font-bold">NAV</span>
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
        <div className="mt-3 rounded-lg bg-card-subtle p-3 border border-border text-xs flex items-center justify-between">
          <span className="text-muted">Max Slippage:</span>
          <div className="flex items-center gap-1">
            {[0.5, 1.0, 2.5].map((s) => (
              <button
                key={s}
                onClick={() => setSlippage(s)}
                className={`px-2 py-0.5 rounded font-mono text-[11px] ${
                  slippage === s
                    ? "bg-card-hover border border-border-active text-foreground font-bold"
                    : "bg-card text-muted hover:text-foreground border border-border"
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
          <div className="flex items-center gap-1 rounded-lg bg-card-subtle p-1 border border-border">
            <button
              onClick={() => setRedeemActionType("stock")}
              className={`flex-1 py-1.5 rounded-md text-xs font-bold transition-all ${
                redeemActionType === "stock"
                  ? "bg-amber-400 text-slate-950 shadow-sm"
                  : "text-muted hover:text-foreground"
              }`}
            >
              Withdraw {token.targetEquity.symbol} Stock
            </button>
            <button
              onClick={() => setRedeemActionType("usdc")}
              className={`flex-1 py-1.5 rounded-md text-xs font-bold transition-all ${
                redeemActionType === "usdc"
                  ? "bg-brand-emerald text-white shadow-sm"
                  : "text-muted hover:text-foreground"
              }`}
            >
              1-Click USDC Exit
            </button>
          </div>

          {/* Input Box */}
          <div>
            <div className="flex items-center justify-between text-xs text-muted mb-1.5">
              <span>Amount of ${token.symbol} to Burn</span>
              <span className="font-mono">Balance: 500,000 ${token.symbol}</span>
            </div>

            <div className="relative">
              <input
                type="number"
                step="any"
                min="0"
                placeholder="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full rounded-xl border border-border bg-card-subtle pl-3.5 pr-20 py-3 text-lg font-mono text-foreground placeholder-muted focus:border-amber-500 focus:bg-card focus:outline-none shadow-sm"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 font-mono text-xs font-bold text-amber-500">
                {token.symbol}
              </div>
            </div>

            {/* Quick Burn Chips */}
            <div className="mt-2 grid grid-cols-4 gap-1.5 text-center text-xs font-mono">
              {["10000", "50000", "100000", "500000"].map((val) => (
                <button
                  key={val}
                  onClick={() => setAmount(val)}
                  className="rounded-md border border-border bg-card-subtle py-1 text-muted hover:border-amber-500 hover:text-foreground transition-colors shadow-xs"
                >
                  {parseInt(val) >= 1000 ? `${parseInt(val) / 1000}K` : val}
                </button>
              ))}
            </div>
          </div>

          {/* Interactive Calculation Card */}
          <div className="rounded-xl border border-border bg-card-subtle p-3.5 space-y-2.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted">Target Equity Asset:</span>
              <span className="font-bold text-foreground flex items-center gap-1">
                {token.targetEquity.name} ({token.targetEquity.symbol})
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-muted">You Claim (Pro-Rata):</span>
              <span className="font-mono font-bold text-amber-500 text-sm">
                {entitledStockShares.toFixed(4)} Shares
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-muted">Estimated Value:</span>
              <span className="font-mono font-bold text-brand-emerald text-sm">
                ${entitledUsdcValue.toFixed(2)} USDC
              </span>
            </div>

            <div className="flex items-center justify-between border-t border-border pt-2 text-[11px]">
              <span className="text-muted">Guaranteed NAV Floor:</span>
              <span className="font-mono text-amber-500 font-semibold">
                ${floorPricePerToken} / token
              </span>
            </div>
          </div>

          {/* Success Notification */}
          {tradeSuccessMsg && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-xs text-brand-emerald">
              <Check className="h-4 w-4 flex-shrink-0" />
              <span>{tradeSuccessMsg}</span>
            </div>
          )}

          {/* Action Button */}
          <button
            onClick={handleExecuteTrade}
            disabled={!numTokensToRedeem || isTrading}
            className={`w-full rounded-xl py-3 text-sm font-bold transition-all shadow-sm disabled:opacity-50 ${
              redeemActionType === "stock"
                ? "bg-gradient-to-r from-amber-400 to-amber-500 text-slate-950 hover:opacity-95"
                : "bg-brand-emerald text-white hover:bg-emerald-600"
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
                className="w-full rounded-xl border border-border bg-card-subtle pl-3.5 pr-20 py-3 text-lg font-mono text-foreground placeholder-muted focus:border-border-active focus:bg-card focus:outline-none shadow-sm"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 font-mono text-xs font-bold text-slate-300">
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
                      className="rounded-md border border-border bg-card-subtle py-1 text-muted hover:border-border-active hover:text-foreground transition-colors shadow-xs"
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
                      className="rounded-md border border-border bg-card-subtle py-1 text-muted hover:border-brand-rose hover:text-foreground transition-colors shadow-xs"
                    >
                      {pct}
                    </button>
                  ))}
            </div>
          </div>

          {/* Trade Simulation Breakdown */}
          {simulation && !("error" in simulation) && (
            <div className="mt-4 rounded-lg bg-card-subtle p-3 border border-border space-y-2 text-xs">
              <div className="flex items-center justify-between text-muted">
                <span>You Receive (Estimated):</span>
                <span className="font-mono font-bold text-foreground">
                  {simulation.type === "buy"
                    ? `${(Number(simulation.tokensOut) / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${token.symbol}`
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
                      ? "text-brand-rose font-bold"
                      : "text-brand-emerald"
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
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-2.5 text-xs text-brand-rose">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{simulation.error}</span>
            </div>
          )}

          {/* Success Notification */}
          {tradeSuccessMsg && (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-xs text-brand-emerald">
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
                ? "bg-brand-emerald hover:bg-emerald-600"
                : "bg-brand-rose hover:bg-rose-600"
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
    </div>
  );
}

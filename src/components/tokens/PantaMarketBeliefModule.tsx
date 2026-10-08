"use client";

import { useEffect, useRef, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { AlertCircle, CheckCircle2, ExternalLink, Loader2, TrendingUp } from "lucide-react";
import type { TokenMetadata } from "@/lib/types";
import type { LifecycleMarketInfo, PantaOrderQuote, PantaPosition, PantaSide } from "@/lib/pantaTypes";
import { compilePantaTransaction, validatePantaInstructions } from "@/lib/pantaTransaction";
import { Buffer } from "buffer";
import bs58 from "bs58";
import { confirmSubmittedTransaction } from "@/services/solana/transactionConfirmation";

interface PendingOrder { signature: string; orderToken: string; mint: string; kind: "buy" | "claim"; }
const network = process.env.NEXT_PUBLIC_SOLANA_NETWORK || "devnet";
const genesis: Record<string, string> = { devnet: "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG", "mainnet-beta": "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp" };
const dateLabel = (value: number | null) => value === null ? "—" : new Date(value * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const validAmount = (value: string) => /^(0|[1-9]\d*)(\.\d{1,6})?$/.test(value) && Number(value) > 0 && Number(value) <= 1000;
const sameAmount = (a: unknown, b: unknown) => typeof a === "string" && typeof b === "string" && validAmount(a) && validAmount(b) && Number(a) === Number(b);
async function jsonRequest(path: string, body?: unknown) {
  const response = await fetch(path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error || "Prediction markets are temporarily unavailable."), { code: result.code });
  return result;
}

export function PantaMarketBeliefModule({ token }: { token: TokenMetadata }) {
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const [market, setMarket] = useState<LifecycleMarketInfo | null>(null);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [provisioning, setProvisioning] = useState<{ title: string; description: string; message: string } | null>(null);
  const [marketRefresh, setMarketRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedSide, setSelectedSide] = useState<PantaSide>("yes");
  const [amountUsdc, setAmountUsdc] = useState("20");
  const [quote, setQuote] = useState<PantaOrderQuote | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [positions, setPositions] = useState<PantaPosition[]>([]);
  const [positionsError, setPositionsError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingOrder | null>(null);
  const actionInProgress = useRef(false);
  const wallet = publicKey?.toBase58();
  const pendingKey = wallet ? `streetfun:panta:${network}:${wallet}` : null;

  useEffect(() => {
    const abort = new AbortController(); let active = true;
    setMarket(null); setMarketError(null); setLoading(true);
    fetch(`/api/panta/market?${new URLSearchParams({ mint: token.mint })}`, { signal: abort.signal, cache: "no-store" })
      .then(async res => { const data = await res.json(); if (!res.ok) throw new Error(data.error); if (active) {
        if (data.status === "provisioning") { setMarket(null); setProvisioning(data); }
        else { setMarket(data); setProvisioning(null); setMarketError(null); }
      } })
      .catch(err => { if (active) setMarketError(err.message || "Prediction markets are temporarily unavailable."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; abort.abort(); };
  }, [token.mint, token.bondingCurve.isGraduated, marketRefresh]);
  useEffect(() => {
    const timer = setInterval(() => { if (document.visibilityState === "visible") setMarketRefresh(value => value + 1); }, 30_000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => { if (success) setMarketRefresh(value => value + 1); }, [success]);

  useEffect(() => { setQuote(null); setError(null); }, [wallet, amountUsdc, selectedSide, market?.marketId]);
  useEffect(() => {
    if (!quote) return;
    const timer = setTimeout(() => setQuote(null), Math.max(0, Date.parse(quote.expiresAt) - Date.now()));
    return () => clearTimeout(timer);
  }, [quote]);
  useEffect(() => {
    setPending(null);
    if (!pendingKey) return;
    try {
      const saved = JSON.parse(sessionStorage.getItem(pendingKey) || "null");
      if (saved && saved.mint === token.mint && typeof saved.signature === "string" && typeof saved.orderToken === "string" && ["buy", "claim"].includes(saved.kind)) setPending(saved);
    } catch { /* Browser storage can be unavailable; in-memory recovery remains available. */ }
  }, [pendingKey, token.mint]);
  useEffect(() => {
    const abort = new AbortController(); setPositions([]); setPositionsError(null);
    if (!wallet) return;
    fetch(`/api/panta/positions?${new URLSearchParams({ mint: token.mint, wallet })}`, { signal: abort.signal, cache: "no-store" })
      .then(async res => {
        if (!res.ok) throw new Error("Position balances are temporarily unavailable.");
        const data = await res.json();
        if (!abort.signal.aborted) setPositions(data.positions);
      })
      .catch(() => { if (!abort.signal.aborted) setPositionsError("Position balances are temporarily unavailable."); });
    return () => abort.abort();
  }, [wallet, token.mint, success]);

  const remember = (order: PendingOrder | null) => {
    setPending(order);
    try { if (pendingKey) { if (order) sessionStorage.setItem(pendingKey, JSON.stringify(order)); else sessionStorage.removeItem(pendingKey); } } catch { /* Keep recovery in state. */ }
  };
  const confirmOrder = async (order: PendingOrder) => {
    let result;
    try { result = await jsonRequest("/api/panta/order/confirm", { signature: order.signature, orderToken: order.orderToken }); }
    catch (error) {
      if (error instanceof Error && ["TRANSACTION_FAILED", "TRANSACTION_EXPIRED"].includes(String((error as Error & { code?: string }).code))) remember(null);
      throw error;
    }
    if (result.status !== "confirmed") { setError("Transaction submitted. Confirmation is pending; check its status before placing another order."); return; }
    remember(null); setQuote(null); setSuccess(order.signature);
  };
  const perform = async (action: "buy" | "claim", claimPosition?: PantaPosition) => {
    const selection = action === "claim" ? claimPosition : market;
    if (actionInProgress.current || !selection || !wallet || !publicKey || !signTransaction || pending) return;
    actionInProgress.current = true; setBusy(true); setError(null); setSuccess(null);
    try {
      if (!genesis[network] || await connection.getGenesisHash() !== genesis[network]) throw new Error("Wallet connection does not match this market's network.");
      if (action === "buy" && !quote) {
        const result = await jsonRequest("/api/panta/order/quote", { mint: token.mint, wallet, side: selectedSide, amountUsdc });
        if (result.marketId !== selection.marketId || result.side !== selectedSide || !sameAmount(result.amountUsdc, amountUsdc) || Date.parse(result.expiresAt) <= Date.now()) throw new Error("Refresh the prediction quote.");
        setQuote(result); return;
      }
      if (action === "buy" && (!quote || Date.parse(quote.expiresAt) <= Date.now())) { setQuote(null); throw new Error("Quote expired. Review a fresh quote."); }
      const build = await jsonRequest(action === "buy" ? "/api/panta/order/build" : "/api/panta/claim/build", action === "buy" ? { quoteToken: quote!.quoteToken } : { mint: token.mint, wallet, marketId: selection.marketId });
      if (build.wallet !== wallet || build.marketId !== selection.marketId || build.programId !== selection.programId || build.usdcMint !== selection.usdcMint ||
          (action === "buy" && (build.quoteId !== quote!.quoteId || build.side !== selectedSide || !sameAmount(build.amountUsdc, amountUsdc))) ||
          !Number.isSafeInteger(build.lastValidBlockHeight) || Date.parse(build.expiresAt) <= Date.now()) throw new Error("Prediction order does not match your selection.");
      const instructions = validatePantaInstructions(build.instructions, { wallet, marketId: selection.marketId, programId: selection.programId, usdcMint: selection.usdcMint, kind: action });
      const tx = compilePantaTransaction(instructions, wallet, build.recentBlockhash);
      const expectedMessage = Buffer.from(tx.message.serialize()).toString("base64");
      const signed = await signTransaction(tx);
      if (Buffer.from(signed.message.serialize()).toString("base64") !== expectedMessage) throw new Error("Wallet changed the prediction transaction.");
      if (Date.parse(build.expiresAt) <= Date.now()) throw new Error("Order expired while signing. Review a fresh quote.");
      const signature = bs58.encode(signed.signatures[0]);
      const order: PendingOrder = { signature, orderToken: build.orderToken, mint: token.mint, kind: action };
      // Remember before broadcasting: an RPC timeout can still mean the transaction was sent.
      remember(order);
      const sentSignature = await connection.sendRawTransaction(signed.serialize(), { skipPreflight: false, preflightCommitment: "confirmed", maxRetries: 2 });
      if (sentSignature !== signature) throw new Error("Check the submitted transaction status before placing another order.");
      try { await confirmSubmittedTransaction(connection, signature, { blockhash: build.recentBlockhash, lastValidBlockHeight: build.lastValidBlockHeight }); }
      catch { setError("Transaction submitted. Check confirmation before placing another order."); return; }
      await confirmOrder(order);
    } catch (err) { setError(err instanceof Error ? err.message : "Prediction request failed."); }
    finally { actionInProgress.current = false; setBusy(false); }
  };
  const retryConfirmation = async () => {
    if (!pending || actionInProgress.current) return;
    actionInProgress.current = true; setBusy(true); setError(null);
    try { await confirmOrder(pending); } catch (err) { setError(err instanceof Error ? err.message : "Confirmation is unavailable. Please retry."); }
    finally { actionInProgress.current = false; setBusy(false); }
  };
  const txUrl = (signature: string) => `https://solscan.io/tx/${signature}${network === "devnet" ? "?cluster=devnet" : ""}`;

  return (
    <section className="rounded-2xl border border-border bg-card p-5 space-y-4" aria-label="Market belief">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex items-center gap-2"><TrendingUp className="h-4 w-4 text-brand-cyan" /><h3 className="text-xs font-bold uppercase tracking-wider text-foreground">Market Belief</h3></div>
        <span className="text-[10px] text-muted">Powered by <strong className="text-foreground">Panta</strong></span>
      </div>
      {loading ? <div className="space-y-3 animate-pulse"><div className="h-5 w-3/4 rounded bg-card-hover" /><div className="h-11 rounded-xl bg-card-hover" /></div> : !market ? (
        <div className="space-y-2">{provisioning ? <>
          <span className="rounded border border-border px-2 py-1 text-[10px] text-muted">System Market · Awaiting confirmation</span>
          <p className="pt-2 text-sm font-medium text-foreground">{provisioning.title}</p>
          <p className="text-xs text-muted leading-relaxed">{provisioning.description}</p>
          <p role="status" className="text-xs text-muted leading-relaxed">{provisioning.message}</p>
        </> : <><p className="text-sm font-medium text-foreground">Prediction market unavailable</p><p className="text-xs text-muted leading-relaxed">{marketError}</p></>}</div>
      ) : <>
        <div className="flex items-center justify-between gap-2 text-[10px] text-muted">
          <span className="rounded border border-border px-2 py-1">System Market · {market.stage === "pre-graduation" ? "Pre-Graduation" : "Post-Graduation"}</span>
          <span>Resolves {dateLabel(market.resolutionTime)} UTC · {market.phase}</span>
        </div>
        <div><h4 className="text-sm font-semibold text-foreground leading-snug break-words">{market.title}</h4><p className="mt-2 text-xs text-muted leading-relaxed whitespace-pre-line break-words">{market.description}</p></div>
        <div className="grid grid-cols-2 gap-2" aria-label="Live share prices">
          {(["yes", "no"] as const).map(orderSide => <button type="button" key={orderSide} disabled={busy || !!pending || !market.tradingEnabled} onClick={() => setSelectedSide(orderSide)}
            className={`rounded-xl border p-3 text-left text-xs disabled:opacity-60 ${selectedSide === orderSide ? "border-brand-cyan/30 bg-brand-cyan/10 text-brand-cyan" : "border-border text-muted"}`}>
            <span className="font-bold">{orderSide.toUpperCase()}</span><span className="float-right font-mono">{market[orderSide === "yes" ? "yesPrice" : "noPrice"] === null ? "—" : `$${market[orderSide === "yes" ? "yesPrice" : "noPrice"]}`}</span>
          </button>)}
        </div>
        <p className="text-[10px] text-muted">Live price per share · Volume {market.volumeUsdc === null ? "unavailable" : `${Number(market.volumeUsdc).toLocaleString("en-US", { maximumFractionDigits: 2 })} USDC`}</p>
        {market.tradingEnabled && <>
          <label className="block space-y-2 text-xs text-muted"><span>Deposit (USDC)</span><input type="text" inputMode="decimal" value={amountUsdc} onChange={event => setAmountUsdc(event.target.value)} disabled={busy || !!pending} maxLength={24}
            className="w-full rounded-xl border border-border bg-card-subtle p-3 font-mono text-foreground outline-none focus:border-brand-cyan" /></label>
          {quote && <div className="rounded-xl border border-border bg-card-hover p-3 text-xs space-y-1"><p>Estimated {quote.shares} {quote.side.toUpperCase()} shares</p><p className="text-muted">Fee {quote.feeUsdc} USDC</p><p className="text-muted">Prices can move before confirmation. Final shares depend on the execution price. Payout depends on the market outcome.</p></div>}
          <button type="button" onClick={() => void perform("buy")} disabled={busy || !!pending || !signTransaction || !validAmount(amountUsdc)}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-cyan text-background font-bold text-xs disabled:opacity-50">
            {busy ? <><Loader2 className="h-4 w-4 animate-spin" />Processing…</> : !wallet ? "Connect Wallet to Predict" : !signTransaction ? "Wallet signing unavailable" : quote ? `Buy ${selectedSide.toUpperCase()} · ${amountUsdc} USDC` : "Review Prediction"}
          </button>
        </>}
        <a href={market.marketUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-1 text-xs text-brand-cyan hover:underline">View market and resolution on Panta <ExternalLink className="h-3 w-3" /></a>
      </>}
      {wallet && positionsError && <p className="text-xs text-muted" role="status">{positionsError}</p>}
      {positions.filter(position => Number(position.shares) > 0 && !position.claimed).map(position => <div key={`holding:${position.marketId}:${position.side}`} className="rounded-xl border border-border bg-card-hover p-3 text-xs text-muted">
        <p className="font-medium text-foreground">Your {position.side.toUpperCase()} position · {Number(position.shares).toLocaleString("en-US", { maximumFractionDigits: 6 })} shares</p>
        <p className="mt-1">{position.phase === "resolved" ? position.claimable ? "Winnings available to claim" : "Market resolved" : "Payout depends on Panta's verified outcome"}</p>
      </div>)}
      {positions.filter(position => position.claimable && !position.claimed).map(position => <button key={`${position.marketId}:${position.side}`} type="button" disabled={busy || !!pending || !signTransaction} onClick={() => void perform("claim", position)} className="h-11 w-full rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs font-bold disabled:opacity-50">Claim {position.side.toUpperCase()} Winnings · {position.shares} shares</button>)}
      {pending && <div className="rounded-xl border border-border bg-card-hover p-3 space-y-2 text-xs"><p className="text-muted">Transaction submitted; confirmation pending.</p><a className="text-brand-cyan hover:underline" href={txUrl(pending.signature)} target="_blank" rel="noopener noreferrer">View submitted transaction</a><button type="button" disabled={busy} onClick={() => void retryConfirmation()} className="block font-semibold text-foreground">Check Confirmation</button></div>}
      {error && <p role="alert" className="flex gap-2 text-xs text-rose-300"><AlertCircle className="h-4 w-4 shrink-0" />{error}</p>}
      {success && <div role="status" className="text-xs text-emerald-300 space-y-2"><p className="flex gap-2"><CheckCircle2 className="h-4 w-4" />Prediction transaction confirmed.</p><a href={txUrl(success)} target="_blank" rel="noopener noreferrer" className="text-brand-cyan hover:underline">View confirmed transaction</a></div>}
    </section>
  );
}

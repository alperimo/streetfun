"use client";

import { useState } from "react";
import Image from "next/image";
import { ArrowUpRight, Download, X } from "lucide-react";
import { receiptAmount, receiptLabel, receiptNote, receiptSvg, type TradeReceiptData } from "./tradeReceiptModel";

export function TradeReceipt({ data, onDismiss }: { data: TradeReceiptData; onDismiss: () => void }) {
  const [downloadError, setDownloadError] = useState(false);
  const download = () => {
    try {
      const theme = getComputedStyle(document.documentElement);
      const color = (variable: string) => theme.getPropertyValue(variable).trim();
      const contents = receiptSvg(data, {
        background: color("--background"), surface: color("--card"), border: color("--border"),
        text: color("--foreground"), muted: color("--muted"), accent: color(data.operation === "redeem" ? "--brand-amber" : "--brand-cyan"),
      });
      const url = URL.createObjectURL(new Blob([contents], { type: "image/svg+xml" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `StreetFun-${data.token.symbol.replace(/[^a-z0-9_-]/gi, "")}-${data.kind}.svg`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setDownloadError(false);
    } catch { setDownloadError(true); }
  };

  return (
    <section className="trade-receipt relative mt-4 overflow-hidden rounded-xl border border-border bg-card-subtle" data-receipt-kind={data.kind} data-operation={data.operation} aria-label={`${data.token.symbol} receipt`}>
      <div className="receipt-edge pointer-events-none absolute inset-x-0 top-0 h-px" aria-hidden="true" />
      <div className="p-5">
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-bold tracking-tight text-foreground">StreetFun<span className="text-brand-cyan"> /</span></span>
          <button type="button" onClick={onDismiss} aria-label="Dismiss receipt" className="rounded p-1 text-muted hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-cyan"><X aria-hidden="true" className="h-3.5 w-3.5" /></button>
        </div>
        <p role="status" className="receipt-accent mt-4 text-[9px] font-semibold uppercase tracking-[0.22em]">{receiptLabel(data.kind)} · {data.operation}</p>
        <div className="mt-2 flex items-center gap-3">
          <Image src={data.token.avatarUrl} alt="" width={36} height={36} className="h-9 w-9 rounded-full border border-border" />
          <div className="min-w-0"><h3 className="receipt-title text-2xl font-black tracking-tight text-foreground">${data.token.symbol}</h3><p className="truncate text-[11px] text-muted">{data.token.name}</p></div>
        </div>
        <div className="receipt-amounts mt-5 grid grid-cols-[1fr_auto_1fr] items-center gap-3 border-y border-dashed border-border py-4">
          <div className="receipt-leg min-w-0"><p className="text-[9px] uppercase tracking-[0.18em] text-muted">Sent</p><p className="mt-1 break-words font-mono text-base font-semibold text-foreground">{receiptAmount(data.sent.amount)}</p><p className="text-[10px] text-muted">{data.sent.symbol}</p></div>
          <ArrowUpRight aria-hidden="true" className="receipt-flow h-4 w-4 text-muted" />
          <div className="receipt-leg min-w-0"><p className="text-[9px] uppercase tracking-[0.18em] text-muted">Received</p><p className="receipt-accent mt-1 break-words font-mono text-base font-semibold">{receiptAmount(data.received.amount)}</p><p className="text-[10px] text-muted">{data.received.symbol}</p></div>
        </div>
        <p className="mt-3 font-mono text-[9px] text-muted">{new Date(data.timestamp).toISOString().replace("T", " ").slice(0, 19)} UTC</p>
        {data.signature && <p className="mt-1 break-all font-mono text-[9px] text-muted">Signature: {data.signature}</p>}
        <p className="mt-2 text-[10px] leading-relaxed text-muted">{receiptNote(data.kind)}</p>
        <button type="button" onClick={download} className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-[11px] font-medium text-foreground hover:border-border-active hover:bg-card-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-cyan"><Download aria-hidden="true" className="h-3.5 w-3.5" />Save receipt</button>
        {downloadError && <p role="alert" className="mt-2 text-xs text-brand-rose">Could not save the receipt. Please try again.</p>}
      </div>
    </section>
  );
}

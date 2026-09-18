import type { TokenMetadata } from "@/lib/types";
import type { TradeResult, RedeemResult } from "@/services/types";

export interface TradeReceiptData {
  token: Pick<TokenMetadata, "name" | "symbol" | "mint" | "avatarUrl">;
  operation: "buy" | "sell" | "redeem";
  kind: "preview" | "demo" | "result";
  sent: { amount: number; symbol: string };
  received: { amount: number; symbol: string };
  timestamp: string;
  signature?: string;
}

export const receiptLabel = (_kind: TradeReceiptData["kind"]) => "Receipt";
export const receiptNote = (kind: TradeReceiptData["kind"]) =>
  kind === "preview" ? "Illustrative amounts. No transaction submitted." : kind === "demo"
    ? "" : "Service-reported result. Confirmation not verified.";
export const receiptAmount = (value: number) => value.toLocaleString("en-US", { maximumFractionDigits: 6 });
const valid = (...values: number[]) => values.every(value => Number.isFinite(value) && value > 0);
const identity = ({ name, symbol, mint, avatarUrl }: TokenMetadata) => ({ name, symbol, mint, avatarUrl });

export function receiptFromTrade(token: TokenMetadata, mode: "buy" | "sell", result: TradeResult, demo: boolean): TradeReceiptData | null {
  if (!result.success || !valid(result.tokensAmount, result.quoteAmount)) return null;
  const quote = { amount: result.quoteAmount, symbol: "USDC" };
  const tokens = { amount: result.tokensAmount, symbol: token.symbol };
  return { token: identity(token), operation: mode, kind: demo ? "demo" : "result",
    sent: mode === "buy" ? quote : tokens, received: mode === "buy" ? tokens : quote,
    timestamp: new Date().toISOString(), signature: result.txSignature };
}

export function receiptFromRedemption(token: TokenMetadata, action: "stock" | "usdc", input: number, result: RedeemResult, demo: boolean): TradeReceiptData | null {
  const amount = action === "stock" ? result.entitledShares : result.usdcValue;
  if (!result.success || !valid(input, amount)) return null;
  return { token: identity(token), operation: "redeem", kind: demo ? "demo" : "result",
    sent: { amount: input, symbol: token.symbol },
    received: { amount, symbol: action === "stock" ? `${token.targetEquity.symbol} shares` : "USDC" },
    timestamp: new Date().toISOString(), signature: result.txSignature };
}

/** Design inspection never executes a trade or writes to the market service. */
export function receiptPreview(token: TokenMetadata): TradeReceiptData {
  return { token: identity(token), operation: "buy", kind: "preview",
    sent: { amount: 100, symbol: "USDC" },
    received: { amount: valid(token.priceUsd) ? 100 / token.priceUsd : 1000, symbol: token.symbol },
    timestamp: new Date().toISOString() };
}

const xml = (text: string) => text.replace(/[<>&"']/g, char => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" }[char]!));

/** Standalone, inert SVG: only escaped text and resolved theme colors, no remote assets. */
export function receiptSvg(data: TradeReceiptData, colors: { background: string; surface: string; border: string; text: string; muted: string; accent: string }): string {
  const c = Object.fromEntries(Object.entries(colors).map(([key, value]) => [key, xml(value)]));
  const line = (x: number, y: number, text: string, size = 16, color = c.text, extra = "") =>
    `<text x="${x}" y="${y}" fill="${color}" font-size="${size}" ${extra}>${xml(text)}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="760" height="480" viewBox="0 0 760 480" role="img" aria-label="${xml(receiptLabel(data.kind))}">
  <rect width="760" height="480" rx="24" fill="${c.background}"/>
  <rect x="14" y="14" width="732" height="452" rx="18" fill="${c.surface}" stroke="${c.border}"/>
  <path d="M40 15H720" stroke="${c.accent}" stroke-width="2"/>
  <g font-family="Arial, sans-serif">
  ${line(42, 60, "StreetFun", 23, c.text, 'font-weight="700"')}
  ${line(718, 59, receiptLabel(data.kind).toUpperCase(), 12, c.accent, 'text-anchor="end" letter-spacing="2"')}
  ${line(42, 123, `${data.operation.toUpperCase()} / $${data.token.symbol.slice(0, 20)}`, 15, c.muted, 'letter-spacing="2"')}
  ${line(42, 177, data.token.name.slice(0, 34), 32, c.text, 'font-weight="700"')}
  <path d="M42 208H718 M42 341H718" stroke="${c.border}" stroke-dasharray="3 5"/>
  ${line(42, 249, "SENT", 11, c.muted, 'letter-spacing="2"')}
  ${line(412, 249, "RECEIVED", 11, c.muted, 'letter-spacing="2"')}
  ${line(42, 284, receiptAmount(data.sent.amount), 27, c.text, 'font-family="monospace"')}
  ${line(412, 284, receiptAmount(data.received.amount), 27, c.accent, 'font-family="monospace"')}
  ${line(42, 313, data.sent.symbol.slice(0, 30), 13, c.muted)}
  ${line(412, 313, data.received.symbol.slice(0, 30), 13, c.muted)}
  ${line(42, 380, new Date(data.timestamp).toISOString().replace("T", " ").slice(0, 19) + " UTC", 12, c.muted)}
  ${line(42, 410, receiptNote(data.kind), 12, c.muted)}
  ${line(42, 439, `${data.token.mint.slice(0, 14)}…${data.token.mint.slice(-10)}`, 10, c.muted, 'font-family="monospace"')}
  </g></svg>`;
}

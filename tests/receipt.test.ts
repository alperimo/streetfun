import { expect } from "chai";
import { receiptFromTrade, receiptFromRedemption, receiptSvg, receiptLabel } from "../src/components/tokens/tradeReceiptModel";
import type { TokenMetadata } from "../src/lib/types";
import type { TradeResult, RedeemResult } from "../src/services/types";

const receiptToken: TokenMetadata = {
  mint: "example-mint", name: "Example <asset>", symbol: "EX", description: "",
  avatarUrl: "/example.png", creator: "tester", createdAt: "2026-01-01T00:00:00.000Z",
  marketCapUsd: 0, priceUsd: 2, priceChange24h: 0, volume24hUsd: 0,
  targetEquity: {
    symbol: "STOCK", name: "Example asset", mintAddress: "stock-mint",
    custodian: "", legalFramework: "", logoUrl: "", stockPriceUsd: 0,
  },
  bondingCurve: {
    realQuoteReservesUsd: 0, graduationThresholdUsd: 0, progressPct: 0,
    virtualQuoteReserves: "0", virtualTokenReserves: "0", realTokenReserves: "0",
    isGraduated: false,
  },
  treasury: { totalEquityLocked: 0, totalEquityValueUsd: 0, vaultPda: "" },
};
const receiptResult: TradeResult = {
  success: true, tokensAmount: 12, quoteAmount: 24, effectivePrice: 2,
  txSignature: "2".repeat(87), priceImpactPct: 0, isGraduated: false, message: "", updatedToken: receiptToken,
};

describe("Trade receipt presentation", () => {
  it("keeps returned amounts and buy/sell directions", () => {
    const buy = receiptFromTrade(receiptToken, "buy", receiptResult);
    const sell = receiptFromTrade(receiptToken, "sell", receiptResult);
    expect(buy.sent).to.deep.equal({ amount: 24, symbol: "USDC" });
    expect(buy.received).to.deep.equal({ amount: 12, symbol: "EX" });
    expect(sell.sent).to.deep.equal(buy.received);
    expect(sell.received).to.deep.equal(buy.sent);
  });
  it("never presents failed or non-finite results as receipts", () => {
    for (const result of [{ ...receiptResult, success: false }, { ...receiptResult, quoteAmount: NaN }, { ...receiptResult, tokensAmount: 0 }]) {
      expect(receiptFromTrade(receiptToken, "buy", result)).to.equal(null);
    }
  });
  it("requires a real transaction receipt and rejects unsigned results", () => {
    expect(receiptFromTrade(receiptToken, "buy", { ...receiptResult, txSignature: undefined })).to.equal(null);
    const live = receiptFromTrade(receiptToken, "buy", receiptResult)!;
    expect(live.kind).to.equal("result");
    expect(receiptLabel(live.kind)).to.equal("Receipt");
  });
  it("uses the selected redemption asset and service amount", () => {
    const result: RedeemResult = {
      success: true, txSignature: "3".repeat(87), entitledShares: 0.25, usdcValue: 50, message: "", updatedToken: receiptToken,
    };
    expect(receiptFromRedemption(receiptToken, "stock", 100, result).received).to.deep.equal({ amount: 0.25, symbol: "STOCK tokens" });
    expect(receiptFromRedemption(receiptToken, "usdc", 100, result).received).to.deep.equal({ amount: 50, symbol: "USDC" });
  });
  it("escapes token metadata in exported artwork", () => {
    const data = receiptFromTrade({ ...receiptToken, name: '<script>alert("x")</script>', symbol: 'A&"B' }, "buy", receiptResult)!;
    const svg = receiptSvg(data, { background: "black", surface: "black", border: "gray", text: "white", muted: "gray", accent: "green" });
    expect(svg).not.to.include("<script>");
    expect(svg).to.include("&lt;script&gt;");
    expect(svg).to.include("A&amp;&quot;B");
    expect(svg).to.include("Confirmed on Solana");
    expect(svg).not.to.include("<image");
  });
});

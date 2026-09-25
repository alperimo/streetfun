import { expect } from "chai";
import { receiptFromTrade, receiptFromRedemption, receiptPreview, receiptSvg, receiptLabel } from "../src/components/tokens/tradeReceiptModel";

const receiptToken = { name: "Example <asset>", symbol: "EX", mint: "example-mint", avatarUrl: "/example.png", priceUsd: 2, targetEquity: { symbol: "STOCK" } };
const receiptResult = { success: true, tokensAmount: 12, quoteAmount: 24 };

describe("Trade receipt presentation", () => {
  it("keeps returned amounts and buy/sell directions", () => {
    const buy = receiptFromTrade(receiptToken, "buy", receiptResult, true);
    const sell = receiptFromTrade(receiptToken, "sell", receiptResult, true);
    expect(buy.sent).to.deep.equal({ amount: 24, symbol: "USDC" });
    expect(buy.received).to.deep.equal({ amount: 12, symbol: "EX" });
    expect(sell.sent).to.deep.equal(buy.received);
    expect(sell.received).to.deep.equal(buy.sent);
  });
  it("never presents failed or non-finite results as receipts", () => {
    for (const result of [{ ...receiptResult, success: false }, { ...receiptResult, quoteAmount: NaN }, { ...receiptResult, tokensAmount: 0 }]) {
      expect(receiptFromTrade(receiptToken, "buy", result, false)).to.equal(null);
    }
  });
  it("keeps preview, simulation and unverified service results distinct", () => {
    expect(receiptPreview(receiptToken).kind).to.equal("preview");
    expect(receiptFromTrade(receiptToken, "buy", receiptResult, true).kind).to.equal("demo");
    const live = receiptFromTrade(receiptToken, "buy", { ...receiptResult, txSignature: "some-signature" }, false);
    expect(live.kind).to.equal("result");
    expect(receiptLabel(live.kind)).to.equal("Receipt");
  });
  it("uses the selected redemption asset and service amount", () => {
    const result = { success: true, entitledShares: 0.25, usdcValue: 50 };
    expect(receiptFromRedemption(receiptToken, "stock", 100, result, true).received).to.deep.equal({ amount: 0.25, symbol: "STOCK shares" });
    expect(receiptFromRedemption(receiptToken, "usdc", 100, result, true).received).to.deep.equal({ amount: 50, symbol: "USDC" });
  });
  it("escapes token metadata and keeps preview disclosure in exported artwork", () => {
    const data = receiptPreview({ ...receiptToken, name: '<script>alert("x")</script>', symbol: 'A&"B' });
    const svg = receiptSvg(data, { background: "black", surface: "black", border: "gray", text: "white", muted: "gray", accent: "green" });
    expect(svg).not.to.include("<script>");
    expect(svg).to.include("&lt;script&gt;");
    expect(svg).to.include("A&amp;&quot;B");
    expect(svg).to.include("No transaction submitted");
    expect(svg).not.to.include("<image");
  });
});

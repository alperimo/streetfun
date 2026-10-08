import { expect } from "chai";
import { createHash } from "node:crypto";
import bs58 from "bs58";
import { memoryDatabase } from "./support/memoryDatabase";
import { TradeStoreService, TradeRecord } from "../src/services/indexer/tradeStore";

describe("Trade index consistency", () => {
  const database = memoryDatabase();
  const store = new TradeStoreService(() => database);
  const mint = "CaseSensitiveMint";
  const time = new Date().toISOString();
  const trade = (signature: string, overrides: Partial<TradeRecord> = {}): TradeRecord => ({
    tx_signature: bs58.encode(createHash("sha512").update(signature).digest()), slot: 1, mint, trade_type: "BUY", price_usd: 2,
    tokens_amount: 5, quote_amount_usd: 10, trader: "trader", created_at: time,
    ...overrides,
  });

  it("keeps metadata for addresses differing only by case separate", async () => {
    for (const address of [mint, mint.toLowerCase()]) {
      await store.recordToken({ mint: address, name: address, symbol: "TEST", creator: "creator",
        target_equity_symbol: "STOCK", target_equity_mint: "equity" });
    }
    const tokens = await store.getAllTokens();
    expect(tokens.filter((token) => [mint, mint.toLowerCase()].includes(token.mint))).to.have.length(2);
  });

  it("counts redelivered trades once across history, volume, reserves and candles", async () => {
    await store.recordTrade(trade("duplicate"));
    await store.recordTrade(trade("duplicate"));
    expect(await store.getTrades(mint)).to.have.length(1);
    expect((await store.getMarketStats([mint]))[mint].volume24hUsd).to.equal(10);
    expect((await store.getReservesPerMint())[mint]).to.equal(10);
    expect((await store.getOHLCV(mint))[0].volume).to.equal(10);
  });

  it("does not mix trading data from addresses differing only by case", async () => {
    await store.recordTrade(trade("different-case", { mint: mint.toLowerCase(), quote_amount_usd: 70 }));
    expect(await store.getTrades(mint)).to.have.length(1);
    const stats = await store.getMarketStats([mint, mint.toLowerCase()]);
    expect(stats[mint].volume24hUsd).to.equal(10);
    expect(stats[mint.toLowerCase()].volume24hUsd).to.equal(70);
    expect((await store.getOHLCV(mint))[0].volume).to.equal(10);
  });

  it("keeps late notifications from replacing the latest trade price", async () => {
    await store.recordTrade(trade("older", {
      created_at: new Date(Date.now() - 60_000).toISOString(), price_usd: 1,
    }));
    expect((await store.getTrades(mint))[0].tx_signature).to.equal(bs58.encode(createHash("sha512").update("duplicate").digest()));
    expect((await store.getLatestPrices())[mint].priceUsd).to.equal(2);
  });

  it("excludes equity redemptions from market candles and curve cash flows", async () => {
    const before = await store.getOHLCV(mint);
    const reserves = (await store.getReservesPerMint())[mint];
    await store.recordTrade(trade("redemption", { trade_type: "REDEEM", price_usd: 0, quote_amount_usd: 100 }));
    expect(await store.getOHLCV(mint)).to.deep.equal(before);
    expect((await store.getReservesPerMint())[mint]).to.equal(reserves);
    expect((await store.getRedemptions()).some((item) => item.tx_signature === bs58.encode(createHash("sha512").update("redemption").digest()))).to.equal(true);
  });
});

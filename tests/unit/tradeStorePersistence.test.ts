import { expect } from "chai";
import { TradeStoreService, TradeRecord } from "../../src/services/indexer/tradeStore";

function fakeDatabase(rows: TradeRecord[]) {
  let reads = 0;
  return { get reads() { return reads; }, from: (table: string) => {
    const filters: ((row: TradeRecord) => boolean)[] = [];
    const query: any = {
      select: () => query, order: () => query,
      eq: (key, value) => { filters.push(row => row[key] === value); return query; },
      in: (key, values) => { filters.push(row => values.includes(row[key])); return query; },
      gte: (key, value) => { filters.push(row => row[key] >= value); return query; },
      maybeSingle: async () => ({ data: { mint: "mint" }, error: null }),
      upsert: async (record) => {
        if (table === "trades") {
          const i = rows.findIndex(row => row.tx_signature === record.tx_signature);
          if (i >= 0) rows[i] = record; else rows.push(record);
        }
        return { error: null };
      },
      range: async (start, end) => { reads++; return { data: rows.filter(row => filters.every(filter => filter(row))).slice(start, end + 1), error: null }; },
    };
    return query;
  } };
}

const trade = (overrides: Partial<TradeRecord> = {}): TradeRecord => ({
  tx_signature: "1".repeat(64), mint: "mint", trade_type: "BUY", price_usd: 2,
  tokens_amount: 5, quote_amount_usd: 10, trader: "trader", slot: 123,
  created_at: new Date().toISOString(), ...overrides,
});

describe("Persistent index reconciliation", () => {
  const oldMock = process.env.NEXT_PUBLIC_USE_MOCK_DATA;
  before(() => { process.env.NEXT_PUBLIC_USE_MOCK_DATA = "false"; });
  after(() => {
    if (oldMock === undefined) delete process.env.NEXT_PUBLIC_USE_MOCK_DATA;
    else process.env.NEXT_PUBLIC_USE_MOCK_DATA = oldMock;
  });
  it("counts a trade stored both remotely and locally once, including after redelivery", async () => {
    const rows: TradeRecord[] = [];
    const database = fakeDatabase(rows);
    const store = new TradeStoreService(() => database as any);
    await store.recordTrade(trade());
    await store.recordTrade(trade());
    expect(rows).to.have.length(1);
    expect((await store.getReservesPerMint()).mint).to.equal(10);
    expect((await store.getMarketStats(["mint"])).mint.volume24hUsd).to.equal(10);
  });
  it("walks past unverified history instead of hiding subsequent verified trades", async () => {
    const rows = Array.from({ length: 1000 }, (_, i) => trade({ tx_signature: `mock-${i}`, slot: undefined }));
    rows.push(trade());
    const database = fakeDatabase(rows);
    const store = new TradeStoreService(() => database as any);
    expect(await store.getTrades("mint", 1)).to.have.length(1);
    expect(database.reads).to.equal(2);
    expect((await store.getReservesPerMint()).mint).to.equal(10);
  });
  it("propagates database errors so callers can retry rather than use partial results", async () => {
    const database: any = { from: () => ({ select() { return this; }, order() { return this; },
      range: async () => ({ error: { message: "offline" } }) }) };
    try {
      await new TradeStoreService(() => database).getReservesPerMint();
      expect.fail("Expected database failure");
    } catch (error) { expect((error as Error).message).to.include("offline"); }
  });
});

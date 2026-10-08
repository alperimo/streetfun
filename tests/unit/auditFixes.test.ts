import { expect } from "chai";
import * as pantaLifecycle from "../../src/server/pantaLifecycle";
import { Connection, Keypair, PublicKey, SystemProgram, Transaction } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { NextRequest } from "next/server";
import { launchMetadataDigest, normalizeLaunchMetadata } from "../../src/lib/launchMetadata";
import { liveTreasuryHoldings } from "../../src/server/treasurySnapshot";
import { settlementPolicyMinimum, protectedSettlementMinimum } from "../../src/server/settlementPolicy";
import * as indexer from "../../src/server/indexTransaction";
import * as rpc from "../../src/server/rpc";
import * as catalog from "../../src/server/assetCatalog";
import * as database from "../../src/server/supabase";
import { solanaTokenService as serverTokens } from "../../src/server/tokenData";
import { TradeStoreService } from "../../src/services/indexer/tradeStore";
import { POST as confirmLaunch } from "../../src/app/api/launch/confirm/route";
import { POST as record } from "../../src/app/api/trades/record/route";
import { loadPendingLaunch, savePendingLaunch, withLaunchLock, PendingLaunch } from "../../src/services/solana/pendingLaunch";
import { SolanaTokenService } from "../../src/services/solana/solanaTokenService";
import { GET as treasury } from "../../src/app/api/treasury/route";
import * as liveTokens from "../../src/services/tokens/liveTokens";
import { BorshCoder, Program, BN } from "@coral-xyz/anchor";
import { DynamicBondingCurveIdl } from "@meteora-ag/dynamic-bonding-curve-sdk";
import bs58 from "bs58";
import idl from "../../src/idl/streetfun.json";
import { PROGRAM_ID, METEORA_DBC_PROGRAM_ID } from "../../src/sdk/constants";

function request(path: string, body: unknown) {
  return new NextRequest(`http://localhost${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

function replace(target: any, key: string, value: any, restorers: Array<() => void>) {
  const original = target[key]; target[key] = value; restorers.push(() => { target[key] = original; });
}

describe("Audit: immutable launch metadata and production write boundary", () => {
  const restore: Array<() => void> = [];
  afterEach(() => { restore.reverse().forEach(fn => fn()); restore.length = 0; });

  it("rejects changed image/description on a public confirmation replay, while allowing exact retries", async () => {
    const mint = Keypair.generate().publicKey, equity = Keypair.generate().publicKey;
    const metadata = normalizeLaunchMetadata({ avatarUrl: "https://example.com/original.png", description: "Original" });
    const digest = await launchMetadataDigest(metadata);
    let commitment: string | null = digest;
    const writes: any[] = [];
    replace(rpc, "getServerConnection", () => ({}), restore);
    replace(rpc, "assertConfiguredCluster", async () => "test", restore);
    replace(indexer, "readConfirmedTransaction", async () => ({}), restore);
    replace(indexer, "decodeStreetfunInstructions", () => [{ name: "registerDbcLaunch", instruction: { accounts: [null, null, mint, equity] } }], restore);
    replace(indexer, "decodeDbcPoolInitialization", () => ({ name: "Test", symbol: "TEST", uri: `https://example.com/api/metadata/${mint}${commitment ? `?v=${commitment}` : ""}` }), restore);
    replace(indexer, "indexConfirmedTransaction", async () => {}, restore);
    replace(catalog, "getNetworkAssetCatalog", async () => [{ mintAddress: equity.toBase58(), symbol: "EQ" }], restore);
    replace(database, "createServerSupabaseClient", () => ({ from: () => ({ update: (data: any) => { writes.push(data); return { eq: () => ({ select: () => ({ maybeSingle: async () => ({ data: { mint: mint.toBase58() } }) }) }) }; } }) }), restore);
    replace(serverTokens, "invalidate", () => {}, restore);
    replace(serverTokens, "getToken", async () => ({ mint: mint.toBase58() }), restore);
    const body = { signature: "confirmed-signature", mint: mint.toBase58(), name: "Test", symbol: "TEST", targetEquitySymbol: "EQ", ...metadata };
    expect((await confirmLaunch(request("/api/launch/confirm", body))).status).to.equal(200);
    expect((await confirmLaunch(request("/api/launch/confirm", body))).status).to.equal(200);
    for (const change of [{ avatarUrl: "https://example.com/replaced.png" }, { description: "Changed" }]) {
      expect((await confirmLaunch(request("/api/launch/confirm", { ...body, ...change }))).status).to.equal(422);
    }
    expect(writes).to.have.length(2);
    commitment = null;
    expect((await confirmLaunch(request("/api/launch/confirm", body))).status).to.equal(200);
    expect(writes.at(-1)).not.to.have.property("avatar_url");
    expect(writes.at(-1)).not.to.have.property("description");
  });

  it("rejects public indexing in production even when the mock flag is enabled", async () => {
    const env = { NODE_ENV: process.env.NODE_ENV, NEXT_PUBLIC_USE_MOCK_DATA: process.env.NEXT_PUBLIC_USE_MOCK_DATA };
    restore.push(() => { for (const [key, value] of Object.entries(env)) value === undefined ? delete process.env[key] : process.env[key] = value; });
    process.env.NODE_ENV = "production";
    process.env.NEXT_PUBLIC_USE_MOCK_DATA = "true";
    let reachedStore = false;
    replace(TradeStoreService, "getInstance", () => { reachedStore = true; throw new Error("Must not access storage"); }, restore);
    expect((await record(request("/api/trades/record", { token: { mint: "fake" } }))).status).to.equal(410);
    expect(reachedStore).to.equal(false);
  });

  it("returns unavailable when current treasury verification fails instead of serving indexed balances", async () => {
    let queried = false;
    replace(database, "createServerSupabaseClient", () => ({ from: () => { queried = true; throw new Error("Must not read stale holdings"); } }), restore);
    replace(liveTokens, "getLiveTokens", async () => { throw new Error("RPC unavailable"); }, restore);
    expect((await treasury()).status).to.equal(503);
    expect(queried).to.equal(false);
  });

  it("preserves live graduation when the original DBC launch is reindexed", async () => {
    const coder = new Program({ ...idl, address: PROGRAM_ID.toBase58() } as any, { connection: {} } as any).coder;
    const dbcCoder = new BorshCoder(DynamicBondingCurveIdl as any);
    const accounts = (idl as any).instructions.find((ix: any) => ix.name === "register_dbc_launch").accounts.map(() => Keypair.generate().publicKey);
    const pool = Keypair.generate().publicKey;
    const registryData = await coder.accounts.encode("dbcLaunchAccount", {
      creator: accounts[0], memeMint: accounts[2], targetEquityMint: accounts[3], quoteMint: accounts[4],
      dbcConfig: accounts[5], dbcPool: accounts[6], meteoraDammV2Pool: pool,
      initialMemeSupply: new BN(1000), settlementQuoteAmount: new BN(100), totalEquityLocked: new BN(50),
      graduatedAt: new BN(200), isGraduated: true, bump: 0,
    });
    const tx: any = { slot: 100, blockTime: 100, meta: { err: null, logMessages: [`Program ${PROGRAM_ID} invoke [1]`, `Program ${PROGRAM_ID} success`] }, transaction: { message: {
      accountKeys: [{ pubkey: accounts[0], signer: true }], instructions: [
        { programId: METEORA_DBC_PROGRAM_ID, accounts: [accounts[0], accounts[1], accounts[1], accounts[2]], data: bs58.encode(dbcCoder.instruction.encode("initialize_virtual_pool_with_spl_token", { params: { name: "Test", symbol: "TEST", uri: `https://example.com/api/metadata/${accounts[2]}` } })) },
        { programId: PROGRAM_ID, accounts, data: bs58.encode(coder.instruction.encode("registerDbcLaunch", {})) },
      ],
    } } };
    const writes: any[] = [];
    const connection: any = { getParsedTransaction: async () => tx, getAccountInfo: async () => ({ owner: PROGRAM_ID, data: registryData }) };
    replace(database, "createServerSupabaseClient", () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { is_graduated: true, avatar_url: "https://example.com/original.png", description: "Original" }, error: null }) }) }) }) }), restore);
    replace(catalog, "getNetworkAssetCatalog", async () => [{ mintAddress: accounts[3].toBase58(), symbol: "EQ" }], restore);
    replace(TradeStoreService, "getInstance", () => ({ recordToken: async (token: any) => { writes.push(token); } }), restore);
    replace(serverTokens, "invalidate", () => {}, restore);
    replace(pantaLifecycle, "enqueueLifecycle", async () => {}, restore);
    replace(pantaLifecycle, "captureLifecyclePrices", async () => {}, restore);
    await indexer.indexConfirmedTransaction(connection, bs58.encode(new Uint8Array(64)), undefined, accounts[2].toBase58());
    expect(writes).to.have.length(1);
    expect(writes[0].is_graduated).to.equal(true);
    expect(writes[0].meteora_pool).to.equal(pool.toBase58());
    expect(writes[0].avatar_url).to.equal("https://example.com/original.png");
  });
});

describe("Audit: settlement price limits", () => {
  const policy = { minimumOutputNumerator: "3", minimumOutputDenominator: "2", updatedAt: 100, validUntil: 200 };
  it("rounds protection upward and rejects expired or future rates", () => {
    expect(settlementPolicyMinimum(policy, 3n, 100)).to.equal(5n);
    for (const now of [99, 200, 500]) expect(() => settlementPolicyMinimum(policy, 3n, now)).to.throw();
    expect(() => settlementPolicyMinimum({ ...policy, validUntil: 1000 }, 3n, 110)).to.throw();
    expect(protectedSettlementMinimum(8n, 1n, 5n)).to.equal(5n);
    expect(() => protectedSettlementMinimum(4n, 1n, 5n)).to.throw();
  });
});

describe("Audit: treasury balances", () => {
  it("uses updated chain balances, removes emptied vaults and excludes unverified markets", () => {
    const token: any = { mint: "mint", name: "Token", symbol: "TOK", dataSource: "onchain", observedSlot: 200, lastUpdatedAt: "2026-09-26T00:00:00Z", bondingCurve: { isGraduated: true, meteoraPoolAddress: "pool" }, targetEquity: { mintAddress: "equity", symbol: "EQ" }, treasury: { totalEquityLocked: 4 } };
    const holdings = liveTreasuryHoldings([token]);
    expect(holdings[0].equityAmount).to.equal("4");
    expect(holdings[0].observedSlot).to.equal(200);
    expect(liveTreasuryHoldings([{ ...token, treasury: { totalEquityLocked: 0 } } as any])).to.deep.equal([]);
    expect(liveTreasuryHoldings([{ ...token, bondingCurve: { isGraduated: true } } as any])).to.deep.equal([]);
    expect(liveTreasuryHoldings([{ ...token, dataSource: "mock" } as any])).to.deep.equal([]);
  });
});

describe("Audit: persisted launch recovery", () => {
  const restore: Array<() => void> = [];
  let data: Map<string, string>;
  beforeEach(() => {
    data = new Map();
    for (const [key, value] of Object.entries({ navigator: { locks: { request: async (_key: string, _options: unknown, callback: (lock: object) => Promise<unknown>) => callback({}) } }, window: { dispatchEvent() {} }, localStorage: { getItem: (key: string) => data.get(key) || null, setItem: (key: string, value: string) => data.set(key, value), removeItem: (key: string) => data.delete(key) } })) {
      const old = Object.getOwnPropertyDescriptor(globalThis, key);
      Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
      restore.push(() => old ? Object.defineProperty(globalThis, key, old) : delete (globalThis as any)[key]);
    }
  });
  afterEach(() => { restore.reverse().forEach(fn => fn()); restore.length = 0; });
  it("survives reload, remains isolated by wallet, and blocks a concurrent launch", async () => {
    const pending: PendingLaunch = { version: 1, wallet: "wallet", mint: "mint", signature: "sig", blockhash: "hash", lastValidBlockHeight: 123, genesisHash: "genesis", params: { name: "Test", symbol: "TEST", description: "", avatarUrl: "", targetEquitySymbol: "EQ" } };
    savePendingLaunch("wallet", pending);
    expect(loadPendingLaunch("wallet")).to.deep.equal(pending);
    expect(loadPendingLaunch("another-wallet")).to.equal(null);
    let release!: () => void;
    const first = withLaunchLock("wallet", () => new Promise<void>(resolve => { release = resolve; }));
    try { await withLaunchLock("wallet", async () => {}); expect.fail("Concurrent launch accepted"); }
    catch (error) { expect(String(error)).to.include("already in progress"); }
    release(); await first;
    savePendingLaunch("wallet", null);
    expect(loadPendingLaunch("wallet")).to.equal(null);
  });

  it("stops before signing when another tab owns the lock or browser locking is unavailable", async () => {
    let reachedAction = false;
    replace(navigator.locks, "request", async (_key: string, _options: unknown, callback: (lock: null) => Promise<unknown>) => callback(null), restore);
    try { await withLaunchLock("wallet", async () => { reachedAction = true; }); expect.fail("Another tab owns the launch"); }
    catch (error) { expect(String(error)).to.include("another tab"); }
    replace(navigator, "locks", undefined, restore);
    try { await withLaunchLock("wallet", async () => { reachedAction = true; }); expect.fail("Browser coordination unavailable"); }
    catch (error) { expect(String(error)).to.include("cannot safely coordinate"); }
    expect(reachedAction).to.equal(false);
  });

  it("persists before broadcast, blocks a replacement after a timeout, and recovers without resubmitting", async () => {
    const payer = Keypair.generate();
    const service = new SolanaTokenService();
    const params = { name: "Test", symbol: "TEST", description: "Original", avatarUrl: "https://example.com/image.png", targetEquitySymbol: "EQ" };
    const wallet: any = { publicKey: payer.publicKey, sendTransaction: async () => { throw new Error("Must use the saved signed transaction"); }, signTransaction: async (tx: Transaction) => { tx.partialSign(payer); return tx; } };
    let preparedCount = 0, sentCount = 0, indexingSucceeds = false;
    replace(Connection.prototype, "getGenesisHash", async () => "test-genesis", restore);
    replace(Connection.prototype, "sendRawTransaction", async () => {
      sentCount++;
      expect(loadPendingLaunch(payer.publicKey.toBase58())?.signature).to.be.a("string");
      throw new Error("RPC timed out after accepting the transaction");
    }, restore);
    replace(Connection.prototype, "getSignatureStatuses", async () => ({ value: [{ confirmationStatus: "confirmed", err: null }] }), restore);
    replace(globalThis, "fetch", async (url: string, init?: RequestInit) => {
      if (url === "/api/assets") return Response.json({ assets: [{ symbol: "EQ", mintAddress: Keypair.generate().publicKey.toBase58(), launchEnabled: true, tokenProgram: TOKEN_PROGRAM_ID.toBase58() }] });
      if (url === "/api/launch/prepare") {
        preparedCount++;
        const body = JSON.parse(init!.body as string);
        const transaction = new Transaction({ feePayer: payer.publicKey, recentBlockhash: Keypair.generate().publicKey.toBase58() }).add(SystemProgram.transfer({ fromPubkey: new PublicKey(body.mint), toPubkey: payer.publicKey, lamports: 1 }));
        return Response.json({ transaction: transaction.serialize({ requireAllSignatures: false }).toString("base64"), lastValidBlockHeight: 123, metadataUri: `https://example.com/api/metadata/${body.mint}?v=${await launchMetadataDigest(normalizeLaunchMetadata(body))}` });
      }
      if (url === "/api/launch/confirm") {
        const body = JSON.parse(init!.body as string);
        expect(body.description).to.equal(params.description);
        expect(body.avatarUrl).to.equal(params.avatarUrl);
        return indexingSucceeds ? Response.json({ token: { mint: body.mint } }) : Response.json({ error: "Indexer unavailable" }, { status: 503 });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }, restore);
    try { await service.launchToken(params, wallet); expect.fail("Timeout must remain pending"); }
    catch (error) { expect((error as Error).name).to.equal("SubmittedTransactionError"); }
    const pending = loadPendingLaunch(payer.publicKey.toBase58())!;
    expect(pending.mint).to.be.a("string");
    try { await service.launchToken(params, wallet); expect.fail("Replacement launch accepted"); }
    catch (error) { expect(String(error)).to.include("launch is pending"); }
    try { await service.resumeLaunch(wallet); expect.fail("Indexing failure must remain pending"); }
    catch (error) { expect((error as Error).name).to.equal("SubmittedTransactionError"); }
    expect(loadPendingLaunch(pending.wallet)).to.deep.equal(pending);
    indexingSucceeds = true;
    expect((await service.resumeLaunch(wallet))?.mint).to.equal(pending.mint);
    expect(loadPendingLaunch(pending.wallet)).to.equal(null);
    expect(preparedCount).to.equal(1);
    expect(sentCount).to.equal(1);
    replace(localStorage, "setItem", () => { throw new Error("Storage blocked"); }, restore);
    try { await service.launchToken(params, wallet); expect.fail("Must stop when recovery details cannot be saved"); }
    catch (error) { expect(String(error)).to.include("Storage blocked"); }
    expect(sentCount).to.equal(1);
  });

  it("keeps unknown launches blocked until finalized expiry and an absent mint are verified", async () => {
    const wallet: any = { publicKey: Keypair.generate().publicKey };
    const pending: PendingLaunch = { version: 1, wallet: wallet.publicKey.toBase58(), mint: Keypair.generate().publicKey.toBase58(), signature: "sig", blockhash: "hash", lastValidBlockHeight: 123, genesisHash: "genesis", params: { name: "Test", symbol: "TEST", description: "", avatarUrl: "", targetEquitySymbol: "EQ" } };
    savePendingLaunch(pending.wallet, pending);
    let height = 123, mintExists = true;
    replace(Connection.prototype, "getGenesisHash", async () => "genesis", restore);
    replace(Connection.prototype, "getSignatureStatuses", async () => ({ value: [null] }), restore);
    replace(Connection.prototype, "getBlockHeight", async (commitment: string) => { expect(commitment).to.equal("finalized"); return height; }, restore);
    replace(Connection.prototype, "getAccountInfo", async (_: unknown, commitment: string) => { expect(commitment).to.equal("finalized"); return mintExists ? {} : null; }, restore);
    const service = new SolanaTokenService();
    for (const nextHeight of [123, 124]) {
      height = nextHeight;
      try { await service.resumeLaunch(wallet); expect.fail("Unknown launch cleared too early"); }
      catch (error) { expect((error as Error).name).to.equal("SubmittedTransactionError"); }
      expect(loadPendingLaunch(pending.wallet)).to.deep.equal(pending);
    }
    mintExists = false;
    try { await service.resumeLaunch(wallet); expect.fail("Expiry should explain safe retry"); }
    catch (error) { expect(String(error)).to.include("expired without creating a token"); }
    expect(loadPendingLaunch(pending.wallet)).to.equal(null);
  });

  it("does not clear a processed failure until it becomes final", async () => {
    const wallet: any = { publicKey: Keypair.generate().publicKey };
    const pending: PendingLaunch = { version: 1, wallet: wallet.publicKey.toBase58(), mint: Keypair.generate().publicKey.toBase58(), signature: "sig", blockhash: "hash", lastValidBlockHeight: 123, genesisHash: "genesis", params: { name: "Test", symbol: "TEST", description: "", avatarUrl: "", targetEquitySymbol: "EQ" } };
    savePendingLaunch(pending.wallet, pending);
    let confirmationStatus = "processed";
    replace(Connection.prototype, "getGenesisHash", async () => "genesis", restore);
    replace(Connection.prototype, "getSignatureStatuses", async () => ({ value: [{ err: { InstructionError: [0, "failure"] }, confirmationStatus }] }), restore);
    replace(Connection.prototype, "getBlockHeight", async () => 100, restore);
    const service = new SolanaTokenService();
    try { await service.resumeLaunch(wallet); expect.fail("Processed result must remain pending"); }
    catch (error) { expect((error as Error).name).to.equal("SubmittedTransactionError"); }
    expect(loadPendingLaunch(pending.wallet)).to.deep.equal(pending);
    confirmationStatus = "finalized";
    try { await service.resumeLaunch(wallet); expect.fail("Final failure should explain safe retry"); }
    catch (error) { expect(String(error)).to.include("launch failed on Solana"); }
    expect(loadPendingLaunch(pending.wallet)).to.equal(null);
  });
});

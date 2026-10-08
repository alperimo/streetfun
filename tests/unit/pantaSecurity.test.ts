import { expect } from "chai";
import { createHash } from "node:crypto";
import { Keypair, ComputeBudgetProgram, PublicKey } from "@solana/web3.js";
import { NextRequest } from "next/server";
import bs58 from "bs58";
import { AccountLayout, MintLayout, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { address, parseMarket, usdcUnits, shareUnits } from "../../src/server/pantaValidation";
import { issuePantaSession, readPantaSession } from "../../src/server/pantaSession";
import { pantaCredentials, pantaRequest } from "../../src/server/pantaService";
import { validatePantaInstructions, compilePantaTransaction } from "../../src/lib/pantaTransaction";
import { buildCheckedTransaction } from "../../src/server/pantaBuild";
import { pantaBody } from "../../src/server/pantaHttp";
import { POST as buildOrder } from "../../src/app/api/panta/order/build/route";
import { POST as confirm } from "../../src/app/api/panta/order/confirm/route";
import { GET as positions } from "../../src/app/api/panta/positions/route";
import { POST as quote } from "../../src/app/api/panta/order/quote/route";
import * as supabase from "../../src/server/supabase";
import { memoryDatabase } from "../support/memoryDatabase";
import { rowBinding } from "../../src/server/pantaLifecycleStore";
import { ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { getServerConnection } from "../../src/server/rpc";
import { solanaTokenService } from "../../src/server/tokenData";

const keys = Array.from({ length: 5 }, () => Keypair.generate().publicKey.toBase58());
const [wallet, marketId, programId, mint, usdcMint] = keys;
const binding = { network: "devnet", mint, stage: "pre-graduation", marketId, programId, usdcMint, expectedTitle: "StreetFun graduation?" };
const pda = (seed: string, ...pubkeys: string[]) => PublicKey.findProgramAddressSync([Buffer.from(seed), ...pubkeys.map(k => new PublicKey(k).toBuffer())], new PublicKey(programId))[0].toBase58();
const tradeAccounts = [wallet, marketId, pda("market_config"), mint, mint, pda("position", marketId, wallet), usdcMint,
  getAssociatedTokenAddressSync(new PublicKey(usdcMint), new PublicKey(wallet)).toBase58(), mint, TOKEN_PROGRAM_ID.toBase58(), ASSOCIATED_TOKEN_PROGRAM_ID.toBase58(), "11111111111111111111111111111111"];
const buyData = Buffer.alloc(17); createHash("sha256").update("global:primary_order_usdc").digest().copy(buyData, 0, 0, 8); buyData[8] = 0; buyData.writeBigUInt64LE(20_000_000n, 9);
const instruction = { programId, data: buyData.toString("base64"), accounts: tradeAccounts.map((pubkey, index) => ({ pubkey, isSigner: index === 0, isWritable: [0, 1, 4, 5, 7, 8].includes(index) })) };
const storedRow = { network: "devnet", mint, stage: "pre-graduation", status: "registered", market_id: marketId, program_id: programId, usdc_mint: usdcMint, title: binding.expectedTitle };
const fakeDb = (quota: unknown = { data: true, error: null }) => ({ ...memoryDatabase({ panta_lifecycle_markets: [storedRow] }), rpc: async () => quota });
const intent = { wallet, marketId, programId, usdcMint, kind: "buy" as const };
const market = { marketId, title: binding.expectedTitle, description: "Resolves using the published rules.", phase: "primary", resolved: false, status: "open", startTime: 1, endTime: 1898765199, resolutionTime: 1798765199, yesPrice: "0.7", noPrice: "0.2", volumeUsdc: "0" };
const request = (path: string, body: unknown) => new NextRequest(`http://localhost${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
async function rejects(work: Promise<unknown>) { let caught; try { await work; } catch (error) { caught = error; } expect(caught).to.be.instanceOf(Error); }

describe("Panta financial and transaction security", () => {
  const envKeys = ["PANTA_API_KEY", "PANTA_API_URL", "PANTA_SESSION_SECRET", "PANTA_MARKET_BINDINGS_JSON", "NEXT_PUBLIC_SOLANA_NETWORK"];
  let savedEnv: Record<string, string | undefined>, savedFetch: typeof fetch, savedDb: typeof supabase.createServerSupabaseClient;
  beforeEach(() => {
    savedEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]])); savedFetch = global.fetch; savedDb = supabase.createServerSupabaseClient;
    process.env.PANTA_API_KEY = "pk_test_" + "a".repeat(32); delete process.env.PANTA_API_URL;
    process.env.PANTA_SESSION_SECRET = "a".repeat(64); process.env.NEXT_PUBLIC_SOLANA_NETWORK = "devnet";
  });
  afterEach(() => {
    for (const key of envKeys) { if (savedEnv[key] === undefined) delete process.env[key]; else process.env[key] = savedEnv[key]; }
    global.fetch = savedFetch; (supabase as any).createServerSupabaseClient = savedDb;
  });
  it("uses exact USDC units and rejects trailing junk, infinities, negatives, extra precision and oversized amounts", () => {
    expect(shareUnits("38.400000001")).to.equal(38_400_000_001n);
    expect(usdcUnits("0.000001")).to.equal(1n); expect(usdcUnits("20.01")).to.equal(20_010_000n);
    for (const value of ["Infinity", "NaN", "-1", "1e3", "10oops", "0.0000001", "1001", 20, "0"]) expect(() => usdcUnits(value)).to.throw();
  });
  it("rejects arbitrary wallet URL parameters and unconfirmed database bindings", () => {
    expect(() => address(`${wallet}&wallet=${mint}`)).to.throw();
    expect(rowBinding(storedRow as any).marketId).to.equal(marketId);
    expect(() => rowBinding({ ...storedRow, status: "signed" } as any)).to.throw();
    expect(() => rowBinding({ ...storedRow, market_id: "fake" } as any)).to.throw();
  });
  it("preserves independent real prices and missing quotes without inventing odds, dates or volume", () => {
    expect(parseMarket(market, marketId).noPrice).to.equal("0.2");
    const missing = parseMarket({ ...market, yesPrice: null, noPrice: null, volumeUsdc: null, startTime: null }, marketId);
    expect(missing.yesPrice).to.equal(null); expect(missing.volumeUsdc).to.equal(null);
    for (const price of ["NaN", "2", "-0.1"]) expect(() => parseMarket({ ...market, yesPrice: price }, marketId)).to.throw();
    expect(() => parseMarket({ ...market, marketId: mint }, marketId)).to.throw();
  });
  it("does not fall back to a credential and refuses key exfiltration to an alternate host", () => {
    delete process.env.PANTA_API_KEY; expect(() => pantaCredentials()).to.throw();
    process.env.PANTA_API_KEY = "pk_test_" + "a".repeat(32); process.env.PANTA_API_URL = "https://attacker.invalid/api/v1";
    expect(() => pantaCredentials()).to.throw();
  });
  it("binds sessions to their intent, rejects tampering, expiry and an alternate session type", () => {
    const token = issuePantaSession({ kind: "quote", wallet, amountUsdc: "20", expires: 2000 }, 1000);
    expect(readPantaSession(token, "quote", 1100).wallet).to.equal(wallet);
    expect(() => readPantaSession(token, "quote", 2000)).to.throw();
    expect(() => readPantaSession(token, "order", 1100)).to.throw();
    const changed = Buffer.from(JSON.stringify({ kind: "quote", wallet, amountUsdc: "1000", expires: 2000, issuedAt: 1000 })).toString("base64url");
    expect(() => readPantaSession(`${changed}.${token.split(".")[1]}`, "quote", 1100)).to.throw();
  });
  it("allows only the pinned primary order and rejects direct transfers, wrong discriminators, market swaps and other signers", () => {
    expect(validatePantaInstructions([instruction], intent)).to.have.length(1);
    expect(() => validatePantaInstructions([{ ...instruction, programId: TOKEN_PROGRAM_ID.toBase58() }], intent)).to.throw();
    expect(() => validatePantaInstructions([{ ...instruction, data: Buffer.alloc(32).toString("base64") }], intent)).to.throw();
    expect(() => validatePantaInstructions([instruction], { ...intent, marketId: mint })).to.throw();
    expect(() => validatePantaInstructions([{ ...instruction, accounts: [...instruction.accounts, { pubkey: mint, isSigner: true, isWritable: true }] }], intent)).to.throw();
    expect(() => validatePantaInstructions([instruction, instruction], intent)).to.throw();
  });
  it("rejects excessive priority fees and malformed token account creation", () => {
    const compute = ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 100_001 });
    const ix = { programId: compute.programId.toBase58(), accounts: [], data: compute.data.toString("base64") };
    expect(() => validatePantaInstructions([ix, instruction], intent)).to.throw();
  });
  it("rejects cross-origin, unexpected fields and oversized request bodies before any upstream call", async () => {
    await rejects(pantaBody(new NextRequest("http://localhost/api", { method: "POST", headers: { origin: "https://evil.invalid", "content-type": "application/json" }, body: "{}" }), []));
    await rejects(pantaBody(request("/api", { amountUsdc: "20", shares: "1000" }), ["amountUsdc"]));
    await rejects(pantaBody(request("/api", { x: "a".repeat(9000) }), ["x"]));
  });
  it("fails closed on HTTP errors, invalid JSON and an oversized provider response", async () => {
    for (const response of [new Response('{"message":"private provider details"}', { status: 500 }), new Response("invalid", { headers: { "content-type": "application/json" } }), new Response('"' + "x".repeat(256001) + '"', { headers: { "content-type": "application/json" } })]) {
      global.fetch = async () => response; await rejects(pantaRequest(`/markets/${marketId}/`));
    }
  });
  it("rejects forged client totals or a tampered confirmation token before touching Panta or RPC", async () => {
    global.fetch = async () => { throw new Error("Unexpected upstream call"); };
    expect((await confirm(request("/api/panta/order/confirm", { signature: "fake", wallet, shares: "999" }))).status).to.equal(400);
    expect((await confirm(request("/api/panta/order/confirm", { signature: bs58.encode(new Uint8Array(64)), orderToken: "tampered" }))).status).to.equal(400);
  });
  it("never creates a synthetic quote when a configured market provider is unavailable", async () => {
    const rpc = getServerConnection(); const oldGenesis = rpc.getGenesisHash, oldAccount = rpc.getAccountInfo, oldToken = solanaTokenService.getToken;
    try {
      (supabase as any).createServerSupabaseClient = () => fakeDb();
      rpc.getGenesisHash = async () => "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
      rpc.getAccountInfo = async () => ({ owner: new PublicKey(programId) } as any);
      solanaTokenService.getToken = async () => ({ bondingCurve: { isGraduated: false } } as any);
      global.fetch = async () => new Response("unavailable", { status: 503 });
      const response = await quote(request("/api/panta/order/quote", { mint, wallet, side: "yes", amountUsdc: "20" }));
      expect(response.status).to.equal(503); expect(await response.json()).not.to.have.property("quoteId");
    } finally { rpc.getGenesisHash = oldGenesis; rpc.getAccountInfo = oldAccount; solanaTokenService.getToken = oldToken; }
  });
  it("rejects a build that increases quoted fees or drops the quoted shares beyond 1%", async () => {
    const rpc = getServerConnection(); const oldGenesis = rpc.getGenesisHash, oldAccount = rpc.getAccountInfo, oldToken = solanaTokenService.getToken;
    const quoteToken = issuePantaSession({ kind: "quote", ...binding, wallet, side: "yes", quoteId: "qt_test", amountUsdc: "20", feeUsdc: "0.40", shares: "38.42", expires: Date.now() + 90000 });
    try {
      (supabase as any).createServerSupabaseClient = () => fakeDb();
      rpc.getGenesisHash = async () => "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
      rpc.getAccountInfo = async () => ({ owner: new PublicKey(programId) } as any);
      solanaTokenService.getToken = async () => ({ bondingCurve: { isGraduated: false } } as any);
      for (const change of [{ feeUsdc: "0.50", expectedShares: "38.42" }, { feeUsdc: "0.40", expectedShares: "10" }]) {
        global.fetch = async url => new Response(JSON.stringify(String(url).includes("/markets/") ? market : { wallet, marketId, quoteId: "qt_test", side: "yes", amountUsdc: "20", status: "built", orderId: "ord_test", ...change }), { headers: { "content-type": "application/json" } });
        expect((await buildOrder(request("/api/panta/order/build", { quoteToken }))).status).to.equal(503);
      }
    } finally { rpc.getGenesisHash = oldGenesis; rpc.getAccountInfo = oldAccount; solanaTokenService.getToken = oldToken; }
  });
  it("keeps pre-graduation winnings visible after the StreetFun token graduates", async () => {
    const oldToken = solanaTokenService.getToken;
    try {
      (supabase as any).createServerSupabaseClient = () => fakeDb();
      solanaTokenService.getToken = async () => ({ bondingCurve: { isGraduated: true } } as any);
      global.fetch = async () => new Response(JSON.stringify({ wallet, positions: [{ marketId, side: "yes", shares: "38", phase: "resolved", claimable: true, claimed: false, outcome: "yes" }] }), { headers: { "content-type": "application/json" } });
      const response = await positions(new NextRequest(`http://localhost/api/panta/positions?${new URLSearchParams({ mint, wallet })}`));
      expect(response.status).to.equal(200);
      expect((await response.json()).positions[0]).to.include({ marketId, claimable: true, programId });
    } finally { solanaTokenService.getToken = oldToken; }
  });
  it("rejects simulated overspending and no-payout claims before returning anything to sign", async () => {
    const rpc = getServerConnection();
    const methods = ["getGenesisHash", "getAccountInfo", "getLatestBlockhash", "simulateTransaction", "getBalance"] as const;
    const old = Object.fromEntries(methods.map(method => [method, rpc[method]]));
    const mintData = Buffer.alloc(MintLayout.span);
    MintLayout.encode({ mintAuthorityOption: 0, mintAuthority: new PublicKey(wallet), supply: 100_000_000n, decimals: 6, isInitialized: true, freezeAuthorityOption: 0, freezeAuthority: new PublicKey(wallet) }, mintData);
    const tokenData = (amount: bigint) => {
      const data = Buffer.alloc(AccountLayout.span);
      AccountLayout.encode({ mint: new PublicKey(usdcMint), owner: new PublicKey(wallet), amount, delegateOption: 0, delegate: new PublicKey(wallet), state: 1,
        isNativeOption: 0, isNative: 0n, delegatedAmount: 0n, closeAuthorityOption: 0, closeAuthority: new PublicKey(wallet) }, data);
      return data;
    };
    const info = (data: Buffer) => ({ data, owner: TOKEN_PROGRAM_ID, lamports: 2039280, executable: false, rentEpoch: 0 });
    let afterAmount = 29_000_000n;
    try {
      rpc.getGenesisHash = async () => "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
      rpc.getAccountInfo = async key => key.toBase58() === usdcMint ? info(mintData) : info(tokenData(50_000_000n));
      rpc.getLatestBlockhash = async () => ({ blockhash: mint, lastValidBlockHeight: 100 });
      rpc.getBalance = async () => 1_000_000_000;
      rpc.simulateTransaction = (async () => ({ value: { err: null, accounts: [{ ...info(tokenData(afterAmount)), owner: TOKEN_PROGRAM_ID.toBase58(), data: [tokenData(afterAmount).toString("base64"), "base64"] }, { lamports: 999_990_000 }] } })) as any;
      const bound = { ...binding, network: "devnet" as const, stage: "pre-graduation" as const };
      const session = { wallet, amountUsdc: "20", side: "yes", expires: Date.now() + 10000 };
      await rejects(buildCheckedTransaction({ instructions: [instruction], orderId: "ord_test", expectedShares: "38" }, bound, session, "buy"));
      afterAmount = 30_000_000n;
      expect(await buildCheckedTransaction({ instructions: [instruction], orderId: "ord_test", expectedShares: "38" }, bound, session, "buy")).to.have.property("orderToken");
      const claimKeys = [wallet, pda("market_config"), marketId, mint, mint, pda("position", marketId, wallet), pda("win_claim", marketId, wallet), tradeAccounts[7], usdcMint, ...tradeAccounts.slice(9)];
      const claimIx = { ...instruction, data: Buffer.concat([createHash("sha256").update("global:claim_win_usdc").digest().subarray(0, 8), new PublicKey(wallet).toBuffer()]).toString("base64"),
        accounts: claimKeys.map((pubkey, i) => ({ pubkey, isSigner: i === 0, isWritable: [0, 4, 6, 7].includes(i) })) };
      afterAmount = 50_000_000n;
      await rejects(buildCheckedTransaction({ instructions: [claimIx], winningShares: "38" }, bound, { wallet }, "claim"));
    } finally { Object.assign(rpc, old); }
  });
  it("fails closed when the shared quota function is missing or denied", async () => {
    const token = issuePantaSession({ kind: "order", ...binding, wallet, expires: Date.now() + 10000 });
    for (const quota of [{ data: null, error: { message: "missing migration" } }, { data: false, error: null }]) {
      (supabase as any).createServerSupabaseClient = () => fakeDb(quota);
      const response = await confirm(request("/api/panta/order/confirm", { signature: bs58.encode(new Uint8Array(64)), orderToken: token }));
      expect(response.status).to.equal(quota.data === false ? 429 : 503);
    }
  });
  it("returns pending for an unseen transaction, rejects failed and mismatched messages, and accepts only independently processed attribution", async () => {
    const rpc = getServerConnection();
    const old = { getGenesisHash: rpc.getGenesisHash, getTransaction: rpc.getTransaction, getSignatureStatuses: rpc.getSignatureStatuses, getBlockHeight: rpc.getBlockHeight };
    const signature = bs58.encode(new Uint8Array(64));
    const message = compilePantaTransaction([instruction], wallet, mint).message;
    const orderToken = issuePantaSession({ kind: "order", action: "buy", ...binding, wallet, side: "yes", quoteId: "qt_test", orderId: "ord_test", lastValidBlockHeight: 100,
      messageHash: createHash("sha256").update(message.serialize()).digest("hex"), expires: Date.now() + 10000 });
    const call = () => confirm(request("/api/panta/order/confirm", { signature, orderToken }));
    try {
      (supabase as any).createServerSupabaseClient = () => fakeDb();
      rpc.getGenesisHash = async () => "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
      rpc.getTransaction = async () => null; rpc.getSignatureStatuses = async () => ({ value: [null] } as any); rpc.getBlockHeight = async () => 99;
      expect((await call()).status).to.equal(202);
      rpc.getBlockHeight = async () => 101; expect((await call()).status).to.equal(409);
      rpc.getTransaction = async () => ({ meta: { err: { InstructionError: [0, "failure"] } }, transaction: { message } } as any);
      expect((await call()).status).to.equal(409);
      rpc.getTransaction = async () => ({ meta: { err: null }, transaction: { message: compilePantaTransaction([instruction], wallet, usdcMint).message } } as any);
      expect((await call()).status).to.equal(409);
      rpc.getTransaction = async () => ({ meta: { err: null }, transaction: { message } } as any);
      global.fetch = async (url) => new Response(JSON.stringify(String(url).includes("primaryordersubmit") ? { orderId: "ord_test", signature, status: "submitted" } : { signature, wallet, marketId, side: "yes", status: "processed", kind: "buy" }), { headers: { "content-type": "application/json" } });
      expect((await call()).status).to.equal(200);
      global.fetch = async () => new Response("{}", { headers: { "content-type": "application/json" } });
      expect((await call()).status).to.equal(503);
    } finally { Object.assign(rpc, old); }
  });
});

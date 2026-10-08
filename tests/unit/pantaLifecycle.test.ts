import { expect } from "chai";
import { Keypair, PublicKey, TransactionMessage, TransactionInstruction, VersionedTransaction, SystemProgram } from "@solana/web3.js";
import { BN } from "@coral-xyz/anchor";
import { evidenceOutcome, meetsExcessReturnThreshold } from "../../src/server/pantaResolution";
import { lifecycleTerms } from "../../src/server/pantaLifecycleTerms";
import { createAccounts, pantaCoder, PANTA_PROGRAM, validateCreateTransaction } from "../../src/server/pantaProtocol";
import type { LifecycleRow } from "../../src/server/pantaLifecycleStore";
import { memoryDatabase } from "../support/memoryDatabase";

const wallet = Keypair.generate().publicKey, mint = Keypair.generate().publicKey, treasury = Keypair.generate().publicKey;
const now = Math.floor(Date.now() / 1000);
function row(stage: LifecycleRow["stage"] = "post-graduation"): LifecycleRow {
  return { network: "devnet", mint: mint.toBase58(), stage, source_signature: "1".repeat(64), source_slot: 100,
    anchor_time: now - 100, deadline: now - 1, status: "queued", question: "Unique token lifecycle question", title: "System market",
    resolution_rule: "Verified graduation", description: "System market", sources: ["https://explorer.solana.com"], target_mint: mint.toBase58(),
    create_id: null, market_id: null, program_id: null, usdc_mint: null, quote: null, payment_units: null, quote_expires_at: null,
    signed_transaction: null, create_signature: null, last_valid_block_height: null, baseline: null, final_snapshot: null,
    graduated_signature: null, graduated_slot: null, graduated_time: null, failure_code: null, attempts: 0, lease_id: null };
}
function paired(r: LifecycleRow, tokenEnd = 120, targetEnd = 100) {
  const common = { slot: 101, targetMint: r.target_mint, targetSource: "Verified collateral market", tokenPool: wallet.toBase58(), testCollateral: true };
  r.baseline = { ...common, observedAt: new Date(r.anchor_time * 1000).toISOString(), tokenPriceUsd: 100, targetPriceUsd: 100 };
  r.final_snapshot = { ...common, observedAt: new Date(r.deadline * 1000).toISOString(), tokenPriceUsd: tokenEnd, targetPriceUsd: targetEnd };
  return r;
}

describe("Panta lifecycle evidence and issuer safety", () => {
  it("includes the exact 20 percentage point boundary and handles small decimal prices", () => {
    expect(meetsExcessReturnThreshold(100, 120, 100, 100)).to.equal(true);
    expect(meetsExcessReturnThreshold(100, 119.999999, 100, 100)).to.equal(false);
    expect(meetsExcessReturnThreshold(1e-8, 1.2e-8, 1e-6, 1e-6)).to.equal(true);
    expect(meetsExcessReturnThreshold(100, 130, 100, 110)).to.equal(true);
    expect(meetsExcessReturnThreshold(0, 120, 100, 100)).to.equal(false);
    expect(evidenceOutcome(paired(row()), now).outcome).to.equal("yes");
  });
  it("uses excess return rather than relative outperformance", () => {
    expect(evidenceOutcome(paired(row(), 140, 125), now).outcome).to.equal("no");
  });
  it("requires paired observations from matching pools, sources and time windows", () => {
    for (const change of [
      { targetSource: "Different source" }, { tokenPool: mint.toBase58() }, { testCollateral: false },
      { observedAt: new Date((now + 400) * 1000).toISOString() }, { slot: 99 }, { tokenPriceUsd: NaN },
    ]) {
      const r = paired(row()); Object.assign(r.final_snapshot!, change);
      expect(evidenceOutcome(r, now + 400).outcome).to.equal(null);
    }
    const future = paired(row()); future.deadline = now + 10;
    future.final_snapshot!.observedAt = new Date(future.deadline * 1000).toISOString();
    expect(evidenceOutcome(future, now).status).to.equal("pending");
  });
  it("does not manufacture a NO outcome from missing indexed graduation", () => {
    const r = row("pre-graduation");
    expect(evidenceOutcome(r, now).status).to.equal("oracle_review_required");
    r.graduated_signature = "2".repeat(64); r.graduated_slot = 102; r.graduated_time = r.deadline - 1;
    expect(evidenceOutcome(r, now).outcome).to.equal("yes");
    r.graduated_time = r.deadline;
    expect(evidenceOutcome(r, now).outcome).to.equal(null);
  });
  it("makes questions unique per token even when tickers match, with fixed event deadlines", () => {
    const input = { network: "devnet" as const, mint: mint.toBase58(), symbol: "TEST", targetSymbol: "T-OpenAI",
      targetMint: mint.toBase58(), stage: "pre-graduation" as const, anchor: now, sourceSignature: "1".repeat(64), protocol: "meteora-dbc" as const };
    const a = lifecycleTerms(input), b = lifecycleTerms({ ...input, mint: wallet.toBase58() });
    expect(a.question).not.to.equal(b.question); expect(a.deadline).to.equal(now + 30 * 86400);
  });
  it("validates the system create payment, exact terms, accounts and only its issuer signer", () => {
    const r = row("pre-graduation"), accounts = createAccounts(wallet, r.question, mint, treasury), payment = 20_000_000n;
    const config = { treasury };
    const build = (overrides: Record<string, unknown> = {}, keys = accounts, extra: TransactionInstruction[] = []) => {
      const data = pantaCoder.instruction.encode("create_breaking_event_usdc", {
        question: r.question, resolution_rule: r.resolution_rule, source_of_truth: r.sources,
        event_in_progress: true, event_start_time: new BN(r.anchor_time), end_time: new BN(r.deadline),
        resolution_time: new BN(r.deadline), payment_usdc: new BN(payment.toString()), ...overrides,
      });
      const instruction = new TransactionInstruction({ programId: PANTA_PROGRAM, data, keys: keys.map((pubkey, index) => ({ pubkey, isSigner: index === 0, isWritable: index < 12 })) });
      return new VersionedTransaction(new TransactionMessage({ payerKey: wallet, recentBlockhash: PublicKey.default.toBase58(), instructions: [instruction, ...extra] }).compileToV0Message());
    };
    const check = (tx: VersionedTransaction) => validateCreateTransaction(tx, r, wallet, config, mint, accounts[3].toBase58(), payment);
    expect(() => check(build())).not.to.throw();
    for (const overrides of [{ payment_usdc: new BN("20000001") }, { question: "Changed question" }, { end_time: new BN(r.deadline + 1) }, { event_in_progress: false }]) {
      expect(() => check(build(overrides))).to.throw();
    }
    const changed = [...accounts]; changed[11] = wallet;
    expect(() => check(build({}, changed))).to.throw();
    expect(() => check(build({}, accounts, [SystemProgram.transfer({ fromPubkey: wallet, toPubkey: treasury, lamports: 1 })]))).to.throw();
  });
  it("captures the graduation baseline while creation is deferred by a provider outage", async () => {
    const lifecycle = require("../../src/server/pantaLifecycle");
    const tokenData = require("../../src/server/tokenData");
    const supabase = require("../../src/server/supabase");
    const originalDb = supabase.createServerSupabaseClient, originalToken = tokenData.solanaTokenService.getToken;
    const originalNetwork = process.env.NEXT_PUBLIC_SOLANA_NETWORK;
    const r: any = row(); r.anchor_time = now - 5; r.deadline = now + 30 * 86400;
    r.next_attempt_at = new Date(Date.now() + 3600_000).toISOString(); r.failure_code = "PANTA_CONFIGURATION_INCOMPLETE";
    const db = memoryDatabase({ panta_lifecycle_markets: [r] });
    supabase.createServerSupabaseClient = () => db; process.env.NEXT_PUBLIC_SOLANA_NETWORK = "devnet";
    tokenData.solanaTokenService.getToken = async () => ({ dataSource: "onchain", lastUpdatedAt: new Date().toISOString(), observedSlot: 101,
      priceUsd: 0.001, targetEquity: { mintAddress: r.target_mint, stockPriceUsd: 1, isTestCollateral: true },
      treasury: { valuationAvailable: true, valuationSource: "Live collateral market" },
      bondingCurve: { isGraduated: true, meteoraPoolAddress: wallet.toBase58() } });
    try { const result = await lifecycle.runLifecycleWorker(); expect(result.examined).to.equal(0); expect(r.baseline?.tokenPriceUsd).to.equal(0.001); }
    finally { supabase.createServerSupabaseClient = originalDb; tokenData.solanaTokenService.getToken = originalToken;
      if (originalNetwork === undefined) delete process.env.NEXT_PUBLIC_SOLANA_NETWORK; else process.env.NEXT_PUBLIC_SOLANA_NETWORK = originalNetwork; }
  });
  it("links graduation evidence when a launch webhook arrives after settlement", async () => {
    const lifecycle = require("../../src/server/pantaLifecycle"), supabase = require("../../src/server/supabase");
    const original = supabase.createServerSupabaseClient, network = process.env.NEXT_PUBLIC_SOLANA_NETWORK;
    const graduated = row();
    const db = memoryDatabase({ panta_lifecycle_markets: [graduated] });
    supabase.createServerSupabaseClient = () => db; process.env.NEXT_PUBLIC_SOLANA_NETWORK = "devnet";
    try {
      await lifecycle.enqueueLifecycle({ mint: graduated.mint, symbol: "TEST", targetSymbol: "T-OpenAI", targetMint: graduated.target_mint,
        signature: "2".repeat(64), slot: 90, time: now - 200, stage: "pre-graduation", protocol: "meteora-dbc" });
      const result = await db.from("panta_lifecycle_markets").select().eq("stage", "pre-graduation").maybeSingle();
      expect(result.data?.graduated_signature).to.equal(graduated.source_signature);
      expect(result.data?.graduated_time).to.equal(graduated.anchor_time);
    } finally { supabase.createServerSupabaseClient = original;
      if (network === undefined) delete process.env.NEXT_PUBLIC_SOLANA_NETWORK; else process.env.NEXT_PUBLIC_SOLANA_NETWORK = network; }
  });
  it("refreshes an expired unsigned quote and preserves blocked terminal jobs", async () => {
    const lifecycle = require("../../src/server/pantaLifecycle"), supabase = require("../../src/server/supabase");
    const protocol = require("../../src/server/pantaProtocol"), service = require("../../src/server/pantaService");
    const { PantaError } = require("../../src/server/pantaValidation");
    const original = { db: supabase.createServerSupabaseClient, config: protocol.pantaChainConfig, request: service.pantaRequest };
    const environment = Object.fromEntries(["NEXT_PUBLIC_SOLANA_NETWORK", "PANTA_SYSTEM_KEYPAIR_JSON", "PANTA_SYSTEM_KEYPAIR_PATH", "PANTA_MARKET_IMAGE_URL"].map(key => [key, process.env[key]]));
    const r: any = row("pre-graduation"); r.deadline = now + 3600; r.create_id = "cr_expired"; r.market_id = mint.toBase58();
    r.status = "quoted"; r.quote_expires_at = new Date(Date.now() - 1000).toISOString(); r.lease_id = "test-lease";
    const db = memoryDatabase({ panta_lifecycle_markets: [r] });
    supabase.createServerSupabaseClient = () => ({ ...db, rpc: async (name: string) => name === "lease_panta_lifecycle" ? { data: [r], error: null } : { data: true, error: null } });
    protocol.pantaChainConfig = async () => ({ config: {}, mint, rpc: {} });
    const calls: string[] = []; service.pantaRequest = async (url: string) => { calls.push(url); throw new PantaError("PANTA_UNAVAILABLE", 503, "Unavailable"); };
    process.env.NEXT_PUBLIC_SOLANA_NETWORK = "devnet"; delete process.env.PANTA_SYSTEM_KEYPAIR_PATH;
    process.env.PANTA_SYSTEM_KEYPAIR_JSON = JSON.stringify(Array.from(Keypair.generate().secretKey));
    process.env.PANTA_MARKET_IMAGE_URL = "https://streetfun.xyz/logos/openai.png";
    try {
      await lifecycle.processLifecycleMarket(r.mint, r.stage);
      expect(calls).to.deep.equal(["/markets/create/quote/"]); expect(r.create_id).to.equal(null); expect(r.status).to.equal("queued");
      r.deadline = now - 1; r.lease_id = "test-lease";
      await lifecycle.processLifecycleMarket(r.mint, r.stage);
      expect(r.status).to.equal("blocked"); expect(r.failure_code).to.equal("LIFECYCLE_WINDOW_EXPIRED");
      r.stage = "post-graduation"; r.status = "queued"; r.anchor_time = now; r.deadline = now + 3600; r.lease_id = "test-lease";
      await lifecycle.processLifecycleMarket(r.mint, r.stage);
      expect(r.status).to.equal("queued"); expect(r.failure_code).to.equal("PRICE_BASELINE_PENDING");
      r.anchor_time = now - 61; r.lease_id = "test-lease";
      await lifecycle.processLifecycleMarket(r.mint, r.stage);
      expect(r.status).to.equal("blocked"); expect(r.failure_code).to.equal("PRICE_BASELINE_MISSING");
    } finally {
      supabase.createServerSupabaseClient = original.db; protocol.pantaChainConfig = original.config; service.pantaRequest = original.request;
      for (const [key, value] of Object.entries(environment)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    }
  });
  it("does not let a leased first job starve another token's queued market", async () => {
    const lifecycle = require("../../src/server/pantaLifecycle"), supabase = require("../../src/server/supabase");
    const protocol = require("../../src/server/pantaProtocol"), { PantaError } = require("../../src/server/pantaValidation");
    const original = { db: supabase.createServerSupabaseClient, config: protocol.pantaChainConfig, network: process.env.NEXT_PUBLIC_SOLANA_NETWORK };
    const first: any = row("pre-graduation"), second: any = { ...row("pre-graduation"), mint: wallet.toBase58() };
    for (const r of [first, second]) { r.deadline = now + 3600; r.next_attempt_at = new Date(Date.now() - 1000).toISOString(); r.lease_id = "other-lease"; }
    const db = memoryDatabase({ panta_lifecycle_markets: [first, second] });
    const leased: string[] = [];
    supabase.createServerSupabaseClient = () => ({ ...db, rpc: async (_name: string, args: { p_mint: string }) => {
      leased.push(args.p_mint); return { data: args.p_mint === first.mint ? [] : [second], error: null };
    } });
    protocol.pantaChainConfig = async () => { throw new PantaError("PANTA_CONFIGURATION_INCOMPLETE", 503, "Awaiting provider setup"); };
    process.env.NEXT_PUBLIC_SOLANA_NETWORK = "devnet";
    try { expect((await lifecycle.runLifecycleWorker()).examined).to.equal(1); expect(leased).to.deep.equal([first.mint, second.mint]);
      expect(second.failure_code).to.equal("PANTA_CONFIGURATION_INCOMPLETE"); }
    finally { supabase.createServerSupabaseClient = original.db; protocol.pantaChainConfig = original.config;
      if (original.network === undefined) delete process.env.NEXT_PUBLIC_SOLANA_NETWORK; else process.env.NEXT_PUBLIC_SOLANA_NETWORK = original.network; }
  });
});

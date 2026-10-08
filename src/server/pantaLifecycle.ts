import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Keypair, VersionedTransaction, PublicKey } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, unpackAccount } from "@solana/spl-token";
import bs58 from "bs58";
import type { LifecycleStage } from "@/lib/pantaTypes";
import { solanaTokenService } from "./tokenData";
import { lifecycleDb, lifecycleNetwork, lifecycleRows, type LifecycleRow, type PriceEvidence } from "./pantaLifecycleStore";
import { lifecycleTerms } from "./pantaLifecycleTerms";
import { pantaChainConfig, PANTA_PROGRAM, validateCreateTransaction } from "./pantaProtocol";
import { pantaRequest } from "./pantaService";
import { object, address, text, PantaError, unavailable, usdcUnits } from "./pantaValidation";
import { pantaLimit } from "./pantaHttp";

/** Called only after the central indexer verifies a successful StreetFun instruction. */
export async function enqueueLifecycle(input: {
  mint: string; symbol: string; targetSymbol: string; targetMint: string; signature: string; slot: number; time: number;
  stage: LifecycleStage; protocol: "meteora-dbc" | "streetfun-legacy";
}) {
  const network = lifecycleNetwork();
  const terms = lifecycleTerms({ ...input, network, sourceSignature: input.signature, anchor: input.time });
  const { error } = await lifecycleDb().from("panta_lifecycle_markets").upsert({
    network, mint: input.mint, stage: input.stage, source_signature: input.signature, source_slot: input.slot,
    anchor_time: input.time, target_mint: input.targetMint, ...terms,
  }, { onConflict: "network,mint,stage", ignoreDuplicates: true });
  if (error) throw unavailable();
  if (input.stage === "post-graduation") {
    const result = await lifecycleDb().from("panta_lifecycle_markets").update({
      graduated_signature: input.signature, graduated_slot: input.slot, graduated_time: input.time,
    }).eq("network", network).eq("mint", input.mint).eq("stage", "pre-graduation").is("graduated_signature", null);
    if (result.error) throw unavailable();
  }
}

export async function capturePriceEvidence(row: LifecycleRow): Promise<PriceEvidence> {
  solanaTokenService.invalidate();
  const token = await solanaTokenService.getToken(row.mint);
  const observedAt = new Date().toISOString();
  const age = token?.lastUpdatedAt ? Date.now() - Date.parse(token.lastUpdatedAt) : Infinity;
  if (!token || token.dataSource !== "onchain" || !token.bondingCurve.isGraduated || !token.observedSlot ||
      token.observedSlot < row.source_slot || age < 0 || age > 30_000 || token.targetEquity.mintAddress !== row.target_mint ||
      !token.treasury.valuationAvailable || !token.treasury.valuationSource || !token.bondingCurve.meteoraPoolAddress ||
      ![token.priceUsd, token.targetEquity.stockPriceUsd].every(v => Number.isFinite(v) && v > 0))
    throw new PantaError("PRICE_EVIDENCE_UNAVAILABLE", 503, "Verified collateral price observations are unavailable.");
  return { observedAt, slot: token.observedSlot, tokenPriceUsd: token.priceUsd,
    targetPriceUsd: token.targetEquity.stockPriceUsd, targetMint: row.target_mint,
    targetSource: token.treasury.valuationSource, tokenPool: token.bondingCurve.meteoraPoolAddress,
    testCollateral: token.targetEquity.isTestCollateral === true };
}
export async function captureLifecyclePrices(mint: string) {
  const row = (await lifecycleRows(mint)).find(row => row.stage === "post-graduation");
  if (!row) return;
  const now = Math.floor(Date.now() / 1000);
  const field = !row.baseline && now >= row.anchor_time && now <= row.anchor_time + 60 ? "baseline"
    : !row.final_snapshot && now >= row.deadline && now <= row.deadline + 300 ? "final_snapshot" : null;
  if (!field) return;
  const snapshot = await capturePriceEvidence(row);
  if (field === "final_snapshot" && (!row.baseline || row.baseline.targetSource !== snapshot.targetSource ||
      row.baseline.targetMint !== snapshot.targetMint || row.baseline.testCollateral !== snapshot.testCollateral)) throw unavailable();
  const result = await lifecycleDb().from("panta_lifecycle_markets").update({ [field]: snapshot })
    .eq("network", row.network).eq("mint", row.mint).eq("stage", row.stage).is(field, null);
  if (result.error) throw unavailable();
}

async function systemSigner() {
  // A dedicated market-creation key. Never use a user's wallet or StreetFun admin key.
  const path = process.env.PANTA_SYSTEM_KEYPAIR_PATH;
  const encoded = process.env.PANTA_SYSTEM_KEYPAIR_JSON;
  if ((!path && !encoded) || (path && encoded)) throw new PantaError("SYSTEM_SIGNER_UNAVAILABLE", 503, "The system market issuer is awaiting setup.");
  try {
    const value: unknown = JSON.parse(encoded || await readFile(path!, "utf8"));
    if (!Array.isArray(value) || value.length !== 64 || value.some(b => !Number.isInteger(b) || b < 0 || b > 255)) throw unavailable();
    return Keypair.fromSecretKey(Uint8Array.from(value));
  } catch { throw unavailable(); }
}
function units(value: unknown) {
  if (typeof value !== "string" || !/^[0-9]{1,20}$/.test(value)) throw unavailable();
  return BigInt(value);
}
async function persist(row: LifecycleRow, patch: Record<string, unknown>) {
  const { data, error } = await lifecycleDb().from("panta_lifecycle_markets")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("network", row.network).eq("mint", row.mint).eq("stage", row.stage).eq("lease_id", row.lease_id).select("mint").maybeSingle();
  if (error || !data) throw unavailable();
  Object.assign(row, patch);
}
async function createMarket(row: LifecycleRow) {
  const { config, mint, rpc } = await pantaChainConfig();
  const signer = await systemSigner();
  if (row.deadline <= Date.now() / 1000 && !row.create_signature) throw new PantaError("LIFECYCLE_WINDOW_EXPIRED", 409, "The prediction window expired before its market could be opened.");
  // Recover the exact signed transaction before obtaining any new quote/build.
  if (row.signed_transaction && row.create_signature) {
    const status = (await rpc.getSignatureStatuses([row.create_signature], { searchTransactionHistory: true })).value[0];
    if (status?.err) throw new PantaError("CREATE_TRANSACTION_FAILED", 409, "The system market transaction failed.");
    if (!status || !["confirmed", "finalized"].includes(status.confirmationStatus || "")) {
      const height = await rpc.getBlockHeight("confirmed");
      if (!status && height > Number(row.last_valid_block_height)) {
        // Expiry plus absent historical signature permits a fresh build of the same create.
        await persist(row, { signed_transaction: null, create_signature: null, last_valid_block_height: null, status: "quoted" });
      } else {
        if (!status) await rpc.sendRawTransaction(Buffer.from(row.signed_transaction, "base64"), { skipPreflight: false, maxRetries: 2 });
        throw new PantaError("CREATE_CONFIRMATION_PENDING", 409, "System market confirmation is pending.");
      }
    } else {
      const tx = await rpc.getTransaction(row.create_signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
      const expected = VersionedTransaction.deserialize(Buffer.from(row.signed_transaction, "base64"));
      if (!tx?.meta || tx.meta.err || !Buffer.from(tx.transaction.message.serialize()).equals(Buffer.from(expected.message.serialize()))) throw unavailable();
      await pantaLimit();
      const registered = object(await pantaRequest("/markets/register/", { createId: row.create_id, signature: row.create_signature }));
      if (registered.status !== "registered" || registered.marketId !== row.market_id || registered.signature !== row.create_signature) throw unavailable();
      const account = await rpc.getAccountInfo(new PublicKey(address(registered.marketId)), "confirmed");
      if (!account?.owner.equals(PANTA_PROGRAM)) throw unavailable();
      await persist(row, { status: "registered", failure_code: null, signed_transaction: null });
      return;
    }
  }
  if (!row.create_id) {
    if (row.stage === "post-graduation") {
      if (!row.baseline) throw new PantaError("PRICE_BASELINE_MISSING", 409, "The graduation price observations could not be recorded in time.");
      const evidenceSource = row.sources.find(source => new URL(source).pathname === `/api/panta/evidence/${row.mint}`);
      if (!evidenceSource) throw new PantaError("PUBLIC_EVIDENCE_UNAVAILABLE", 503, "The public price observation feed is awaiting setup.");
      const response = await fetch(evidenceSource, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new PantaError("PUBLIC_EVIDENCE_UNAVAILABLE", 503, "The public price observation feed is unavailable.");
      const evidence = object(await response.json());
      if (evidence.network !== row.network || evidence.mint !== row.mint || evidence.stage !== row.stage ||
          JSON.stringify(evidence.baseline) !== JSON.stringify(row.baseline)) throw unavailable();
    }
    const imageUrl = process.env.PANTA_MARKET_IMAGE_URL;
    if (!imageUrl || new URL(imageUrl).protocol !== "https:") throw new PantaError("MARKET_IMAGE_UNAVAILABLE", 503, "The system market image is awaiting setup.");
    await pantaLimit();
    const raw = object(await pantaRequest("/markets/create/quote/", {
      wallet: signer.publicKey.toBase58(), question: row.question, title: row.title, description: row.description,
      resolutionRule: row.resolution_rule, sourcesOfTruth: row.sources, category: "crypto",
      startTime: row.anchor_time, endTime: row.deadline, resolutionTime: row.deadline,
      imageUrl, marketType: "breaking", eventInProgress: true,
    }));
    const payment = units(raw.paymentUsdc);
    if (payment !== BigInt(config.breaking_creator_payment_usdc.toString()) || payment > 20_000_000n ||
        payment !== units(raw.liquidityInjectionUsdc) + units(raw.platformRevenueUsdc) ||
        units(raw.liquidityInjectionUsdc) !== BigInt(config.breaking_liquidity_injection_usdc.toString()) ||
        !/^cr_[A-Za-z0-9_-]+$/.test(text(raw.createId, 128)) || Date.parse(String(raw.expiresAt)) <= Date.now()) throw unavailable();
    await persist(row, { status: "quoted", create_id: raw.createId, market_id: address(raw.expectedEventPda),
      program_id: PANTA_PROGRAM.toBase58(), usdc_mint: mint.toBase58(), payment_units: String(payment), quote: raw, quote_expires_at: raw.expiresAt });
  }
  const before = await rpc.getAccountInfo(getAssociatedTokenAddressSync(mint, signer.publicKey), "confirmed");
  const payment = units(row.payment_units);
  if (!before || unpackAccount(getAssociatedTokenAddressSync(mint, signer.publicKey), before).amount < payment)
    throw new PantaError("SYSTEM_ISSUER_BALANCE_LOW", 503, "The system market issuer is awaiting funding.");
  await pantaLimit();
  const build = object(await pantaRequest("/markets/create/build/", { createId: row.create_id, wallet: signer.publicKey.toBase58() }));
  if (build.createId !== row.create_id || build.expectedEventPda !== row.market_id || units(build.paymentUsdc) !== payment ||
      !Number.isSafeInteger(build.lastValidBlockHeight) || Date.parse(String(build.expiresAt)) <= Date.now()) throw unavailable();
  const tx = VersionedTransaction.deserialize(Buffer.from(text(build.transaction, 3000), "base64"));
  validateCreateTransaction(tx, row, signer.publicKey, config, mint, address(row.market_id), payment);
  if (tx.message.recentBlockhash !== build.recentBlockhash || !(await rpc.isBlockhashValid(tx.message.recentBlockhash, { commitment: "confirmed" })).value)
    throw new PantaError("PANTA_CLUSTER_MISMATCH", 503, "The provider transaction does not match this network.");
  const ata = getAssociatedTokenAddressSync(mint, signer.publicKey);
  const beforeAmount = unpackAccount(ata, before).amount;
  const simulation = await rpc.simulateTransaction(tx, { sigVerify: false, commitment: "confirmed", accounts: { encoding: "base64", addresses: [ata.toBase58(), signer.publicKey.toBase58()] } });
  const after = simulation.value.accounts?.[0], walletAfter = simulation.value.accounts?.[1];
  if (simulation.value.err || !after || !walletAfter) throw unavailable();
  const accountAfter = unpackAccount(ata, { ...after, owner: new PublicKey(after.owner), data: Buffer.from(after.data[0], "base64") });
  if (!accountAfter.mint.equals(mint) || !accountAfter.owner.equals(signer.publicKey) || beforeAmount - accountAfter.amount !== payment ||
      await rpc.getBalance(signer.publicKey, "confirmed") - walletAfter.lamports > 50_000_000) throw unavailable();
  const reserved = await lifecycleDb().rpc("reserve_panta_issuer_budget", { p_network: row.network, p_mint: row.mint,
    p_stage: row.stage, p_units: String(payment), p_limit: String(usdcUnits(process.env.PANTA_DAILY_CREATION_BUDGET_USDC || "100")) });
  if (reserved.error || reserved.data !== true) throw new PantaError("SYSTEM_ISSUER_BUDGET_EXHAUSTED", 503, "System market creation is awaiting issuer funding allocation.");
  tx.sign([signer]);
  const signature = bs58.encode(tx.signatures[0]);
  // Durable recovery before broadcast. A timeout must never cause a second payment.
  await persist(row, { status: "signed", signed_transaction: Buffer.from(tx.serialize()).toString("base64"),
    create_signature: signature, last_valid_block_height: build.lastValidBlockHeight });
  await rpc.sendRawTransaction(tx.serialize(), { skipPreflight: false, maxRetries: 2 });
  const result = await rpc.confirmTransaction({ signature, blockhash: tx.message.recentBlockhash, lastValidBlockHeight: Number(build.lastValidBlockHeight) }, "confirmed");
  if (result.value.err) throw unavailable();
  await createMarket(row);
}

export async function processLifecycleMarket(mint: string, stage: LifecycleStage) {
  const lease = randomUUID();
  const { data, error } = await lifecycleDb().rpc("lease_panta_lifecycle", { p_network: lifecycleNetwork(), p_mint: address(mint), p_stage: stage, p_lease: lease });
  if (error) throw unavailable();
  const row = data?.[0] as LifecycleRow | undefined;
  if (!row) return;
  try { await createMarket(row); }
  catch (error) {
    const failure = error instanceof PantaError ? error.code : "PANTA_UNAVAILABLE";
    await persist(row, { failure_code: failure, next_attempt_at: new Date(Date.now() + Math.min(3600, 15 * 2 ** Math.min(row.attempts, 8)) * 1000).toISOString() });
  } finally { await persist(row, { lease_id: null, lease_until: null }); }
}
export async function runLifecycleWorker(mint?: string) {
  const network = lifecycleNetwork();
  const now = Math.floor(Date.now() / 1000);
  // Capture the narrow final window before processing slower create retries.
  const finals = await lifecycleDb().from("panta_lifecycle_markets").select("mint")
    .eq("network", network).eq("stage", "post-graduation").is("final_snapshot", null).lte("deadline", now).gte("deadline", now - 300).limit(100);
  if (finals.error) throw unavailable();
  for (const row of finals.data || []) await captureLifecyclePrices(row.mint).catch(() => undefined);
  let query = lifecycleDb().from("panta_lifecycle_markets").select("mint,stage,status,anchor_time,deadline,baseline,final_snapshot")
    .eq("network", network).neq("status", "registered").lte("next_attempt_at", new Date().toISOString()).order("next_attempt_at").limit(1);
  if (mint) query = query.eq("mint", address(mint));
  const { data, error } = await query;
  if (error) throw unavailable();
  for (const row of data || []) {
    if (row.stage === "post-graduation") await captureLifecyclePrices(row.mint).catch(() => undefined);
    if (row.status !== "registered") await processLifecycleMarket(row.mint, row.stage);
  }
  return { examined: data?.length || 0 };
}

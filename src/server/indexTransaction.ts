import { Program, BorshCoder } from "@coral-xyz/anchor";
import { Connection, ParsedTransactionWithMeta, PublicKey } from "@solana/web3.js";
import { cpAmmCoder } from "@meteora-ag/cp-amm-sdk";
import { deriveDammV2PoolAddress, DynamicBondingCurveClient, DynamicBondingCurveIdl } from "@meteora-ag/dynamic-bonding-curve-sdk";
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import bs58 from "bs58";
import idl from "@/idl/streetfun.json";
import { METEORA_DAMM_V2_PROGRAM_ID, METEORA_DBC_PROGRAM_ID, PROGRAM_ID, USDC_MINT } from "@/sdk/constants";
import { getCurvePda, getDbcLaunchPda } from "@/sdk/pda";
import { TradeRecord, TradeStoreService } from "@/services/indexer/tradeStore";
import { parseCurveTrade, InvalidCurveTradeError, PendingCurveTradeError } from "@/services/indexer/parseCurveTrade";
import { createServerSupabaseClient } from "./supabase";
import { getServerConnection } from "./rpc";
import { solanaTokenService } from "./tokenData";
import { persistVaultHoldingSnapshot } from "./treasury";
import { persistDbcVaultHoldingSnapshot } from "./treasury";
import { getDbcMigrationDammConfigAddress } from "./meteoraDbc";
import { getNetworkAssetCatalog } from "./assetCatalog";

const coder = new BorshCoder(new Program({ ...idl, address: PROGRAM_ID.toBase58() } as any, { connection: getServerConnection() } as any).idl);
const dbcCoder = new BorshCoder(DynamicBondingCurveIdl as any);

type DecodedInstruction = { instruction: any; name: string; data: any; index: number };

function normalizeInstructionName(value: string): string {
  return value.replace(/_/g, "").toLowerCase();
}

/** Resolve the DBC registry account from the IDL, not a fragile positional guess. */
export function getDbcLaunchRegistryAddress(instruction: { accounts: PublicKey[] }): PublicKey | undefined {
  const definition = (idl as any).instructions?.find((item: any) =>
    normalizeInstructionName(item.name) === "registerdbclaunch",
  );
  const accountIndex = definition?.accounts?.findIndex((item: any) =>
    normalizeInstructionName(item.name) === "dbclaunch",
  ) ?? -1;
  return accountIndex < 0 ? undefined : instruction.accounts[accountIndex];
}

function flattenInstructions(tx: ParsedTransactionWithMeta): Array<{ instruction: any; index: number }> {
  const flat: Array<{ instruction: any; index: number }> = [];
  for (const [index, instruction] of tx.transaction.message.instructions.entries()) {
    flat.push({ instruction, index: index * 1_000 });
    const inner = tx.meta?.innerInstructions?.find(group => group.index === index)?.instructions || [];
    inner.forEach((innerInstruction, innerIndex) => flat.push({ instruction: innerInstruction, index: index * 1_000 + innerIndex + 1 }));
  }
  return flat;
}

function decodeMeteoraInstructions(tx: ParsedTransactionWithMeta, programId: PublicKey, targetCoder: BorshCoder): DecodedInstruction[] {
  return flattenInstructions(tx).flatMap(({ instruction, index }) => {
    if (!instruction.programId?.equals(programId) || !("data" in instruction) || !("accounts" in instruction)) return [];
    let decoded;
    try { decoded = targetCoder.instruction.decode(instruction.data, "base58"); }
    catch { return []; }
    return decoded ? [{ instruction, name: decoded.name, data: decoded.data as any, index }] : [];
  });
}

export function decodeDbcPoolInitialization(tx: ParsedTransactionWithMeta, mint: PublicKey) {
  const entry = decodeMeteoraInstructions(tx, METEORA_DBC_PROGRAM_ID, dbcCoder).find(item =>
    item.name.replace(/_/g, "").toLowerCase() === "initializevirtualpoolwithspltoken" &&
    item.instruction.accounts[3]?.equals(mint),
  );
  if (!entry) throw new InvalidCurveTradeError("Confirmed transaction does not initialize this DBC token mint.");
  const params = entry.data.params;
  if (!params || typeof params.name !== "string" || typeof params.symbol !== "string" || typeof params.uri !== "string") {
    throw new InvalidCurveTradeError("DBC token metadata is missing from the confirmed launch transaction.");
  }
  return { name: params.name, symbol: params.symbol, uri: params.uri };
}

function signerFor(tx: ParsedTransactionWithMeta, signer: PublicKey): boolean {
  return tx.transaction.message.accountKeys.some(key => key.signer && key.pubkey.equals(signer));
}

function accountBalanceDelta(
  tx: ParsedTransactionWithMeta,
  account: PublicKey,
  mint: PublicKey,
  trader: PublicKey,
): { pre: bigint; post: bigint } {
  const accountIndex = tx.transaction.message.accountKeys.findIndex(key => key.pubkey.equals(account));
  if (accountIndex < 0) throw new InvalidCurveTradeError("Trade token account is missing from the confirmed transaction.");
  const preEntry = tx.meta?.preTokenBalances?.find(entry => entry.accountIndex === accountIndex && entry.mint === mint.toBase58());
  const postEntry = tx.meta?.postTokenBalances?.find(entry => entry.accountIndex === accountIndex && entry.mint === mint.toBase58());
  if (!preEntry && !postEntry) throw new PendingCurveTradeError("Confirmed token balance deltas are unavailable.");
  for (const owner of [preEntry?.owner, postEntry?.owner]) {
    if (owner && owner !== trader.toBase58()) throw new InvalidCurveTradeError("Meteora swap token account is not owned by the signed trader.");
  }
  return { pre: BigInt(preEntry?.uiTokenAmount.amount || "0"), post: BigInt(postEntry?.uiTokenAmount.amount || "0") };
}

function accountMint(tx: ParsedTransactionWithMeta, account: PublicKey): PublicKey {
  const accountIndex = tx.transaction.message.accountKeys.findIndex(key => key.pubkey.equals(account));
  if (accountIndex < 0) throw new InvalidCurveTradeError("Trade token account is missing from the confirmed transaction.");
  const balance = [...(tx.meta?.postTokenBalances || []), ...(tx.meta?.preTokenBalances || [])]
    .find(entry => entry.accountIndex === accountIndex);
  if (!balance) throw new PendingCurveTradeError("Confirmed token balance metadata is unavailable.");
  return new PublicKey(balance.mint);
}

async function indexMeteoraSwapInstructions(
  connection: Connection,
  tx: ParsedTransactionWithMeta,
  signature: string,
  db: any,
  store: TradeStoreService,
  expectedMint?: string,
): Promise<{ indexed: number; trades: TradeRecord[] }> {
  const entries = [
    ...decodeMeteoraInstructions(tx, METEORA_DBC_PROGRAM_ID, dbcCoder).map(entry => ({ ...entry, protocol: "dbc" as const })),
    ...decodeMeteoraInstructions(tx, METEORA_DAMM_V2_PROGRAM_ID, cpAmmCoder).map(entry => ({ ...entry, protocol: "damm" as const })),
  ];
  const trades: TradeRecord[] = [];
  let indexed = 0;
  for (const entry of entries) {
    const normalizedName = entry.name.replace(/_/g, "").toLowerCase();
    if (entry.protocol === "dbc" && normalizedName !== "swap2") continue;
    if (entry.protocol === "damm" && normalizedName !== "swap2") continue;
    const accounts: PublicKey[] = entry.instruction.accounts;
    const pool = accounts[entry.protocol === "dbc" ? 2 : 1];
    const inputAccount = accounts[entry.protocol === "dbc" ? 3 : 2];
    const outputAccount = accounts[entry.protocol === "dbc" ? 4 : 3];
    const inputMint = entry.protocol === "dbc" ? undefined : accounts[6];
    const outputMint = entry.protocol === "dbc" ? undefined : accounts[7];
    const baseOrA = entry.protocol === "dbc" ? accounts[7] : inputMint!;
    const quoteOrB = entry.protocol === "dbc" ? accounts[8] : outputMint!;
    const trader = accounts[entry.protocol === "dbc" ? 9 : 8];
    if (!pool || !inputAccount || !outputAccount || !baseOrA || !quoteOrB || !trader) continue;

    let mint: PublicKey;
    let quoteMint: PublicKey;
    if (entry.protocol === "dbc") {
      mint = baseOrA;
      quoteMint = quoteOrB;
      if (!quoteMint.equals(USDC_MINT)) continue;
    } else {
      if (baseOrA.equals(USDC_MINT) && !quoteOrB.equals(USDC_MINT)) {
        quoteMint = baseOrA; mint = quoteOrB;
      } else if (quoteOrB.equals(USDC_MINT) && !baseOrA.equals(USDC_MINT)) {
        quoteMint = quoteOrB; mint = baseOrA;
      } else continue;
    }
    if (expectedMint && mint.toBase58() !== expectedMint) continue;
    const [launchAddress] = getDbcLaunchPda(mint, PROGRAM_ID);
    const registryInfo = await connection.getAccountInfo(launchAddress, { commitment: "confirmed", minContextSlot: tx.slot });
    if (!registryInfo?.owner.equals(PROGRAM_ID)) continue;
    const registry: any = coder.accounts.decode("dbcLaunchAccount", registryInfo.data);
    if (!registry.memeMint.equals(mint) || !registry.quoteMint.equals(quoteMint)) continue;
    if (entry.protocol === "dbc") {
      if (!registry.dbcPool.equals(pool)) continue;
    } else {
      const virtualPool = await DynamicBondingCurveClient.create(connection, "confirmed").state.getPool(registry.dbcPool);
      if (!virtualPool?.poolState.isMigrated) continue;
      const expectedDamm = deriveDammV2PoolAddressForIndex(registry, mint, quoteMint);
      if (!registry.isGraduated && !pool.equals(expectedDamm)) continue;
      if (registry.isGraduated && !registry.meteoraDammV2Pool.equals(pool)) continue;
    }

    // StreetFun's settlement CPI swaps from the protocol PDA, which is a
    // transaction-local signer only for that invocation. Do not misclassify
    // that collateral purchase as a public user trade; the following
    // settle_dbc_graduation handler indexes its verified vault outcome.
    if (!signerFor(tx, trader)) continue;
    const inputMintResolved = accountMint(tx, inputAccount);
    const outputMintResolved = accountMint(tx, outputAccount);
    const inputBalance = accountBalanceDelta(tx, inputAccount, inputMintResolved, trader);
    const outputBalance = accountBalanceDelta(tx, outputAccount, outputMintResolved, trader);
    if (!inputAccount.equals(getAssociatedTokenAddressSync(inputMintResolved, trader, false, TOKEN_PROGRAM_ID)) ||
        !outputAccount.equals(getAssociatedTokenAddressSync(outputMintResolved, trader, false, TOKEN_PROGRAM_ID))) {
      throw new InvalidCurveTradeError("Meteora swap token accounts are not owned by the signed trader.");
    }
    const inputAmount = inputBalance.pre - inputBalance.post;
    const outputAmount = outputBalance.post - outputBalance.pre;
    if (inputAmount <= 0n || outputAmount <= 0n) throw new InvalidCurveTradeError("Meteora swap has no verified user balance movement.");
    const isBuy = inputMintResolved.equals(quoteMint) && outputMintResolved.equals(mint);
    const isSell = inputMintResolved.equals(mint) && outputMintResolved.equals(quoteMint);
    if (!isBuy && !isSell) throw new InvalidCurveTradeError("Meteora swap direction does not match the registered token pair.");
    const tokenAmount = isBuy ? outputAmount : inputAmount;
    const quoteAmount = isBuy ? inputAmount : outputAmount;
    const { data: token, error } = await db.from("tokens").select("mint").eq("mint", mint.toBase58()).maybeSingle();
    if (error) throw new Error("Token metadata read failed while indexing a Meteora swap.");
    if (!token) throw new PendingCurveTradeError("Token launch metadata is not indexed yet; retry after launch indexing.");
    const trade: TradeRecord = {
      tx_signature: signature,
      instruction_index: entry.index,
      mint: mint.toBase58(),
      trade_type: isBuy ? "BUY" : "SELL",
      tokens_amount: Number(tokenAmount) / 1e6,
      quote_amount_usd: Number(quoteAmount) / 1e6,
      price_usd: Number(quoteAmount) / Number(tokenAmount),
      trader: trader.toBase58(),
      slot: tx.slot,
      created_at: new Date(tx.blockTime! * 1000).toISOString(),
    };
    await store.recordTrade(trade);
    trades.push(trade);
    indexed++;
  }
  return { indexed, trades };
}

function deriveDammV2PoolAddressForIndex(registry: any, mint: PublicKey, quoteMint: PublicKey): PublicKey {
  if (registry.isGraduated) return registry.meteoraDammV2Pool;
  return deriveDammV2PoolAddress(getDbcMigrationDammConfigAddress(), mint, quoteMint);
}

/** Capture only runtime-authenticated StreetFun frames, ignoring other programs' log text. */
export function decodeStreetfunInstructions(tx: ParsedTransactionWithMeta) {
  if (!tx.meta || tx.meta.err) throw new InvalidCurveTradeError("Transaction did not succeed.");
  const instructions = tx.transaction.message.instructions.flatMap((ix, index) => [
    ix, ...(tx.meta?.innerInstructions?.find(inner => inner.index === index)?.instructions || []),
  ]).filter(ix => ix.programId.equals(PROGRAM_ID));
  const frames: string[][] = [];
  const stack: { program: string; logs?: string[] }[] = [];
  for (const log of tx.meta.logMessages || []) {
    const invocation = log.match(/^Program (\S+) invoke \[(\d+)\]$/);
    if (invocation) {
      const frame = { program: invocation[1], logs: invocation[1] === PROGRAM_ID.toBase58() ? [] as string[] : undefined };
      if (frame.logs) frames.push(frame.logs);
      stack.push(frame); continue;
    }
    const end = log.match(/^Program (\S+) (?:success|failed:.*)$/);
    if (end) { if (stack.at(-1)?.program === end[1]) stack.pop(); continue; }
    stack.at(-1)?.logs?.push(log);
  }
  if (!instructions.length) throw new InvalidCurveTradeError("No StreetFun instruction.");
  if (frames.length !== instructions.length) throw new PendingCurveTradeError("Complete execution logs are unavailable.");
  return instructions.map((ix, index) => {
    if (!("data" in ix) || !("accounts" in ix)) throw new InvalidCurveTradeError("Unsupported parsed instruction.");
    let decoded;
    try { decoded = coder.instruction.decode(ix.data, "base58"); }
    catch { throw new InvalidCurveTradeError("Invalid instruction encoding."); }
    if (!decoded) throw new InvalidCurveTradeError("Unrecognized StreetFun instruction.");
    return { instruction: ix, name: decoded.name, data: decoded.data as any, logs: frames[index], index };
  });
}

export async function readConfirmedTransaction(connection: Connection, signature: string) {
  try { if (typeof signature !== "string" || bs58.decode(signature).length !== 64) throw new Error(); }
  catch { throw new InvalidCurveTradeError("Invalid Solana signature."); }
  const tx = await connection.getParsedTransaction(signature, { commitment: "confirmed", maxSupportedTransactionVersion: 0 });
  if (!tx || tx.blockTime == null) throw new PendingCurveTradeError("Confirmed transaction is not available yet.");
  return tx;
}

export async function indexConfirmedTransaction(
  connection: Connection,
  signature: string,
  expectedSlot?: number,
  expectedMint?: string,
) {
  const tx = await readConfirmedTransaction(connection, signature);
  if (expectedSlot !== undefined && expectedSlot !== tx.slot) throw new InvalidCurveTradeError("Webhook slot mismatch.");
  const flatInstructions = flattenInstructions(tx);
  const hasStreetfun = flatInstructions.some(({ instruction }) => instruction.programId?.equals(PROGRAM_ID));
  const instructions = hasStreetfun ? decodeStreetfunInstructions(tx) : [];
  const db = createServerSupabaseClient();
  if (!db) throw new Error("Live index is not configured.");
  const store = TradeStoreService.getInstance();
  const trades: TradeRecord[] = [];
  const indexedMints = new Set<string>();
  const meteora = await indexMeteoraSwapInstructions(connection, tx, signature, db, store, expectedMint);
  trades.push(...meteora.trades);
  let indexed = meteora.indexed;
  for (const trade of meteora.trades) indexedMints.add(trade.mint);

  const dbcInstructions = decodeMeteoraInstructions(tx, METEORA_DBC_PROGRAM_ID, dbcCoder);
  if (dbcInstructions.some(entry => entry.name.replace(/_/g, "").toLowerCase().startsWith("migrationdammv2"))) indexed++;

  for (const entry of instructions) {
    const name = entry.name.replace(/_/g, "").toLowerCase();
    const isTrade = name === "buycurve" || name === "sellcurve";
    const isLaunch = name === "launchstonk";
    const isGraduate = name === "graduateandexecutestock";
    const isRedeem = name === "burnandredeem";
    const isDbcLaunch = name === "registerdbclaunch";
    const isDbcGraduate = name === "settledbcgraduation";
    const isDbcRedeem = name === "burnandredeemdbc";
    if (!isTrade && !isLaunch && !isGraduate && !isRedeem && !isDbcLaunch && !isDbcGraduate && !isDbcRedeem) continue;

    const mint = entry.instruction.accounts[isRedeem || isDbcRedeem ? 1 : 2];
    if (!mint) throw new InvalidCurveTradeError("Missing instruction mint.");
    if (expectedMint && mint.toBase58() !== expectedMint) continue;

    if (isDbcLaunch) {
      const creator = entry.instruction.accounts[0];
      if (!signerFor(tx, creator)) throw new InvalidCurveTradeError("DBC launch creator did not sign.");
      const registryAddress = getDbcLaunchRegistryAddress(entry.instruction);
      const registryInfo = registryAddress && await connection.getAccountInfo(registryAddress, { commitment: "confirmed", minContextSlot: tx.slot });
      if (!registryInfo?.owner.equals(PROGRAM_ID)) throw new PendingCurveTradeError("DBC launch registry is not available yet.");
      const registry: any = coder.accounts.decode("dbcLaunchAccount", registryInfo.data);
      if (!registry.memeMint.equals(mint) || !registry.creator.equals(creator)) throw new InvalidCurveTradeError("DBC launch registry does not match the signed launch.");
      const metadata = decodeDbcPoolInitialization(tx, mint);
      const [{ data: existing, error }, assets] = await Promise.all([
        db.from("tokens").select("*").eq("mint", mint.toBase58()).maybeSingle(),
        getNetworkAssetCatalog(connection).catch(() => []),
      ]);
      if (error) throw new Error("Token metadata read failed.");
      const asset: any = assets.find((item: any) => item.mintAddress === registry.targetEquityMint.toBase58());
      await store.recordToken({
        mint: mint.toBase58(), name: metadata.name, symbol: metadata.symbol,
        target_equity_symbol: asset?.symbol || existing?.target_equity_symbol || "UNVERIFIED",
        target_equity_mint: registry.targetEquityMint.toBase58(), creator: creator.toBase58(),
        description: existing?.description || "", avatar_url: existing?.avatar_url || undefined,
        is_graduated: Boolean(registry.isGraduated),
        meteora_pool: registry.isGraduated && !registry.meteoraDammV2Pool.equals(PublicKey.default)
          ? registry.meteoraDammV2Pool.toBase58() : undefined,
      });
      indexedMints.add(mint.toBase58());
      indexed++;
      continue;
    }

    if (isDbcGraduate || isDbcRedeem) {
      const [launchAddress] = getDbcLaunchPda(mint, PROGRAM_ID);
      const launchInfo = await connection.getAccountInfo(launchAddress, { commitment: "confirmed", minContextSlot: tx.slot });
      if (!launchInfo || !launchInfo.owner.equals(PROGRAM_ID)) throw new PendingCurveTradeError("DBC launch registry is not available yet.");
      const launch: any = coder.accounts.decode("dbcLaunchAccount", launchInfo.data);
      if (!launch.memeMint.equals(mint)) throw new InvalidCurveTradeError("Invalid DBC launch registry mint.");
      const { data: existing, error } = await db.from("tokens").select("*").eq("mint", mint.toBase58()).maybeSingle();
      if (error) throw new Error("Token metadata read failed.");
      if (!existing) throw new PendingCurveTradeError("DBC launch metadata is not indexed yet; retry after launch indexing.");
      const pool = launch.meteoraDammV2Pool.equals(PublicKey.default) ? undefined : launch.meteoraDammV2Pool.toBase58();
      await store.recordToken({
        ...existing, mint: mint.toBase58(), target_equity_mint: launch.targetEquityMint.toBase58(),
        creator: launch.creator.toBase58(), is_graduated: Boolean(launch.isGraduated), meteora_pool: pool,
      });
      indexedMints.add(mint.toBase58());
      if (isDbcRedeem) {
        const redeemer = entry.instruction.accounts[0];
        const memeAccount = entry.instruction.accounts[5];
        const equityAccount = entry.instruction.accounts[6];
        if (!signerFor(tx, redeemer)) throw new InvalidCurveTradeError("DBC redeemer did not sign.");
        const memeDelta = accountBalanceDelta(tx, memeAccount, mint, redeemer);
        const equityDelta = accountBalanceDelta(tx, equityAccount, launch.targetEquityMint, redeemer);
        const burned = memeDelta.pre - memeDelta.post;
        const shares = equityDelta.post - equityDelta.pre;
        if (burned <= 0n || shares <= 0n) throw new InvalidCurveTradeError("DBC redemption has no verified token balance movement.");
        const accountIndex = tx.transaction.message.accountKeys.findIndex(key => key.pubkey.equals(equityAccount));
        const equityBalance = tx.meta?.postTokenBalances?.find(balance => balance.accountIndex === accountIndex && balance.mint === launch.targetEquityMint.toBase58());
        if (!equityBalance) throw new PendingCurveTradeError("DBC redemption collateral decimals are not available.");
        const trade: TradeRecord = {
          tx_signature: signature, instruction_index: entry.index, mint: mint.toBase58(), trade_type: "REDEEM",
          tokens_amount: Number(burned) / 1e6, equity_amount: Number(shares) / 10 ** equityBalance.uiTokenAmount.decimals,
          price_usd: 0, quote_amount_usd: 0, trader: redeemer.toBase58(), slot: tx.slot,
          created_at: new Date(tx.blockTime! * 1000).toISOString(),
        };
        await store.recordTrade(trade);
        trades.push(trade);
      }
      if (isDbcGraduate || isDbcRedeem) {
        await persistDbcVaultHoldingSnapshot(
          connection, db, launchAddress, launch, tx.slot, existing.target_equity_symbol || "UNVERIFIED",
        );
      }
      indexed++;
      continue;
    }

    const curveKey = getCurvePda(mint, PROGRAM_ID)[0];
    const curveInfo = await connection.getAccountInfo(curveKey, { commitment: "confirmed", minContextSlot: tx.slot });
    if (!curveInfo || !curveInfo.owner.equals(PROGRAM_ID)) throw new PendingCurveTradeError("Curve account is unavailable.");
    const curve: any = coder.accounts.decode("curveAccount", curveInfo.data);
    if (!curve.memeMint.equals(mint)) throw new InvalidCurveTradeError("Invalid curve mint.");
    const { data: existing, error } = await db.from("tokens").select("*").eq("mint", mint.toBase58()).maybeSingle();
    if (error) throw new Error("Token metadata read failed.");
    const params = entry.data.params;
    const token = {
      mint: mint.toBase58(), name: isLaunch ? params.name : existing?.name || `StreetFun ${mint.toBase58().slice(0, 4)}`,
      symbol: isLaunch ? params.symbol : existing?.symbol || mint.toBase58().slice(0, 5),
      target_equity_symbol: existing?.target_equity_symbol || "UNVERIFIED",
      target_equity_mint: curve.targetEquityMint.toBase58(), creator: curve.creator.toBase58(),
      is_graduated: Boolean(curve.isGraduated), updated_at: new Date().toISOString(),
      ...(isLaunch ? { created_at: new Date(tx.blockTime! * 1000).toISOString() } : {}),
    };
    await store.recordToken(token);
    if (isTrade) {
      const isolated = {
        ...tx, transaction: { ...tx.transaction, message: { ...tx.transaction.message, instructions: [entry.instruction] } },
        meta: { ...tx.meta!, logMessages: [`Program ${PROGRAM_ID} invoke [1]`, ...entry.logs, `Program ${PROGRAM_ID} success`] },
      };
      const trade = parseCurveTrade(isolated, signature, PROGRAM_ID, USDC_MINT);
      trade.instruction_index = entry.index;
      await store.recordTrade(trade); trades.push(trade);
    } else if (isRedeem) {
      const event = entry.logs.map(log => log.match(/^Program log: Burn and redeem completed\. Burned: (\d+), Redeemed Shares: (\d+), Remaining Locked: (\d+)$/)).find(Boolean);
      if (!event || BigInt(event[1]) !== BigInt(params.memeTokensToBurn.toString())) throw new InvalidCurveTradeError("Redemption event mismatch.");
      const signer = entry.instruction.accounts[0];
      if (!signerFor(tx, signer)) throw new InvalidCurveTradeError("Redeemer did not sign.");
      const equityMint = entry.instruction.accounts[2].toBase58();
      const balance = tx.meta!.postTokenBalances?.find(b => b.mint === equityMint);
      if (!balance) throw new PendingCurveTradeError("Redemption balance metadata unavailable.");
      const trade: TradeRecord = {
        tx_signature: signature, instruction_index: entry.index, mint: mint.toBase58(), trade_type: "REDEEM",
        tokens_amount: Number(event[1]) / 1e6, equity_amount: Number(event[2]) / 10 ** balance.uiTokenAmount.decimals,
        price_usd: 0, quote_amount_usd: 0, trader: signer.toBase58(), slot: tx.slot,
        created_at: new Date(tx.blockTime! * 1000).toISOString(),
      };
      await store.recordTrade(trade); trades.push(trade);
    }
    if (isGraduate || isRedeem) {
      await persistVaultHoldingSnapshot(connection, db, curveKey, curve, tx.slot, existing?.target_equity_symbol || "UNVERIFIED");
    }
    indexed++;
    indexedMints.add(mint.toBase58());
  }
  if (expectedMint && !indexedMints.has(expectedMint)) throw new InvalidCurveTradeError("Confirmed transaction does not contain a supported event for the requested mint.");
  if (!indexed) throw new InvalidCurveTradeError("No supported market event.");
  solanaTokenService.invalidate();
  return { indexed, trades };
}

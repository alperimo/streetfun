import { Program, BorshCoder } from "@coral-xyz/anchor";
import { Connection, ParsedTransactionWithMeta, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import idl from "@/idl/streetfun.json";
import { PROGRAM_ID, USDC_MINT } from "@/sdk/constants";
import { getCurvePda } from "@/sdk/pda";
import { TradeRecord, TradeStoreService } from "@/services/indexer/tradeStore";
import { parseCurveTrade, InvalidCurveTradeError, PendingCurveTradeError } from "@/services/indexer/parseCurveTrade";
import { createServerSupabaseClient } from "./supabase";
import { getServerConnection } from "./rpc";
import { solanaTokenService } from "./tokenData";
import { persistVaultHoldingSnapshot } from "./treasury";

const coder = new BorshCoder(new Program({ ...idl, address: PROGRAM_ID.toBase58() } as any, { connection: getServerConnection() } as any).idl);

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

export async function indexConfirmedTransaction(connection: Connection, signature: string, expectedSlot?: number) {
  const tx = await readConfirmedTransaction(connection, signature);
  if (expectedSlot !== undefined && expectedSlot !== tx.slot) throw new InvalidCurveTradeError("Webhook slot mismatch.");
  const instructions = decodeStreetfunInstructions(tx);
  const db = createServerSupabaseClient();
  if (!db) throw new Error("Live index is not configured.");
  const store = TradeStoreService.getInstance();
  const trades: TradeRecord[] = [];
  let indexed = 0;
  for (const entry of instructions) {
    const name = entry.name.replace(/_/g, "").toLowerCase();
    const isTrade = name === "buycurve" || name === "sellcurve";
    const isLaunch = name === "launchstonk";
    const isGraduate = name === "graduateandexecutestock";
    const isRedeem = name === "burnandredeem";
    if (!isTrade && !isLaunch && !isGraduate && !isRedeem) continue;
    const mint = entry.instruction.accounts[isRedeem ? 1 : 2];
    if (!mint) throw new InvalidCurveTradeError("Missing instruction mint.");
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
    // A late launch delivery must not revert an already-graduated curve.
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
      if (!tx.transaction.message.accountKeys.some(key => key.signer && key.pubkey.equals(signer))) throw new InvalidCurveTradeError("Redeemer did not sign.");
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
      await persistVaultHoldingSnapshot(
        connection,
        db,
        curveKey,
        curve,
        tx.slot,
        existing?.target_equity_symbol || "UNVERIFIED"
      );
    }
    indexed++;
  }
  if (!indexed) throw new InvalidCurveTradeError("No supported market event.");
  solanaTokenService.invalidate();
  return { indexed, trades };
}

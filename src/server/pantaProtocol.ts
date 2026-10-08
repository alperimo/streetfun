import { BorshCoder, type Idl } from "@coral-xyz/anchor";
import { createHash } from "node:crypto";
import { PublicKey, SystemProgram, VersionedTransaction, ComputeBudgetProgram } from "@solana/web3.js";
import { ASSOCIATED_TOKEN_PROGRAM_ID, TOKEN_PROGRAM_ID, getAssociatedTokenAddressSync, unpackMint } from "@solana/spl-token";
import idl from "@/idl/panta-usdc.json";
import { getServerConnection, assertConfiguredCluster } from "./rpc";
import { PantaError, unavailable } from "./pantaValidation";
import type { LifecycleRow } from "./pantaLifecycleStore";

// Reviewed USDC interface published by https://panta.market/ on 2026-10-08.
export const PANTA_PROGRAM = new PublicKey(idl.address);
export const pantaCoder = new BorshCoder(idl as Idl);
export const pantaPda = (seed: string, ...keys: Uint8Array[]) => PublicKey.findProgramAddressSync([Buffer.from(seed), ...keys.map(k => Buffer.from(k))], PANTA_PROGRAM)[0];
export const pantaConfigAddress = pantaPda("market_config");
export async function pantaChainConfig() {
  const rpc = getServerConnection(); await assertConfiguredCluster(rpc);
  const [program, info] = await rpc.getMultipleAccountsInfo([PANTA_PROGRAM, pantaConfigAddress], "confirmed");
  if (!program?.executable || !info?.owner.equals(PANTA_PROGRAM)) throw unavailable();
  // Older Devnet config has 324 bytes and no configured USDC market fees.
  if (info.data.length < 356) throw new PantaError("PANTA_CONFIGURATION_INCOMPLETE", 503, "Prediction markets are awaiting provider setup on this network.");
  const config = pantaCoder.accounts.decode("MarketConfig", info.data) as Record<string, any>;
  const mint = config.usdc_mint as PublicKey;
  if (!mint || mint.equals(PublicKey.default)) throw new PantaError("PANTA_CONFIGURATION_INCOMPLETE", 503, "Prediction markets are awaiting provider setup on this network.");
  const mintInfo = await rpc.getAccountInfo(mint, "confirmed");
  if (!mintInfo?.owner.equals(TOKEN_PROGRAM_ID) || unpackMint(mint, mintInfo).decimals !== 6) throw unavailable();
  return { config, mint, rpc };
}
export function createAccounts(wallet: PublicKey, question: string, mint: PublicKey, treasury: PublicKey) {
  const hash = createHash("sha256").update(question, "utf8").digest();
  const event = pantaPda("event_usdc", wallet.toBuffer(), hash), vault = pantaPda("vault_usdc", wallet.toBuffer(), hash);
  const feeVault = pantaPda("creator_fee_vault_usdc", event.toBuffer());
  return [wallet, pantaConfigAddress, pantaPda("creator_whitelist"), event, vault,
    getAssociatedTokenAddressSync(mint, vault, true), feeVault, getAssociatedTokenAddressSync(mint, feeVault, true),
    pantaPda("position", event.toBuffer(), wallet.toBuffer()), mint, getAssociatedTokenAddressSync(mint, wallet),
    getAssociatedTokenAddressSync(mint, treasury, true), TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID, SystemProgram.programId];
}
export function validateCreateTransaction(tx: VersionedTransaction, row: LifecycleRow, wallet: PublicKey,
  config: Record<string, any>, mint: PublicKey, expectedEvent: string, payment: bigint) {
  if (tx.message.version !== 0 || tx.message.addressTableLookups.length || tx.message.header.numRequiredSignatures !== 1 ||
      !tx.message.staticAccountKeys[0].equals(wallet) || tx.signatures.some(s => s.some(b => b !== 0)) || tx.serialize().length > 1232) throw unavailable();
  const accounts = createAccounts(wallet, row.question, mint, config.treasury);
  if (accounts[3].toBase58() !== expectedEvent) throw unavailable();
  let creates = 0, atas = 0, limits = 0, prices = 0;
  for (const ix of tx.message.compiledInstructions) {
    const program = tx.message.staticAccountKeys[ix.programIdIndex];
    const keys = ix.accountKeyIndexes.map(i => tx.message.staticAccountKeys[i]);
    const data = Buffer.from(ix.data);
    if (program.equals(PANTA_PROGRAM)) {
      const decoded = pantaCoder.instruction.decode(data);
      if (++creates !== 1 || decoded?.name !== "create_breaking_event_usdc" || keys.length !== accounts.length ||
          keys.some((key, i) => !key.equals(accounts[i]))) throw unavailable();
      const args = decoded.data as Record<string, any>;
      if (args.question !== row.question || args.resolution_rule !== row.resolution_rule ||
          JSON.stringify(args.source_of_truth) !== JSON.stringify(row.sources) || args.event_in_progress !== true ||
          args.event_start_time.toString() !== String(row.anchor_time) || args.end_time.toString() !== String(row.deadline) ||
          args.resolution_time.toString() !== String(row.deadline) || args.payment_usdc.toString() !== String(payment)) throw unavailable();
    } else if (program.equals(ASSOCIATED_TOKEN_PROGRAM_ID)) {
      const expected = [wallet, accounts[10], wallet, mint, SystemProgram.programId, TOKEN_PROGRAM_ID];
      if (++atas > 1 || data.length !== 1 || data[0] !== 1 || keys.length !== 6 || keys.some((key, i) => !key.equals(expected[i]))) throw unavailable();
    } else if (program.equals(ComputeBudgetProgram.programId)) {
      if (keys.length) throw unavailable();
      if (data[0] === 2 && data.length === 5 && ++limits === 1 && data.readUInt32LE(1) <= 400_000) continue;
      if (data[0] === 3 && data.length === 9 && ++prices === 1 && data.readBigUInt64LE(1) <= 100_000n) continue;
      throw unavailable();
    } else throw unavailable();
  }
  if (creates !== 1) throw unavailable();
}

import * as anchor from "@coral-xyz/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  AddressLookupTableAccount,
  AddressLookupTableProgram,
  ComputeBudgetProgram,
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import BN from "bn.js";
import idl from "@/idl/streetfun.json";
import { PROGRAM_ID } from "@/sdk/constants";
import { getBrowserRpcUrl } from "@/sdk/network";
import type { WalletTransactionSender } from "../types";
import { confirmSubmittedTransaction, SubmittedTransactionError } from "./transactionConfirmation";

interface GraduationPlan {
  networkGenesisHash: string;
  amounts: {
    minEquityTokensExpected: string;
  };
  pool: {
    address: string;
    sqrtPrice: string;
    liquidity: string;
  };
  accounts: Record<string, string>;
}

export async function graduateToken(
  mint: string,
  wallet: WalletTransactionSender,
  slippageBps = 100,
  protocol?: "meteora-dbc" | "streetfun-legacy",
): Promise<{ signature: string; poolAddress: string; migrationSignature?: string }> {
  if (!wallet?.publicKey || typeof wallet.sendTransaction !== "function") {
    throw new Error("Connect a wallet that can sign the graduation transaction.");
  }

  const connection = new Connection(getBrowserRpcUrl(), "confirmed");
  if (protocol === "meteora-dbc") return graduateDbcToken(mint, wallet, connection, slippageBps);
  const positionNftMint = Keypair.generate();
  const response = await fetch("/api/graduate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      mint,
      caller: wallet.publicKey.toBase58(),
      positionNftMint: positionNftMint.publicKey.toBase58(),
      slippageBps,
    }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || "A live settlement route is unavailable.");
  }
  const plan = payload as GraduationPlan;

  const genesisHash = await connection.getGenesisHash();
  if (genesisHash !== plan.networkGenesisHash) {
    throw new Error("The wallet RPC and settlement plan point to different Solana clusters.");
  }
  if (plan.accounts.caller !== wallet.publicKey.toBase58() ||
      plan.accounts.positionNftMint !== positionNftMint.publicKey.toBase58()) {
    throw new Error("The settlement plan does not match the connected wallet.");
  }

  const readonlyWallet: any = {
    publicKey: wallet.publicKey,
    signTransaction: async () => { throw new Error("Use the connected wallet to sign."); },
    signAllTransactions: async () => { throw new Error("Use the connected wallet to sign."); },
  };
  const provider = new anchor.AnchorProvider(connection, readonlyWallet, {
    commitment: "confirmed",
    preflightCommitment: "confirmed",
  });
  const program = new anchor.Program({ ...idl, address: PROGRAM_ID.toBase58() } as any, provider);
  const accounts = Object.fromEntries(
    Object.entries(plan.accounts).map(([name, address]) => [name, new PublicKey(address)]),
  );
  const graduationInstruction = await (program.methods as any)
    .graduateAndExecuteStock({
      minEquityTokensExpected: new BN(plan.amounts.minEquityTokensExpected),
      poolLiquidity: new BN(plan.pool.liquidity),
      poolSqrtPrice: new BN(plan.pool.sqrtPrice),
    })
    .accounts(accounts)
    .instruction();

  const transaction = new Transaction().add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }),
    createAssociatedTokenAccountIdempotentInstruction(
      wallet.publicKey,
      new PublicKey(plan.accounts.callerQuoteAccount),
      wallet.publicKey,
      new PublicKey(plan.accounts.quoteMint),
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    ),
    createAssociatedTokenAccountIdempotentInstruction(
      wallet.publicKey,
      new PublicKey(plan.accounts.callerMemeAccount),
      wallet.publicKey,
      new PublicKey(plan.accounts.memeMint),
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    ),
    graduationInstruction,
  );
  transaction.feePayer = wallet.publicKey;
  // This settlement has enough writable accounts that a legacy transaction
  // exceeds Solana's packet limit. A dedicated lookup table keeps settlement
  // below the limit; the caller retains authority so its rent is recoverable.
  const lookupTable = await createSettlementLookupTable(
    connection,
    wallet,
    transaction,
    [positionNftMint.publicKey],
  );
  const blockhash = await connection.getLatestBlockhash("confirmed");
  const versionedMessage = new TransactionMessage({
    payerKey: wallet.publicKey,
    recentBlockhash: blockhash.blockhash,
    instructions: transaction.instructions,
  }).compileToV0Message([lookupTable]);
  const versionedTransaction = new VersionedTransaction(versionedMessage);
  versionedTransaction.sign([positionNftMint]);

  let signature: string;
  try {
    signature = await wallet.sendTransaction(versionedTransaction, connection, {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "Wallet rejected the graduation transaction.");
  }

  try {
    await confirmSubmittedTransaction(connection, signature, blockhash);
  } catch (error) {
    if (error instanceof SubmittedTransactionError) throw error;
    throw new Error(`Graduation transaction ${signature} failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  return { signature, poolAddress: plan.pool.address };
}

async function createSettlementLookupTable(
  connection: Connection,
  wallet: WalletTransactionSender,
  settlement: Transaction,
  additionalSigners: PublicKey[],
): Promise<AddressLookupTableAccount> {
  // compileMessage requires a recent blockhash even though this transaction is
  // only being inspected to collect lookup-table addresses.
  settlement.feePayer = wallet.publicKey;
  settlement.recentBlockhash = (await connection.getLatestBlockhash("confirmed")).blockhash;
  const accountKeys = settlement.compileMessage().accountKeys;
  const addresses = accountKeys
    .filter(key => !key.equals(wallet.publicKey) && !additionalSigners.some(signer => signer.equals(key)))
    .slice(0, 28);
  if (addresses.length < 13) throw new Error("The settlement account list could not be compacted safely.");

  // A slot number is not necessarily produced (Solana can skip slots). The ALT
  // program only accepts a slot present in SlotHashes, so choose an actually
  // produced confirmed block just behind the RPC's current slot.
  const currentSlot = await connection.getSlot("confirmed");
  const producedSlots = await connection.getBlocks(
    Math.max(0, currentSlot - 32),
    currentSlot,
    "confirmed",
  );
  let recentSlot: number | undefined;
  for (let index = producedSlots.length - 1; index >= 0; index -= 1) {
    if (producedSlots[index] < currentSlot) {
      recentSlot = producedSlots[index];
      break;
    }
  }
  recentSlot ??= producedSlots[producedSlots.length - 1];
  if (recentSlot === undefined) {
    throw new Error("Could not find a produced recent Solana slot for settlement setup.");
  }
  const [createInstruction, lookupTableAddress] = AddressLookupTableProgram.createLookupTable({
    authority: wallet.publicKey,
    payer: wallet.publicKey,
    recentSlot,
  });
  const extendInstruction = AddressLookupTableProgram.extendLookupTable({
    lookupTable: lookupTableAddress,
    authority: wallet.publicKey,
    payer: wallet.publicKey,
    addresses,
  });
  const setup = new Transaction().add(createInstruction, extendInstruction);
  const setupBlockhash = await connection.getLatestBlockhash("confirmed");
  setup.feePayer = wallet.publicKey;
  setup.recentBlockhash = setupBlockhash.blockhash;

  let setupSignature: string;
  try {
    setupSignature = await wallet.sendTransaction(setup, connection, {
      skipPreflight: false,
      preflightCommitment: "confirmed",
    });
    const confirmation = await connection.confirmTransaction({ signature: setupSignature, ...setupBlockhash }, "confirmed");
    if (confirmation.value.err) throw new Error(JSON.stringify(confirmation.value.err));
  } catch (error) {
    throw new Error(`Settlement preparation failed; no graduation was submitted. ${error instanceof Error ? error.message : String(error)}`);
  }

  for (let attempt = 0; attempt < 12; attempt++) {
    const [{ value }, currentSlot] = await Promise.all([
      connection.getAddressLookupTable(lookupTableAddress, { commitment: "confirmed" }),
      connection.getSlot("confirmed"),
    ]);
    if (value && value.state.authority?.equals(wallet.publicKey) &&
        value.state.addresses.length === addresses.length && currentSlot > value.state.lastExtendedSlot) {
      return value;
    }
    await new Promise(resolve => setTimeout(resolve, 400));
  }
  throw new Error(`Settlement preparation ${setupSignature} confirmed, but Solana has not activated the address table yet. No graduation was submitted.`);
}

export class GraduationStepPendingError extends SubmittedTransactionError {
  constructor(signature: string, readonly step: "migration" | "settlement") {
    super(signature);
    this.name = "GraduationStepPendingError";
  }
}

interface DbcGraduationPlan {
  action: "migrate" | "settle";
  networkGenesisHash: string;
  pool?: { address: string };
  dammConfig?: string;
  amounts?: { minEquityTokensExpected: string };
  accounts?: Record<string, string>;
}

async function fetchDbcGraduationPlan(
  mint: string,
  wallet: WalletTransactionSender,
  slippageBps: number,
): Promise<DbcGraduationPlan> {
  const response = await fetch("/api/graduate/dbc", {
    method: "POST", headers: { "Content-Type": "application/json" }, cache: "no-store",
    body: JSON.stringify({ mint, caller: wallet.publicKey.toBase58(), slippageBps }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || (payload?.action !== "migrate" && payload?.action !== "settle")) {
    throw new Error(payload?.error || "Meteora DBC migration or settlement is not ready.");
  }
  return payload as DbcGraduationPlan;
}

async function graduateDbcToken(
  mint: string,
  wallet: WalletTransactionSender,
  connection: Connection,
  slippageBps: number,
): Promise<{ signature: string; poolAddress: string; migrationSignature?: string }> {
  let plan = await fetchDbcGraduationPlan(mint, wallet, slippageBps);
  const genesisHash = await connection.getGenesisHash();
  if (genesisHash !== plan.networkGenesisHash) throw new Error("The wallet RPC and DBC graduation plan point to different Solana clusters.");

  let migrationSignature: string | undefined;
  if (plan.action === "migrate") {
    if (!plan.pool?.address || !plan.dammConfig) throw new Error("Meteora did not return a complete migration plan.");
    const { DynamicBondingCurveClient } = await import("@meteora-ag/dynamic-bonding-curve-sdk");
    const migration = await DynamicBondingCurveClient.create(connection, "confirmed").migration.migrateToDammV2({
      payer: wallet.publicKey,
      pool: new PublicKey(plan.pool.address),
      dammConfig: new PublicKey(plan.dammConfig),
    });
    const transaction = migration.transaction;
    const blockhash = await connection.getLatestBlockhash("confirmed");
    transaction.feePayer = wallet.publicKey;
    transaction.recentBlockhash = blockhash.blockhash;
    transaction.partialSign(migration.firstPositionNftKeypair, migration.secondPositionNftKeypair);
    try {
      migrationSignature = await wallet.sendTransaction(transaction, connection, {
        skipPreflight: false, preflightCommitment: "confirmed",
      });
    } catch (error) {
      throw new Error(error instanceof Error ? error.message : "Wallet rejected the Meteora DAMM v2 migration.");
    }
    try { await confirmSubmittedTransaction(connection, migrationSignature, blockhash); }
    catch (error) {
      if (error instanceof SubmittedTransactionError) throw new GraduationStepPendingError(migrationSignature, "migration");
      throw new Error(`Meteora migration ${migrationSignature} failed: ${error instanceof Error ? error.message : String(error)}`);
    }
    plan = await fetchDbcGraduationPlan(mint, wallet, slippageBps);
    if (plan.action !== "settle") throw new Error(`Meteora migration ${migrationSignature} confirmed, but the DBC pool has not reached settlement-ready state yet.`);
  }

  if (!plan.accounts || !plan.amounts?.minEquityTokensExpected) throw new Error("StreetFun did not return complete equity settlement accounts.");
  if (plan.accounts.caller !== wallet.publicKey.toBase58()) throw new Error("The settlement plan does not match the connected wallet.");
  const readonlyWallet: any = {
    publicKey: wallet.publicKey,
    signTransaction: async () => { throw new Error("Use the connected wallet to sign."); },
    signAllTransactions: async () => { throw new Error("Use the connected wallet to sign."); },
  };
  const provider = new anchor.AnchorProvider(connection, readonlyWallet, { commitment: "confirmed", preflightCommitment: "confirmed" });
  const program = new anchor.Program({ ...idl, address: PROGRAM_ID.toBase58() } as any, provider);
  const accounts = Object.fromEntries(Object.entries(plan.accounts).map(([name, address]) => [name, new PublicKey(address)]));
  const settleInstruction = await (program.methods as any)
    .settleDbcGraduation({ minEquityTokensExpected: new BN(plan.amounts.minEquityTokensExpected) })
    .accounts(accounts)
    .instruction();
  const transaction = new Transaction().add(ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }), settleInstruction);
  transaction.feePayer = wallet.publicKey;
  const lookupTable = await createSettlementLookupTable(connection, wallet, transaction, []);
  const blockhash = await connection.getLatestBlockhash("confirmed");
  const message = new TransactionMessage({
    payerKey: wallet.publicKey,
    recentBlockhash: blockhash.blockhash,
    instructions: transaction.instructions,
  }).compileToV0Message([lookupTable]);
  let signature: string;
  try {
    signature = await wallet.sendTransaction(new VersionedTransaction(message), connection, {
      skipPreflight: false, preflightCommitment: "confirmed",
    });
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "Wallet rejected the StreetFun equity settlement.");
  }
  try { await confirmSubmittedTransaction(connection, signature, blockhash); }
  catch (error) {
    if (error instanceof SubmittedTransactionError) throw new GraduationStepPendingError(signature, "settlement");
    throw new Error(`StreetFun settlement ${signature} failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  await fetch("/api/trades/confirm", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signature, mint, protocol: "meteora-dbc", purpose: "graduation" }),
  }).catch(() => null);
  return { signature, poolAddress: plan.pool?.address || "", migrationSignature };
}

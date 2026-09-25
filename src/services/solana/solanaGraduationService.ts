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
): Promise<{ signature: string; poolAddress: string }> {
  if (!wallet?.publicKey || typeof wallet.sendTransaction !== "function") {
    throw new Error("Connect a wallet that can sign the graduation transaction.");
  }

  const connection = new Connection(getBrowserRpcUrl(), "confirmed");
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
    positionNftMint.publicKey,
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
  positionNftSigner: PublicKey,
): Promise<AddressLookupTableAccount> {
  const accountKeys = settlement.compileMessage().accountKeys;
  const addresses = accountKeys
    .filter(key => !key.equals(wallet.publicKey) && !key.equals(positionNftSigner))
    .slice(0, 24);
  if (addresses.length < 13) throw new Error("The settlement account list could not be compacted safely.");

  const recentSlot = await connection.getSlot("confirmed");
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

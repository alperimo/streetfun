import { Connection, PublicKey } from "@solana/web3.js";
import { PROGRAM_ID } from "@/sdk/constants";
import { TradeRecord } from "./tradeStore";

const SIGNATURE_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{64,88}$/;
const TOKEN_DECIMALS = 1_000_000;

export async function readConfirmedCurveTrade(
  connection: Connection,
  signature: string,
  expectedMint?: string
): Promise<TradeRecord> {
  if (!SIGNATURE_PATTERN.test(signature)) {
    throw new Error("Invalid Solana transaction signature.");
  }

  let transaction = null;
  for (let attempt = 0; attempt < 4 && !transaction; attempt += 1) {
    transaction = await connection.getParsedTransaction(signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });
    if (!transaction && attempt < 3) {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  if (!transaction || transaction.meta?.err) {
    throw new Error("Confirmed StreetFun transaction was not found.");
  }

  const programInstructions = transaction.transaction.message.instructions.filter(
    (instruction) => instruction.programId.equals(PROGRAM_ID) && "accounts" in instruction
  );
  if (programInstructions.length !== 1) {
    throw new Error("Expected exactly one StreetFun instruction in the transaction.");
  }

  const instruction = programInstructions[0];
  if (!("accounts" in instruction) || instruction.accounts.length < 3) {
    throw new Error("StreetFun instruction accounts are incomplete.");
  }
  const mint = instruction.accounts[2].toBase58();
  if (expectedMint && new PublicKey(expectedMint).toBase58() !== mint) {
    throw new Error("The transaction belongs to a different token mint.");
  }

  const logs = transaction.meta?.logMessages || [];
  const buyEvents = logs
    .map((log) => log.match(/Buy executed\. Spent: (\d+), Received: (\d+), New Real Quote: (\d+)/))
    .filter(Boolean);
  const sellEvents = logs
    .map((log) => log.match(/Sell executed\. Sold: (\d+), Received Quote: (\d+), New Real Quote: (\d+)/))
    .filter(Boolean);
  if (buyEvents.length + sellEvents.length !== 1) {
    throw new Error("A single confirmed StreetFun buy or sell event was not found.");
  }

  const isBuy = buyEvents.length === 1;
  const event = (isBuy ? buyEvents[0] : sellEvents[0])!;
  const tokensAmount = Number(BigInt(event[isBuy ? 2 : 1])) / TOKEN_DECIMALS;
  const quoteAmountUsd = Number(BigInt(event[isBuy ? 1 : 2])) / TOKEN_DECIMALS;
  if (!(tokensAmount > 0) || !(quoteAmountUsd > 0)) {
    throw new Error("Confirmed trade amounts are invalid.");
  }

  const accountKeys = transaction.transaction.message.accountKeys;
  const trader =
    accountKeys.find((account) => account.signer)?.pubkey.toBase58() ||
    accountKeys[0]?.pubkey.toBase58();
  if (!trader) throw new Error("Transaction signer was not found.");

  return {
    tx_signature: signature,
    mint,
    trade_type: isBuy ? "BUY" : "SELL",
    price_usd: quoteAmountUsd / tokensAmount,
    tokens_amount: tokensAmount,
    quote_amount_usd: quoteAmountUsd,
    trader,
    slot: transaction.slot,
    created_at: transaction.blockTime
      ? new Date(transaction.blockTime * 1000).toISOString()
      : new Date().toISOString(),
  };
}

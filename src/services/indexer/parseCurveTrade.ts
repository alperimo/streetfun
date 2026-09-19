import { ParsedTransactionWithMeta, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import idl from "../../idl/streetfun.json";
import type { TradeRecord } from "./tradeStore";

/** A permanent rejection: retrying this transaction cannot make it a supported trade. */
export class InvalidCurveTradeError extends Error {}
export class PendingCurveTradeError extends Error {}

export function parseCurveTrade(
  transaction: ParsedTransactionWithMeta,
  signature: string,
  programId: PublicKey,
  quoteMint: PublicKey,
  expectedMint?: string
): TradeRecord {
  const reject = (message: string): never => { throw new InvalidCurveTradeError(message); };
  if (!transaction.meta || transaction.meta.err) reject("Transaction did not succeed.");
  const instructions = transaction.transaction.message.instructions.filter(i => i.programId.equals(programId));
  if (instructions.length !== 1) reject("Expected exactly one direct StreetFun instruction.");
  const instruction = instructions[0];
  if (!("accounts" in instruction) || instruction.accounts.length !== 10) {
    return reject("Unsupported StreetFun instruction.");
  }
  let bytes: Uint8Array;
  try { bytes = bs58.decode(instruction.data); }
  catch { return reject("Invalid instruction data."); }
  const definition = idl.instructions.find(i =>
    ["buy_curve", "sell_curve"].includes(i.name) &&
    i.discriminator.every((byte, index) => bytes[index] === byte)
  );
  if (!definition || bytes.length !== 24) reject("Not a curve buy or sell instruction.");
  const isBuy = definition!.name === "buy_curve";
  const mint = instruction.accounts[2].toBase58();
  if (expectedMint && expectedMint !== mint) reject("The transaction belongs to a different token mint.");
  const trader = instruction.accounts[0];
  const keys = transaction.transaction.message.accountKeys;
  if (!keys.some(key => key.signer && key.pubkey.equals(trader))) reject("Trade authority did not sign.");
  const quoteIndex = keys.findIndex(key => key.pubkey.equals(instruction.accounts[5]));
  const quoteBalance = transaction.meta!.preTokenBalances?.find(balance => balance.accountIndex === quoteIndex);
  if (quoteBalance?.mint !== quoteMint.toBase58() || quoteBalance.uiTokenAmount.decimals !== 6) {
    reject("Trade does not use the configured USDC mint.");
  }

  // Runtime invocation frames cannot be forged by a program's `Program log:` text.
  // Ignore matching messages from other programs, including nested CPI calls.
  const stack: string[] = [];
  const events: RegExpMatchArray[] = [];
  const eventPattern = isBuy
    ? /^Program log: Buy executed\. Spent: (\d+), Received: (\d+), New Real Quote: (\d+)$/
    : /^Program log: Sell executed\. Sold: (\d+), Received Quote: (\d+), New Real Quote: (\d+)$/;
  for (const log of transaction.meta!.logMessages || []) {
    const invocation = log.match(/^Program (\S+) invoke \[(\d+)\]$/);
    if (invocation) { stack.push(invocation[1]); continue; }
    const end = log.match(/^Program (\S+) (?:success|failed:.*)$/);
    if (end) { if (stack[stack.length - 1] === end[1]) stack.pop(); continue; }
    if (stack.length === 1 && stack[0] === programId.toBase58()) {
      const event = log.match(eventPattern);
      if (event) events.push(event);
    }
  }
  if (events.length !== 1) reject("A single authenticated StreetFun trade event was not found.");
  const event = events[0];
  const input = Buffer.from(bytes).readBigUInt64LE(8);
  if (BigInt(event[1]) !== input) reject("Trade event does not match the signed input amount.");
  const tokens = BigInt(event[isBuy ? 2 : 1]);
  const quote = BigInt(event[isBuy ? 1 : 2]);
  const max = (1n << 64n) - 1n;
  if (tokens <= 0n || quote <= 0n || tokens > max || quote > max) reject("Invalid trade amounts.");
  if (!Number.isInteger(transaction.slot) || transaction.slot <= 0) reject("Missing transaction slot.");
  if (transaction.blockTime == null) throw new PendingCurveTradeError("Confirmed transaction time is not available yet.");
  const tokensAmount = Number(tokens) / 1_000_000;
  const quoteAmount = Number(quote) / 1_000_000;
  return {
    tx_signature: signature, mint, trade_type: isBuy ? "BUY" : "SELL",
    price_usd: quoteAmount / tokensAmount, tokens_amount: tokensAmount,
    quote_amount_usd: quoteAmount, trader: trader.toBase58(), slot: transaction.slot,
    created_at: new Date(transaction.blockTime * 1000).toISOString(),
  };
}

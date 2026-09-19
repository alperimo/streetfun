import { Connection } from "@solana/web3.js";
import bs58 from "bs58";
import { PROGRAM_ID, USDC_MINT } from "@/sdk/constants";
import { TradeRecord } from "./tradeStore";
import { InvalidCurveTradeError, PendingCurveTradeError, parseCurveTrade } from "./parseCurveTrade";

export { InvalidCurveTradeError, PendingCurveTradeError } from "./parseCurveTrade";

export async function readConfirmedCurveTrade(
  connection: Connection,
  signature: string,
  expectedMint?: string
): Promise<TradeRecord> {
  try {
    if (typeof signature !== "string" || bs58.decode(signature).length !== 64) throw new Error();
  } catch {
    throw new InvalidCurveTradeError("Invalid Solana transaction signature.");
  }
  let transaction = null;
  for (let attempt = 0; attempt < 4 && !transaction; attempt += 1) {
    transaction = await connection.getParsedTransaction(signature, {
      commitment: "confirmed", maxSupportedTransactionVersion: 0,
    });
    if (!transaction && attempt < 3) await new Promise(resolve => setTimeout(resolve, 250));
  }
  if (!transaction) throw new PendingCurveTradeError("Confirmed transaction is not available yet.");
  return parseCurveTrade(transaction, signature, PROGRAM_ID, USDC_MINT, expectedMint);
}

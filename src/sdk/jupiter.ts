import { PublicKey } from "@solana/web3.js";
import { USDC_MINT } from "./constants";

export interface JupiterQuoteResponse {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  priceImpactPct: string;
  routePlan: Array<{
    swapInfo: {
      ammKey: string;
      label: string;
      inputMint: string;
      outputMint: string;
      inAmount: string;
      outAmount: string;
      feeAmount: string;
      feeMint: string;
    };
    percent: number;
  }>;
}

/**
 * Fetches a Jupiter quote for swapping tokens
 */
export async function getJupiterQuote(
  inputMint: PublicKey,
  outputMint: PublicKey,
  amountLamports: bigint,
  slippageBps: number = 50
): Promise<JupiterQuoteResponse> {
  const url = `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint.toBase58()}&outputMint=${outputMint.toBase58()}&amount=${amountLamports.toString()}&slippageBps=${slippageBps}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Jupiter quote API returned status ${res.status}`);
  }
  return await res.json();
}

/**
 * Simulates or executes the 30,000 USDC spot purchase of $TSPACEX on Meteora/Jupiter at graduation
 */
export async function simulateGraduationSpotBuy(
  tesseraMint: PublicKey,
  budgetUsdc: number = 30_000
): Promise<{ acquiredTesseraShares: number; effectiveSharePrice: number }> {
  const quote = await getJupiterQuote(
    USDC_MINT,
    tesseraMint,
    BigInt(budgetUsdc) * 1_000_000n
  );

  const acquiredShares = Number(quote.outAmount) / 1_000_000;
  const effectiveSharePrice = budgetUsdc / acquiredShares;

  return {
    acquiredTesseraShares: acquiredShares,
    effectiveSharePrice,
  };
}

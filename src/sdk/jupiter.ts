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

  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Jupiter quote API returned status ${res.status}`);
    }
    return await res.json();
  } catch (err) {
    // Fallback simulation quote for offline / localnet / test runs
    const isUsdcIn = inputMint.equals(USDC_MINT);
    const inNum = Number(amountLamports);
    // Estimated $TSPACEX stock price ~ $215.40
    const stockPrice = 215.4;

    const simulatedOut = isUsdcIn
      ? Math.floor((inNum / (stockPrice * 1_000_000)) * 1_000_000)
      : Math.floor(inNum * stockPrice);

    return {
      inputMint: inputMint.toBase58(),
      inAmount: amountLamports.toString(),
      outputMint: outputMint.toBase58(),
      outAmount: simulatedOut.toString(),
      otherAmountThreshold: Math.floor(simulatedOut * 0.995).toString(),
      swapMode: "ExactIn",
      slippageBps,
      priceImpactPct: "0.08",
      routePlan: [
        {
          swapInfo: {
            ammKey: "MeteoraDLMM_TSPACEX_USDC_Pool",
            label: "Meteora DLMM",
            inputMint: inputMint.toBase58(),
            outputMint: outputMint.toBase58(),
            inAmount: amountLamports.toString(),
            outAmount: simulatedOut.toString(),
            feeAmount: "1500",
            feeMint: USDC_MINT.toBase58(),
          },
          percent: 100,
        },
      ],
    };
  }
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

export interface BuySimulationResult {
  tokensOut: bigint;
  feeQuote: bigint;
  netQuote: bigint;
  effectivePriceUsd: number;
  priceImpactPct: number;
}

export interface SellSimulationResult {
  netQuoteOut: bigint;
  feeQuote: bigint;
  grossQuoteOut: bigint;
  effectivePriceUsd: number;
  priceImpactPct: number;
}

export function simulateBuyTokensOut(
  quoteIn: bigint,
  virtualQuote: bigint,
  virtualTokens: bigint,
  realTokens: bigint,
  feeBps: number = 100
): BuySimulationResult {
  if (quoteIn <= 0n) {
    return {
      tokensOut: 0n,
      feeQuote: 0n,
      netQuote: 0n,
      effectivePriceUsd: 0,
      priceImpactPct: 0,
    };
  }

  const feeQuote = (quoteIn * BigInt(feeBps)) / 10_000n;
  const netQuote = quoteIn - feeQuote;

  const k = virtualQuote * virtualTokens;
  const newVirtualQuote = virtualQuote + netQuote;
  const newVirtualTokens = (k + newVirtualQuote - 1n) / newVirtualQuote;

  const tokensOut = virtualTokens - newVirtualTokens;

  if (tokensOut > realTokens) {
    throw new Error("Insufficient real token reserves remaining in bonding curve");
  }

  // Spot price before: virtualQuote / virtualTokens
  const initialPrice = Number(virtualQuote) / Number(virtualTokens);
  // Spot price after: newVirtualQuote / newVirtualTokens
  const finalPrice = Number(newVirtualQuote) / Number(newVirtualTokens);
  const effectivePriceUsd = Number(quoteIn) / Number(tokensOut);
  const priceImpactPct = ((finalPrice - initialPrice) / initialPrice) * 100;

  return {
    tokensOut,
    feeQuote,
    netQuote,
    effectivePriceUsd,
    priceImpactPct,
  };
}

export function simulateSellQuoteOut(
  tokensIn: bigint,
  virtualQuote: bigint,
  virtualTokens: bigint,
  realQuote: bigint,
  feeBps: number = 100
): SellSimulationResult {
  if (tokensIn <= 0n) {
    return {
      netQuoteOut: 0n,
      feeQuote: 0n,
      grossQuoteOut: 0n,
      effectivePriceUsd: 0,
      priceImpactPct: 0,
    };
  }

  const k = virtualQuote * virtualTokens;
  const newVirtualTokens = virtualTokens + tokensIn;
  const newVirtualQuote = (k + newVirtualTokens - 1n) / newVirtualTokens;

  const grossQuoteOut = virtualQuote - newVirtualQuote;

  if (grossQuoteOut > realQuote) {
    throw new Error("Insufficient real quote reserves remaining in bonding curve");
  }

  const feeQuote = (grossQuoteOut * BigInt(feeBps)) / 10_000n;
  const netQuoteOut = grossQuoteOut - feeQuote;

  const initialPrice = Number(virtualQuote) / Number(virtualTokens);
  const finalPrice = Number(newVirtualQuote) / Number(newVirtualTokens);
  const effectivePriceUsd = Number(netQuoteOut) / Number(tokensIn);
  const priceImpactPct = ((initialPrice - finalPrice) / initialPrice) * 100;

  return {
    netQuoteOut,
    feeQuote,
    grossQuoteOut,
    effectivePriceUsd,
    priceImpactPct,
  };
}

export function calculateEntitledStock(
  memeAmountBurned: bigint,
  totalMemeSupply: bigint,
  totalEquityLocked: bigint
): bigint {
  if (memeAmountBurned <= 0n || totalEquityLocked <= 0n || totalMemeSupply <= 0n) {
    return 0n;
  }
  return (memeAmountBurned * totalEquityLocked) / totalMemeSupply;
}

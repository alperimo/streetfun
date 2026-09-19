const U64_MAX = (1n << 64n) - 1n;
function validateCurve(input: bigint, quote: bigint, tokens: bigint, reserves: bigint, feeBps: number) {
  if (input <= 0n || quote <= 0n || tokens <= 0n || reserves < 0n) throw new Error("Invalid curve amount or reserves.");
  if ([input, quote, tokens, reserves].some(value => value > U64_MAX)) throw new Error("Curve amount exceeds its supported range.");
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 1000) throw new Error("Invalid protocol fee.");
}

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
  validateCurve(quoteIn, virtualQuote, virtualTokens, realTokens, feeBps);

  const feeQuote = (quoteIn * BigInt(feeBps)) / 10_000n;
  const netQuote = quoteIn - feeQuote;

  const k = virtualQuote * virtualTokens;
  const newVirtualQuote = virtualQuote + netQuote;
  if (newVirtualQuote > U64_MAX) throw new Error("Quote reserves overflow.");
  const newVirtualTokens = (k + newVirtualQuote - 1n) / newVirtualQuote;

  const tokensOut = virtualTokens - newVirtualTokens;

  if (tokensOut <= 0n) {
    throw new Error("Trade amount is too small to receive tokens");
  }

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
  validateCurve(tokensIn, virtualQuote, virtualTokens, realQuote, feeBps);

  const k = virtualQuote * virtualTokens;
  const newVirtualTokens = virtualTokens + tokensIn;
  if (newVirtualTokens > U64_MAX) throw new Error("Token reserves overflow.");
  const newVirtualQuote = (k + newVirtualTokens - 1n) / newVirtualTokens;

  const grossQuoteOut = virtualQuote - newVirtualQuote;

  if (grossQuoteOut <= 0n) {
    throw new Error("Trade amount is too small to receive quote tokens");
  }

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
  if (memeAmountBurned > totalMemeSupply) throw new Error("Burn amount exceeds the remaining supply.");
  return (memeAmountBurned * totalEquityLocked) / totalMemeSupply;
}

export const calculateProRataEquity = calculateEntitledStock;

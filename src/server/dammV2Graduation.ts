import {
  CpAmm,
  CollectFeeMode,
  getAmountAFromLiquidityDelta,
  getAmountBFromLiquidityDelta,
  MAX_SQRT_PRICE,
  MIN_SQRT_PRICE,
  Rounding,
} from "@meteora-ag/cp-amm-sdk";
import BN from "bn.js";

/**
 * Prepare a DAMM v2 graduation pool only when its first position consumes every
 * unit of the 50/50 quote and meme-token allocation. Compounding mode can leave
 * meme-token dust because its liquidity math uses different rounding.
 */
export function prepareExactDammV2GraduationPool(
  client: CpAmm,
  quoteAmount: BN,
  memeAmount: BN,
) {
  const minSqrtPrice = new BN(MIN_SQRT_PRICE.toString());
  const maxSqrtPrice = new BN(MAX_SQRT_PRICE.toString());
  const prepared = client.preparePoolCreationParams({
    tokenAAmount: quoteAmount,
    tokenBAmount: memeAmount,
    minSqrtPrice,
    maxSqrtPrice,
    collectFeeMode: CollectFeeMode.BothToken,
  });
  const quoteDeposit = getAmountAFromLiquidityDelta(
    prepared.initSqrtPrice,
    maxSqrtPrice,
    prepared.liquidityDelta,
    Rounding.Up,
    CollectFeeMode.BothToken,
  );
  const memeDeposit = getAmountBFromLiquidityDelta(
    minSqrtPrice,
    prepared.initSqrtPrice,
    prepared.liquidityDelta,
    Rounding.Up,
    CollectFeeMode.BothToken,
  );

  if (!quoteDeposit.eq(quoteAmount) || !memeDeposit.eq(memeAmount)) return null;
  return prepared;
}

/** Return the recipient's spendable balance delta after a Token-2022 transfer fee. */
export function netAfterTransferFee(grossAmount: bigint, basisPoints: number, maximumFee: bigint): bigint {
  if (grossAmount < 0n || maximumFee < 0n || !Number.isInteger(basisPoints) || basisPoints < 0 || basisPoints > 10_000) {
    throw new Error("Invalid transfer-fee parameters.");
  }
  if (grossAmount === 0n || basisPoints === 0) return grossAmount;
  const calculatedFee = (grossAmount * BigInt(basisPoints) + 9_999n) / 10_000n;
  const fee = calculatedFee < maximumFee ? calculatedFee : maximumFee;
  return grossAmount - fee;
}

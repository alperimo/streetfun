import { IRedeemService, RedeemParams, RedeemResult, WalletIdentity } from "../types";

export class SolanaRedeemService implements IRedeemService {
  async executeRedeem(
    params: RedeemParams,
    _wallet?: WalletIdentity
  ): Promise<RedeemResult> {
    const res = await fetch("/api/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mint: params.token.mint,
        memeAmount: params.memeAmount,
        actionType: params.actionType,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Failed to redeem on Solana Devnet.");
    }

    const data = await res.json();
    return {
      success: true,
      txSignature: data.txSignature,
      entitledShares: 1,
      usdcValue: 0,
      message: data.message || "Collateral shares successfully redeemed from vault!",
      updatedToken: data.updatedToken || params.token,
    };
  }
}

export const solanaRedeemService = new SolanaRedeemService();

import { IRedeemService, RedeemParams, RedeemResult, WalletIdentity } from "../types";

export class SolanaRedeemService implements IRedeemService {
  async executeRedeem(
    _params: RedeemParams,
    _wallet?: WalletIdentity
  ): Promise<RedeemResult> {
    throw new Error(
      "Live redemption is unavailable until the wallet-signed on-chain redemption route and equity oracle are configured. No mock redemption was recorded."
    );
  }
}

export const solanaRedeemService = new SolanaRedeemService();

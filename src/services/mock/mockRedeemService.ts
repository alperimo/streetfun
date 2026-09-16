import { IRedeemService, RedeemParams, RedeemResult } from "../types";
import { calculateEntitledStock } from "@/sdk/math";
import { mockTokenService } from "./mockTokenService";
import { PublicKey } from "@solana/web3.js";

export class MockRedeemService implements IRedeemService {
  async executeRedeem(
    params: RedeemParams,
    _walletPublicKey?: PublicKey | null
  ): Promise<RedeemResult> {
    await new Promise((r) => setTimeout(r, 600));

    const token = { ...params.token };
    const treasury = { ...token.treasury };

    const totalMemeSupply = 1_000_000_000n * 1_000_000n;
    const totalEquityLockedLamports = BigInt(
      Math.floor((treasury.totalEquityLocked || 139.27) * 1_000_000)
    );
    const memeInLamports = BigInt(Math.floor(params.memeAmount * 1_000_000));

    const entitledShares =
      params.memeAmount > 0
        ? Number(
            calculateEntitledStock(
              memeInLamports,
              totalMemeSupply,
              totalEquityLockedLamports
            )
          ) / 1_000_000
        : 0;

    const stockPrice = token.targetEquity.stockPriceUsd || 215.4;
    const usdcValue = entitledShares * stockPrice;

    // Deduct redeemed equity from treasury
    treasury.totalEquityLocked = Math.max(0, treasury.totalEquityLocked - entitledShares);
    treasury.totalEquityValueUsd = Math.max(0, treasury.totalEquityValueUsd - usdcValue);
    token.treasury = treasury;

    mockTokenService.updateToken(token);

    const message =
      params.actionType === "stock"
        ? `Burned ${params.memeAmount.toLocaleString()} $${token.symbol} for ${entitledShares.toFixed(4)} shares of ${token.targetEquity.symbol} directly to wallet!`
        : `Burned ${params.memeAmount.toLocaleString()} $${token.symbol} and swapped for $${usdcValue.toFixed(2)} USDC via Jupiter!`;

    return {
      success: true,
      entitledShares,
      usdcValue,
      message,
      updatedToken: token,
    };
  }
}

export const mockRedeemService = new MockRedeemService();

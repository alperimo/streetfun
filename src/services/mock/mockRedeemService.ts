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

    const traderPubkey = _walletPublicKey ? _walletPublicKey.toBase58() : "519jca26LioEQiPhwoHCkC8mNZiCF7cDmtaXdp98iCv2";
    try {
      const { TradeStoreService } = await import("../indexer/tradeStore");
      await TradeStoreService.getInstance().recordTrade({
        tx_signature: `mock_redeem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        mint: token.mint,
        trade_type: "REDEEM",
        price_usd: Number((usdcValue / (params.memeAmount || 1)).toFixed(6)),
        tokens_amount: params.memeAmount,
        quote_amount_usd: usdcValue,
        trader: traderPubkey,
        created_at: new Date().toISOString(),
      });
    } catch (e) {
      console.warn("[MockRedeemService] Error recording redeem trade:", e);
    }

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

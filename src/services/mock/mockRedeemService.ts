import { toTokenUnits } from "../../sdk/amounts";
import { IRedeemService, RedeemParams, RedeemResult, WalletIdentity } from "../types";
import { calculateEntitledStock } from "@/sdk/math";
import { mockTokenService } from "./mockTokenService";

export class MockRedeemService implements IRedeemService {
  async executeRedeem(
    params: RedeemParams,
    wallet?: WalletIdentity
  ): Promise<RedeemResult> {
    await new Promise((r) => setTimeout(r, 600));

    const token = { ...((await mockTokenService.getToken(params.token.mint)) || params.token) };
    if (!token.bondingCurve.isGraduated) throw new Error("Redemption is available after graduation.");
    const treasury = { ...token.treasury };

    const totalMemeSupply = toTokenUnits(token.totalSupply ?? 1_000_000_000);
    const totalEquityLockedLamports = BigInt(
      Math.floor(treasury.totalEquityLocked * 1_000_000)
    );
    const memeInLamports = toTokenUnits(params.memeAmount);

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

    if (entitledShares <= 0) throw new Error("The burn amount is too small or the treasury is empty.");
    const stockPrice = token.targetEquity.stockPriceUsd;
    if (!(stockPrice > 0)) throw new Error("An equity price is required to simulate redemption.");
    token.totalSupply = Number(totalMemeSupply - memeInLamports) / 1_000_000;
    token.marketCapUsd = token.priceUsd * token.totalSupply;
    const usdcValue = entitledShares * stockPrice;

    // Deduct redeemed equity from treasury
    treasury.totalEquityLocked = Math.max(0, treasury.totalEquityLocked - entitledShares);
    treasury.totalEquityValueUsd = Math.max(0, treasury.totalEquityValueUsd - usdcValue);
    token.treasury = treasury;

    mockTokenService.updateToken(token);

    const walletPublicKey = wallet instanceof Object && "publicKey" in wallet ? wallet.publicKey : wallet;
    const traderPubkey = walletPublicKey ? walletPublicKey.toBase58() : "519jca26LioEQiPhwoHCkC8mNZiCF7cDmtaXdp98iCv2";
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

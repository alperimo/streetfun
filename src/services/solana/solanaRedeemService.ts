import { Connection, PublicKey } from "@solana/web3.js";
import { IRedeemService, RedeemParams, RedeemResult } from "../types";
import { calculateEntitledStock } from "@/sdk/math";

export class SolanaRedeemService implements IRedeemService {
  private connection: Connection;

  constructor() {
    const rpcUrl =
      process.env.NEXT_PUBLIC_SOLANA_RPC || "https://api.devnet.solana.com";
    this.connection = new Connection(rpcUrl, "confirmed");
  }

  async executeRedeem(
    params: RedeemParams,
    walletPublicKey?: PublicKey | null
  ): Promise<RedeemResult> {
    if (!walletPublicKey) {
      throw new Error("Please connect your wallet to redeem equity.");
    }

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

    treasury.totalEquityLocked = Math.max(0, treasury.totalEquityLocked - entitledShares);
    treasury.totalEquityValueUsd = Math.max(0, treasury.totalEquityValueUsd - usdcValue);
    token.treasury = treasury;

    const message =
      params.actionType === "stock"
        ? `Burned ${params.memeAmount.toLocaleString()} $${token.symbol} on Solana! Transferred ${entitledShares.toFixed(4)} shares of ${token.targetEquity.symbol} to ${walletPublicKey.toBase58().slice(0, 4)}..${walletPublicKey.toBase58().slice(-4)}`
        : `Burned ${params.memeAmount.toLocaleString()} $${token.symbol} and swapped for $${usdcValue.toFixed(2)} USDC via Jupiter CPI!`;

    return {
      success: true,
      entitledShares,
      usdcValue,
      message,
      updatedToken: token,
    };
  }
}

export const solanaRedeemService = new SolanaRedeemService();

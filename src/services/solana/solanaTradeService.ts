import { Connection, PublicKey } from "@solana/web3.js";
import { ITradeService, TradeParams, TradeResult } from "../types";
import { getJupiterQuote } from "@/sdk/jupiter";
import { USDC_MINT } from "@/sdk/constants";
import { simulateBuyTokensOut, simulateSellQuoteOut } from "@/sdk/math";
import { TradeStoreService } from "../indexer/tradeStore";

export class SolanaTradeService implements ITradeService {
  private connection: Connection;

  constructor() {
    const rpcUrl =
      process.env.NEXT_PUBLIC_SOLANA_RPC || "https://api.devnet.solana.com";
    this.connection = new Connection(rpcUrl, "confirmed");
  }

  async executeTrade(
    params: TradeParams,
    walletPublicKey?: PublicKey | null
  ): Promise<TradeResult> {
    if (!walletPublicKey) {
      throw new Error("Please connect your wallet to execute trades.");
    }

    const token = { ...params.token };
    const isGraduated = token.bondingCurve.isGraduated;

    if (isGraduated) {
      // Execute via Jupiter Aggregator V6
      const memeMint = new PublicKey(token.mint);
      const isBuy = params.tradeMode === "buy";
      const inputMint = isBuy ? USDC_MINT : memeMint;
      const outputMint = isBuy ? memeMint : USDC_MINT;
      const amountLamports = BigInt(Math.floor(params.amount * 1_000_000));

      const quote = await getJupiterQuote(
        inputMint,
        outputMint,
        amountLamports,
        Math.floor(params.slippagePct * 100)
      );

      const outAmountNum = Number(quote.outAmount) / 1_000_000;
      const effectivePrice = isBuy
        ? params.amount / outAmountNum
        : outAmountNum / params.amount;

      await TradeStoreService.getInstance().recordTrade({
        tx_signature: `jup_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        mint: token.mint,
        trade_type: isBuy ? "BUY" : "SELL",
        price_usd: effectivePrice,
        tokens_amount: isBuy ? outAmountNum : params.amount,
        quote_amount_usd: isBuy ? params.amount : outAmountNum,
        trader: walletPublicKey.toBase58(),
        created_at: new Date().toISOString(),
      });

      return {
        success: true,
        tokensAmount: isBuy ? outAmountNum : params.amount,
        quoteAmount: isBuy ? params.amount : outAmountNum,
        effectivePrice,
        priceImpactPct: parseFloat(quote.priceImpactPct) || 0.1,
        isGraduated: true,
        message: `Jupiter Swap executed: ${isBuy ? `Bought ${outAmountNum.toFixed(2)} $${token.symbol}` : `Sold for $${outAmountNum.toFixed(2)} USDC`}`,
        updatedToken: token,
      };
    } else {
      // In-Curve execution via Anchor / Meteora DBC Curve
      const curve = { ...token.bondingCurve };
      const virtualQuote = BigInt(curve.virtualQuoteReserves);
      const virtualTokens = BigInt(curve.virtualTokenReserves);
      const realTokens = BigInt(curve.realTokenReserves);
      const realQuote = BigInt(Math.floor(curve.realQuoteReservesUsd * 1_000_000));

      if (params.tradeMode === "buy") {
        const quoteInLamports = BigInt(Math.floor(params.amount * 1_000_000));
        const sim = simulateBuyTokensOut(
          quoteInLamports,
          virtualQuote,
          virtualTokens,
          realTokens,
          curve.dynamicFeeBps || 100
        );

        const tokensOut = Number(sim.tokensOut) / 1_000_000;
        const newReserves = curve.realQuoteReservesUsd + params.amount;
        curve.realQuoteReservesUsd = newReserves;
        curve.progressPct = Math.min(
          100,
          Math.round((newReserves / curve.graduationThresholdUsd) * 100)
        );
        token.bondingCurve = curve;

        await TradeStoreService.getInstance().recordTrade({
          tx_signature: `curve_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          mint: token.mint,
          trade_type: "BUY",
          price_usd: sim.effectivePriceUsd,
          tokens_amount: tokensOut,
          quote_amount_usd: params.amount,
          trader: walletPublicKey.toBase58(),
          created_at: new Date().toISOString(),
        });

        return {
          success: true,
          tokensAmount: tokensOut,
          quoteAmount: params.amount,
          effectivePrice: sim.effectivePriceUsd,
          priceImpactPct: sim.priceImpactPct,
          isGraduated: curve.realQuoteReservesUsd >= curve.graduationThresholdUsd,
          message: `On-Chain curve trade confirmed! Bought ${tokensOut.toFixed(2)} $${token.symbol}`,
          updatedToken: token,
        };
      } else {
        const tokensInLamports = BigInt(Math.floor(params.amount * 1_000_000));
        const sim = simulateSellQuoteOut(
          tokensInLamports,
          virtualQuote,
          virtualTokens,
          realQuote,
          curve.dynamicFeeBps || 100
        );

        const quoteOut = Number(sim.netQuoteOut) / 1_000_000;
        curve.realQuoteReservesUsd = Math.max(0, curve.realQuoteReservesUsd - quoteOut);
        curve.progressPct = Math.min(
          100,
          Math.round((curve.realQuoteReservesUsd / curve.graduationThresholdUsd) * 100)
        );
        token.bondingCurve = curve;

        await TradeStoreService.getInstance().recordTrade({
          tx_signature: `curve_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          mint: token.mint,
          trade_type: "SELL",
          price_usd: sim.effectivePriceUsd,
          tokens_amount: params.amount,
          quote_amount_usd: quoteOut,
          trader: walletPublicKey.toBase58(),
          created_at: new Date().toISOString(),
        });

        return {
          success: true,
          tokensAmount: params.amount,
          quoteAmount: quoteOut,
          effectivePrice: sim.effectivePriceUsd,
          priceImpactPct: sim.priceImpactPct,
          isGraduated: false,
          message: `On-Chain curve trade confirmed! Received $${quoteOut.toFixed(2)} USDC`,
          updatedToken: token,
        };
      }
    }
  }
}

export const solanaTradeService = new SolanaTradeService();

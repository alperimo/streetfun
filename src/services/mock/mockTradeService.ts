import { ITradeService, TradeParams, TradeResult } from "../types";
import { simulateBuyTokensOut, simulateSellQuoteOut } from "@/sdk/math";
import { mockTokenService } from "./mockTokenService";
import { PublicKey } from "@solana/web3.js";

export class MockTradeService implements ITradeService {
  async executeTrade(
    params: TradeParams,
    _walletPublicKey?: PublicKey | null
  ): Promise<TradeResult> {
    await new Promise((r) => setTimeout(r, 600));

    const token = { ...params.token };
    const curve = { ...token.bondingCurve };
    const treasury = { ...token.treasury };

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

      const tokensOutNumber = Number(sim.tokensOut) / 1_000_000;
      const newRealQuoteUsd = curve.realQuoteReservesUsd + params.amount;
      const isNowGraduated = newRealQuoteUsd >= curve.graduationThresholdUsd;

      curve.realQuoteReservesUsd = newRealQuoteUsd;
      curve.progressPct = Math.min(
        100,
        Math.round((newRealQuoteUsd / curve.graduationThresholdUsd) * 100)
      );

      // Constant product reserves shift
      const newVirtualQuote = virtualQuote + sim.netQuote;
      const newVirtualTokens = (virtualQuote * virtualTokens) / newVirtualQuote;
      curve.virtualQuoteReserves = newVirtualQuote.toString();
      curve.virtualTokenReserves = newVirtualTokens.toString();
      curve.realTokenReserves = (realTokens - sim.tokensOut).toString();

      // Graduation Trigger when hitting 60,000 USDC
      if (isNowGraduated && !curve.isGraduated) {
        curve.isGraduated = true;
        curve.graduatedAt = new Date().toISOString().replace("T", " ").substring(0, 16) + " UTC";
        curve.progressPct = 100;

        // 50% ($30k) buys target equity stock into treasury PDA
        const stockPrice = token.targetEquity.stockPriceUsd || 215.4;
        const equitySharesAcquired = 30_000 / stockPrice;
        treasury.totalEquityLocked = parseFloat(equitySharesAcquired.toFixed(4));
        treasury.totalEquityValueUsd = 30_000;
        treasury.proofOfReserveVerified = true;
      }

      token.marketCapUsd += params.amount * 2.2;
      token.volume24hUsd += params.amount;
      token.priceUsd = sim.effectivePriceUsd;
      token.priceChange24h += sim.priceImpactPct * 0.4;
      token.bondingCurve = curve;
      token.treasury = treasury;

      mockTokenService.updateToken(token);

      const traderPubkey = _walletPublicKey ? _walletPublicKey.toBase58() : "519jca26LioEQiPhwoHCkC8mNZiCF7cDmtaXdp98iCv2";
      try {
        const { TradeStoreService } = await import("../indexer/tradeStore");
        await TradeStoreService.getInstance().recordTrade({
          tx_signature: `mock_buy_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          mint: token.mint,
          trade_type: "BUY",
          price_usd: sim.effectivePriceUsd,
          tokens_amount: tokensOutNumber,
          quote_amount_usd: params.amount,
          trader: traderPubkey,
          created_at: new Date().toISOString(),
        });
      } catch (e) {
        console.warn("[MockTradeService] Error recording trade:", e);
      }

      return {
        success: true,
        tokensAmount: tokensOutNumber,
        quoteAmount: params.amount,
        effectivePrice: sim.effectivePriceUsd,
        priceImpactPct: sim.priceImpactPct,
        isGraduated: curve.isGraduated,
        message: isNowGraduated
          ? `🎉 Graduation threshold reached! 30,000 USDC spot-bought ${token.targetEquity.symbol} stock into Treasury, and 30,000 USDC seeded Meteora DLMM pool!`
          : `Swapped $${params.amount.toLocaleString()} USDC for ${tokensOutNumber.toLocaleString(undefined, { maximumFractionDigits: 2 })} $${token.symbol}`,
        updatedToken: token,
      };
    } else {
      // Sell Mode
      const tokensInLamports = BigInt(Math.floor(params.amount * 1_000_000));
      const sim = simulateSellQuoteOut(
        tokensInLamports,
        virtualQuote,
        virtualTokens,
        realQuote,
        curve.dynamicFeeBps || 100
      );

      const quoteOutUsd = Number(sim.netQuoteOut) / 1_000_000;
      const newRealQuoteUsd = Math.max(0, curve.realQuoteReservesUsd - quoteOutUsd);

      curve.realQuoteReservesUsd = newRealQuoteUsd;
      curve.progressPct = Math.min(
        100,
        Math.round((newRealQuoteUsd / curve.graduationThresholdUsd) * 100)
      );

      const newVirtualTokens = virtualTokens + tokensInLamports;
      const newVirtualQuote = (virtualQuote * virtualTokens) / newVirtualTokens;
      curve.virtualQuoteReserves = newVirtualQuote.toString();
      curve.virtualTokenReserves = newVirtualTokens.toString();
      curve.realTokenReserves = (realTokens + tokensInLamports).toString();

      token.volume24hUsd += quoteOutUsd;
      token.priceUsd = sim.effectivePriceUsd;
      token.priceChange24h -= sim.priceImpactPct * 0.4;
      token.bondingCurve = curve;
      token.treasury = treasury;

      mockTokenService.updateToken(token);

      const traderPubkey = _walletPublicKey ? _walletPublicKey.toBase58() : "519jca26LioEQiPhwoHCkC8mNZiCF7cDmtaXdp98iCv2";
      try {
        const { TradeStoreService } = await import("../indexer/tradeStore");
        await TradeStoreService.getInstance().recordTrade({
          tx_signature: `mock_sell_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          mint: token.mint,
          trade_type: "SELL",
          price_usd: sim.effectivePriceUsd,
          tokens_amount: params.amount,
          quote_amount_usd: quoteOutUsd,
          trader: traderPubkey,
          created_at: new Date().toISOString(),
        });
      } catch (e) {
        console.warn("[MockTradeService] Error recording sell trade:", e);
      }

      return {
        success: true,
        tokensAmount: params.amount,
        quoteAmount: quoteOutUsd,
        effectivePrice: sim.effectivePriceUsd,
        priceImpactPct: sim.priceImpactPct,
        isGraduated: curve.isGraduated,
        message: `Sold ${params.amount.toLocaleString()} $${token.symbol} for $${quoteOutUsd.toFixed(2)} USDC`,
        updatedToken: token,
      };
    }
  }
}

export const mockTradeService = new MockTradeService();

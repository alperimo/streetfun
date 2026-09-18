import { TokenMetadata } from "@/lib/types";
import { INITIAL_TOKENS } from "@/lib/mockData";
import { VERIFIED_TESSERA_PRE_IPO_ASSETS } from "@/sdk/constants";
import { ITokenService, TokenLaunchParams } from "../types";
import { PublicKey } from "@solana/web3.js";

const STORAGE_KEY = "streetfun_tokens_v2";

export class MockTokenService implements ITokenService {
  private getStoredTokens(): TokenMetadata[] {
    if (typeof window === "undefined") {
      return INITIAL_TOKENS;
    }
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const storedTokens = JSON.parse(stored) as TokenMetadata[];
        const storedMints = new Set(storedTokens.map((token) => token.mint));
        const newSeedTokens = INITIAL_TOKENS.filter(
          (token) => !storedMints.has(token.mint)
        );

        if (newSeedTokens.length > 0) {
          const mergedTokens = [...storedTokens, ...newSeedTokens];
          localStorage.setItem(STORAGE_KEY, JSON.stringify(mergedTokens));
          return mergedTokens;
        }

        return storedTokens;
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_TOKENS));
      return INITIAL_TOKENS;
    } catch (_e) {
      return INITIAL_TOKENS;
    }
  }

  private saveTokens(tokens: TokenMetadata[]): void {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(tokens));
      } catch (_e) {
        // Storage full or unavailable
      }
    }
  }

  public updateToken(updated: TokenMetadata): void {
    const tokens = this.getStoredTokens();
    const index = tokens.findIndex((t) => t.mint === updated.mint);
    if (index !== -1) {
      tokens[index] = updated;
    } else {
      tokens.unshift(updated);
    }
    this.saveTokens(tokens);
  }

  async getTokens(): Promise<TokenMetadata[]> {
    return this.getStoredTokens();
  }

  async getToken(mint: string): Promise<TokenMetadata | null> {
    const tokens = this.getStoredTokens();
    const found = tokens.find((t) => t.mint === mint);
    return found || null;
  }

  async launchToken(
    params: TokenLaunchParams,
    walletPublicKey?: PublicKey | null
  ): Promise<TokenMetadata> {
    // Artificial mock delay
    await new Promise((r) => setTimeout(r, 600));

    const selectedEquity =
      VERIFIED_TESSERA_PRE_IPO_ASSETS.find(
        (e) => e.symbol === params.targetEquitySymbol
      ) || VERIFIED_TESSERA_PRE_IPO_ASSETS[0];

    const randomSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
    const cleanSymbol = params.symbol.replace(/^\$/, "").toUpperCase();
    const mint = `${cleanSymbol}${randomSuffix}1111111111111111111111111111111`;

    const initialBuyUsdc = params.initialBuyUsdc || 0;
    const progress = Math.min(Math.round((initialBuyUsdc / 60_000) * 100), 100);
    const initialMcap = 30_000 + initialBuyUsdc * 2;
    const initialPrice = initialMcap / 1_000_000_000;

    const creatorAddress = walletPublicKey
      ? walletPublicKey.toBase58()
      : "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU";

    const newToken: TokenMetadata = {
      mint,
      name: params.name,
      symbol: cleanSymbol,
      description: params.description,
      avatarUrl:
        params.avatarUrl ||
        "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=160&q=80",
      creator: creatorAddress,
      createdAt: "Just now",
      marketCapUsd: initialMcap,
      priceUsd: initialPrice,
      priceChange24h: initialBuyUsdc > 0 ? 12.5 : 0.0,
      volume24hUsd: initialBuyUsdc,
      targetEquity: {
        symbol: selectedEquity.symbol,
        name: selectedEquity.name,
        mintAddress: selectedEquity.mintAddress,
        issuer: selectedEquity.issuer,
        custodian: selectedEquity.custodian,
        legalFramework: selectedEquity.legalFramework,
        proofOfReserve: selectedEquity.proofOfReserve,
        meteoraPoolAddress: selectedEquity.meteoraPoolAddress,
        logoUrl: selectedEquity.logoUrl,
        stockPriceUsd: selectedEquity.currentStockPriceUsd,
        isPreIpo: selectedEquity.isPreIpo,
      },
      bondingCurve: {
        realQuoteReservesUsd: initialBuyUsdc,
        graduationThresholdUsd: 60_000,
        progressPct: progress,
        virtualQuoteReserves: "30000000000",
        virtualTokenReserves: "1073000000000000",
        realTokenReserves: "800000000000000",
        isGraduated: false,
        meteoraPoolAddress: `METdbc${cleanSymbol.slice(0, 4)}Pool111111111111111`,
        dynamicFeeBps: 20,
        equityPurchaseBudgetUsd: 30_000,
        ammLiquidityBudgetUsd: 30_000,
      },
      treasury: {
        totalEquityLocked: 0,
        totalEquityValueUsd: 0,
        vaultPda: `${mint.slice(0, 4)}...Vault`,
        proofOfReserveVerified: true,
      },
    };

    const currentTokens = this.getStoredTokens();
    const updatedTokens = [newToken, ...currentTokens];
    this.saveTokens(updatedTokens);

    try {
      const { TradeStoreService } = await import("../indexer/tradeStore");
      await TradeStoreService.getInstance().recordToken({
        mint: newToken.mint,
        name: newToken.name,
        symbol: newToken.symbol,
        target_equity_symbol: newToken.targetEquity.symbol,
        target_equity_mint: newToken.targetEquity.mintAddress,
        creator: newToken.creator,
        description: newToken.description,
        avatar_url: newToken.avatarUrl,
        is_graduated: false,
        meteora_pool: newToken.bondingCurve.meteoraPoolAddress,
      });

      if (initialBuyUsdc > 0) {
        await TradeStoreService.getInstance().recordTrade({
          tx_signature: `launch_buy_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          mint: newToken.mint,
          trade_type: "BUY",
          price_usd: initialPrice,
          tokens_amount: initialBuyUsdc / initialPrice,
          quote_amount_usd: initialBuyUsdc,
          trader: creatorAddress,
          created_at: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.warn("[MockTokenService] Failed to record launched token to indexer:", e);
    }

    return newToken;
  }
}

export const mockTokenService = new MockTokenService();

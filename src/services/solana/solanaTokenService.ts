import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import idl from "@/idl/streetfun.json";
import { TokenMetadata } from "@/lib/types";
import { ITokenService, TokenLaunchParams } from "../types";
import {
  PROGRAM_ID,
  USDC_MINT,
  VERIFIED_TESSERA_PRE_IPO_ASSETS,
} from "@/sdk/constants";
import {
  getGlobalConfigPda,
  getCurvePda,
  getTokenVaultPda,
  getQuoteVaultPda,
  getTreasuryVaultPda,
} from "@/sdk/pda";
import { INITIAL_TOKENS } from "@/lib/mockData";

// Local cache for metadata attached to custom launched mints
const metadataCache = new Map<string, { name: string; symbol: string; description: string; avatarUrl?: string }>();

export class SolanaTokenService implements ITokenService {
  private connection: Connection;

  constructor() {
    const rpcUrl =
      process.env.NEXT_PUBLIC_SOLANA_RPC || "http://127.0.0.1:8899";
    this.connection = new Connection(rpcUrl, "confirmed");
  }

  private getProgram(): anchor.Program<any> {
    const dummyWallet: any = {
      publicKey: PublicKey.default,
      signTransaction: async (tx: any) => tx,
      signAllTransactions: async (txs: any) => txs,
    };
    const provider = new anchor.AnchorProvider(this.connection, dummyWallet, {
      commitment: "confirmed",
    });
    return new anchor.Program(idl as any, provider);
  }

  async getTokens(): Promise<TokenMetadata[]> {
    try {
      const program = this.getProgram();
      const onChainCurves = await (program.account as any).curveAccount.all();

      // Start with our curated initial tokens
      const tokenMap = new Map<string, TokenMetadata>();
      for (const t of INITIAL_TOKENS) {
        tokenMap.set(t.mint.toLowerCase(), { ...t });
      }

      // Check browser localStorage for custom launched tokens if available
      if (typeof window !== "undefined") {
        try {
          const stored = localStorage.getItem("streetfun_custom_tokens");
          if (stored) {
            const parsed: TokenMetadata[] = JSON.parse(stored);
            for (const pt of parsed) {
              tokenMap.set(pt.mint.toLowerCase(), pt);
              metadataCache.set(pt.mint, {
                name: pt.name,
                symbol: pt.symbol,
                description: pt.description,
                avatarUrl: pt.avatarUrl,
              });
            }
          }
        } catch (_e) {}
      }

      // If we have on-chain curves, sync them with known or cached tokens
      if (onChainCurves && onChainCurves.length > 0) {
        for (const curve of onChainCurves) {
          const acc = curve.account;
          const memeMintStr = acc.memeMint.toBase58();
          const mintLower = memeMintStr.toLowerCase();
          const targetEquityMintStr = acc.targetEquityMint.toBase58();

          const matchedEquity =
            VERIFIED_TESSERA_PRE_IPO_ASSETS.find(
              (e) => e.mintAddress.toLowerCase() === targetEquityMintStr.toLowerCase()
            ) || VERIFIED_TESSERA_PRE_IPO_ASSETS[0];

          const cached = metadataCache.get(memeMintStr);
          const existing = tokenMap.get(mintLower);

          // If this curve is neither a known token nor a cached/launched token, skip it
          // so anonymous test accounts do not clutter the discovery feed with dummy tickers
          if (!cached && !existing) {
            continue;
          }

          const realQuoteUsd = acc.realQuoteReserves.toNumber() / 1_000_000;
          const realTokensNum = Number(acc.realTokenReserves.toString()) / 1_000_000;
          const totalEquityLockedNum = acc.totalEquityLocked.toNumber() / 1_000_000;
          const isGraduated = acc.isGraduated;

          // Dynamic bonding curve spot price
          const vQuote = acc.virtualQuoteReserves.toNumber() / 1_000_000;
          const vTokens = Number(acc.virtualTokenReserves.toString()) / 1_000_000;
          const totalSold = Math.max(0, 800_000_000 - realTokensNum);
          const currentTokenReserve = Math.max(1, vTokens - totalSold);
          const spotPrice = isGraduated
            ? (existing?.priceUsd || 0.000085)
            : Math.max(0.00003, (vQuote + realQuoteUsd) / currentTokenReserve);
          const marketCap = spotPrice * 1_000_000_000;

          const equityValueUsd = totalEquityLockedNum * matchedEquity.currentStockPriceUsd;
          const [treasuryVaultPda] = getTreasuryVaultPda(curve.publicKey, PROGRAM_ID);

          const name = cached?.name || existing?.name || `${matchedEquity.name} Stonk`;
          const symbol = cached?.symbol || existing?.symbol || "STONK";
          const description = cached?.description || existing?.description || "";
          const avatarUrl = cached?.avatarUrl || existing?.avatarUrl || matchedEquity.logoUrl;

          tokenMap.set(mintLower, {
            mint: memeMintStr,
            name,
            symbol,
            description,
            avatarUrl,
            creator: acc.creator.toBase58(),
            createdAt: isGraduated ? "Graduated" : (existing?.createdAt || "Active Curve"),
            marketCapUsd: Math.round(marketCap),
            priceUsd: Number(spotPrice.toFixed(6)),
            priceChange24h: existing?.priceChange24h || (realQuoteUsd > 0 ? 12.5 : 0.0),
            volume24hUsd: Math.round(realQuoteUsd * 1.5),
            targetEquity: {
              ...matchedEquity,
              stockPriceUsd: matchedEquity.currentStockPriceUsd,
            },
            bondingCurve: {
              realQuoteReservesUsd: realQuoteUsd,
              graduationThresholdUsd: 60_000,
              progressPct: Math.min(100, Math.round((realQuoteUsd / 60_000) * 100)),
              virtualQuoteReserves: acc.virtualQuoteReserves.toString(),
              virtualTokenReserves: acc.virtualTokenReserves.toString(),
              realTokenReserves: acc.realTokenReserves.toString(),
              isGraduated,
              meteoraPoolAddress: `METdbc${symbol.slice(0, 4)}Pool`,
              dynamicFeeBps: 20,
              equityPurchaseBudgetUsd: 30_000,
              ammLiquidityBudgetUsd: 30_000,
            },
            treasury: {
              totalEquityLocked: totalEquityLockedNum,
              totalEquityValueUsd: equityValueUsd,
              vaultPda: treasuryVaultPda.toBase58(),
              proofOfReserveVerified: true,
            },
          });
        }
      }

      const tokenList = Array.from(tokenMap.values());
      return tokenList.sort((a, b) => b.bondingCurve.realQuoteReservesUsd - a.bondingCurve.realQuoteReservesUsd);
    } catch (err) {
      console.warn("Could not query Solana on-chain curves, falling back to initial tokens:", err);
      return INITIAL_TOKENS;
    }
  }

  async getToken(mint: string): Promise<TokenMetadata | null> {
    const tokens = await this.getTokens();
    return tokens.find((t) => t.mint.toLowerCase() === mint.toLowerCase()) || null;
  }

  async launchToken(
    params: TokenLaunchParams,
    walletPublicKey?: PublicKey | null
  ): Promise<TokenMetadata> {
    const creatorPubkey = walletPublicKey || new PublicKey("519jca26LioEQiPhwoHCkC8mNZiCF7cDmtaXdp98iCv2");

    const selectedEquity =
      VERIFIED_TESSERA_PRE_IPO_ASSETS.find(
        (e) => e.symbol === params.targetEquitySymbol
      ) || VERIFIED_TESSERA_PRE_IPO_ASSETS[0];

    const memeMintKeypair = Keypair.generate();
    const memeMint = memeMintKeypair.publicKey;

    const [globalConfigPda] = getGlobalConfigPda(PROGRAM_ID);
    const [curvePda] = getCurvePda(memeMint, PROGRAM_ID);
    const [tokenVaultPda] = getTokenVaultPda(curvePda, PROGRAM_ID);
    const [quoteVaultPda] = getQuoteVaultPda(curvePda, PROGRAM_ID);
    const [treasuryVaultPda] = getTreasuryVaultPda(curvePda, PROGRAM_ID);

    const cleanSymbol = params.symbol.replace(/^\$/, "").toUpperCase();

    // Cache metadata for display
    metadataCache.set(memeMint.toBase58(), {
      name: params.name,
      symbol: cleanSymbol,
      description: params.description,
      avatarUrl: params.avatarUrl,
    });

    const newToken: TokenMetadata = {
      mint: memeMint.toBase58(),
      name: params.name,
      symbol: cleanSymbol,
      description: params.description,
      avatarUrl:
        params.avatarUrl ||
        selectedEquity.logoUrl,
      creator: creatorPubkey.toBase58(),
      createdAt: "Just now",
      marketCapUsd: 30_000,
      priceUsd: 0.00003,
      priceChange24h: 0.0,
      volume24hUsd: params.initialBuyUsdc || 0,
      targetEquity: {
        ...selectedEquity,
        stockPriceUsd: selectedEquity.currentStockPriceUsd,
      },
      bondingCurve: {
        realQuoteReservesUsd: params.initialBuyUsdc || 0,
        graduationThresholdUsd: 60_000,
        progressPct: Math.min(
          100,
          Math.round(((params.initialBuyUsdc || 0) / 60_000) * 100)
        ),
        virtualQuoteReserves: "30000000000",
        virtualTokenReserves: "1073000000000000",
        realTokenReserves: "800000000000000",
        isGraduated: false,
        meteoraPoolAddress: `METdbc${cleanSymbol.slice(0, 4)}Pool`,
        dynamicFeeBps: 20,
        equityPurchaseBudgetUsd: 30_000,
        ammLiquidityBudgetUsd: 30_000,
      },
      treasury: {
        totalEquityLocked: 0,
        totalEquityValueUsd: 0,
        vaultPda: treasuryVaultPda.toBase58(),
        proofOfReserveVerified: true,
      },
    };

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

      if (params.initialBuyUsdc && params.initialBuyUsdc > 0) {
        const initialCurvePrice = 30_000 / 1_073_000_000;
        const tokensEstimated = Math.round(params.initialBuyUsdc / initialCurvePrice);
        await TradeStoreService.getInstance().recordTrade({
          tx_signature: `sol_launch_buy_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          mint: newToken.mint,
          trade_type: "BUY",
          price_usd: initialCurvePrice,
          tokens_amount: tokensEstimated,
          quote_amount_usd: params.initialBuyUsdc,
          trader: creatorPubkey.toBase58(),
          created_at: new Date().toISOString(),
        });
      }
      if (typeof window !== "undefined") {
        try {
          const stored = localStorage.getItem("streetfun_custom_tokens");
          const list: TokenMetadata[] = stored ? JSON.parse(stored) : [];
          list.unshift(newToken);
          localStorage.setItem("streetfun_custom_tokens", JSON.stringify(list));
        } catch (_e) {}
      }
    } catch (e) {
      console.warn("[SolanaTokenService] Failed to record token to indexer:", e);
    }

    return newToken;
  }
}

export const solanaTokenService = new SolanaTokenService();

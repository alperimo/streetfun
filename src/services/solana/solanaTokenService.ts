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
      // 1. Client-side: fetch directly from /api/tokens for instant, unified cross-browser loading
      if (typeof window !== "undefined") {
        try {
          const res = await fetch("/api/tokens");
          if (res.ok) {
            const data = await res.json();
            if (data.tokens && Array.isArray(data.tokens) && data.tokens.length > 0) {
              for (const t of data.tokens) {
                metadataCache.set(t.mint, {
                  name: t.name,
                  symbol: t.symbol,
                  description: t.description,
                  avatarUrl: t.avatarUrl,
                });
              }
              return data.tokens;
            }
          }
        } catch (e) {
          console.warn("[SolanaTokenService] Failed to fetch /api/tokens, falling back to local merge:", e);
        }
      }

      // 2. Server-side or direct fallback
      const tokenMap = new Map<string, TokenMetadata>();

      for (const t of INITIAL_TOKENS) {
        tokenMap.set(t.mint.toLowerCase(), { ...t });
        metadataCache.set(t.mint, {
          name: t.name,
          symbol: t.symbol,
          description: t.description,
          avatarUrl: t.avatarUrl,
        });
      }

      try {
        const { TradeStoreService } = await import("../indexer/tradeStore");
        const supabaseTokens = await TradeStoreService.getInstance().getAllTokens();
        for (const st of supabaseTokens) {
          const mintLower = st.mint.toLowerCase();
          metadataCache.set(st.mint, {
            name: st.name,
            symbol: st.symbol,
            description: st.description || "",
            avatarUrl: st.avatar_url || "",
          });

          if (!tokenMap.has(mintLower)) {
            const matchedEquity =
              VERIFIED_TESSERA_PRE_IPO_ASSETS.find(
                (e) => e.symbol.toLowerCase() === (st.target_equity_symbol || "").toLowerCase()
              ) || VERIFIED_TESSERA_PRE_IPO_ASSETS[0];

            tokenMap.set(mintLower, {
              mint: st.mint,
              name: st.name,
              symbol: st.symbol,
              description: st.description || `Culture coin backed by ${matchedEquity.name} tokenized equity.`,
              avatarUrl: st.avatar_url || matchedEquity.logoUrl,
              creator: st.creator || "519jca26LioEQiPhwoHCkC8mNZiCF7cDmtaXdp98iCv2",
              createdAt: st.is_graduated ? "Graduated" : "Active Curve",
              marketCapUsd: 28_000,
              priceUsd: 0.000028,
              priceChange24h: 0.0,
              volume24hUsd: 0,
              targetEquity: {
                ...matchedEquity,
                stockPriceUsd: matchedEquity.currentStockPriceUsd,
              },
              bondingCurve: {
                realQuoteReservesUsd: 0,
                graduationThresholdUsd: 60_000,
                progressPct: 0,
                virtualQuoteReserves: "30000000000",
                virtualTokenReserves: "1073000000000000",
                realTokenReserves: "800000000000000",
                isGraduated: Boolean(st.is_graduated),
                meteoraPoolAddress: st.meteora_pool || `METdbc${st.symbol}Pool`,
                dynamicFeeBps: 20,
                equityPurchaseBudgetUsd: 30_000,
                ammLiquidityBudgetUsd: 30_000,
              },
              treasury: {
                totalEquityLocked: 0,
                totalEquityValueUsd: 0,
                vaultPda: "",
                proofOfReserveVerified: true,
              },
            });
          }
        }
      } catch (err) {
        console.warn("[SolanaTokenService] Failed to load tokens from Supabase:", err);
      }

      return Array.from(tokenMap.values());
    } catch (err) {
      console.warn("Could not load tokens:", err);
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

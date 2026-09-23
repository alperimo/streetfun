import { Connection, PublicKey } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { getAccount } from "@solana/spl-token";
import idl from "@/idl/streetfun.json";
import { TokenMetadata } from "@/lib/types";
import { calculateBondingProgress } from "@/lib/marketFormat";
import { createServerSupabaseClient } from "@/lib/supabase";
import { ITokenService, TokenLaunchParams } from "../types";
import { PROGRAM_ID, USDC_MINT, VERIFIED_TESSERA_PRE_IPO_ASSETS } from "@/sdk/constants";
import { getGlobalConfigPda, getQuoteVaultPda, getTreasuryVaultPda } from "@/sdk/pda";
import { TradeStoreService } from "../indexer/tradeStore";

interface IndexedTokenMetadata {
  mint: string;
  name: string;
  symbol: string;
  target_equity_symbol: string;
  target_equity_mint: string;
  creator: string;
  description?: string | null;
  avatar_url?: string | null;
  created_at?: string | null;
  is_graduated?: boolean | null;
  meteora_pool?: string | null;
}

interface IndexedMarketStat {
  volume24hUsd: number;
  referencePriceUsd: number | null;
  latestTradePriceUsd: number | null;
}

const TOKEN_DECIMALS = 1_000_000;

export class SolanaTokenService implements ITokenService {
  private connection: Connection;
  private cachedTokensResult: { tokens: TokenMetadata[]; timestamp: number } | null = null;
  private readonly CACHE_TTL_MS = 3000;

  constructor() {
    const rpcUrl = process.env.SOLANA_RPC || "https://api.devnet.solana.com";
    this.connection = new Connection(rpcUrl, "confirmed");
  }

  public invalidateCache(): void {
    this.cachedTokensResult = null;
  }

  private getProgram(): anchor.Program<any> {
    const readonlyWallet: any = {
      publicKey: PublicKey.default,
      signTransaction: async (tx: any) => tx,
      signAllTransactions: async (txs: any) => txs,
    };
    const provider = new anchor.AnchorProvider(this.connection, readonlyWallet, {
      commitment: "confirmed",
    });
    return new anchor.Program({ ...idl, address: PROGRAM_ID.toBase58() } as any, provider);
  }

  private async getIndexedMetadata(): Promise<Map<string, IndexedTokenMetadata>> {
    const metadata = new Map<string, IndexedTokenMetadata>();
    const supabase = createServerSupabaseClient();
    if (!supabase) return metadata;
    const { data, error } = await supabase
      .from("tokens")
      .select(
        "mint, name, symbol, target_equity_symbol, target_equity_mint, creator, description, avatar_url, created_at, is_graduated, meteora_pool"
      );

    if (error) {
      console.warn(`[SolanaTokenService] Token metadata index unavailable: ${error.message}`);
      return metadata;
    }
    for (const row of (data || []) as IndexedTokenMetadata[]) {
      metadata.set(row.mint, row);
    }
    return metadata;
  }

  private async getIndexedStats(mints: string[]): Promise<Record<string, IndexedMarketStat>> {
    if (mints.length === 0) return {};
    return TradeStoreService.getInstance().getMarketStats(mints);
  }

  private async getIndexedTokens(
    metadata: Map<string, IndexedTokenMetadata>
  ): Promise<TokenMetadata[]> {
    const indexedRows = Array.from(metadata.values());
    if (indexedRows.length === 0) return [];

    let stats: Record<string, IndexedMarketStat> = {};
    let statsAvailable = false;
    try {
      stats = await this.getIndexedStats(indexedRows.map((token) => token.mint));
      statsAvailable = true;
    } catch (error) {
      console.warn("[SolanaTokenService] Indexed market stats unavailable:", error);
    }

    const asOf = new Date().toISOString();
    return indexedRows.map((indexed) => {
      const knownAsset = VERIFIED_TESSERA_PRE_IPO_ASSETS.find(
        (asset) =>
          asset.mintAddress === indexed.target_equity_mint ||
          asset.symbol === indexed.target_equity_symbol
      );
      const stat = stats[indexed.mint];
      const priceUsd = stat?.latestTradePriceUsd || 0;

      return {
        mint: indexed.mint,
        name: indexed.name,
        symbol: indexed.symbol,
        description: indexed.description || "Indexed StreetFun market record.",
        avatarUrl: indexed.avatar_url || "/generated/streetfun-logo.png",
        creator: indexed.creator,
        createdAt: indexed.created_at || asOf,
        marketCapUsd: 0,
        priceUsd,
        priceChange24h: 0,
        priceChange24hAvailable: false,
        volume24hUsd: stat?.volume24hUsd || 0,
        volume24hAvailable: statsAvailable,
        targetEquity: {
          symbol: knownAsset?.symbol || indexed.target_equity_symbol || "UNKNOWN",
          name: knownAsset?.name || "Unverified target asset",
          mintAddress: indexed.target_equity_mint,
          issuer: knownAsset?.issuer,
          custodian: knownAsset?.custodian || "Not indexed",
          legalFramework: knownAsset?.legalFramework || "Not indexed",
          logoUrl: knownAsset?.logoUrl || "/generated/streetfun-logo.png",
          stockPriceUsd: 0,
          isPreIpo: knownAsset?.isPreIpo,
          meteoraPoolAddress: indexed.meteora_pool || undefined,
        },
        bondingCurve: {
          realQuoteReservesUsd: 0,
          graduationThresholdUsd: 0,
          progressPct: 0,
          virtualQuoteReserves: "0",
          virtualTokenReserves: "0",
          realTokenReserves: "0",
          isGraduated: Boolean(indexed.is_graduated),
          meteoraPoolAddress: indexed.meteora_pool || undefined,
        },
        treasury: {
          totalEquityLocked: 0,
          totalEquityValueUsd: 0,
          vaultPda: "",
          proofOfReserveVerified: false,
        },
        dataSource: "indexed",
        lastUpdatedAt: asOf,
      };
    });
  }

  async getTokens(): Promise<TokenMetadata[]> {
    if (typeof window !== "undefined") {
      const response = await fetch("/api/tokens", { cache: "no-store" });
      if (!response.ok) throw new Error("Live Solana market data is unavailable.");
      const payload = await response.json();
      if (!Array.isArray(payload.tokens)) throw new Error("Invalid live market response.");
      return payload.tokens as TokenMetadata[];
    }

    const program = this.getProgram();
    const [onChainCurves, metadata, slot] = await Promise.all([
      (program.account as any).curveAccount.all(),
      this.getIndexedMetadata(),
      this.connection.getSlot("confirmed"),
    ]);

    if (!onChainCurves || onChainCurves.length === 0) {
      return this.getIndexedTokens(metadata);
    }

    const [globalConfigPda] = getGlobalConfigPda(PROGRAM_ID);
    const config = await (program.account as any).globalConfig.fetch(globalConfigPda);
    const graduationThresholdUsd = Number(config.graduationThreshold.toString()) / TOKEN_DECIMALS;
    const protocolFeeBps = Number(config.protocolFeeBps);

    const mints = onChainCurves.map((curve: any) => curve.account.memeMint.toBase58());
    let indexedStats: Record<string, IndexedMarketStat> = {};
    let tradeIndexAvailable = false;
    try {
      indexedStats = await this.getIndexedStats(mints);
      tradeIndexAvailable = true;
    } catch (error) {
      console.warn("[SolanaTokenService] Verified trade index unavailable:", error);
    }
    const asOf = new Date().toISOString();

    const tokens = await Promise.all(
      onChainCurves.map(async (curveEntry: any): Promise<TokenMetadata | null> => {
        const account = curveEntry.account;
        const mint = account.memeMint.toBase58();
        const indexed = metadata.get(mint);
        const targetEquityMint = account.targetEquityMint.toBase58();
        const indexedStat = indexedStats[mint];
        const knownAsset = VERIFIED_TESSERA_PRE_IPO_ASSETS.find(
          (asset) => asset.mintAddress === targetEquityMint
        );

        const virtualQuoteRaw = Number(account.virtualQuoteReserves.toString());
        const virtualTokensRaw = Number(account.virtualTokenReserves.toString());
        const realQuoteReservesUsd =
          Number(account.realQuoteReserves.toString()) / TOKEN_DECIMALS;
        const totalSupply = Number(account.totalMemeSupply.toString()) / TOKEN_DECIMALS;
        const spotPrice = virtualTokensRaw > 0 ? virtualQuoteRaw / virtualTokensRaw : 0;
        const isGraduated = Boolean(account.isGraduated);
        // For graduated tokens, reference the latest trade price or final graduation spot price
        const currentPrice = indexedStat?.latestTradePriceUsd || spotPrice;
        const marketCapUsd = currentPrice * totalSupply;
        // Execution-average trade prices are not a 24-hour spot-price baseline.
        const priceChange24h = 0;
        const [quoteVaultPda] = getQuoteVaultPda(curveEntry.publicKey, PROGRAM_ID);
        const [treasuryVaultPda] = getTreasuryVaultPda(curveEntry.publicKey, PROGRAM_ID);
        const quoteVault = await getAccount(this.connection, quoteVaultPda, "confirmed");
        if (!quoteVault.mint.equals(USDC_MINT)) {
          // Launch is permissionless: an unsupported quote asset must not take
          // every supported market offline or be displayed as USDC.
          return null;
        }
        const meteoraPool = account.meteoraDbcPool as PublicKey;
        const hasMeteoraPool = !meteoraPool.equals(PublicKey.default);
        const totalEquityLocked =
          Number(account.totalEquityLocked.toString()) / TOKEN_DECIMALS;

        return {
          mint,
          name: indexed?.name || `StreetFun ${mint.slice(0, 4)}`,
          symbol: indexed?.symbol || mint.slice(0, 5).toUpperCase(),
          description: indexed?.description || "On-chain StreetFun bonding curve.",
          avatarUrl: indexed?.avatar_url || "/generated/streetfun-logo.png",
          creator: account.creator.toBase58(),
          createdAt: indexed?.created_at || `Slot ${slot}`,
          totalSupply,
          marketCapUsd,
          priceUsd: currentPrice,
          priceChange24h,
          priceChange24hAvailable: false,
          volume24hUsd: indexedStat?.volume24hUsd || 0,
          volume24hAvailable: tradeIndexAvailable,
          targetEquity: {
            symbol: knownAsset?.symbol || "UNKNOWN",
            name: knownAsset?.name || "Unverified target asset",
            mintAddress: targetEquityMint,
            issuer: knownAsset?.issuer,
            custodian: knownAsset?.custodian || "Not indexed",
            legalFramework: knownAsset?.legalFramework || "Not indexed",
            proofOfReserve: undefined,
            meteoraPoolAddress: hasMeteoraPool ? meteoraPool.toBase58() : undefined,
            logoUrl: knownAsset?.logoUrl || "/generated/streetfun-logo.png",
            stockPriceUsd: knownAsset?.currentStockPriceUsd || 0,
            isPreIpo: knownAsset?.isPreIpo,
          },
          bondingCurve: {
            realQuoteReservesUsd,
            graduationThresholdUsd,
            progressPct: calculateBondingProgress(
              realQuoteReservesUsd,
              graduationThresholdUsd
            ),
            virtualQuoteReserves: account.virtualQuoteReserves.toString(),
            virtualTokenReserves: account.virtualTokenReserves.toString(),
            realTokenReserves: account.realTokenReserves.toString(),
            quoteMint: quoteVault.mint.toBase58(),
            isGraduated,
            graduatedAt:
              Number(account.graduatedAt?.toString() || 0) > 0
                ? new Date(Number(account.graduatedAt.toString()) * 1000).toISOString()
                : undefined,
            meteoraPoolAddress: hasMeteoraPool ? meteoraPool.toBase58() : undefined,
            dynamicFeeBps: protocolFeeBps,
            equityPurchaseBudgetUsd: graduationThresholdUsd / 2,
            ammLiquidityBudgetUsd: graduationThresholdUsd / 2,
          },
          treasury: {
            totalEquityLocked,
            totalEquityValueUsd:
              totalEquityLocked * (knownAsset?.currentStockPriceUsd || 0),
            vaultPda: treasuryVaultPda.toBase58(),
            proofOfReserveVerified: Boolean(knownAsset?.proofOfReserve),
          },
          dataSource: "onchain",
          lastUpdatedAt: asOf,
        };
      })
    );

    return tokens.filter((token): token is TokenMetadata => token !== null).sort(
      (a, b) => b.bondingCurve.realQuoteReservesUsd - a.bondingCurve.realQuoteReservesUsd
    );
  }

  async getToken(mint: string): Promise<TokenMetadata | null> {
    const tokens = await this.getTokens();
    return tokens.find((token) => token.mint === mint) || null;
  }

  async launchToken(
    params: TokenLaunchParams,
    walletPublicKey?: PublicKey | null
  ): Promise<TokenMetadata> {
    const res = await fetch("/api/launch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...params,
        creatorPublicKey: walletPublicKey ? walletPublicKey.toBase58() : undefined,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || "Failed to launch token on Solana Devnet.");
    }
    const data = await res.json();
    return data.token;
  }
}

export const solanaTokenService = new SolanaTokenService();

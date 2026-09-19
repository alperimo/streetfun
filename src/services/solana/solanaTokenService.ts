import { Connection, PublicKey } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { getAccount } from "@solana/spl-token";
import idl from "@/idl/streetfun.json";
import { TokenMetadata } from "@/lib/types";
import { calculateBondingProgress } from "@/lib/marketFormat";
import { createBrowserSupabaseClient } from "@/lib/supabase";
import { ITokenService, TokenLaunchParams } from "../types";
import { PROGRAM_ID, VERIFIED_TESSERA_PRE_IPO_ASSETS } from "@/sdk/constants";
import { getGlobalConfigPda, getQuoteVaultPda, getTreasuryVaultPda } from "@/sdk/pda";

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
}

interface IndexedMarketStat {
  volume24hUsd: number;
  referencePriceUsd: number | null;
  latestTradePriceUsd: number | null;
}

const DEFAULT_THRESHOLD_USD = 60_000;
const TOKEN_DECIMALS = 1_000_000;

export class SolanaTokenService implements ITokenService {
  private connection: Connection;

  constructor() {
    const rpcUrl = process.env.NEXT_PUBLIC_SOLANA_RPC || "https://api.devnet.solana.com";
    this.connection = new Connection(rpcUrl, "confirmed");
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
    return new anchor.Program(idl as any, provider);
  }

  private async getIndexedMetadata(): Promise<Map<string, IndexedTokenMetadata>> {
    const metadata = new Map<string, IndexedTokenMetadata>();
    const supabase = createBrowserSupabaseClient();
    if (!supabase) return metadata;

    const { data, error } = await supabase
      .from("tokens")
      .select(
        "mint, name, symbol, target_equity_symbol, target_equity_mint, creator, description, avatar_url, created_at"
      );

    if (error) throw new Error(`Token metadata index unavailable: ${error.message}`);
    for (const row of (data || []) as IndexedTokenMetadata[]) {
      metadata.set(row.mint.toLowerCase(), row);
    }
    return metadata;
  }

  private async getIndexedStats(mints: string[]): Promise<Record<string, IndexedMarketStat>> {
    if (mints.length === 0) return {};
    const response = await fetch(`/api/trades/stats?mints=${encodeURIComponent(mints.join(","))}`, {
      cache: "no-store",
    });
    if (!response.ok) return {};
    const payload = await response.json();
    return payload.stats || {};
  }

  async getTokens(): Promise<TokenMetadata[]> {
    const program = this.getProgram();
    const [onChainCurves, metadata, slot] = await Promise.all([
      (program.account as any).curveAccount.all(),
      this.getIndexedMetadata(),
      this.connection.getSlot("confirmed"),
    ]);

    if (!onChainCurves || onChainCurves.length === 0) return [];

    const [globalConfigPda] = getGlobalConfigPda(PROGRAM_ID);
    let graduationThresholdUsd = DEFAULT_THRESHOLD_USD;
    let protocolFeeBps = 0;
    try {
      const config = await (program.account as any).globalConfig.fetch(globalConfigPda);
      graduationThresholdUsd = Number(config.graduationThreshold.toString()) / TOKEN_DECIMALS;
      protocolFeeBps = Number(config.protocolFeeBps);
    } catch {
      // Curve accounts remain authoritative even while the config fetch is temporarily unavailable.
    }

    const mints = onChainCurves.map((curve: any) => curve.account.memeMint.toBase58());
    const indexedStats = await this.getIndexedStats(mints);
    const asOf = new Date().toISOString();

    const tokens = await Promise.all(
      onChainCurves.map(async (curveEntry: any): Promise<TokenMetadata> => {
        const account = curveEntry.account;
        const mint = account.memeMint.toBase58();
        const indexed = metadata.get(mint.toLowerCase());
        const targetEquityMint = account.targetEquityMint.toBase58();
        const indexedStat = indexedStats[mint] || indexedStats[mint.toLowerCase()];
        const knownAsset =
          VERIFIED_TESSERA_PRE_IPO_ASSETS.find(
            (asset) => asset.mintAddress.toLowerCase() === targetEquityMint.toLowerCase()
          ) ||
          VERIFIED_TESSERA_PRE_IPO_ASSETS.find(
            (asset) => asset.symbol.toLowerCase() === indexed?.target_equity_symbol?.toLowerCase()
          );

        const virtualQuoteRaw = Number(account.virtualQuoteReserves.toString());
        const virtualTokensRaw = Number(account.virtualTokenReserves.toString());
        const realQuoteReservesUsd =
          Number(account.realQuoteReserves.toString()) / TOKEN_DECIMALS;
        const totalSupply = Number(account.totalMemeSupply.toString()) / TOKEN_DECIMALS;
        const spotPrice = virtualTokensRaw > 0 ? virtualQuoteRaw / virtualTokensRaw : 0;
        const isGraduated = Boolean(account.isGraduated);
        // A migrated token needs a live AMM quote. Curve state is no longer a current price source.
        const currentPrice = isGraduated ? 0 : spotPrice;
        const marketCapUsd = currentPrice * totalSupply;
        const referencePrice = indexedStat?.referencePriceUsd;
        const priceChange24h =
          currentPrice > 0 && referencePrice && referencePrice > 0
            ? ((currentPrice - referencePrice) / referencePrice) * 100
            : 0;
        const [quoteVaultPda] = getQuoteVaultPda(curveEntry.publicKey, PROGRAM_ID);
        const [treasuryVaultPda] = getTreasuryVaultPda(curveEntry.publicKey, PROGRAM_ID);
        const quoteVault = await getAccount(this.connection, quoteVaultPda, "confirmed");
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
          volume24hUsd: indexedStat?.volume24hUsd || 0,
          targetEquity: {
            symbol: indexed?.target_equity_symbol || knownAsset?.symbol || "UNKNOWN",
            name: knownAsset?.name || indexed?.target_equity_symbol || "Unverified backing asset",
            mintAddress: targetEquityMint,
            issuer: knownAsset?.issuer,
            custodian: knownAsset?.custodian || "Not indexed",
            legalFramework: knownAsset?.legalFramework || "Not indexed",
            proofOfReserve: undefined,
            meteoraPoolAddress: hasMeteoraPool ? meteoraPool.toBase58() : undefined,
            logoUrl: knownAsset?.logoUrl || "/generated/streetfun-logo.png",
            stockPriceUsd: 0,
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
            // USD valuation requires a real oracle feed; never synthesize it from catalog constants.
            totalEquityValueUsd: 0,
            vaultPda: treasuryVaultPda.toBase58(),
            proofOfReserveVerified: false,
          },
          dataSource: "onchain",
          lastUpdatedAt: asOf,
        };
      })
    );

    return tokens.sort(
      (a, b) => b.bondingCurve.realQuoteReservesUsd - a.bondingCurve.realQuoteReservesUsd
    );
  }

  async getToken(mint: string): Promise<TokenMetadata | null> {
    const tokens = await this.getTokens();
    return tokens.find((token) => token.mint.toLowerCase() === mint.toLowerCase()) || null;
  }

  async launchToken(
    _params: TokenLaunchParams,
    _walletPublicKey?: PublicKey | null
  ): Promise<TokenMetadata> {
    throw new Error(
      "Live token launch is unavailable until a wallet-signed launch transaction is configured. No mock token was created."
    );
  }
}

export const solanaTokenService = new SolanaTokenService();

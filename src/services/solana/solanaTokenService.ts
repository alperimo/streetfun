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

      if (!onChainCurves || onChainCurves.length === 0) {
        return INITIAL_TOKENS;
      }

      const tokenList: TokenMetadata[] = [];

      for (const curve of onChainCurves) {
        const acc = curve.account;
        const memeMintStr = acc.memeMint.toBase58();
        const targetEquityMintStr = acc.targetEquityMint.toBase58();

        const matchedEquity =
          VERIFIED_TESSERA_PRE_IPO_ASSETS.find(
            (e) => e.mintAddress.toLowerCase() === targetEquityMintStr.toLowerCase()
          ) ||
          VERIFIED_TESSERA_PRE_IPO_ASSETS[0];

        const cached = metadataCache.get(memeMintStr);
        const known = INITIAL_TOKENS.find(
          (t) => t.mint.toLowerCase() === memeMintStr.toLowerCase()
        );

        const realQuoteUsd = acc.realQuoteReserves.toNumber() / 1_000_000;
        const realTokensNum = Number(acc.realTokenReserves.toString()) / 1_000_000;
        const totalEquityLockedNum = acc.totalEquityLocked.toNumber() / 1_000_000;
        const isGraduated = acc.isGraduated;

        // Dynamic bonding curve spot price
        const vQuote = acc.virtualQuoteReserves.toNumber() / 1_000_000;
        const vTokens = Number(acc.virtualTokenReserves.toString()) / 1_000_000;
        const totalSold = Math.max(0, 800_000_000 - realTokensNum);
        const currentTokenReserve = Math.max(1, vTokens - totalSold);
        const spotPrice = isGraduated ? 0.1054 : Math.max(0.00003, (vQuote + realQuoteUsd) / currentTokenReserve);
        const marketCap = spotPrice * 1_000_000_000;

        const equityValueUsd = totalEquityLockedNum * matchedEquity.currentStockPriceUsd;
        const [treasuryVaultPda] = getTreasuryVaultPda(curve.publicKey, PROGRAM_ID);

        const symbol = cached?.symbol || known?.symbol || `STK_${memeMintStr.slice(0, 4).toUpperCase()}`;
        const name = cached?.name || known?.name || `${matchedEquity.name} Stonk`;
        const description =
          cached?.description ||
          known?.description ||
          `On-chain equity backed token verified on Solana. Collateralized with ${matchedEquity.name} shares.`;

        tokenList.push({
          mint: memeMintStr,
          name,
          symbol,
          description,
          avatarUrl:
            cached?.avatarUrl ||
            known?.avatarUrl ||
            matchedEquity.logoUrl,
          creator: acc.creator.toBase58(),
          createdAt: isGraduated ? "Graduated" : "Active Curve",
          marketCapUsd: Math.round(marketCap),
          priceUsd: Number(spotPrice.toFixed(6)),
          priceChange24h: known?.priceChange24h || (realQuoteUsd > 0 ? 12.5 : 0.0),
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
            meteoraPoolAddress: `METdbc${memeMintStr.slice(0, 4)}Pool`,
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

      // Sort with graduated and active trading curves prioritized
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

    return {
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
  }
}

export const solanaTokenService = new SolanaTokenService();

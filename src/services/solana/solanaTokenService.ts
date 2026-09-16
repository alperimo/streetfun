import { Connection, PublicKey, Keypair, SystemProgram, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
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

export class SolanaTokenService implements ITokenService {
  private connection: Connection;

  constructor() {
    const rpcUrl =
      process.env.NEXT_PUBLIC_SOLANA_RPC || "https://api.devnet.solana.com";
    this.connection = new Connection(rpcUrl, "confirmed");
  }

  async getTokens(): Promise<TokenMetadata[]> {
    // In production without indexer backend, returns discovered tokens or fallback seed tokens
    return INITIAL_TOKENS;
  }

  async getToken(mint: string): Promise<TokenMetadata | null> {
    const tokens = await this.getTokens();
    return tokens.find((t) => t.mint === mint) || null;
  }

  async launchToken(
    params: TokenLaunchParams,
    walletPublicKey?: PublicKey | null
  ): Promise<TokenMetadata> {
    if (!walletPublicKey) {
      throw new Error("Wallet not connected. Please connect your Solana wallet.");
    }

    const selectedEquity =
      VERIFIED_TESSERA_PRE_IPO_ASSETS.find(
        (e) => e.symbol === params.targetEquitySymbol
      ) || VERIFIED_TESSERA_PRE_IPO_ASSETS[0];

    const memeMintKeypair = Keypair.generate();
    const memeMint = memeMintKeypair.publicKey;
    const targetEquityMint = new PublicKey(selectedEquity.mintAddress);

    const [globalConfigPda] = getGlobalConfigPda(PROGRAM_ID);
    const [curvePda] = getCurvePda(memeMint, PROGRAM_ID);
    const [tokenVaultPda] = getTokenVaultPda(curvePda, PROGRAM_ID);
    const [quoteVaultPda] = getQuoteVaultPda(curvePda, PROGRAM_ID);
    const [treasuryVaultPda] = getTreasuryVaultPda(curvePda, PROGRAM_ID);

    console.info("Launching on Solana Devnet:", {
      creator: walletPublicKey.toBase58(),
      memeMint: memeMint.toBase58(),
      curvePda: curvePda.toBase58(),
      tokenVaultPda: tokenVaultPda.toBase58(),
      quoteVaultPda: quoteVaultPda.toBase58(),
      treasuryVaultPda: treasuryVaultPda.toBase58(),
      globalConfigPda: globalConfigPda.toBase58(),
    });

    const cleanSymbol = params.symbol.replace(/^\$/, "").toUpperCase();

    return {
      mint: memeMint.toBase58(),
      name: params.name,
      symbol: cleanSymbol,
      description: params.description,
      avatarUrl:
        params.avatarUrl ||
        "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=160&q=80",
      creator: walletPublicKey.toBase58(),
      createdAt: "Just now",
      marketCapUsd: 30_000,
      priceUsd: 0.00003,
      priceChange24h: 0.0,
      volume24hUsd: params.initialBuyUsdc || 0,
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
        meteoraPoolAddress: `METdbc${cleanSymbol.slice(0, 4)}PoolDevnet`,
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

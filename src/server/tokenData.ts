import { Connection, PublicKey } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { cpAmmCoder, deriveCustomizablePoolAddress, derivePoolAuthority, getPriceFromSqrtPrice } from "@meteora-ag/cp-amm-sdk";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, getEpochFee, getTransferFeeConfig, unpackAccount, unpackMint } from "@solana/spl-token";
import idl from "@/idl/streetfun.json";
import type { TokenMetadata } from "@/lib/types";
import { calculateBondingProgress } from "@/lib/marketFormat";
import { createServerSupabaseClient } from "./supabase";
import { METEORA_DAMM_V2_PROGRAM_ID, PROGRAM_ID, USDC_MINT } from "@/sdk/constants";
import { getGlobalConfigPda, getQuoteVaultPda, getTreasuryVaultPda } from "@/sdk/pda";
import { TradeStoreService } from "@/services/indexer/tradeStore";
import { assertConfiguredCluster, getServerConnection } from "./rpc";
import { getTesseraAvailability, getTesseraCatalog } from "./tessera";
import { getPreStocksAvailability, getPreStocksCatalog } from "./prestocks";
import { getOfficialEquityLogo } from "@/lib/assetLogos";

/** Server snapshots are coalesced per process and invalidated by verified events. */
export class SolanaTokenService {
  private connection: Connection;
  private cached?: { tokens: TokenMetadata[]; expires: number };
  private pending?: Promise<TokenMetadata[]>;
  private generation = 0;
  constructor(connection = getServerConnection()) { this.connection = connection; }
  invalidate() { this.cached = undefined; this.generation++; }

  private getProgram(): anchor.Program<any> {
    const wallet: any = { publicKey: PublicKey.default, signTransaction: async () => { throw new Error("Read-only wallet"); }, signAllTransactions: async () => { throw new Error("Read-only wallet"); } };
    return new anchor.Program({ ...idl, address: PROGRAM_ID.toBase58() } as any,
      new anchor.AnchorProvider(this.connection, wallet, { commitment: "confirmed" }));
  }

  private async getIndexedMetadata(mints: string[]): Promise<Map<string, any>> {
    const metadata = new Map<string, any>();
    const db = createServerSupabaseClient();
    if (!db) throw new Error("Live metadata index is not configured.");
    for (let i = 0; i < mints.length; i += 100) {
      const { data, error } = await db.from("tokens").select("*").in("mint", mints.slice(i, i + 100));
      if (error) throw new Error("Live metadata index is unavailable.");
      for (const row of data || []) metadata.set(row.mint, row);
    }
    return metadata;
  }

  async getTokens(): Promise<TokenMetadata[]> {
    if (this.cached && this.cached.expires > Date.now()) return this.cached.tokens;
    if (this.pending) return this.pending;
    const generation = this.generation;
    this.pending = this.fetchSnapshot().then(tokens => {
      if (this.generation === generation) this.cached = { tokens, expires: Date.now() + 2_000 };
      return tokens;
    }).finally(() => { this.pending = undefined; });
    return this.pending;
  }

  private async fetchSnapshot(): Promise<TokenMetadata[]> {
    const program = this.getProgram();
    await assertConfiguredCluster(this.connection);
    const curves = await (program.account as any).curveAccount.all();
    // Database records alone never prove that a token exists on this cluster.
    if (!curves.length) return [];
    const mints = curves.map((c: any) => c.account.memeMint.toBase58());
    const [metadata, config, prestocksRaw, tesseraRaw, stats, currentEpoch] = await Promise.all([
      this.getIndexedMetadata(mints),
      (program.account as any).globalConfig.fetch(getGlobalConfigPda(PROGRAM_ID)[0]),
      getPreStocksCatalog().catch(() => []),
      getTesseraCatalog().catch(() => []),
      TradeStoreService.getInstance().getMarketStats(mints).catch(() => null),
      this.connection.getEpochInfo
        ? this.connection.getEpochInfo("confirmed").catch(() => null)
        : Promise.resolve(null),
    ]);

    const [prestocksAvailable, tesseraAvailable] = await Promise.all([
      getPreStocksAvailability(this.connection, prestocksRaw).catch(() => []),
      getTesseraAvailability(this.connection, tesseraRaw).catch(() => []),
    ]);

    const assets = new Map<string, any>();
    // PreStocks first, Tessera second
    for (const a of [...tesseraAvailable, ...prestocksAvailable]) {
      assets.set(a.mintAddress, a);
    }

    const records: Array<{ token: TokenMetadata; poolState?: any; poolAddress?: PublicKey }> = [];
    // Bounded requests replace one RPC request per token. Re-read each curve and
    // its balances together so price, supply and collateral share the RPC context.
    for (let start = 0; start < curves.length; start += 20) {
      const group = curves.slice(start, start + 20);
      const keys = group.flatMap((c: any) => [c.publicKey, c.account.memeMint,
        getQuoteVaultPda(c.publicKey, PROGRAM_ID)[0], getTreasuryVaultPda(c.publicKey, PROGRAM_ID)[0], c.account.targetEquityMint,
        c.account.isGraduated && !c.account.meteoraDammV2Pool.equals(PublicKey.default) ? c.account.meteoraDammV2Pool : PublicKey.default]);
      const { context, value } = await this.connection.getMultipleAccountsInfoAndContext(keys, "confirmed");
      for (let i = 0; i < group.length; i++) {
        const [curveInfo, mintInfo, quoteInfo, treasuryInfo, equityInfo, dammPoolInfo] = value.slice(i * 6, i * 6 + 6);
        const entry = group[i];
        if (!curveInfo || !curveInfo.owner.equals(PROGRAM_ID) || !mintInfo || !quoteInfo) continue;
        const account: any = program.coder.accounts.decode("curveAccount", curveInfo.data);
        const mint = account.memeMint.toBase58();
        const mintState = unpackMint(account.memeMint, mintInfo, TOKEN_PROGRAM_ID);
        const quote = unpackAccount(keys[i * 6 + 2], quoteInfo, TOKEN_PROGRAM_ID);
        if (!quote.mint.equals(USDC_MINT) || !quote.owner.equals(entry.publicKey) || mintState.decimals !== 6) continue;
        const asset = assets.get(account.targetEquityMint.toBase58());
        const indexed = metadata.get(mint);
        const isGraduated = Boolean(account.isGraduated);
        const supply = Number(mintState.supply) / 1e6;
        const virtualQuote = Number(account.virtualQuoteReserves.toString());
        const virtualTokens = Number(account.virtualTokenReserves.toString());
        const reserves = Number(account.realQuoteReserves.toString()) / 1e6;
        const threshold = Number(config.graduationThreshold.toString()) / 1e6;

        let equityBalance = 0;
        let equityDecimals: number | undefined;
        let equityTransferFee: TokenMetadata["targetEquity"]["transferFee"] | undefined;
        if (equityInfo && treasuryInfo && (equityInfo.owner.equals(TOKEN_PROGRAM_ID) || equityInfo.owner.equals(TOKEN_2022_PROGRAM_ID))) {
          const equityMint = unpackMint(account.targetEquityMint, equityInfo, equityInfo.owner);
          const transferFeeConfig = getTransferFeeConfig(equityMint);
          if (!transferFeeConfig) {
            equityTransferFee = null;
          } else if (currentEpoch) {
            const activeFee = getEpochFee(transferFeeConfig, BigInt(currentEpoch.epoch));
            equityTransferFee = {
              basisPoints: activeFee.transferFeeBasisPoints,
              maximumFeeRaw: activeFee.maximumFee.toString(),
            };
          }
          const treasury = unpackAccount(keys[i * 6 + 3], treasuryInfo, equityInfo.owner);
          if (treasury.mint.equals(account.targetEquityMint) && treasury.owner.equals(entry.publicKey)) {
            equityDecimals = equityMint.decimals;
            // Only accounted collateral is redeemable; donations must not inflate NAV.
            const accounted = BigInt(account.totalEquityLocked.toString());
            equityBalance = Number(treasury.amount < accounted ? treasury.amount : accounted) / 10 ** equityDecimals;
          }
        }
        const hasProviderMark = Boolean(asset && !asset.testCollateral && asset.currentStockPriceUsd > 0);
        const equityValue = hasProviderMark ? equityBalance * asset.currentStockPriceUsd : 0;

        const curvePrice = !isGraduated && virtualTokens > 0 ? virtualQuote / virtualTokens : 0;
        // A collateral NAV is not a traded market price or market capitalization.

        let poolState: any;
        const poolAddress = isGraduated && !account.meteoraDammV2Pool.equals(PublicKey.default)
          ? account.meteoraDammV2Pool
          : undefined;
        if (poolAddress && dammPoolInfo?.owner.equals(METEORA_DAMM_V2_PROGRAM_ID)) {
          try {
            const decoded = cpAmmCoder.accounts.decode("pool", dammPoolInfo.data);
            const expectedAddress = deriveCustomizablePoolAddress(USDC_MINT, account.memeMint);
            const validPair =
              (decoded.tokenAMint.equals(USDC_MINT) && decoded.tokenBMint.equals(account.memeMint)) ||
              (decoded.tokenBMint.equals(USDC_MINT) && decoded.tokenAMint.equals(account.memeMint));
            if (poolAddress.equals(expectedAddress) && validPair) poolState = decoded;
          } catch {
            // Invalid or incompatible DAMM account data never becomes a market-price source.
          }
        }

        records.push({ token: {
          mint, name: indexed?.name || `StreetFun ${mint.slice(0, 4)}`, symbol: indexed?.symbol || mint.slice(0, 5),
          description: indexed?.description || "On-chain StreetFun market.",
          avatarUrl: indexed?.avatar_url || "/generated/streetfun-logo.png", creator: account.creator.toBase58(),
          createdAt: indexed?.created_at || "", totalSupply: supply,
          priceUsd: curvePrice, marketCapUsd: curvePrice > 0 ? curvePrice * supply : 0, priceChange24h: 0, priceChange24hAvailable: false,
          volume24hUsd: stats?.[mint]?.volume24hUsd || 0, volume24hAvailable: stats !== null,
          targetEquity: {
            symbol: asset?.symbol || indexed?.target_equity_symbol || "UNVERIFIED",
            name: asset?.name || "Pre-IPO Collateral",
            mintAddress: account.targetEquityMint.toBase58(),
            issuer: asset?.issuer || "Unverified",
            custodian: asset?.custodian || "Unverified",
            legalFramework: asset?.legalFramework || "Collateral identity unverified",
            logoUrl: getOfficialEquityLogo(asset?.symbol || indexed?.target_equity_symbol || asset?.name),
            stockPriceUsd: hasProviderMark ? asset.currentStockPriceUsd : 0,
            isPreIpo: !!asset && !asset.testCollateral,
            decimals: equityDecimals,
            verifiedTessera: asset?.provider !== "prestocks" && !!asset && !asset.testCollateral,
            verifiedPreStocks: asset?.provider === "prestocks" && !asset.testCollateral,
            isTestCollateral: Boolean(asset?.testCollateral),
            transferFee: equityTransferFee,
          },
          bondingCurve: {
            realQuoteReservesUsd: reserves, graduationThresholdUsd: threshold,
            progressPct: isGraduated ? 100 : calculateBondingProgress(reserves, threshold),
            virtualQuoteReserves: account.virtualQuoteReserves.toString(), virtualTokenReserves: account.virtualTokenReserves.toString(),
            realTokenReserves: account.realTokenReserves.toString(), quoteMint: quote.mint.toBase58(), isGraduated,
            graduatedAt: isGraduated ? new Date(Number(account.graduatedAt.toString()) * 1000).toISOString() : undefined,
            // Database metadata is not proof of a funded Meteora pool.
            meteoraPoolAddress: undefined,
            dynamicFeeBps: Number(config.protocolFeeBps),
            // This is the live quote already in the curve, not the threshold target.
            equityPurchaseBudgetUsd: reserves / 2,
            ammLiquidityBudgetUsd: reserves / 2,
          },
          treasury: { totalEquityLocked: equityBalance, totalEquityValueUsd: equityValue,
            vaultPda: keys[i * 6 + 3].toBase58(), proofOfReserveVerified: false,
            valuationAvailable: hasProviderMark || equityBalance === 0,
            valuationSource: hasProviderMark ? `${asset.issuer} mark price` : undefined },
          dataSource: "onchain", lastUpdatedAt: new Date().toISOString(), observedSlot: context.slot,
        }, poolState, poolAddress });
      }
    }

    const poolRecords = records.filter((record) => record.poolState && record.poolAddress);
    const vaultKeys = [...new Map(poolRecords.flatMap(({ poolState }) => [poolState.tokenAVault, poolState.tokenBVault])
      .map((key: PublicKey) => [key.toBase58(), key])).values()];
    const vaultInfos = new Map<string, import("@solana/web3.js").AccountInfo<Buffer> | null>();
    for (let start = 0; start < vaultKeys.length; start += 100) {
      const chunk = vaultKeys.slice(start, start + 100);
      const infos = await this.connection.getMultipleAccountsInfo(chunk, "confirmed");
      infos.forEach((info, index) => vaultInfos.set(chunk[index].toBase58(), info));
    }
    const poolAuthority = derivePoolAuthority();
    for (const { token, poolState, poolAddress } of poolRecords) {
      try {
        const tokenAMint = poolState.tokenAMint as PublicKey;
        const tokenBMint = poolState.tokenBMint as PublicKey;
        const tokenAVault = poolState.tokenAVault as PublicKey;
        const tokenBVault = poolState.tokenBVault as PublicKey;
        const vaultAInfo = vaultInfos.get(tokenAVault.toBase58());
        const vaultBInfo = vaultInfos.get(tokenBVault.toBase58());
        if (!vaultAInfo || !vaultBInfo ||
            (!vaultAInfo.owner.equals(TOKEN_PROGRAM_ID) && !vaultAInfo.owner.equals(TOKEN_2022_PROGRAM_ID)) ||
            (!vaultBInfo.owner.equals(TOKEN_PROGRAM_ID) && !vaultBInfo.owner.equals(TOKEN_2022_PROGRAM_ID))) continue;
        const reserveA = unpackAccount(tokenAVault, vaultAInfo, vaultAInfo.owner);
        const reserveB = unpackAccount(tokenBVault, vaultBInfo, vaultBInfo.owner);
        if (!reserveA.owner.equals(poolAuthority) || !reserveB.owner.equals(poolAuthority) ||
            !reserveA.mint.equals(tokenAMint) || !reserveB.mint.equals(tokenBMint) ||
            reserveA.amount === 0n || reserveB.amount === 0n) continue;
        const quoteIsA = tokenAMint.equals(USDC_MINT);
        const quoteIsB = tokenBMint.equals(USDC_MINT);
        if (!quoteIsA && !quoteIsB) continue;
        const memeIsA = tokenAMint.equals(new PublicKey(token.mint));
        const memeIsB = tokenBMint.equals(new PublicKey(token.mint));
        if (!memeIsA && !memeIsB) continue;
        // StreetFun quote and meme mints both use six decimals.
        const tokenBPerTokenA = getPriceFromSqrtPrice(poolState.sqrtPrice, 6, 6).toNumber();
        const marketPrice = memeIsA ? tokenBPerTokenA : 1 / tokenBPerTokenA;
        if (!Number.isFinite(marketPrice) || marketPrice <= 0) continue;
        token.priceUsd = marketPrice;
        token.marketCapUsd = marketPrice * (token.totalSupply || 0);
        token.bondingCurve.meteoraPoolAddress = poolAddress!.toBase58();
      } catch {
        // Do not expose a graduated price until pool ownership and vaults are verified.
      }
    }
    return records.map((record) => record.token).sort((a, b) => b.bondingCurve.realQuoteReservesUsd - a.bondingCurve.realQuoteReservesUsd);
  }

  async getToken(mint: string): Promise<TokenMetadata | null> {
    return (await this.getTokens()).find(token => token.mint === mint) || null;
  }
}
export const solanaTokenService = new SolanaTokenService();

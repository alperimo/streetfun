import { Connection, PublicKey } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { cpAmmCoder, deriveCustomizablePoolAddress, derivePoolAuthority, getPriceFromSqrtPrice } from "@meteora-ag/cp-amm-sdk";
import { deriveDammV2PoolAddress, getPriceFromSqrtPrice as getDbcPriceFromSqrtPrice } from "@meteora-ag/dynamic-bonding-curve-sdk";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID, getAssociatedTokenAddressSync, getEpochFee, getTransferFeeConfig, unpackAccount, unpackMint } from "@solana/spl-token";
import idl from "@/idl/streetfun.json";
import type { TokenMetadata } from "@/lib/types";
import { calculateBondingProgress } from "@/lib/marketFormat";
import { createServerSupabaseClient } from "./supabase";
import { METEORA_DAMM_V2_PROGRAM_ID, METEORA_DBC_PROGRAM_ID, PROGRAM_ID, USDC_MINT } from "@/sdk/constants";
import { getDbcLaunchPda, getGlobalConfigPda, getQuoteVaultPda, getTreasuryVaultPda } from "@/sdk/pda";
import { getDbcSettlementFallbackAt } from "@/sdk/dbcSettlement";
import { TradeStoreService } from "@/services/indexer/tradeStore";
import { assertConfiguredCluster, getServerConnection } from "./rpc";
import { getNetworkAssetCatalog } from "./assetCatalog";
import { getOfficialEquityLogo } from "@/lib/assetLogos";
import { getAssetMarkPrice, getAssetValuationSource } from "./assetValuation";
import { getDbcClient, getDbcMigrationDammConfigAddress } from "./meteoraDbc";

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
    const genesisHash = await assertConfiguredCluster(this.connection);
    const [curves, dbcLaunches] = await Promise.all([
      (program.account as any).curveAccount.all(),
      (program.account as any).dbcLaunchAccount.all(),
    ]);
    // Database records alone never prove that a token exists on this cluster.
    if (!curves.length && !dbcLaunches.length) return [];
    const mints = [...new Set([
      ...curves.map((c: any) => c.account.memeMint.toBase58()),
      ...dbcLaunches.map((c: any) => c.account.memeMint.toBase58()),
    ])];
    const dbcClient = dbcLaunches.length ? getDbcClient(this.connection) : undefined;
    const dbcConfigMap = new Map<string, PublicKey>();
    for (const entry of dbcLaunches as any[]) dbcConfigMap.set(entry.account.dbcConfig.toBase58(), entry.account.dbcConfig);
    const dbcConfigs = [...dbcConfigMap.values()];
    const dbcPoolsByConfig = dbcClient
      ? await Promise.all(dbcConfigs.map(configAddress => dbcClient.state.getPoolsByConfig(configAddress)))
      : [];
    const dbcPoolByAddress = new Map<string, any>();
    for (const poolEntries of dbcPoolsByConfig) {
      for (const poolEntry of poolEntries) dbcPoolByAddress.set(poolEntry.publicKey.toBase58(), poolEntry.account);
    }
    const dbcConfigStates = new Map<string, any>();
    if (dbcClient) {
      const dbcConfigValues = await Promise.all(dbcConfigs.map(configAddress => dbcClient.state.getPoolConfig(configAddress)));
      dbcConfigValues.forEach((configState, index) => {
        if (!configState) throw new Error(`Meteora DBC config ${dbcConfigs[index].toBase58()} is missing.`);
        dbcConfigStates.set(dbcConfigs[index].toBase58(), configState);
      });
    }
    const [metadata, config, assetCatalog, stats, currentEpoch] = await Promise.all([
      this.getIndexedMetadata(mints),
      curves.length
        ? (program.account as any).globalConfig.fetch(getGlobalConfigPda(PROGRAM_ID)[0])
        : Promise.resolve(null),
      getNetworkAssetCatalog(this.connection, "all", genesisHash),
      TradeStoreService.getInstance().getMarketStats(mints).catch(() => null),
      this.connection.getEpochInfo
        ? this.connection.getEpochInfo("confirmed").catch(() => null)
        : Promise.resolve(null),
    ]);

    const assets = new Map<string, any>();
    for (const a of assetCatalog) {
      assets.set(a.mintAddress, a);
    }

    const records: Array<{ token: TokenMetadata; poolState?: any; poolAddress?: PublicKey; expectedPoolAddress?: PublicKey }> = [];
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
        const assetMarkPrice = getAssetMarkPrice(asset);
        const hasAssetMark = assetMarkPrice > 0;
        const equityValue = hasAssetMark ? equityBalance * assetMarkPrice : 0;

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
            stockPriceUsd: assetMarkPrice,
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
            valuationAvailable: hasAssetMark || equityBalance === 0,
            valuationSource: getAssetValuationSource(asset) },
          dataSource: "onchain", lastUpdatedAt: new Date().toISOString(), observedSlot: context.slot,
        }, poolState, poolAddress, expectedPoolAddress: poolAddress ? deriveCustomizablePoolAddress(USDC_MINT, account.memeMint) : undefined });
      }
    }

    // DBC virtual pools, quote reserves, and spot prices are the live source
    // for every new launch. The StreetFun registry only proves asset backing.
    for (let start = 0; start < dbcLaunches.length; start += 20) {
      const group = dbcLaunches.slice(start, start + 20);
      const keys = group.flatMap((entry: any) => {
        const registry: any = entry.account;
        const virtualPool = dbcPoolByAddress.get(registry.dbcPool.toBase58());
        const migrated = Boolean(virtualPool?.poolState?.isMigrated);
        const dammPool = !registry.meteoraDammV2Pool.equals(PublicKey.default)
          ? registry.meteoraDammV2Pool
          : migrated
            ? deriveDammV2PoolAddress(getDbcMigrationDammConfigAddress(), registry.memeMint, registry.quoteMint)
            : PublicKey.default;
        return [entry.publicKey, registry.memeMint, registry.targetEquityMint, registry.dbcPool, dammPool];
      });
      const { context, value } = await this.connection.getMultipleAccountsInfoAndContext(keys, "confirmed");
      const decodedEntries: Array<{
        entry: any; registry: any; mintState: ReturnType<typeof unpackMint>; equityInfo: any;
        poolState: any; configState: any; dammPool: PublicKey; dammPoolState?: any;
        treasuryAddress: PublicKey; treasuryInfo?: import("@solana/web3.js").AccountInfo<Buffer> | null;
      }> = [];
      const treasuryAddresses: PublicKey[] = [];
      for (let i = 0; i < group.length; i++) {
        const [registryInfo, mintInfo, equityInfo, dbcPoolInfo, dammPoolInfo] = value.slice(i * 5, i * 5 + 5);
        const entry = group[i];
        if (!registryInfo?.owner.equals(PROGRAM_ID) || !mintInfo || !equityInfo) continue;
        const registry: any = program.coder.accounts.decode("dbcLaunchAccount", registryInfo.data);
        const mint = registry.memeMint as PublicKey;
        const expectedRegistry = getDbcLaunchPda(mint, PROGRAM_ID)[0];
        const virtualPool = dbcPoolByAddress.get(registry.dbcPool.toBase58());
        const configState = dbcConfigStates.get(registry.dbcConfig.toBase58());
        if (!entry.publicKey.equals(expectedRegistry) || !virtualPool || !dbcPoolInfo?.owner.equals(METEORA_DBC_PROGRAM_ID) || !configState ||
            !virtualPool.poolState.baseMint.equals(mint) || !virtualPool.poolState.config.equals(registry.dbcConfig) ||
            !registry.quoteMint.equals(USDC_MINT) || !configState.quoteMint.equals(USDC_MINT)) continue;
        if (!mintInfo.owner.equals(TOKEN_PROGRAM_ID) ||
            (!equityInfo.owner.equals(TOKEN_PROGRAM_ID) && !equityInfo.owner.equals(TOKEN_2022_PROGRAM_ID))) continue;
        const mintState = unpackMint(mint, mintInfo, TOKEN_PROGRAM_ID);
        if (mintState.decimals !== 6 || BigInt(registry.initialMemeSupply.toString()) !== 1_000_000_000_000_000n ||
            mintState.supply > BigInt(registry.initialMemeSupply.toString())) continue;
        const treasuryAddress = getAssociatedTokenAddressSync(registry.targetEquityMint, entry.publicKey, true, equityInfo.owner);
        const dammPool = !registry.meteoraDammV2Pool.equals(PublicKey.default)
          ? registry.meteoraDammV2Pool
          : virtualPool.poolState.isMigrated
            ? deriveDammV2PoolAddress(getDbcMigrationDammConfigAddress(), mint, registry.quoteMint)
            : PublicKey.default;
        let dammPoolState: any;
        const expectedDammPool = virtualPool.poolState.isMigrated
          ? deriveDammV2PoolAddress(getDbcMigrationDammConfigAddress(), mint, registry.quoteMint)
          : undefined;
        if (expectedDammPool && dammPool.equals(expectedDammPool) && dammPoolInfo?.owner.equals(METEORA_DAMM_V2_PROGRAM_ID)) {
          try {
            const decoded = cpAmmCoder.accounts.decode("pool", dammPoolInfo.data);
            const pairMatches = (decoded.tokenAMint.equals(mint) && decoded.tokenBMint.equals(registry.quoteMint)) ||
              (decoded.tokenBMint.equals(mint) && decoded.tokenAMint.equals(registry.quoteMint));
            if (pairMatches) dammPoolState = decoded;
          } catch { /* Bad pool data cannot become the market price source. */ }
        }
        treasuryAddresses.push(treasuryAddress);
        decodedEntries.push({ entry, registry, mintState, equityInfo, poolState: virtualPool, configState, dammPool, dammPoolState, treasuryAddress });
      }
      const treasuryInfos = treasuryAddresses.length
        ? await this.connection.getMultipleAccountsInfo(treasuryAddresses, "confirmed")
        : [];
      for (let i = 0; i < decodedEntries.length; i++) {
        const { entry, registry, mintState, equityInfo, poolState, configState, dammPool, dammPoolState, treasuryAddress } = decodedEntries[i];
        const treasuryInfo = treasuryInfos[i];
        const mint = registry.memeMint.toBase58();
        const asset = assets.get(registry.targetEquityMint.toBase58());
        const indexed = metadata.get(mint);
        let equityBalance = 0;
        let equityDecimals: number | undefined;
        let equityTransferFee: TokenMetadata["targetEquity"]["transferFee"] | undefined;
        let treasuryMatchesRegistry = false;
        if (treasuryInfo?.owner.equals(equityInfo.owner)) {
          const equityMint = unpackMint(registry.targetEquityMint, equityInfo, equityInfo.owner);
          const treasury = unpackAccount(treasuryAddress, treasuryInfo, equityInfo.owner);
          const accounted = BigInt(registry.totalEquityLocked.toString());
          if (treasury.mint.equals(registry.targetEquityMint) && treasury.owner.equals(entry.publicKey)) {
            equityDecimals = equityMint.decimals;
            treasuryMatchesRegistry = treasury.amount >= accounted;
            equityBalance = Number(treasury.amount < accounted ? treasury.amount : accounted) / 10 ** equityDecimals;
          }
          const transferFeeConfig = getTransferFeeConfig(equityMint);
          if (!transferFeeConfig) equityTransferFee = null;
          else if (currentEpoch) {
            const activeFee = getEpochFee(transferFeeConfig, BigInt(currentEpoch.epoch));
            equityTransferFee = { basisPoints: activeFee.transferFeeBasisPoints, maximumFeeRaw: activeFee.maximumFee.toString() };
          }
        }
        const dammPoolVerified = Boolean(poolState.poolState.isMigrated && dammPoolState);
        const isGraduated = Boolean(registry.isGraduated && dammPoolVerified && treasuryMatchesRegistry);
        const settlementPending = Boolean(poolState.poolState.isMigrated && !isGraduated);
        const assetMarkPrice = getAssetMarkPrice(asset);
        const hasAssetMark = assetMarkPrice > 0;
        const equityValue = hasAssetMark ? equityBalance * assetMarkPrice : 0;
        const price = poolState.poolState.isMigrated
          ? 0
          : getDbcPriceFromSqrtPrice(poolState.poolState.sqrtPrice, 6, 6).toNumber();
        const quoteReserveRaw = BigInt(poolState.poolState.quoteReserve.toString());
        const thresholdRaw = BigInt(configState.migrationQuoteThreshold.toString());
        const quoteReserveUsd = Number(quoteReserveRaw) / 1e6;
        const thresholdUsd = Number(thresholdRaw) / 1e6;
        const supply = Number(mintState.supply) / 1e6;
        const progressPct = thresholdRaw > 0n
          ? Math.min(100, Number(quoteReserveRaw * 10_000n / thresholdRaw) / 100)
          : 0;
        const graduatedPoolAddress = dammPoolVerified ? dammPool : undefined;
        records.push({
          token: {
            mint, name: indexed?.name || `StreetFun ${mint.slice(0, 4)}`, symbol: indexed?.symbol || mint.slice(0, 5),
            description: indexed?.description || "On-chain StreetFun market.",
            avatarUrl: indexed?.avatar_url || "/generated/streetfun-logo.png", creator: registry.creator.toBase58(),
            createdAt: indexed?.created_at || "", totalSupply: supply,
            priceUsd: price, marketCapUsd: price > 0 ? price * supply : 0,
            priceChange24h: 0, priceChange24hAvailable: false,
            volume24hUsd: stats?.[mint]?.volume24hUsd || 0, volume24hAvailable: stats !== null,
            targetEquity: {
              symbol: asset?.symbol || indexed?.target_equity_symbol || "UNVERIFIED",
              name: asset?.name || "Pre-IPO Collateral", mintAddress: registry.targetEquityMint.toBase58(),
              issuer: asset?.issuer || "Unverified", custodian: asset?.custodian || "Unverified",
              legalFramework: asset?.legalFramework || "Collateral identity unverified",
              logoUrl: getOfficialEquityLogo(asset?.symbol || indexed?.target_equity_symbol || asset?.name),
              stockPriceUsd: assetMarkPrice,
              isPreIpo: !!asset && !asset.testCollateral, decimals: equityDecimals,
              verifiedTessera: asset?.provider !== "prestocks" && !!asset && !asset.testCollateral,
              verifiedPreStocks: asset?.provider === "prestocks" && !asset.testCollateral,
              isTestCollateral: Boolean(asset?.testCollateral), transferFee: equityTransferFee,
            },
            bondingCurve: {
              protocol: "meteora-dbc", dbcPoolAddress: registry.dbcPool.toBase58(), settlementPending,
              dbcSettlementFallbackAt: getDbcSettlementFallbackAt(poolState.poolState.finishCurveTimestamp.toString()),
              realQuoteReservesUsd: quoteReserveUsd, graduationThresholdUsd: thresholdUsd,
              progressPct: isGraduated ? 100 : progressPct,
              dbcQuoteReserveRaw: poolState.poolState.quoteReserve.toString(),
              dbcBaseReserveRaw: poolState.poolState.baseReserve.toString(),
              quoteMint: registry.quoteMint.toBase58(), isGraduated,
              graduatedAt: isGraduated ? new Date(Number(registry.graduatedAt.toString()) * 1000).toISOString() : undefined,
              meteoraPoolAddress: graduatedPoolAddress?.toBase58(),
              equityPurchaseBudgetUsd: isGraduated ? Number(registry.settlementQuoteAmount.toString()) / 1e6 : undefined,
            },
            treasury: {
              totalEquityLocked: equityBalance, totalEquityValueUsd: equityValue,
              vaultPda: treasuryAddress.toBase58(), proofOfReserveVerified: false,
              valuationAvailable: hasAssetMark || equityBalance === 0,
              valuationSource: getAssetValuationSource(asset),
            },
            dataSource: "onchain", lastUpdatedAt: new Date().toISOString(), observedSlot: context.slot,
          },
          poolState: graduatedPoolAddress ? dammPoolState : undefined,
          poolAddress: graduatedPoolAddress,
          expectedPoolAddress: graduatedPoolAddress
            ? deriveDammV2PoolAddress(getDbcMigrationDammConfigAddress(), registry.memeMint, registry.quoteMint)
            : undefined,
        });
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
        if (!poolAddress) continue;
        const record = records.find(item => item.token === token);
        if (record?.expectedPoolAddress && !poolAddress.equals(record.expectedPoolAddress)) continue;
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
    for (const record of records) {
      if (record.token.bondingCurve.protocol === "meteora-dbc" && record.poolAddress &&
          (!record.token.bondingCurve.meteoraPoolAddress || record.token.priceUsd <= 0)) {
        record.token.bondingCurve.isGraduated = false;
        record.token.bondingCurve.settlementPending = true;
        record.token.bondingCurve.meteoraPoolAddress = undefined;
        record.token.priceUsd = 0;
        record.token.marketCapUsd = 0;
      }
    }
    return records.map((record) => record.token).sort((a, b) => b.bondingCurve.realQuoteReservesUsd - a.bondingCurve.realQuoteReservesUsd);
  }

  async getToken(mint: string): Promise<TokenMetadata | null> {
    return (await this.getTokens()).find(token => token.mint === mint) || null;
  }
}
export const solanaTokenService = new SolanaTokenService();

import * as anchor from "@coral-xyz/anchor";
import {
  CpAmm,
  SwapMode as DammSwapMode,
  cpAmmCoder,
  derivePoolAuthority,
  getCurrentPoint as getDammCurrentPoint,
  hasTransferHookExtension,
} from "@meteora-ag/cp-amm-sdk";
import {
  deriveDammV2PoolAddress,
  deriveDbcPoolAuthority,
} from "@meteora-ag/dynamic-bonding-curve-sdk";
import {
  getAssociatedTokenAddressSync,
  getMint,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import BN from "bn.js";
import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import idl from "@/idl/streetfun.json";
import { METEORA_DAMM_V2_PROGRAM_ID, METEORA_DBC_PROGRAM_ID, PROGRAM_ID, USDC_MINT } from "@/sdk/constants";
import { getDbcLaunchPda, getGlobalConfigPda } from "@/sdk/pda";
import { assertStreetFunDbcConfig, getDbcClient, getDbcMigrationDammConfigAddress } from "@/server/meteoraDbc";
import { assertConfiguredCluster, getServerConnection } from "@/server/rpc";

export const dynamic = "force-dynamic";

class DbcGraduationError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) { super(message); }
}

function parsePublicKey(value: unknown, field: string): PublicKey {
  if (typeof value !== "string") throw new DbcGraduationError(`A valid ${field} address is required.`, 400, "INVALID_REQUEST");
  try { return new PublicKey(value); }
  catch { throw new DbcGraduationError(`A valid ${field} address is required.`, 400, "INVALID_REQUEST"); }
}

function db(program: PublicKey, seed: string): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from(seed)], program)[0];
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const mint = parsePublicKey(body?.mint, "mint");
    const caller = parsePublicKey(body?.caller, "caller");
    const slippageBps = Number(body?.slippageBps ?? 100);
    if (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps > 1_000) {
      throw new DbcGraduationError("Slippage must be from 0 to 1000 basis points.", 400, "INVALID_SLIPPAGE");
    }

    const connection = getServerConnection();
    const networkGenesisHash = await assertConfiguredCluster(connection);
    const [globalConfig] = getGlobalConfigPda(PROGRAM_ID);
    const [registryAddress] = getDbcLaunchPda(mint, PROGRAM_ID);
    const readonlyWallet: any = {
      publicKey: PublicKey.default,
      signTransaction: async () => { throw new Error("Read-only wallet"); },
      signAllTransactions: async () => { throw new Error("Read-only wallet"); },
    };
    const program = new anchor.Program(
      { ...idl, address: PROGRAM_ID.toBase58() } as any,
      new anchor.AnchorProvider(connection, readonlyWallet, { commitment: "confirmed" }),
    );
    let registry: any;
    try { registry = await (program.account as any).dbcLaunchAccount.fetch(registryAddress); }
    catch { throw new DbcGraduationError("This mint has no StreetFun DBC launch registry.", 404, "DBC_LAUNCH_NOT_FOUND"); }
    if (!registry.memeMint.equals(mint)) throw new DbcGraduationError("Launch registry and mint do not match.", 409, "DBC_REGISTRY_MISMATCH");
    if (!registry.creator.equals(caller)) {
      throw new DbcGraduationError("Only the launch creator can authorize DBC migration and equity settlement.", 403, "CREATOR_AUTH_REQUIRED");
    }
    if (registry.isGraduated) throw new DbcGraduationError("This token has already completed settlement.", 409, "ALREADY_GRADUATED");

    const dbcClient = getDbcClient(connection);
    const dbcConfig: any = await assertStreetFunDbcConfig(dbcClient, registry.dbcConfig);
    const virtualPool = await dbcClient.state.getPool(registry.dbcPool);
    if (!virtualPool || !virtualPool.poolState.baseMint.equals(mint) ||
        !virtualPool.poolState.config.equals(registry.dbcConfig) ||
        !registry.quoteMint.equals(USDC_MINT) || !dbcConfig.quoteMint.equals(USDC_MINT)) {
      throw new DbcGraduationError("The live Meteora DBC pool does not match this launch registry.", 409, "DBC_POOL_MISMATCH");
    }
    const threshold = BigInt(dbcConfig.migrationQuoteThreshold.toString());
    const quoteReserve = BigInt(virtualPool.poolState.quoteReserve.toString());
    if (threshold <= 0n || quoteReserve < threshold) {
      throw new DbcGraduationError("The live DBC quote reserve has not reached its migration threshold.", 409, "THRESHOLD_NOT_REACHED");
    }

    const migrationDammConfig = getDbcMigrationDammConfigAddress();
    const migratedPool = deriveDammV2PoolAddress(migrationDammConfig, mint, registry.quoteMint);
    if (!virtualPool.poolState.isMigrated) {
      if (await connection.getAccountInfo(migratedPool, "confirmed")) {
        throw new DbcGraduationError("A DAMM v2 pool exists but the DBC pool is not marked migrated. Verify Meteora migration state before retrying.", 409, "MIGRATION_STATE_MISMATCH");
      }
      return NextResponse.json({
        action: "migrate",
        networkGenesisHash,
        pool: registry.dbcPool.toBase58(),
        dammConfig: migrationDammConfig.toBase58(),
        quoteReserve: quoteReserve.toString(),
        migrationThreshold: threshold.toString(),
        requiredPartnerQuoteForEquity: (threshold / 2n).toString(),
      }, { headers: { "Cache-Control": "no-store" } });
    }

    const [migratedPoolInfo, dbcPoolInfo, quoteMintInfo, equityMintInfo] = await connection.getMultipleAccountsInfo(
      [migratedPool, registry.dbcPool, registry.quoteMint, registry.targetEquityMint], "confirmed",
    );
    if (!migratedPoolInfo?.owner.equals(METEORA_DAMM_V2_PROGRAM_ID) || !dbcPoolInfo?.owner.equals(METEORA_DBC_PROGRAM_ID) ||
        !quoteMintInfo?.owner.equals(TOKEN_PROGRAM_ID) || !equityMintInfo) {
      throw new DbcGraduationError("The migrated pool or settlement mints are not owned by the expected Solana programs.", 409, "MIGRATION_ACCOUNTS_INVALID");
    }
    const migratedState: any = cpAmmCoder.accounts.decode("pool", migratedPoolInfo.data);
    const migratedPairMatches = (migratedState.tokenAMint.equals(mint) && migratedState.tokenBMint.equals(registry.quoteMint)) ||
      (migratedState.tokenBMint.equals(mint) && migratedState.tokenAMint.equals(registry.quoteMint));
    if (!migratedPairMatches || !migratedPool.equals(deriveDammV2PoolAddress(migrationDammConfig, migratedState.tokenAMint, migratedState.tokenBMint))) {
      throw new DbcGraduationError("The migrated DAMM v2 pool does not match the DBC launch pair and configured migration pool.", 409, "MIGRATED_POOL_INVALID");
    }
    const [equityTokenProgram] = [equityMintInfo.owner];
    if (!equityTokenProgram.equals(TOKEN_PROGRAM_ID) && !equityTokenProgram.equals(TOKEN_2022_PROGRAM_ID)) {
      throw new DbcGraduationError("The collateral mint uses an unsupported token program.", 409, "UNSUPPORTED_EQUITY_TOKEN_PROGRAM");
    }
    if ((await hasTransferHookExtension(connection, registry.targetEquityMint)).hasTransferHook) {
      throw new DbcGraduationError("The collateral mint has a transfer hook that DAMM v2 cannot safely satisfy.", 409, "UNSUPPORTED_EQUITY_TRANSFER_HOOK");
    }
    const equityMintState = await getMint(connection, registry.targetEquityMint, "confirmed", equityTokenProgram);
    const thresholdPartnerFee = threshold / 2n;
    if (thresholdPartnerFee <= 0n) throw new DbcGraduationError("The configured partner migration allocation is too small to settle.", 409, "EMPTY_PARTNER_MIGRATION_FEE");

    const client = new CpAmm(connection);
    const [targetAsA, targetAsB] = await Promise.all([
      client.fetchPoolStatesByTokenAMint(registry.targetEquityMint),
      client.fetchPoolStatesByTokenBMint(registry.targetEquityMint),
    ]);
    const equityMarkets = [...targetAsA, ...targetAsB].filter(({ account }: any) =>
      (account.tokenAMint.equals(USDC_MINT) && account.tokenBMint.equals(registry.targetEquityMint)) ||
      (account.tokenBMint.equals(USDC_MINT) && account.tokenAMint.equals(registry.targetEquityMint)),
    );
    if (!equityMarkets.length) {
      throw new DbcGraduationError("No live Meteora DAMM v2 USDC/collateral pool exists, so the equity purchase cannot be verified.", 409, "EQUITY_MARKET_UNAVAILABLE");
    }
    const [epoch, usdcMint] = await Promise.all([
      connection.getEpochInfo("confirmed"),
      getMint(connection, USDC_MINT, "confirmed", TOKEN_PROGRAM_ID),
    ]);
    const markets = await Promise.all(equityMarkets.map(async (market: any) => {
      try {
        const aIsQuote = market.account.tokenAMint.equals(USDC_MINT);
        const currentPoint = await getDammCurrentPoint(connection, market.account.activationType as any);
        const quote = client.getQuote2({
          inputTokenMint: USDC_MINT,
          slippage: slippageBps,
          currentPoint,
          poolState: market.account,
          tokenADecimal: aIsQuote ? usdcMint.decimals : equityMintState.decimals,
          tokenBDecimal: aIsQuote ? equityMintState.decimals : usdcMint.decimals,
          outputTokenInfo: equityTokenProgram.equals(TOKEN_2022_PROGRAM_ID)
            ? { mint: equityMintState, currentEpoch: epoch.epoch }
            : undefined,
          hasReferral: false,
          swapMode: DammSwapMode.ExactIn,
          amountIn: new BN(thresholdPartnerFee.toString()),
        });
        return quote.outputAmount.isZero() ? null : { market, quote };
      } catch { return null; }
    }));
    const bestQuote = markets.reduce<{ market: any; quote: any } | null>((best, item) =>
      item && (!best || item.quote.outputAmount.gt(best.quote.outputAmount)) ? item : best,
    null);
    if (!bestQuote) throw new DbcGraduationError("No active DAMM v2 collateral market can quote the required partner migration allocation.", 409, "EQUITY_MARKET_UNAVAILABLE");

    const [dammPoolAuthority] = [derivePoolAuthority()];
    const globalQuoteAccount = getAssociatedTokenAddressSync(USDC_MINT, globalConfig, true, TOKEN_PROGRAM_ID);
    const treasuryVault = getAssociatedTokenAddressSync(registry.targetEquityMint, registryAddress, true, equityTokenProgram);
    const eventAuthority = db(METEORA_DAMM_V2_PROGRAM_ID, "__event_authority");
    const dbcEventAuthority = db(METEORA_DBC_PROGRAM_ID, "__event_authority");
    const expectedPartnerQuoteAccount = await connection.getAccountInfo(globalQuoteAccount, "confirmed");
    if (!expectedPartnerQuoteAccount) {
      throw new DbcGraduationError("StreetFun's quote-token partner account is missing; launch registration did not complete.", 409, "PARTNER_ACCOUNT_MISSING");
    }
    const minEquityTokensExpected = BigInt(bestQuote.quote.minimumAmountOut.toString());
    if (minEquityTokensExpected <= 0n) throw new DbcGraduationError("The live collateral quote returned no spendable shares.", 409, "ZERO_EQUITY_QUOTE");

    return NextResponse.json({
      action: "settle",
      networkGenesisHash,
      amounts: {
        partnerQuoteForEquity: thresholdPartnerFee.toString(),
        estimatedEquityOut: bestQuote.quote.outputAmount.toString(),
        minEquityTokensExpected: minEquityTokensExpected.toString(),
        migratedDammQuoteVault: migratedState.tokenAMint.equals(USDC_MINT)
          ? migratedState.tokenAVault.toBase58()
          : migratedState.tokenBVault.toBase58(),
      },
      pool: { address: migratedPool.toBase58(), quoteReserve: quoteReserve.toString(), migrationThreshold: threshold.toString() },
      accounts: {
        caller: caller.toBase58(), globalConfig: globalConfig.toBase58(), memeMint: mint.toBase58(),
        quoteMint: registry.quoteMint.toBase58(), targetEquityMint: registry.targetEquityMint.toBase58(),
        dbcLaunch: registryAddress.toBase58(), dbcPool: registry.dbcPool.toBase58(), dbcConfig: registry.dbcConfig.toBase58(),
        dbcQuoteVault: virtualPool.poolState.quoteVault.toBase58(), dbcPoolAuthority: deriveDbcPoolAuthority().toBase58(),
        dbcEventAuthority: dbcEventAuthority.toBase58(), dbcProgram: METEORA_DBC_PROGRAM_ID.toBase58(),
        migratedDbcDammPool: migratedPool.toBase58(), migratedDbcDammConfig: migrationDammConfig.toBase58(),
        migratedDbcDammTokenAVault: migratedState.tokenAVault.toBase58(), migratedDbcDammTokenBVault: migratedState.tokenBVault.toBase58(),
        partnerQuoteAccount: globalQuoteAccount.toBase58(), treasuryVault: treasuryVault.toBase58(),
        equityDammV2Pool: bestQuote.market.publicKey.toBase58(),
        equityReserveA: bestQuote.market.account.tokenAVault.toBase58(), equityReserveB: bestQuote.market.account.tokenBVault.toBase58(),
        equityTokenAMint: bestQuote.market.account.tokenAMint.toBase58(), equityTokenBMint: bestQuote.market.account.tokenBMint.toBase58(),
        equityTokenAProgram: (bestQuote.market.account.tokenAMint.equals(USDC_MINT) ? TOKEN_PROGRAM_ID : equityTokenProgram).toBase58(),
        equityTokenBProgram: (bestQuote.market.account.tokenBMint.equals(USDC_MINT) ? TOKEN_PROGRAM_ID : equityTokenProgram).toBase58(),
        dammV2PoolAuthority: dammPoolAuthority.toBase58(), dammV2EventAuthority: eventAuthority.toBase58(),
        dammV2Program: METEORA_DAMM_V2_PROGRAM_ID.toBase58(), tokenProgram: TOKEN_PROGRAM_ID.toBase58(),
        equityTokenProgram: equityTokenProgram.toBase58(), token2022Program: TOKEN_2022_PROGRAM_ID.toBase58(),
        associatedTokenProgram: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL", systemProgram: "11111111111111111111111111111111",
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof DbcGraduationError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers: { "Cache-Control": "no-store" } });
    }
    console.error("[DBC graduation] Could not prepare Meteora migration or settlement:", error);
    return NextResponse.json({ error: "Live DBC migration or settlement could not be prepared.", code: "DBC_GRADUATION_UNAVAILABLE" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

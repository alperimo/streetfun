import * as anchor from "@coral-xyz/anchor";
import {
  CpAmm,
  SwapMode,
  CP_AMM_PROGRAM_ID,
  deriveCustomizablePoolAddress,
  derivePoolAuthority,
  derivePositionAddress,
  derivePositionNftAccount,
  deriveTokenVaultAddress,
  getCurrentPoint,
  hasTransferHookExtension,
} from "@meteora-ag/cp-amm-sdk";
import { getAssociatedTokenAddress, TOKEN_2022_PROGRAM_ID, TOKEN_PROGRAM_ID, unpackAccount, unpackMint } from "@solana/spl-token";
import { NextResponse } from "next/server";
import BN from "bn.js";
import { PublicKey } from "@solana/web3.js";
import idl from "@/idl/streetfun.json";
import { PROGRAM_ID, SALE_SUPPLY, TOTAL_MEME_SUPPLY, USDC_MINT } from "@/sdk/constants";
import { getCurvePda, getGlobalConfigPda, getQuoteVaultPda, getTokenVaultPda, getTreasuryVaultPda } from "@/sdk/pda";
import { assertConfiguredCluster, getServerConnection } from "@/server/rpc";
import { prepareExactDammV2GraduationPool } from "@/server/dammV2Graduation";

export const dynamic = "force-dynamic";

class GraduationPlanError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) {
    super(message);
  }
}

/**
 * Prepare the exact permissionless graduation instruction for the connected
 * wallet. The route only reads chain state; the wallet signs and pays for all
 * state changes. The on-chain instruction remains the settlement authority.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const memeMint = parsePublicKey(body?.mint, "mint");
    const caller = parsePublicKey(body?.caller, "caller");
    const positionNftMint = parsePublicKey(body?.positionNftMint, "positionNftMint");
    const slippageBps = Number(body?.slippageBps ?? 100);
    if (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps > 1_000) {
      throw new GraduationPlanError("Slippage must be from 0 to 1000 basis points.", 400, "INVALID_SLIPPAGE");
    }

    const connection = getServerConnection();
    const genesisHash = await assertConfiguredCluster(connection);
    const readonlyWallet: any = {
      publicKey: PublicKey.default,
      signTransaction: async () => { throw new Error("Read-only wallet"); },
      signAllTransactions: async () => { throw new Error("Read-only wallet"); },
    };
    const provider = new anchor.AnchorProvider(connection, readonlyWallet, { commitment: "confirmed" });
    const program = new anchor.Program({ ...idl, address: PROGRAM_ID.toBase58() } as any, provider);
    const [curveAddress] = getCurvePda(memeMint, PROGRAM_ID);
    const [globalConfigAddress] = getGlobalConfigPda(PROGRAM_ID);
    const [quoteVaultAddress] = getQuoteVaultPda(curveAddress, PROGRAM_ID);
    const [tokenVaultAddress] = getTokenVaultPda(curveAddress, PROGRAM_ID);
    const [treasuryVaultAddress] = getTreasuryVaultPda(curveAddress, PROGRAM_ID);

    let curve: any;
    let config: any;
    try {
      [curve, config] = await Promise.all([
        (program.account as any).curveAccount.fetch(curveAddress),
        (program.account as any).globalConfig.fetch(globalConfigAddress),
      ]);
    } catch {
      throw new GraduationPlanError("This token does not have a live StreetFun curve on the configured cluster.", 404, "CURVE_NOT_FOUND");
    }
    if (!curve.memeMint.equals(memeMint)) {
      throw new GraduationPlanError("The supplied token mint does not match its curve account.", 400, "CURVE_MINT_MISMATCH");
    }
    if (curve.isGraduated) {
      throw new GraduationPlanError("This curve has already graduated.", 409, "ALREADY_GRADUATED");
    }
    const quoteForEquity = BigInt(curve.realQuoteReserves.toString()) / 2n;
    const quoteForLiquidity = BigInt(curve.realQuoteReserves.toString()) - quoteForEquity;
    const graduationThreshold = BigInt(config.graduationThreshold.toString());
    if (BigInt(curve.realQuoteReserves.toString()) < graduationThreshold) {
      throw new GraduationPlanError("The curve has not reached its graduation threshold.", 409, "THRESHOLD_NOT_REACHED");
    }
    const graduationFeeBps = Number(config.graduationFeeBps);
    if (!Number.isInteger(graduationFeeBps) || graduationFeeBps < 1 || graduationFeeBps > 1_000) {
      throw new GraduationPlanError("The configured DAMM v2 graduation fee is invalid.", 409, "INVALID_GRADUATION_FEE");
    }
    if (BigInt(curve.totalEquityLocked.toString()) !== 0n) {
      throw new GraduationPlanError("The curve already records collateral and cannot be settled twice.", 409, "COLLATERAL_ALREADY_RECORDED");
    }
    if (quoteForEquity <= 0n || quoteForLiquidity <= 0n) {
      throw new GraduationPlanError("The curve has insufficient quote reserves to settle both outcomes.", 409, "INSUFFICIENT_QUOTE_RESERVES");
    }

    const [quoteVaultInfo, tokenVaultInfo, memeMintInfo, equityMintInfo, treasuryVaultInfo] = await connection.getMultipleAccountsInfo(
      [quoteVaultAddress, tokenVaultAddress, memeMint, curve.targetEquityMint, treasuryVaultAddress],
      "confirmed",
    );
    if (!quoteVaultInfo || !tokenVaultInfo || !memeMintInfo || !equityMintInfo || !treasuryVaultInfo) {
      throw new GraduationPlanError("One or more live settlement accounts are missing.", 409, "SETTLEMENT_ACCOUNT_MISSING");
    }
    if (!quoteVaultInfo.owner.equals(TOKEN_PROGRAM_ID) || !tokenVaultInfo.owner.equals(TOKEN_PROGRAM_ID) || !memeMintInfo.owner.equals(TOKEN_PROGRAM_ID)) {
      throw new GraduationPlanError("The curve quote and token accounts do not use the supported SPL Token program.", 409, "UNSUPPORTED_CURVE_TOKEN_PROGRAM");
    }
    const quoteVault = unpackAccount(quoteVaultAddress, quoteVaultInfo, TOKEN_PROGRAM_ID);
    const tokenVault = unpackAccount(tokenVaultAddress, tokenVaultInfo, TOKEN_PROGRAM_ID);
    const memeMintState = unpackMint(memeMint, memeMintInfo, TOKEN_PROGRAM_ID);
    const equityTokenProgram = equityMintInfo.owner;
    if (!equityTokenProgram.equals(TOKEN_PROGRAM_ID) && !equityTokenProgram.equals(TOKEN_2022_PROGRAM_ID)) {
      throw new GraduationPlanError("The target equity mint uses an unsupported token program.", 409, "UNSUPPORTED_EQUITY_TOKEN_PROGRAM");
    }
    const equityMintState = unpackMint(curve.targetEquityMint, equityMintInfo, equityTokenProgram);
    if (!treasuryVaultInfo.owner.equals(equityTokenProgram)) {
      throw new GraduationPlanError("The collateral vault token program does not match the Tessera mint.", 409, "TREASURY_VAULT_MISMATCH");
    }
    const treasuryVault = unpackAccount(treasuryVaultAddress, treasuryVaultInfo, equityTokenProgram);
    if (!treasuryVault.mint.equals(curve.targetEquityMint) || !treasuryVault.owner.equals(curveAddress) || treasuryVault.amount !== 0n) {
      throw new GraduationPlanError("The collateral vault is not empty and correctly controlled for settlement.", 409, "TREASURY_VAULT_MISMATCH");
    }
    if ((await hasTransferHookExtension(connection, curve.targetEquityMint)).hasTransferHook) {
      throw new GraduationPlanError(
        "This equity mint has a transfer hook that the available DAMM v2 swap instruction cannot safely satisfy.",
        409,
        "UNSUPPORTED_EQUITY_TRANSFER_HOOK",
      );
    }
    const expectedPoolTokenAmount = BigInt(curve.realTokenReserves.toString()) + TOTAL_MEME_SUPPLY - SALE_SUPPLY;
    if (!quoteVault.mint.equals(USDC_MINT) || !quoteVault.owner.equals(curveAddress) || quoteVault.amount.toString() !== curve.realQuoteReserves.toString()) {
      throw new GraduationPlanError("The live quote vault does not match the curve's recorded reserves.", 409, "QUOTE_RESERVE_MISMATCH");
    }
    if (!tokenVault.mint.equals(memeMint) || !tokenVault.owner.equals(curveAddress) || tokenVault.amount.toString() !== expectedPoolTokenAmount.toString()) {
      throw new GraduationPlanError("The live token vault does not match the required post-graduation supply.", 409, "TOKEN_SUPPLY_MISMATCH");
    }
    if (memeMintState.decimals !== 6 || memeMintState.supply.toString() !== curve.totalMemeSupply.toString() || curve.totalMemeSupply.toString() !== "1000000000000000") {
      throw new GraduationPlanError("The live mint supply does not satisfy the graduation supply invariant.", 409, "TOKEN_SUPPLY_MISMATCH");
    }

    const client = new CpAmm(connection);
    const [targetAsA, targetAsB] = await Promise.all([
      client.fetchPoolStatesByTokenAMint(curve.targetEquityMint),
      client.fetchPoolStatesByTokenBMint(curve.targetEquityMint),
    ]);
    const markets = [...targetAsA, ...targetAsB];
    const equityMarkets = markets.filter(({ account }: any) =>
      (account.tokenAMint.equals(USDC_MINT) && account.tokenBMint.equals(curve.targetEquityMint)) ||
      (account.tokenBMint.equals(USDC_MINT) && account.tokenAMint.equals(curve.targetEquityMint)),
    );
    if (!equityMarkets.length) {
      throw new GraduationPlanError(
        "No live Meteora DAMM v2 USDC/target-equity market exists on this cluster, so equity cannot be acquired safely.",
        409,
        "EQUITY_MARKET_UNAVAILABLE",
      );
    }

    const currentEpoch = await connection.getEpochInfo("confirmed");
    const currentPoints = new Map<number, Promise<BN>>();
    const quotes = await Promise.all(equityMarkets.map(async (market: any) => {
      try {
        const aIsQuote = market.account.tokenAMint.equals(USDC_MINT);
        const activationType = market.account.activationType as number;
        let currentPointPromise = currentPoints.get(activationType);
        if (!currentPointPromise) {
          currentPointPromise = getCurrentPoint(connection, activationType as any);
          currentPoints.set(activationType, currentPointPromise);
        }
        const currentPoint = await currentPointPromise;
        const quote = client.getQuote2({
          inputTokenMint: USDC_MINT,
          slippage: slippageBps,
          currentPoint,
          poolState: market.account,
          tokenADecimal: aIsQuote ? 6 : equityMintState.decimals,
          tokenBDecimal: aIsQuote ? equityMintState.decimals : 6,
          outputTokenInfo: equityTokenProgram.equals(TOKEN_2022_PROGRAM_ID)
            ? { mint: equityMintState, currentEpoch: currentEpoch.epoch }
            : undefined,
          hasReferral: false,
          swapMode: SwapMode.ExactIn,
          amountIn: new BN(quoteForEquity.toString()),
        });
        return quote.outputAmount.isZero() ? null : { market, quote };
      } catch {
        // A disabled, empty, or otherwise unusable DAMM pool is not a market route.
        return null;
      }
    }));
    const bestQuote = quotes.reduce<{ market: any; quote: any } | null>((best, candidate) =>
      candidate && (!best || candidate.quote.outputAmount.gt(best.quote.outputAmount)) ? candidate : best,
    null);
    if (!bestQuote) {
      throw new GraduationPlanError("No active DAMM v2 market can quote this equity purchase.", 409, "EQUITY_MARKET_UNAVAILABLE");
    }
    const selectedMarket = bestQuote.market;
    const selectedQuote = bestQuote.quote;

    const callerQuoteAccount = await getAssociatedTokenAddress(USDC_MINT, caller, false, TOKEN_PROGRAM_ID);
    const callerMemeAccount = await getAssociatedTokenAddress(memeMint, caller, false, TOKEN_PROGRAM_ID);
    const dammV2Pool = deriveCustomizablePoolAddress(USDC_MINT, memeMint);
    if (await connection.getAccountInfo(dammV2Pool, "confirmed")) {
      throw new GraduationPlanError("A Meteora pool already exists for this token pair; automatic graduation cannot safely create a second pool.", 409, "DESTINATION_POOL_EXISTS");
    }
    const position = derivePositionAddress(positionNftMint);
    const positionNftAccount = derivePositionNftAccount(positionNftMint);
    const dammV2QuoteVault = deriveTokenVaultAddress(USDC_MINT, dammV2Pool);
    const dammV2MemeVault = deriveTokenVaultAddress(memeMint, dammV2Pool);
    const preparedPool = prepareExactDammV2GraduationPool(
      client,
      new BN(quoteForLiquidity.toString()),
      new BN(expectedPoolTokenAmount.toString()),
    );
    if (!preparedPool) {
      throw new GraduationPlanError(
        "Meteora DAMM v2 cannot deposit the full graduation allocation for this pool price.",
        503,
        "EXACT_POOL_DEPOSIT_UNAVAILABLE",
      );
    }
    const eventAuthority = PublicKey.findProgramAddressSync([Buffer.from("__event_authority")], CP_AMM_PROGRAM_ID)[0];

    return NextResponse.json({
      success: true,
      networkGenesisHash: genesisHash,
      amounts: {
        quoteForEquity: quoteForEquity.toString(),
        quoteForLiquidity: quoteForLiquidity.toString(),
        expectedMemeTokens: expectedPoolTokenAmount.toString(),
        estimatedEquityOut: selectedQuote.outputAmount.toString(),
        minEquityTokensExpected: selectedQuote.minimumAmountOut.toString(),
      },
      pool: {
        address: dammV2Pool.toBase58(),
        sqrtPrice: preparedPool.initSqrtPrice.toString(),
        liquidity: preparedPool.liquidityDelta.toString(),
      },
      accounts: {
        caller: caller.toBase58(),
        globalConfig: globalConfigAddress.toBase58(),
        memeMint: memeMint.toBase58(),
        quoteMint: USDC_MINT.toBase58(),
        targetEquityMint: curve.targetEquityMint.toBase58(),
        curve: curveAddress.toBase58(),
        tokenVault: tokenVaultAddress.toBase58(),
        quoteVault: quoteVaultAddress.toBase58(),
        treasuryVault: treasuryVaultAddress.toBase58(),
        equityDammV2Pool: selectedMarket.publicKey.toBase58(),
        equityReserveA: selectedMarket.account.tokenAVault.toBase58(),
        equityReserveB: selectedMarket.account.tokenBVault.toBase58(),
        equityTokenAMint: selectedMarket.account.tokenAMint.toBase58(),
        equityTokenBMint: selectedMarket.account.tokenBMint.toBase58(),
        equityTokenAProgram: (selectedMarket.account.tokenAMint.equals(USDC_MINT) ? TOKEN_PROGRAM_ID : equityTokenProgram).toBase58(),
        equityTokenBProgram: (selectedMarket.account.tokenBMint.equals(USDC_MINT) ? TOKEN_PROGRAM_ID : equityTokenProgram).toBase58(),
        callerQuoteAccount: callerQuoteAccount.toBase58(),
        callerMemeAccount: callerMemeAccount.toBase58(),
        dammV2Pool: dammV2Pool.toBase58(),
        positionNftMint: positionNftMint.toBase58(),
        positionNftAccount: positionNftAccount.toBase58(),
        dammV2Position: position.toBase58(),
        dammV2QuoteVault: dammV2QuoteVault.toBase58(),
        dammV2MemeVault: dammV2MemeVault.toBase58(),
        dammV2PoolAuthority: derivePoolAuthority().toBase58(),
        dammV2EventAuthority: eventAuthority.toBase58(),
        dammV2Program: CP_AMM_PROGRAM_ID.toBase58(),
        tokenProgram: TOKEN_PROGRAM_ID.toBase58(),
        equityTokenProgram: equityTokenProgram.toBase58(),
        token2022Program: TOKEN_2022_PROGRAM_ID.toBase58(),
        associatedTokenProgram: "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
        systemProgram: "11111111111111111111111111111111",
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof GraduationPlanError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers: { "Cache-Control": "no-store" } });
    }
    console.error("[Graduation API] Could not prepare on-chain settlement:", error);
    return NextResponse.json({ error: "Live graduation settlement could not be prepared.", code: "GRADUATION_PLAN_UNAVAILABLE" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

function parsePublicKey(value: unknown, field: string): PublicKey {
  if (typeof value !== "string") throw new GraduationPlanError(`A valid ${field} address is required.`, 400, "INVALID_REQUEST");
  try {
    return new PublicKey(value);
  } catch {
    throw new GraduationPlanError(`A valid ${field} address is required.`, 400, "INVALID_REQUEST");
  }
}

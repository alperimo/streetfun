import { BorshCoder } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  unpackAccount,
  unpackMint,
} from "@solana/spl-token";
import { PROGRAM_ID } from "@/sdk/constants";
import { getDbcLaunchPda, getTreasuryVaultPda } from "@/sdk/pda";
import { PendingCurveTradeError } from "@/services/indexer/parseCurveTrade";
import idl from "@/idl/streetfun.json";
import { devnetTestCollateralLabel } from "./tessera";

const curveCoder = new BorshCoder(idl as any);

function rawTokenAmountToDecimal(amount: bigint, decimals: number): string {
  if (decimals === 0) return amount.toString();
  const divisor = 10n ** BigInt(decimals);
  const whole = amount / divisor;
  const fractional = (amount % divisor).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fractional ? `${whole}.${fractional}` : whole.toString();
}

export async function persistVaultHoldingAmount(
  db: any,
  snapshot: {
    mint: string;
    equityMint: string;
    equitySymbol: string;
    equityAmount: string;
    observedSlot: number;
  }
): Promise<void> {
  const { error } = await db.rpc("upsert_vault_holding_snapshot", {
    p_mint: snapshot.mint,
    p_equity_mint: snapshot.equityMint,
    p_equity_symbol: snapshot.equitySymbol,
    p_equity_amount: snapshot.equityAmount,
    p_observed_slot: snapshot.observedSlot,
  });
  if (error) throw new Error(`Could not persist vault holding snapshot: ${error.message}`);
}

/** Save the current redeemable collateral balance after a graduation or redemption. */
export async function persistVaultHoldingSnapshot(
  connection: Connection,
  db: any,
  curveKey: PublicKey,
  curve: any,
  minimumSlot: number,
  equitySymbol: string
): Promise<void> {
  if (!curve.isGraduated) return;

  const equityMint = curve.targetEquityMint as PublicKey;
  const [vaultKey] = getTreasuryVaultPda(curveKey, PROGRAM_ID);
  const { context, value } = await connection.getMultipleAccountsInfoAndContext(
    [curveKey, vaultKey, equityMint],
    { commitment: "confirmed", minContextSlot: minimumSlot }
  );
  const [curveInfo, vaultInfo, mintInfo] = value;
  if (!curveInfo || !vaultInfo || !mintInfo) {
    throw new PendingCurveTradeError("Treasury vault account data is not available yet.");
  }
  if (!curveInfo.owner.equals(PROGRAM_ID)) throw new Error("Treasury curve is owned by an unexpected program.");
  const currentCurve: any = curveCoder.accounts.decode("CurveAccount", curveInfo.data);
  if (!currentCurve.is_graduated || !currentCurve.meme_mint.equals(curve.memeMint) || !currentCurve.target_equity_mint.equals(equityMint)) {
    throw new PendingCurveTradeError("A consistent graduated vault snapshot is not available yet.");
  }
  if (!mintInfo.owner.equals(TOKEN_PROGRAM_ID) && !mintInfo.owner.equals(TOKEN_2022_PROGRAM_ID)) {
    throw new Error("Treasury equity mint has an unsupported token program.");
  }

  const equity = unpackMint(equityMint, mintInfo, mintInfo.owner);
  const vault = unpackAccount(vaultKey, vaultInfo, mintInfo.owner);
  if (!vault.mint.equals(equityMint) || !vault.owner.equals(curveKey)) {
    throw new Error("Treasury vault does not match its curve collateral mint.");
  }

  // Only collateral accounted for by the curve is redeemable; exclude donations.
  const accounted = BigInt(currentCurve.total_equity_locked.toString());
  const amount = vault.amount < accounted ? vault.amount : accounted;
  await persistVaultHoldingAmount(db, {
    mint: curve.memeMint.toBase58(),
    equityMint: equityMint.toBase58(),
    equitySymbol: devnetTestCollateralLabel(equityMint.toBase58()) || equitySymbol,
    equityAmount: rawTokenAmountToDecimal(amount, equity.decimals),
    observedSlot: context.slot,
  });
}

/** Persist the live redeemable balance for a settled DBC-backed launch. */
export async function persistDbcVaultHoldingSnapshot(
  connection: Connection,
  db: any,
  launchKey: PublicKey,
  launch: any,
  minimumSlot: number,
  equitySymbol: string,
): Promise<void> {
  if (!launch.is_graduated) return;
  const equityMint = launch.target_equity_mint as PublicKey;
  const mintInfo = await connection.getAccountInfo(equityMint, { commitment: "confirmed", minContextSlot: minimumSlot });
  if (!mintInfo || (!mintInfo.owner.equals(TOKEN_PROGRAM_ID) && !mintInfo.owner.equals(TOKEN_2022_PROGRAM_ID))) {
    throw new PendingCurveTradeError("Treasury equity mint account is not available yet.");
  }
  const vaultKey = getAssociatedTokenAddressSync(equityMint, launchKey, true, mintInfo.owner);
  const { context, value } = await connection.getMultipleAccountsInfoAndContext(
    [launchKey, vaultKey, equityMint],
    { commitment: "confirmed", minContextSlot: minimumSlot },
  );
  const [launchInfo, vaultInfo, currentMintInfo] = value;
  if (!launchInfo || !vaultInfo || !currentMintInfo) throw new PendingCurveTradeError("DBC treasury vault account data is not available yet.");
  if (!launchInfo.owner.equals(PROGRAM_ID)) throw new Error("DBC launch registry is owned by an unexpected program.");
  const current: any = curveCoder.accounts.decode("DbcLaunchAccount", launchInfo.data);
  if (!current.is_graduated || !current.meme_mint.equals(launch.meme_mint) || !current.target_equity_mint.equals(equityMint)) {
    throw new PendingCurveTradeError("A consistent settled DBC vault snapshot is not available yet.");
  }
  const equity = unpackMint(equityMint, currentMintInfo, currentMintInfo.owner);
  const vault = unpackAccount(vaultKey, vaultInfo, currentMintInfo.owner);
  if (!vault.mint.equals(equityMint) || !vault.owner.equals(launchKey)) throw new Error("DBC treasury vault does not match its collateral mint.");
  const accounted = BigInt(current.total_equity_locked.toString());
  const amount = vault.amount < accounted ? vault.amount : accounted;
  await persistVaultHoldingAmount(db, {
    mint: current.meme_mint.toBase58(),
    equityMint: equityMint.toBase58(),
    equitySymbol: devnetTestCollateralLabel(equityMint.toBase58()) || equitySymbol,
    equityAmount: rawTokenAmountToDecimal(amount, equity.decimals),
    observedSlot: context.slot,
  });
}

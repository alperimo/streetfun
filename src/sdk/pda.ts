import { PublicKey } from "@solana/web3.js";
import {
  PROGRAM_ID,
  GLOBAL_CONFIG_SEED,
  CURVE_SEED,
  TOKEN_VAULT_SEED,
  QUOTE_VAULT_SEED,
  TREASURY_VAULT_SEED,
} from "./constants";

export function getGlobalConfigPda(programId: PublicKey = PROGRAM_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([GLOBAL_CONFIG_SEED], programId);
}

export function getCurvePda(
  memeMint: PublicKey,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [CURVE_SEED, memeMint.toBuffer()],
    programId
  );
}

export function getTokenVaultPda(
  curvePda: PublicKey,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [TOKEN_VAULT_SEED, curvePda.toBuffer()],
    programId
  );
}

export function getQuoteVaultPda(
  curvePda: PublicKey,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [QUOTE_VAULT_SEED, curvePda.toBuffer()],
    programId
  );
}

export function getTreasuryVaultPda(
  curvePda: PublicKey,
  programId: PublicKey = PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [TREASURY_VAULT_SEED, curvePda.toBuffer()],
    programId
  );
}

import { expect } from "chai";
import { Keypair } from "@solana/web3.js";
import {
  createProvider,
  protocolAdmin,
  loadProgram,
  airdropSol,
  createSplMint,
  deriveGlobalConfigPda,
  PROTOCOL_FEE_BPS,
  GRADUATION_FEE_BPS,
  GRADUATION_THRESHOLD,
  INITIAL_VIRTUAL_QUOTE,
  INITIAL_VIRTUAL_TOKENS,
  SystemProgram,
} from "./helpers";

describe("01 - StreetFun Protocol: Initialize Global Config", () => {
  const admin = protocolAdmin;
  const feeRecipient = Keypair.generate();
  const provider = createProvider(admin);
  const program = loadProgram(provider);
  const [globalConfigPda, globalConfigBump] = deriveGlobalConfigPda();

  before(async () => {
    await airdropSol(provider.connection, admin.publicKey, 10);
    await airdropSol(provider.connection, feeRecipient.publicKey, 5);
  });

  it("Initializes Global Config with protocol parameters", async () => {
    const existing = await provider.connection.getAccountInfo(globalConfigPda);
    if (!existing) {
      const tx = await program.methods
        .initializeGlobalConfig({
          protocolFeeBps: PROTOCOL_FEE_BPS,
          graduationFeeBps: GRADUATION_FEE_BPS,
          graduationThreshold: GRADUATION_THRESHOLD,
          initialVirtualQuoteReserves: INITIAL_VIRTUAL_QUOTE,
          initialVirtualTokenReserves: INITIAL_VIRTUAL_TOKENS,
        })
        .accounts({
          admin: admin.publicKey,
          protocolFeeRecipient: feeRecipient.publicKey,
          globalConfig: globalConfigPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([admin])
        .rpc();

      expect(tx).to.be.a("string");
    }

    const configAccount = await program.account.globalConfig.fetch(globalConfigPda);
    expect(configAccount.protocolFeeBps).to.equal(PROTOCOL_FEE_BPS);
    expect(configAccount.graduationFeeBps).to.equal(GRADUATION_FEE_BPS);
    expect(configAccount.graduationThreshold.toString()).to.equal(
      GRADUATION_THRESHOLD.toString()
    );
    expect(configAccount.bump).to.equal(globalConfigBump);
  });

  it("Re-initialization of Global Config fails (account already exists)", async () => {
    try {
      await program.methods
        .initializeGlobalConfig({
          protocolFeeBps: PROTOCOL_FEE_BPS,
          graduationFeeBps: GRADUATION_FEE_BPS,
          graduationThreshold: GRADUATION_THRESHOLD,
          initialVirtualQuoteReserves: INITIAL_VIRTUAL_QUOTE,
          initialVirtualTokenReserves: INITIAL_VIRTUAL_TOKENS,
        })
        .accounts({
          admin: admin.publicKey,
          protocolFeeRecipient: feeRecipient.publicKey,
          globalConfig: globalConfigPda,
          systemProgram: SystemProgram.programId,
        })
        .signers([admin])
        .rpc();
      expect.fail("Should have failed to re-initialize");
    } catch (err: any) {
      expect(err.toString()).to.match(/already in use|custom program error: 0x0/);
    }
  });
});

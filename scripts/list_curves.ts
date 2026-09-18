import * as anchor from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

const connection = new Connection("http://127.0.0.1:8899", "confirmed");
const dummyWallet: any = {
  publicKey: PublicKey.default,
  signTransaction: async (tx: any) => tx,
  signAllTransactions: async (txs: any) => txs,
};
const provider = new anchor.AnchorProvider(connection, dummyWallet, { commitment: "confirmed" });
const idlPath = path.resolve(process.cwd(), "target/idl/streetfun.json");
const idl = JSON.parse(fs.readFileSync(idlPath, "utf8"));
const program: any = new anchor.Program(idl, provider);

async function main() {
  try {
    const curves = await program.account.curveAccount.all();
    console.log(`Found ${curves.length} on-chain curves on local validator:`);
    for (const c of curves) {
      console.log(`- Curve Pubkey: ${c.publicKey.toBase58()}`);
      console.log(`  Meme Mint: ${c.account.memeMint.toBase58()}`);
      console.log(`  Target Equity Mint: ${c.account.targetEquityMint.toBase58()}`);
      console.log(`  Real Quote Reserves (USDC): ${c.account.realQuoteReserves.toNumber() / 1_000_000}`);
      console.log(`  Real Token Reserves: ${c.account.realTokenReserves.toString()}`);
      console.log(`  Is Graduated: ${c.account.isGraduated}`);
    }
  } catch (err) {
    console.error("Error querying curves:", err);
  }
}

main();

import { NextResponse } from "next/server";
import { Keypair } from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";
import bs58 from "bs58";

export const dynamic = "force-dynamic";

function getLocalDevnetKeypair(): Keypair | null {
  const envKey = process.env.ADMIN_PRIVATE_KEY || process.env.SOLANA_PRIVATE_KEY;
  if (envKey) {
    try {
      if (envKey.startsWith("[")) {
        return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(envKey)));
      }
      return Keypair.fromSecretKey(bs58.decode(envKey));
    } catch {}
  }
  const keypairPath = path.resolve(process.env.HOME || "", ".config/solana/id.json");
  if (fs.existsSync(keypairPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(keypairPath, "utf-8"));
      return Keypair.fromSecretKey(Uint8Array.from(raw));
    } catch {}
  }
  return null;
}

export async function GET(req: Request) {
  // Strictly reject if not in local development mode
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Only available in local development" }, { status: 403 });
  }
  const host = req.headers.get("host") || "";
  const isLocalhost = host.startsWith("localhost") || host.startsWith("127.0.0.1");
  if (!isLocalhost) {
    return NextResponse.json({ error: "Only available on localhost" }, { status: 403 });
  }

  const keypair = getLocalDevnetKeypair();
  if (!keypair) {
    return NextResponse.json({ error: "No local Solana keypair found at ~/.config/solana/id.json" }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    publicKey: keypair.publicKey.toBase58(),
    secretKey: Array.from(keypair.secretKey),
  });
}

import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import bs58 from "bs58";
import { PublicKey } from "@solana/web3.js";
import { createServerSupabaseClient } from "@/lib/supabase";

// In-memory fallback for local dev / sandbox when Supabase credentials are not populated
interface InMemPass {
  passNumber: number;
  walletAddress: string;
  signature: string;
  message: string;
  xHandle?: string;
  createdAt: string;
}

const memoryPasses = new Map<string, InMemPass>();
let passCounter = 138; // Initial seed offset for alpha hype

function verifySolanaSignature(
  message: string,
  signatureBase58: string,
  publicKeyBase58: string
): boolean {
  try {
    const pubkey = new PublicKey(publicKeyBase58);
    const rawPubkey = pubkey.toBuffer();
    const sigBuffer = Buffer.from(bs58.decode(signatureBase58));
    const msgBuffer = Buffer.from(new TextEncoder().encode(message));

    // ed25519 SPKI DER prefix
    const prefix = Buffer.from("302a300506032b6570032100", "hex");
    const keyObject = crypto.createPublicKey({
      key: Buffer.concat([prefix, rawPubkey]),
      format: "der",
      type: "spki",
    });

    return crypto.verify(null, msgBuffer, keyObject, sigBuffer);
  } catch (err) {
    console.error("[verifySolanaSignature] Verification failed:", err);
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { walletAddress, signature, message, xHandle } = body;

    if (!walletAddress || !signature || !message) {
      return NextResponse.json(
        { error: "Missing required parameters (walletAddress, signature, message)" },
        { status: 400 }
      );
    }

    // Verify cryptographic signature
    const isValid = verifySolanaSignature(message, signature, walletAddress);
    if (!isValid) {
      return NextResponse.json(
        { error: "Cryptographic signature verification failed. Please sign with your own wallet." },
        { status: 401 }
      );
    }

    const cleanXHandle = xHandle
      ? String(xHandle).trim().replace(/^@/, "")
      : null;

    const supabase = createServerSupabaseClient();

    if (supabase) {
      // 1. Check if wallet is already registered
      const { data: existing, error: fetchErr } = await supabase
        .from("alpha_passes")
        .select("id, pass_number, wallet_address, x_handle, created_at")
        .eq("wallet_address", walletAddress)
        .maybeSingle();

      if (fetchErr) {
        console.error("[Alpha Claim] Supabase fetch error:", fetchErr);
      }

      if (existing) {
        // If xHandle was newly provided, update it
        if (cleanXHandle && !existing.x_handle) {
          await supabase
            .from("alpha_passes")
            .update({ x_handle: cleanXHandle })
            .eq("wallet_address", walletAddress);
        }

        return NextResponse.json({
          success: true,
          pass: {
            passNumber: existing.pass_number,
            walletAddress: existing.wallet_address,
            xHandle: cleanXHandle || existing.x_handle,
            createdAt: existing.created_at,
            isNew: false,
          },
        });
      }

      // 2. Insert new alpha pass
      const { data: inserted, error: insertErr } = await supabase
        .from("alpha_passes")
        .insert({
          wallet_address: walletAddress,
          signature,
          message,
          x_handle: cleanXHandle,
        })
        .select("pass_number, wallet_address, x_handle, created_at")
        .single();

      if (insertErr) {
        console.error("[Alpha Claim] Supabase insert error:", insertErr);
        // Fallback to local if table does not exist or connection fails
      } else if (inserted) {
        return NextResponse.json({
          success: true,
          pass: {
            passNumber: inserted.pass_number,
            walletAddress: inserted.wallet_address,
            xHandle: inserted.x_handle,
            createdAt: inserted.created_at,
            isNew: true,
          },
        });
      }
    }

    // Fallback: in-memory store
    let pass = memoryPasses.get(walletAddress);
    if (!pass) {
      passCounter += 1;
      pass = {
        passNumber: passCounter,
        walletAddress,
        signature,
        message,
        xHandle: cleanXHandle || undefined,
        createdAt: new Date().toISOString(),
      };
      memoryPasses.set(walletAddress, pass);
      return NextResponse.json({
        success: true,
        pass: { ...pass, isNew: true },
      });
    } else {
      if (cleanXHandle && !pass.xHandle) {
        pass.xHandle = cleanXHandle;
      }
      return NextResponse.json({
        success: true,
        pass: { ...pass, isNew: false },
      });
    }
  } catch (err: any) {
    console.error("[Alpha Claim API] Unexpected error:", err);
    return NextResponse.json(
      { error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

import { normalizeHandle, validAlphaClaim } from "@/lib/alphaClaim";
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import bs58 from "bs58";
import { PublicKey } from "@solana/web3.js";
import { createServerSupabaseClient } from "@/server/supabase";

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

    const cleanXHandle = normalizeHandle(xHandle);
    if (!validAlphaClaim(message, walletAddress, cleanXHandle)) return NextResponse.json({ error: "Sign a fresh StreetFun claim for this wallet and handle." }, { status: 400 });

    // Verify cryptographic signature
    const isValid = verifySolanaSignature(message, signature, walletAddress);
    if (!isValid) {
      return NextResponse.json(
        { error: "Cryptographic signature verification failed. Please sign with your own wallet." },
        { status: 401 }
      );
    }

    const supabase = createServerSupabaseClient();

    if (supabase) {
      // 1. Check if wallet is already registered
      const { data: existing, error: fetchErr } = await supabase
        .from("alpha_passes")
        .select("id, pass_number, wallet_address, x_handle, created_at")
        .eq("wallet_address", walletAddress)
        .maybeSingle();

      if (fetchErr) {
        throw new Error("Alpha claims are temporarily unavailable.");
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

    return NextResponse.json({ error: "Alpha claims could not be saved. Please try again." }, { status: 503 });
  } catch (err: any) {
    console.error("[Alpha Claim API] Unexpected error:", err);
    return NextResponse.json(
      { error: err?.message || "Internal server error" },
      { status: 500 }
    );
  }
}

import { PublicKey } from "@solana/web3.js";
import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/server/supabase";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ mint: string }> }) {
  try {
    const { mint: rawMint } = await context.params;
    const mint = new PublicKey(rawMint).toBase58();
    const supabase = createServerSupabaseClient();
    if (!supabase) return NextResponse.json({ error: "Token metadata is not configured." }, { status: 503 });
    const { data, error } = await supabase.from("tokens")
      .select("mint,name,symbol,description,avatar_url")
      .eq("mint", mint)
      .maybeSingle();
    if (error) return NextResponse.json({ error: "Token metadata is unavailable." }, { status: 503 });
    if (!data) return NextResponse.json({ error: "Token metadata has not been indexed yet." }, { status: 404 });
    const metadata: Record<string, unknown> = {
      name: data.name,
      symbol: data.symbol,
      description: data.description || "",
      properties: { category: "image" },
    };
    if (typeof data.avatar_url === "string" && /^https:\/\//i.test(data.avatar_url)) metadata.image = data.avatar_url;
    return NextResponse.json(metadata, {
      headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=60" },
    });
  } catch {
    return NextResponse.json({ error: "Invalid token mint." }, { status: 400 });
  }
}

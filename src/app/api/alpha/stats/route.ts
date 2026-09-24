import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/server/supabase";
export async function GET() {
  const db = createServerSupabaseClient();
  if (!db) return NextResponse.json({ error: "Alpha statistics unavailable." }, { status: 503 });
  const { count, error } = await db.from("alpha_passes").select("*", { count: "exact", head: true });
  if (error || count == null) return NextResponse.json({ error: "Alpha statistics unavailable." }, { status: 503 });
  return NextResponse.json({ totalClaimed: count, maxSlots: 1000, remainingSlots: Math.max(0, 1000 - count), isOpen: count < 1000 });
}

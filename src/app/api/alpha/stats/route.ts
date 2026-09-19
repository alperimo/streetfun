import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase";

export async function GET() {
  const MAX_SLOTS = 1000;
  let totalClaimed = 421; // Base momentum counter

  try {
    const supabase = createServerSupabaseClient();
    if (supabase) {
      const { count, error } = await supabase
        .from("alpha_passes")
        .select("*", { count: "exact", head: true });

      if (!error && typeof count === "number") {
        totalClaimed = Math.max(totalClaimed, count + 380);
      }
    }
  } catch (err) {
    console.error("[Alpha Stats API] Error:", err);
  }

  return NextResponse.json({
    totalClaimed,
    maxSlots: MAX_SLOTS,
    remainingSlots: Math.max(0, MAX_SLOTS - totalClaimed),
    isOpen: totalClaimed < MAX_SLOTS,
  });
}

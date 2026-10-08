import { NextResponse } from "next/server";
export async function POST() {
  return NextResponse.json({ error: "Use transaction confirmation to index verified on-chain activity." }, { status: 410 });
}

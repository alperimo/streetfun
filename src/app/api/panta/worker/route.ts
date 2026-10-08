import { timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";
import { runLifecycleWorker } from "@/server/pantaLifecycle";
import { pantaJson, pantaFailure } from "@/server/pantaHttp";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const expected = Buffer.from(`Bearer ${secret || ""}`), actual = Buffer.from(req.headers.get("authorization") || "");
  if (!secret || secret.length < 32 || actual.length !== expected.length || !timingSafeEqual(actual, expected)) return pantaJson({ error: "Unauthorized" }, 401);
  try { return pantaJson(await runLifecycleWorker()); } catch (error) { return pantaFailure(error); }
}

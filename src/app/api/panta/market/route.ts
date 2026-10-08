import { NextRequest } from "next/server";
import { bindingForToken, checkedMarket } from "@/server/pantaMarket";
import { address } from "@/server/pantaValidation";
import { pantaFailure, pantaJson, pantaQuery } from "@/server/pantaHttp";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  try {
    const mint = address(pantaQuery(req, ["mint"]).get("mint"));
    const binding = await bindingForToken(mint);
    return pantaJson(await checkedMarket(binding));
  } catch (error) { return pantaFailure(error); }
}

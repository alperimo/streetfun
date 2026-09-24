import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function middleware(request: NextRequest) {
  const isAlphaOnly =
    process.env.NEXT_PUBLIC_ALPHA_ONLY === "true" ||
    (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_FULL_APP !== "true");

  if (!isAlphaOnly) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  // Allowed public paths in Alpha-only mode
  const isAllowed =
    pathname === "/" ||
    pathname === "/alpha" ||
    pathname === "/api/webhooks/helius" ||
    pathname.startsWith("/api/alpha") ||
    pathname === "/terms.txt" ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    pathname === "/llms.txt" ||
    pathname === "/llms-full.txt" ||
    pathname.endsWith(".txt") ||
    pathname.endsWith(".xml") ||
    pathname.startsWith("/generated") ||
    pathname.startsWith("/_next") ||
    pathname === "/favicon.ico" ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".jpg") ||
    pathname.endsWith(".jpeg") ||
    pathname.endsWith(".webp") ||
    pathname.endsWith(".webm") ||
    pathname.endsWith(".mp4") ||
    pathname.endsWith(".svg");

  if (!isAllowed) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "This API is unavailable during alpha." }, { status: 503 });
    }
    // Redirect any unauthorized routes (e.g. /treasury, /token/...) to root alpha page
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};

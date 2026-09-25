import type { Metadata, Viewport } from "next";
import "./globals.css";
import { WalletProvider } from "@/components/layout/WalletProvider";
import { ThemeProvider } from "@/context/ThemeContext";
import { MarketProvider } from "@/context/MarketContext";

import { getLiveTokens } from "@/services/tokens/liveTokens";
import { TokenMetadata } from "@/lib/types";
import { isMockMode } from "@/services";

export const dynamic = "force-dynamic";

export const viewport: Viewport = {
  themeColor: "#0a0b0d",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL("https://streetfun.xyz"),
  title: "Streetfun · Memecoins With A Wall Street Floor",
  description: "Trade viral momentum. Graduate to collateral-backed Solana tokens.",
  icons: {
    icon: "/generated/streetfun-logo.webp",
  },
  openGraph: {
    title: "Streetfun · Memecoins With A Wall Street Floor",
    description: "Trade viral momentum. Graduate to collateral-backed Solana tokens.",
    url: "https://streetfun.xyz",
    siteName: "Streetfun",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Streetfun - Wall Street Floor For Memecoins",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Streetfun · Memecoins With A Wall Street Floor",
    description: "Trade viral momentum. Graduate to collateral-backed Solana tokens.",
    site: "@streetfunxyz",
    creator: "@streetfunxyz",
    images: ["/og-image.png"],
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const isAlphaOnly =
    process.env.NEXT_PUBLIC_ALPHA_ONLY === "true" ||
    (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_FULL_APP !== "true");

  let initialTokens: TokenMetadata[] = [];
  if (!isAlphaOnly && !isMockMode()) {
    try {
      initialTokens = await getLiveTokens();
    } catch (err) {
      console.warn("[RootLayout] Could not prefetch live tokens:", err);
    }
  }

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link
          rel="preload"
          as="image"
          href="/generated/hero-bull-foreground.webp"
          type="image/webp"
          fetchPriority="high"
        />
        <link
          rel="preload"
          as="image"
          href="/generated/hero-bull-brand-glasses.webp"
          type="image/webp"
          fetchPriority="high"
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var p=new URLSearchParams(window.location.search).get('theme');var t=p||localStorage.getItem('streetfun-theme')||'dark';if(p){try{localStorage.setItem('streetfun-theme',p);}catch(_){}}document.documentElement.setAttribute('data-theme',t);}catch(_){document.documentElement.setAttribute('data-theme','dark');}`,
          }}
        />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased selection:bg-brand-cyan/20 selection:text-brand-cyan">
        <ThemeProvider>
          <WalletProvider>
            <MarketProvider initialTokens={initialTokens}>{children}</MarketProvider>
          </WalletProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

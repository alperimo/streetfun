import type { Metadata } from "next";
import "./globals.css";
import { WalletProvider } from "@/components/layout/WalletProvider";
import { ThemeProvider } from "@/context/ThemeContext";
import { MarketProvider } from "@/context/MarketContext";

export const metadata: Metadata = {
  title: "Streetfun · Memecoins With A Wall Street Floor",
  description: "Trade viral momentum. Graduate to real tokenized equities.",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var p=new URLSearchParams(window.location.search).get('theme');var t=p||localStorage.getItem('streetfun-theme')||'street-dark';if(p){try{localStorage.setItem('streetfun-theme',p);}catch(_){}}document.documentElement.setAttribute('data-theme',t);}catch(_){document.documentElement.setAttribute('data-theme','street-dark');}`,
          }}
        />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased selection:bg-brand-cyan/20 selection:text-brand-cyan">
        <ThemeProvider>
          <WalletProvider>
            <MarketProvider>{children}</MarketProvider>
          </WalletProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

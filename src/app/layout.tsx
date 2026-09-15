import type { Metadata } from "next";
import "./globals.css";
import { WalletProvider } from "@/components/layout/WalletProvider";

export const metadata: Metadata = {
  title: "Streetfun | The World's First Equity-Backed Memecoin Engine on Solana",
  description:
    "Launch and trade instant-liquidity coins backed by real tokenized equities (SpaceX, Nvidia, Grindr). Dual redemption floor ensures your meme token never goes to zero.",
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
    <html lang="en" className="dark">
      <body className="min-h-screen bg-background text-foreground antialiased selection:bg-brand-cyan/20 selection:text-brand-cyan">
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}

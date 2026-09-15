import type { Metadata } from "next";
import "./globals.css";
import { WalletProvider } from "@/components/layout/WalletProvider";

export const metadata: Metadata = {
  title: "Streetfun · Memecoins With A Wall Street Floor",
  description:
    "Trade viral momentum. Graduate to real tokenized stocks. Never go to zero.",
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

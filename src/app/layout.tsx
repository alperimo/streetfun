import type { Metadata } from "next";
import "./globals.css";
import { WalletProvider } from "@/components/layout/WalletProvider";

export const metadata: Metadata = {
  title: "Streetfun · Launch coins backed by real equities",
  description: "Launch coins backed by real equities",
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
    <html lang="en" className="light">
      <body className="min-h-screen bg-background text-foreground antialiased selection:bg-brand-cyan/20 selection:text-brand-cyan">
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}

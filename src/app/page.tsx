"use client";

import React from "react";
import dynamic from "next/dynamic";
import { AlphaLanding } from "@/components/alpha/AlphaLanding";

const MarketsPage = dynamic(
  () => import("@/components/home/MarketsPage").then((mod) => mod.MarketsPage),
  { ssr: false }
);

export default function Page() {
  const isAlphaOnly =
    process.env.NEXT_PUBLIC_ALPHA_ONLY === "true" ||
    (process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_FULL_APP !== "true");

  if (isAlphaOnly) {
    return <AlphaLanding />;
  }

  return <MarketsPage />;
}

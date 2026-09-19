import type { Metadata } from "next";
import { AlphaLanding } from "@/components/alpha/AlphaLanding";

export const metadata: Metadata = {
  title: "StreetFun Alpha Pass · Early Access",
  description: "Claim your early Alpha Pass for Day-1 zero fees and priority testnet access.",
};

export default function AlphaPage() {
  return <AlphaLanding />;
}

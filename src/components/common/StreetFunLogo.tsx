import React from "react";
import Image from "next/image";

interface StreetFunLogoProps {
  className?: string;
  size?: number;
}

export function StreetFunLogo({ className = "h-7 w-7", size = 28 }: StreetFunLogoProps) {
  return (
    <Image
      src="/generated/streetfun-logo.png"
      alt="StreetFun logo"
      width={size}
      height={size}
      className={className}
    />
  );
}

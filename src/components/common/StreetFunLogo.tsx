import React from "react";
import Image from "next/image";

interface StreetFunLogoProps {
  className?: string;
  size?: number;
}

export function StreetFunLogo({ className = "h-8 w-8", size = 32 }: StreetFunLogoProps) {
  return (
    <div
      className={`relative inline-flex items-center justify-center shrink-0 overflow-hidden rounded-md ${className}`}
      style={{ width: size, height: size }}
    >
      <Image
        src="/logo.png"
        alt="StreetFun Bull Logo"
        width={size}
        height={size}
        className="object-contain w-full h-full"
        priority
      />
    </div>
  );
}

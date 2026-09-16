import React from "react";

interface StreetFunLogoProps {
  className?: string;
  size?: number;
}

export function StreetFunLogo({ className = "h-7 w-7", size = 28 }: StreetFunLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="sf-grad" x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#22D3EE" />
          <stop offset="50%" stopColor="#06B6D4" />
          <stop offset="100%" stopColor="#0891B2" />
        </linearGradient>
      </defs>

      {/* StreetFun Logo Mark: Minimalist Monoline Geometric 'S' & Stock Floor Chevron */}
      {/* Upper Curve */}
      <path
        d="M24 7C24 5.34315 22.6569 4 21 4H12C8.68629 4 6 6.68629 6 10C6 13.3137 8.68629 16 12 16H20C23.3137 16 26 18.6863 26 22C26 25.3137 23.3137 28 20 28H11C9.34315 28 8 26.6569 8 25"
        stroke="url(#sf-grad)"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Wall Street Ascent Chevron Accent */}
      <path
        d="M21 10.5L25 6.5L29 10.5"
        stroke="#06B6D4"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

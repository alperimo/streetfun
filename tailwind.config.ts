import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#f8fafc",
        card: {
          DEFAULT: "#ffffff",
          hover: "#f1f5f9",
        },
        border: {
          DEFAULT: "#e2e8f0",
          active: "#cbd5e1",
        },
        brand: {
          cyan: "#0284c7",
          emerald: "#059669",
          purple: "#9333ea",
          amber: "#d97706",
          rose: "#e11d48",
        },
        muted: {
          DEFAULT: "#64748b",
          foreground: "#94a3b8",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;

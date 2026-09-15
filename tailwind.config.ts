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
        background: "#060a0e",
        card: {
          DEFAULT: "#0b1218",
          hover: "#0f1922",
        },
        border: {
          DEFAULT: "#182531",
          active: "#2a3d4f",
        },
        brand: {
          cyan: "#00f0ff",
          emerald: "#10b981",
          purple: "#a855f7",
          amber: "#f59e0b",
          rose: "#f43f5e",
        },
        muted: {
          DEFAULT: "#8295a5",
          foreground: "#526373",
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

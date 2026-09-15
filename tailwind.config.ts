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
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: {
          DEFAULT: "var(--card)",
          hover: "var(--card-hover)",
          subtle: "var(--card-subtle)",
        },
        border: {
          DEFAULT: "var(--border)",
          active: "var(--border-active)",
        },
        brand: {
          cyan: "var(--brand-cyan)",
          emerald: "var(--brand-emerald)",
          purple: "var(--brand-purple)",
          amber: "var(--brand-amber)",
          rose: "var(--brand-rose)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
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

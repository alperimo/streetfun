import type { Config } from "tailwindcss";

function withOpacity(variableName: string) {
  return ({ opacityValue }: { opacityValue?: string }) => {
    if (opacityValue !== undefined) {
      return `color-mix(in srgb, var(${variableName}) calc(${opacityValue} * 100%), transparent)`;
    }
    return `var(${variableName})`;
  };
}

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      borderColor: {
        DEFAULT: "var(--border)",
      },
      colors: {
        background: withOpacity("--background"),
        foreground: withOpacity("--foreground"),
        card: {
          DEFAULT: withOpacity("--card"),
          hover: withOpacity("--card-hover"),
          subtle: withOpacity("--card-subtle"),
        },
        filter: withOpacity("--filter-surface"),
        border: {
          DEFAULT: withOpacity("--border"),
          active: withOpacity("--border-active"),
        },
        brand: {
          cyan: withOpacity("--brand-cyan"),
          "cyan-hover": withOpacity("--brand-cyan-hover"),
          emerald: withOpacity("--brand-emerald"),
          purple: withOpacity("--brand-purple"),
          amber: withOpacity("--brand-amber"),
          rose: withOpacity("--brand-rose"),
        },
        muted: {
          DEFAULT: withOpacity("--muted"),
          foreground: withOpacity("--muted-foreground"),
        },
        hero: {
          chart: withOpacity("--hero-chart"),
          "chart-core": withOpacity("--hero-chart-core"),
          "glass-shadow": withOpacity("--hero-glass-shadow"),
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

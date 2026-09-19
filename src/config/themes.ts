export type ThemeId = "street-dark" | "dark" | "light";

export interface ChartThemeConfig {
  background: string;
  textColor: string;
  gridColor: string;
  borderColor: string;
  lineColor: string;
  topColor: string;
  bottomColor: string;
  floorLineColor: string;
}

export interface ThemeColors {
  background: string;
  card: string;
  cardSubtle: string;
  border: string;
  foreground: string;
  muted: string;
  brandCyan: string;
  brandEmerald: string;
  brandRose: string;
  amber: string;
}

export interface ThemeTokens {
  id: ThemeId;
  name: string;
  description: string;
  colors: ThemeColors;
  chart: ChartThemeConfig;
}

export const THEME_STORAGE_KEY = "streetfun-theme";
export const DEFAULT_THEME_ID: ThemeId = "dark";

export const THEMES: Record<ThemeId, ThemeTokens> = {
  "street-dark": {
    id: "street-dark",
    name: "Street Dark",
    description: "Midnight Slate Terminal",
    colors: {
      background: "#0c1218",
      card: "#131d27",
      cardSubtle: "#090e13",
      border: "#1f3042",
      foreground: "#f1f5f9",
      muted: "#94a3b8",
      brandCyan: "#62F88B",
      brandEmerald: "#62F88B",
      brandRose: "#f43f5e",
      amber: "#f59e0b",
    },
    chart: {
      background: "#131d27",
      textColor: "#94a3b8",
      gridColor: "#1a2837",
      borderColor: "#1f3042",
      lineColor: "#62F88B",
      topColor: "rgba(98, 248, 139, 0.25)",
      bottomColor: "rgba(0, 0, 0, 0.0)",
      floorLineColor: "#f59e0b",
    },
  },
  dark: {
    id: "dark",
    name: "Onyx Dark",
    description: "Deep Black Terminal",
    colors: {
      background: "#060a0e",
      card: "#0b1218",
      cardSubtle: "#070c10",
      border: "#182531",
      foreground: "#e8eff5",
      muted: "#8295a5",
      brandCyan: "#62F88B",
      brandEmerald: "#62F88B",
      brandRose: "#f43f5e",
      amber: "#f59e0b",
    },
    chart: {
      background: "#0b1218",
      textColor: "#8295a5",
      gridColor: "#131f2b",
      borderColor: "#182531",
      lineColor: "#62F88B",
      topColor: "rgba(98, 248, 139, 0.22)",
      bottomColor: "rgba(0, 0, 0, 0.0)",
      floorLineColor: "#f59e0b",
    },
  },
  light: {
    id: "light",
    name: "Clean Light",
    description: "Paper White Mode",
    colors: {
      background: "#f8fafc",
      card: "#ffffff",
      cardSubtle: "#f1f5f9",
      border: "#e2e8f0",
      foreground: "#0f172a",
      muted: "#64748b",
      brandCyan: "#0284c7",
      brandEmerald: "#059669",
      brandRose: "#e11d48",
      amber: "#d97706",
    },
    chart: {
      background: "#ffffff",
      textColor: "#64748b",
      gridColor: "#f1f5f9",
      borderColor: "#e2e8f0",
      lineColor: "#0284c7",
      topColor: "rgba(2, 132, 199, 0.2)",
      bottomColor: "rgba(0, 0, 0, 0.0)",
      floorLineColor: "#d97706",
    },
  },
};

export const THEME_LIST: ThemeTokens[] = Object.values(THEMES);
export const THEME_IDS: ThemeId[] = Object.keys(THEMES) as ThemeId[];

export function isThemeId(value: unknown): value is ThemeId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(THEMES, value);
}

export function getThemeConfig(themeId?: string | null): ThemeTokens {
  if (themeId && isThemeId(themeId)) {
    return THEMES[themeId];
  }
  return THEMES[DEFAULT_THEME_ID];
}

"use client";

import React, { createContext, useContext, useEffect, useState, useMemo } from "react";
import {
  ThemeId,
  ThemeTokens,
  THEMES,
  THEME_LIST,
  THEME_STORAGE_KEY,
  DEFAULT_THEME_ID,
  isThemeId,
  getThemeConfig,
} from "@/config/themes";

export type ThemeMode = ThemeId;

interface ThemeContextType {
  theme: ThemeId;
  themeConfig: ThemeTokens;
  setTheme: (theme: ThemeId) => void;
  themes: ThemeTokens[];
}

const ThemeContext = createContext<ThemeContextType>({
  theme: DEFAULT_THEME_ID,
  themeConfig: THEMES[DEFAULT_THEME_ID],
  setTheme: () => {},
  themes: THEME_LIST,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>(DEFAULT_THEME_ID);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const queryTheme = params.get("theme");
      const stored = localStorage.getItem(THEME_STORAGE_KEY);

      const resolvedTheme: ThemeId = isThemeId(queryTheme)
        ? queryTheme
        : isThemeId(stored)
        ? stored
        : DEFAULT_THEME_ID;

      setThemeState(resolvedTheme);
      document.documentElement.setAttribute("data-theme", resolvedTheme);
      localStorage.setItem(THEME_STORAGE_KEY, resolvedTheme);
    } catch {
      document.documentElement.setAttribute("data-theme", DEFAULT_THEME_ID);
    }
  }, []);

  const setTheme = (newTheme: ThemeId) => {
    if (!isThemeId(newTheme)) return;
    setThemeState(newTheme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, newTheme);
    } catch {}
    document.documentElement.setAttribute("data-theme", newTheme);
  };

  const themeConfig = useMemo(() => getThemeConfig(theme), [theme]);

  const value = useMemo(
    () => ({
      theme,
      themeConfig,
      setTheme,
      themes: THEME_LIST,
    }),
    [theme, themeConfig]
  );

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

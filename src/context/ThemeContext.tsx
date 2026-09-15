"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

export type ThemeMode = "street-dark" | "dark" | "light";

interface ThemeContextType {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "street-dark",
  setTheme: () => {},
});

const STORAGE_KEY = "streetfun-theme";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeMode>("street-dark");

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const queryTheme = params.get("theme") as ThemeMode | null;
      const stored = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
      const valid = ["street-dark", "dark", "light"];
      const active = (queryTheme && valid.includes(queryTheme))
        ? queryTheme
        : (stored && valid.includes(stored))
        ? stored
        : "street-dark";

      setThemeState(active);
      document.documentElement.setAttribute("data-theme", active);
      localStorage.setItem(STORAGE_KEY, active);
    } catch {
      document.documentElement.setAttribute("data-theme", "street-dark");
    }
  }, []);

  const setTheme = (newTheme: ThemeMode) => {
    setThemeState(newTheme);
    try {
      localStorage.setItem(STORAGE_KEY, newTheme);
    } catch {}
    document.documentElement.setAttribute("data-theme", newTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

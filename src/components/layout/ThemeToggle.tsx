"use client";

import React, { useState, useRef, useEffect } from "react";
import { useTheme, ThemeMode } from "@/context/ThemeContext";
import { Moon, Sun, Sparkles, ChevronDown } from "lucide-react";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const themes: { id: ThemeMode; label: string; icon: React.ReactNode; desc: string }[] = [
    {
      id: "street-dark",
      label: "Street Dark",
      icon: <Sparkles className="h-3.5 w-3.5 text-brand-cyan" />,
      desc: "Midnight Slate (Degen Wall St)",
    },
    {
      id: "dark",
      label: "Onyx Dark",
      icon: <Moon className="h-3.5 w-3.5 text-purple-400" />,
      desc: "Deep Black Terminal",
    },
    {
      id: "light",
      label: "Clean Light",
      icon: <Sun className="h-3.5 w-3.5 text-amber-500" />,
      desc: "Paper White Mode",
    },
  ];

  const currentTheme = themes.find((t) => t.id === theme) || themes[0];

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs text-foreground hover:border-border-active transition-colors shadow-xs"
        title="Change Theme"
      >
        {currentTheme.icon}
        <span className="hidden sm:inline font-medium text-[11px]">{currentTheme.label}</span>
        <ChevronDown className="h-3 w-3 text-muted" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1.5 w-56 rounded-xl border border-border bg-card p-1 shadow-xl z-50 animate-in fade-in zoom-in-95 duration-100">
          <div className="px-2 py-1 text-[10px] uppercase font-bold text-muted tracking-wider border-b border-border mb-1">
            Select Theme
          </div>
          {themes.map((t) => {
            const active = t.id === theme;
            return (
              <button
                key={t.id}
                onClick={() => {
                  setTheme(t.id);
                  setIsOpen(false);
                }}
                className={`w-full flex items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
                  active
                    ? "bg-card-hover text-brand-cyan font-bold"
                    : "text-foreground hover:bg-card-hover hover:text-foreground"
                }`}
              >
                <div className="flex items-center gap-2">
                  {t.icon}
                  <div>
                    <div className="text-xs font-semibold">{t.label}</div>
                    <div className="text-[10px] text-muted font-normal">{t.desc}</div>
                  </div>
                </div>
                {active && (
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-cyan" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

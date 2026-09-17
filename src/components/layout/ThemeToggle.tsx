"use client";

import React, { useState, useRef, useEffect } from "react";
import { useTheme } from "@/context/ThemeContext";
import { ThemeId } from "@/config/themes";
import { Moon, Sun, Sparkles, ChevronDown } from "lucide-react";

function ThemeIcon({ id, className = "h-3.5 w-3.5" }: { id: ThemeId; className?: string }) {
  if (id === "street-dark") return <Sparkles className={`${className} text-brand-cyan`} />;
  if (id === "dark") return <Moon className={`${className} text-purple-400`} />;
  return <Sun className={`${className} text-amber-500`} />;
}

export function ThemeToggle() {
  const { theme, themeConfig, setTheme, themes } = useTheme();
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

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex h-11 w-11 items-center justify-center rounded-xl border border-transparent bg-transparent text-xs text-foreground hover:border-border hover:bg-card transition-colors"
        title="Change Theme"
      >
        <ThemeIcon id={theme} />
        <span className="sr-only">{themeConfig.name}</span>
        <ChevronDown className="hidden" />
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
                  <ThemeIcon id={t.id} />
                  <div>
                    <div className="text-xs font-semibold">{t.name}</div>
                    <div className="text-[10px] text-muted font-normal">{t.description}</div>
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

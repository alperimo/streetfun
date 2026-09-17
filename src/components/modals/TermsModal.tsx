"use client";

import React, { useEffect, useState } from "react";
import { X } from "lucide-react";

interface TermsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function TermsModal({ isOpen, onClose }: TermsModalProps) {
  const [termsText, setTermsText] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);

    setIsLoading(true);
    fetch("/terms.txt")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load terms");
        return res.text();
      })
      .then((text) => {
        setTermsText(text);
        setIsLoading(false);
      })
      .catch((err) => {
        console.error("Could not load /terms.txt:", err);
        setIsLoading(false);
      });

    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/30 backdrop-blur-[1px] transition-opacity"
        onClick={onClose}
      />

      {/* Modal Container: StonkFun style compact terminal dialog */}
      <div className="relative flex flex-col w-full max-w-2xl max-h-[85vh] rounded-2xl border border-border bg-card shadow-2xl overflow-hidden z-10 animate-in fade-in-0 zoom-in-95 duration-200">
        {/* Header matching StonkFun: Bold title, muted date, rounded square close button, no shield icon */}
        <div className="flex items-start justify-between border-b border-border/60 px-6 sm:px-7 py-5 bg-card">
          <div>
            <h2 className="text-lg font-bold text-foreground tracking-tight">Terms of Service</h2>
            <p className="text-xs text-muted font-normal mt-0.5">Last updated September 2026</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl border border-border bg-card-hover/50 p-2 text-muted hover:border-border-active hover:text-foreground hover:bg-card-hover transition-all shadow-xs"
            title="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content Body: Bold white headings, dim/slate-400 body text, clean bullets */}
        <div className="flex-1 overflow-y-auto px-6 sm:px-7 py-6 font-sans scrollbar-thin">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-muted text-xs">
              Loading Terms of Service...
            </div>
          ) : (
            <div className="space-y-4">
              {termsText.split("\n\n").map((block, idx) => {
                const trimmed = block.trim();
                if (!trimmed) return null;

                // Numbered headings like "1. What StreetFun is"
                if (/^\d+\.\s+/.test(trimmed)) {
                  const lines = trimmed.split("\n");
                  const heading = lines[0];
                  const rest = lines.slice(1);

                  return (
                    <div key={idx} className="pt-2 first:pt-0">
                      <h3 className="text-sm sm:text-[15px] font-bold text-foreground tracking-tight mb-2">
                        {heading}
                      </h3>
                      <div className="space-y-2.5">
                        {rest.map((line, lIdx) => {
                          if (line.startsWith("• ")) {
                            return (
                              <div
                                key={lIdx}
                                className="flex items-start gap-2.5 pl-2 text-xs sm:text-[13px] text-slate-400 leading-relaxed"
                              >
                                <span className="text-slate-500 font-bold select-none">•</span>
                                <span>{line.replace(/^•\s*/, "")}</span>
                              </div>
                            );
                          }
                          return (
                            <p key={lIdx} className="text-xs sm:text-[13px] text-slate-400 leading-relaxed">
                              {line}
                            </p>
                          );
                        })}
                      </div>
                    </div>
                  );
                }

                // Standard paragraph / intro text
                const lines = trimmed.split("\n");
                return (
                  <div key={idx} className="space-y-2.5">
                    {lines.map((line, lIdx) => {
                      if (line.startsWith("• ")) {
                        return (
                          <div
                            key={lIdx}
                            className="flex items-start gap-2.5 pl-2 text-xs sm:text-[13px] text-slate-400 leading-relaxed"
                          >
                            <span className="text-slate-500 font-bold select-none">•</span>
                            <span>{line.replace(/^•\s*/, "")}</span>
                          </div>
                        );
                      }
                      return (
                        <p key={lIdx} className="text-xs sm:text-[13px] text-slate-400 leading-relaxed">
                          {line}
                        </p>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Token-reactive reflections — deferred at the user’s request.
// This is commented reference material only; the application does not import it.
// The existing decorative bull animation remains active.
//
// --- src/components/home/marketReflection.ts ---
// import type { OHLCVBar } from "@/services/types";
//
// export interface ReflectionCandle {
//   x: number;
//   open: number;
//   close: number;
//   high: number;
//   low: number;
//   volume: number;
// }
//
// export interface MarketReflection {
//   trend: string;
//   candles: readonly ReflectionCandle[];
// }
//
// /** Map hourly history into the existing lens plane without changing its direction. */
// export function createMarketReflection(history: readonly OHLCVBar[]): MarketReflection | null {
//   const valid = history.filter((bar) =>
//     [bar.time, bar.open, bar.close, bar.high, bar.low, bar.volume].every(Number.isFinite) &&
//     Math.min(bar.open, bar.close, bar.low) > 0 && bar.volume >= 0 &&
//     bar.high >= Math.max(bar.open, bar.close) && bar.low <= Math.min(bar.open, bar.close)
//   );
//   const bars = [...new Map(valid.map((bar) => [bar.time, bar])).values()]
//     .sort((a, b) => a.time - b.time).slice(-24);
//   // The service returns two flat bars when history is unavailable. Never dress that
//   // fallback up as a real historical trend, or force a declining market upward.
//   if (bars.length < 3) return null;
//
//   const minimum = Math.min(...bars.map((bar) => bar.low));
//   const maximum = Math.max(...bars.map((bar) => bar.high));
//   const range = maximum - minimum;
//   const y = (price: number) => range > 0 ? 106 - ((price - minimum) / range) * 96 : 58;
//   const maxVolume = Math.max(1, ...bars.map((bar) => bar.volume));
//   const candles = bars.map((bar, index) => ({
//     x: (index / (bars.length - 1)) * 240,
//     open: y(bar.open), close: y(bar.close), high: y(bar.high), low: y(bar.low),
//     volume: (bar.volume / maxVolume) * 30,
//   }));
//   const round = (value: number) => Number(value.toFixed(3));
//   const trend = `M-64 ${round(candles[0].close)} ${candles.map((candle) =>
//     `L${round(candle.x)} ${round(candle.close)}`).join(" ")} L330 ${round(candles.at(-1)!.close)}`;
//   return { trend, candles };
// }
//
//
// --- src/components/home/useMarketVision.ts ---
// "use client";
//
// import { useCallback, useEffect, useRef, useState } from "react";
// import type { TokenMetadata } from "@/lib/types";
// import { getChartService } from "@/services";
// import { BULL_ARTWORK } from "./bullArtworkConfig";
// import { createMarketReflection, type MarketReflection } from "./marketReflection";
//
// const signature: MarketReflection = { trend: BULL_ARTWORK.trend, candles: BULL_ARTWORK.candles };
//
// export interface MarketVision {
//   mint: string;
//   symbol: string;
//   status: "signature" | "loading" | "ready" | "unavailable";
//   reflection: MarketReflection;
// }
//
// const initial: MarketVision = { mint: "", symbol: "", status: "signature", reflection: signature };
//
// export function useMarketVision() {
//   const [vision, setVision] = useState<MarketVision>(initial);
//   const requestedMint = useRef("");
//   const request = useRef(0);
//   const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
//   const cache = useRef(new Map<string, { expires: number; result: Promise<MarketReflection | null> }>());
//
//   const cancelHover = useCallback(() => {
//     if (hoverTimer.current) clearTimeout(hoverTimer.current);
//   }, []);
//
//   const select = useCallback((token: TokenMetadata | null) => {
//     cancelHover();
//     const mint = token?.mint ?? "";
//     if (mint === requestedMint.current) return;
//     requestedMint.current = mint;
//     const currentRequest = ++request.current;
//     if (!token) {
//       setVision(initial);
//       return;
//     }
//     setVision((previous) => ({ ...previous, mint, symbol: token.symbol, status: "loading" }));
//     let entry = cache.current.get(mint);
//     if (!entry || entry.expires < Date.now()) {
//       entry = {
//         expires: Date.now() + 60_000,
//         result: getChartService().getOHLCV(token, "1h").then(createMarketReflection).catch(() => null),
//       };
//       if (cache.current.size >= 32) cache.current.delete(cache.current.keys().next().value!);
//       cache.current.set(mint, entry);
//     }
//     entry.result.then((reflection) => {
//       // Late responses and unmounted pages must not replace the current selection.
//       if (request.current !== currentRequest) return;
//       setVision({ mint, symbol: token.symbol, status: reflection ? "ready" : "unavailable", reflection: reflection ?? signature });
//     });
//   }, [cancelHover]);
//
//   const hover = useCallback((token: TokenMetadata) => {
//     cancelHover();
//     hoverTimer.current = setTimeout(() => select(token), 160);
//   }, [cancelHover, select]);
//
//   useEffect(() => () => {
//     cancelHover();
//     request.current++;
//   }, [cancelHover]);
//
//   return { vision, select, hover, cancelHover };
// }
//
//
// --- tests/market_reflection.test.ts ---
// import { expect } from "chai";
// import { createMarketReflection } from "../src/components/home/marketReflection";
// import type { OHLCVBar } from "../src/services/types";
//
// function history(prices: number[]): OHLCVBar[] {
//   return prices.map((close, time) => ({ time, open: close, close, high: close + 1, low: close - 1, volume: 20 + time }));
// }
//
// describe("Market reflections", () => {
//   it("preserves rising and declining histories instead of inventing an uptrend", () => {
//     const rising = createMarketReflection(history([10, 15, 12, 20]))!;
//     const falling = createMarketReflection(history([20, 15, 18, 10]))!;
//     expect(rising.candles.at(-1)!.close).to.be.lessThan(rising.candles[0].close);
//     expect(falling.candles.at(-1)!.close).to.be.greaterThan(falling.candles[0].close);
//   });
//
//   it("keeps flat history flat and finite", () => {
//     const flat = history([10, 10, 10]).map((bar) => ({ ...bar, high: 10, low: 10, volume: 0 }));
//     const reflection = createMarketReflection(flat)!;
//     expect(reflection.candles.every((candle) => candle.close === 58 && candle.high === 58 && candle.volume === 0)).to.equal(true);
//     expect(reflection.trend).not.to.match(/NaN|Infinity/);
//   });
//
//   it("rejects insufficient or malformed history, including the service baseline", () => {
//     expect(createMarketReflection(history([10, 10]))).to.equal(null);
//     const invalid = history([10, 11, 12]);
//     invalid[1].close = NaN;
//     expect(createMarketReflection(invalid)).to.equal(null);
//     expect(createMarketReflection(history([-10, -5, -1]))).to.equal(null);
//   });
//
//   it("uses the latest 24 unique hourly bars without mutating source data", () => {
//     const bars = history(Array.from({ length: 30 }, (_, i) => i + 10)).reverse();
//     const input = [...bars, bars[0]];
//     const times = input.map((bar) => bar.time);
//     const reflection = createMarketReflection(input)!;
//     expect(reflection.candles).to.have.length(24);
//     expect(reflection.candles[0].x).to.equal(0);
//     expect(reflection.candles.at(-1)!.x).to.equal(240);
//     expect(input.map((bar) => bar.time)).to.deep.equal(times);
//     expect(Math.max(...reflection.candles.map((candle) => candle.volume))).to.equal(30);
//   });
// });
//
//
// --- Original prototype integration diff (also contains the shared motion/graduation work) ---
// diff --git a/src/app/globals.css b/src/app/globals.css
// index b4abb47..256580c 100644
// --- a/src/app/globals.css
// +++ b/src/app/globals.css
// @@ -165,10 +165,117 @@
//    color: var(--hero-chart);
//  }
//  
// +.hero-chart-acquire {
// +  animation: lens-acquire 450ms ease-out both;
// +}
// +
// +.hero-lens-glint {
// +  animation: lens-glint 850ms cubic-bezier(0.22, 0.6, 0.35, 1) both;
// +}
// +
// +@keyframes lens-acquire {
// +  from { opacity: 0; }
// +  to { opacity: 1; }
// +}
// +
// +@keyframes lens-glint {
// +  0% { transform: translateX(-50px) skewX(-16deg); opacity: 0; }
// +  18% { opacity: 1; }
// +  75% { opacity: 0.6; }
// +  100% { transform: translateX(355px) skewX(-16deg); opacity: 0; }
// +}
// +
// +.hero-vision-control option {
// +  color: var(--foreground);
// +  background: var(--card);
// +}
// +
// +.token-discovery-card[data-previewed] {
// +  border-color: color-mix(in srgb, var(--brand-cyan) 38%, var(--border));
// +  box-shadow: inset 0 1px color-mix(in srgb, var(--brand-cyan) 18%, transparent);
// +}
// +
// +.graduation-charge {
// +  opacity: 0;
// +  transform-origin: left;
// +  background: var(--brand-cyan);
// +}
// +
// +.token-discovery-card[data-graduating] {
// +  animation: graduation-frame 2200ms ease-out both;
// +}
// +
// +.token-discovery-card[data-graduating] .graduation-charge {
// +  animation: graduation-charge 2200ms ease-out both;
// +}
// +
// +.graduation-wave::after {
// +  position: absolute;
// +  inset: 0;
// +  content: "";
// +  background: linear-gradient(110deg, transparent 20%,
// +    color-mix(in srgb, var(--brand-amber) 5%, transparent) 37%,
// +    color-mix(in srgb, var(--brand-amber) 23%, transparent) 49%,
// +    color-mix(in srgb, var(--brand-amber) 8%, transparent) 53%, transparent 72%);
// +  animation: graduation-wave 2200ms ease-in-out both;
// +}
// +
// +.token-discovery-card[data-graduating] .graduation-seal,
// +.token-discovery-card[data-graduating] .graduation-badge {
// +  animation: graduation-seal 2200ms ease-out both;
// +}
// +
// +@keyframes graduation-charge {
// +  0% { transform: scaleX(0); opacity: 1; }
// +  30% { transform: scaleX(1); opacity: 1; background: var(--brand-cyan); }
// +  45%, 70% { transform: scaleX(1); opacity: 1; background: var(--brand-amber); box-shadow: 0 0 8px color-mix(in srgb, var(--brand-amber) 40%, transparent); }
// +  100% { transform: scaleX(1); opacity: 0; background: var(--brand-amber); }
// +}
// +
// +@keyframes graduation-wave {
// +  0%, 23% { transform: translateX(-110%); opacity: 0; }
// +  35% { opacity: 1; }
// +  82%, 100% { transform: translateX(110%); opacity: 0; }
// +}
// +
// +@keyframes graduation-frame {
// +  0% { border-color: var(--border); }
// +  30% { border-color: color-mix(in srgb, var(--brand-cyan) 65%, var(--border)); }
// +  48%, 70% { border-color: color-mix(in srgb, var(--brand-amber) 65%, var(--border)); box-shadow: inset 0 0 22px color-mix(in srgb, var(--brand-amber) 5%, transparent); }
// +  100% { border-color: var(--border); box-shadow: none; }
// +}
// +
// +@keyframes graduation-seal {
// +  0%, 35% { transform: translateY(0) scale(1); }
// +  48% { transform: translateY(-2px) scale(1.06); color: var(--brand-amber); }
// +  68%, 100% { transform: translateY(0) scale(1); color: var(--brand-amber); }
// +}
// +
// +.home-experience[data-motion="off"] .hero-chart-acquire,
// +.home-experience[data-motion="off"] .hero-lens-glint,
// +.home-experience[data-motion="off"] [data-graduating],
// +.home-experience[data-motion="off"] [data-graduating] *,
// +.home-experience[data-motion="off"] .graduation-wave::after {
// +  animation: none;
// +}
// +
// +.home-experience[data-motion="off"] .hero-lens-glint,
// +.home-experience[data-motion="off"] .graduation-wave::after {
// +  display: none;
// +}
// +
//  @media (prefers-reduced-motion: reduce) {
// -  .hero-chart-travel {
// +  .hero-chart-travel,
// +  .hero-lens-glint,
// +  .graduation-wave::after {
//      display: none;
//    }
// +  .hero-chart-acquire,
// +  .token-discovery-card,
// +  .token-discovery-card * {
// +    animation: none !important;
// +    transition: none !important;
// +  }
//  }
//  
//  .site-header,
// diff --git a/src/app/page.tsx b/src/app/page.tsx
// index df08ec4..e32568d 100644
// --- a/src/app/page.tsx
// +++ b/src/app/page.tsx
// @@ -11,9 +11,13 @@ import { SearchModal } from "@/components/modals/SearchModal";
//  import { LaunchModal } from "@/components/modals/LaunchModal";
//  import { TokenMetadata } from "@/lib/types";
//  import { useMarket } from "@/context/MarketContext";
// +import { useMarketVision } from "@/components/home/useMarketVision";
// +import { useHomeMotion } from "@/components/home/useHomeMotion";
//  
//  export default function MarketsPage() {
//    const { tokens, loading } = useMarket();
// +  const marketVision = useMarketVision();
// +  const motion = useHomeMotion();
//    const [searchQuery, setSearchQuery] = useState("");
//    const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
//    const [selectedTag, setSelectedTag] = useState("all");
// @@ -74,14 +78,14 @@ export default function MarketsPage() {
//    }, [tokens, statusFilter, selectedTag, searchQuery, sortBy]);
//  
//    return (
// -    <div className="flex min-h-screen flex-col bg-background">
// +    <div className="home-experience flex min-h-screen flex-col bg-background" data-motion={motion.paused || motion.reducedMotion ? "off" : "on"}>
//        <Header
//          onOpenSearch={() => setIsSearchOpen(true)}
//          onOpenLaunch={() => setIsLaunchOpen(true)}
//        />
//  
//        <main className="flex-1 w-full bg-background pb-12">
// -        <HeroBanner />
// +        <HeroBanner vision={marketVision.vision} onSelectToken={marketVision.select} motion={motion} />
//  
//          <div className="w-full bg-background">
//            <div className="mx-auto w-full max-w-[1350px] px-6 pt-4 sm:px-10 lg:px-0">
// @@ -105,7 +109,14 @@ export default function MarketsPage() {
//                <>
//                  <div className="mt-5 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
//                    {filteredTokens.map((token) => (
// -                    <TokenCard key={token.mint} token={token} />
// +                    <TokenCard
// +                      key={token.mint}
// +                      token={token}
// +                      previewed={marketVision.vision.mint === token.mint}
// +                      onPreview={marketVision.select}
// +                      onHoverPreview={marketVision.hover}
// +                      onCancelHover={marketVision.cancelHover}
// +                    />
//                    ))}
//                  </div>
//                  {filteredTokens.length === 0 && (
// diff --git a/src/components/home/BullArtwork.tsx b/src/components/home/BullArtwork.tsx
// index 6fd9cf6..df89ac9 100644
// --- a/src/components/home/BullArtwork.tsx
// +++ b/src/components/home/BullArtwork.tsx
// @@ -1,18 +1,25 @@
//  "use client";
//  
// -import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
// +import { useEffect, useId, useRef, type CSSProperties } from "react";
//  import Image from "next/image";
//  import { Pause, Play } from "lucide-react";
//  import { BULL_ARTWORK as art } from "./bullArtworkConfig";
// +import type { MarketReflection } from "./marketReflection";
// +import type { HomeMotion } from "./useHomeMotion";
//  
// -export function BullArtwork() {
// +interface BullArtworkProps {
// +  reflection: MarketReflection;
// +  reflectionKey: string;
// +  motion: HomeMotion;
// +}
// +
// +export function BullArtwork({ reflection, reflectionKey, motion }: BullArtworkProps) {
// +  const { paused, reducedMotion } = motion;
//    const id = useId().replace(/:/g, "");
//    const viewport = useRef<HTMLDivElement>(null);
//    const svg = useRef<SVGSVGElement>(null);
//    const path = useRef<SVGPathElement>(null);
//    const progress = useRef(art.initialProgress as number);
// -  const [paused, setPaused] = useState(false);
// -  const [reducedMotion, setReducedMotion] = useState(false);
//  
//    useEffect(() => {
//      const container = viewport.current;
// @@ -20,7 +27,6 @@ export function BullArtwork() {
//      const curve = path.current;
//      if (!container || !drawing || !curve) return;
//  
// -    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
//      const length = curve.getTotalLength();
//      const markers = drawing.querySelectorAll<SVGCircleElement>("[data-chart-marker]");
//      const traces = drawing.querySelectorAll<SVGUseElement>("[data-chart-trace]");
// @@ -57,10 +63,8 @@ export function BullArtwork() {
//      const sync = () => {
//        cancelAnimationFrame(frame);
//        previousTime = null;
// -      const reduce = preference.matches;
// -      setReducedMotion(reduce);
//        // Preserve a user's pause across visibility and preference changes.
// -      if (visible && !document.hidden && !reduce && !paused) {
// +      if (visible && !document.hidden && !reducedMotion && !paused) {
//          frame = requestAnimationFrame(tick);
//        }
//      };
// @@ -70,7 +74,6 @@ export function BullArtwork() {
//        sync();
//      });
//      observer.observe(container);
// -    preference.addEventListener("change", sync);
//      document.addEventListener("visibilitychange", sync);
//      paint();
//      sync();
// @@ -78,10 +81,9 @@ export function BullArtwork() {
//      return () => {
//        cancelAnimationFrame(frame);
//        observer.disconnect();
// -      preference.removeEventListener("change", sync);
//        document.removeEventListener("visibilitychange", sync);
//      };
// -  }, [paused]);
// +  }, [paused, reducedMotion, reflection]);
//  
//    const stageStyle = {
//      "--artwork-ratio": art.width / art.height,
// @@ -100,11 +102,11 @@ export function BullArtwork() {
//              priority
//              sizes="(max-width: 900px) 900px, 100vw"
//            />
// -          <svg ref={svg} className="hero-chart" viewBox={`0 0 ${art.width} ${art.height}`} focusable="false">
// +          <svg ref={svg} className="hero-chart" data-reflection={reflectionKey} viewBox={`0 0 ${art.width} ${art.height}`} focusable="false">
//              <defs>
// -              <path ref={path} id={`${id}-trend`} d={art.trend} pathLength="1" />
// +              <path ref={path} id={`${id}-trend`} d={reflection.trend} pathLength="1" />
//                <g id={`${id}-candles`}>
// -                {art.candles.map((candle) => (
// +                {reflection.candles.map((candle) => (
//                    <g key={candle.x}>
//                      <path d={`M${candle.x} ${candle.high}V${candle.low}`} stroke="currentColor" strokeWidth="0.85" />
//                      <path d={`M${candle.x} ${candle.open}V${candle.close}`} stroke="currentColor" strokeWidth="2.2" />
// @@ -116,6 +118,11 @@ export function BullArtwork() {
//                  <stop offset="0.7" stopColor="white" />
//                  <stop offset="1" stopColor="white" stopOpacity="0" />
//                </linearGradient>
// +              <linearGradient id={`${id}-glint`}>
// +                <stop stopColor="var(--hero-chart-core)" stopOpacity="0" />
// +                <stop offset="0.5" stopColor="var(--hero-chart-core)" stopOpacity="0.24" />
// +                <stop offset="1" stopColor="var(--hero-chart-core)" stopOpacity="0" />
// +              </linearGradient>
//                <mask id={`${id}-tape-mask`} maskUnits="userSpaceOnUse" x="-64" y="-45" width="394" height="190">
//                  <rect x="-64" y="-45" width="394" height="190" fill={`url(#${id}-tape-light)`} />
//                </mask>
// @@ -139,11 +146,12 @@ export function BullArtwork() {
//              {art.lenses.map((lens) => (
//                <g key={lens.name} clipPath={`url(#${id}-${lens.name})`} data-lens={lens.name}>
//                  <g transform={lens.mapping} opacity={lens.opacity} className="text-hero-chart">
// +                  <g key={reflectionKey} className={reflectionKey === "signature" ? undefined : "hero-chart-acquire"}>
//                    <path d="M0 -20V145 M40 -20V145 M80 -20V145 M120 -20V145 M160 -20V145 M200 -20V145 M240 -20V145 M-20 20H260 M-20 55H260 M-20 90H260 M-20 125H260" fill="none" stroke="currentColor" strokeWidth="0.6" opacity="0.07" />
// -                  {art.candles.map((candle) => (
// +                  {reflection.candles.map((candle) => (
//                      <rect key={candle.x} x={candle.x - 1.7} y={132 - candle.volume} width="3.4" height={candle.volume} fill="currentColor" opacity="0.085" />
//                    ))}
// -                  <path d={`${art.trend} L330 145 L-64 145Z`} fill={`url(#${id}-fill)`} />
// +                  <path d={`${reflection.trend} L330 145 L-64 145Z`} fill={`url(#${id}-fill)`} />
//                    <use href={`#${id}-candles`} opacity="0.42" />
//                    <use href={`#${id}-trend`} fill="none" stroke="currentColor" strokeWidth="3" filter={`url(#${id}-glow)`} opacity="0.4" />
//                    <use href={`#${id}-trend`} fill="none" stroke="currentColor" strokeWidth={art.lineWidth} strokeLinejoin="round" opacity="0.75" />
// @@ -154,6 +162,10 @@ export function BullArtwork() {
//                      <circle data-chart-marker r="5" fill="currentColor" filter={`url(#${id}-glow)`} opacity="0.7" />
//                      <circle data-chart-marker r={art.markerRadius} fill="var(--hero-chart-core)" />
//                    </g>
// +                  </g>
// +                  {reflectionKey !== "signature" && (
// +                    <rect key={reflectionKey} className="hero-lens-glint" x="-64" y="-45" width="46" height="200" fill={`url(#${id}-glint)`} />
// +                  )}
//                  </g>
//                  <rect {...lens.bounds} fill={`url(#${id}-shade)`} />
//                </g>
// @@ -164,13 +176,13 @@ export function BullArtwork() {
//        <button
//          type="button"
//          className="hero-motion-control absolute bottom-5 right-6 z-10 flex h-8 items-center gap-1.5 rounded-lg border border-border bg-background/75 px-2.5 text-[11px] text-muted hover:bg-card-hover hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-emerald sm:right-10"
// -        onClick={() => setPaused((value) => !value)}
// -        aria-label={reducedMotion ? "Chart motion off: reduced motion enabled" : paused ? "Resume chart animation" : "Pause chart animation"}
// +        onClick={motion.toggle}
// +        aria-label={reducedMotion ? "Effects off: reduced motion enabled" : paused ? "Resume effects" : "Pause effects"}
//          aria-pressed={paused || reducedMotion}
//          disabled={reducedMotion}
//        >
//          {paused || reducedMotion ? <Play aria-hidden="true" className="h-3 w-3" /> : <Pause aria-hidden="true" className="h-3 w-3" />}
// -        <span>{reducedMotion ? "Motion off" : paused ? "Resume motion" : "Pause motion"}</span>
// +        <span className="hidden sm:inline">{reducedMotion ? "Motion off" : paused ? "Resume motion" : "Pause motion"}</span>
//        </button>
//      </>
//    );
// diff --git a/src/components/home/HeroBanner.tsx b/src/components/home/HeroBanner.tsx
// index 8702d9d..6a476a0 100644
// --- a/src/components/home/HeroBanner.tsx
// +++ b/src/components/home/HeroBanner.tsx
// @@ -1,12 +1,21 @@
//  "use client";
//  
//  import React from "react";
// -import { TrendingUp } from "lucide-react";
// +import { ChevronDown, Eye, TrendingUp } from "lucide-react";
//  import { BullArtwork } from "./BullArtwork";
// +import type { MarketVision } from "./useMarketVision";
// +import type { HomeMotion } from "./useHomeMotion";
// +import type { TokenMetadata } from "@/lib/types";
//  
//  import { useMarket } from "@/context/MarketContext";
//  
// -export function HeroBanner() {
// +interface HeroBannerProps {
// +  vision: MarketVision;
// +  onSelectToken: (token: TokenMetadata | null) => void;
// +  motion: HomeMotion;
// +}
// +
// +export function HeroBanner({ vision, onSelectToken, motion }: HeroBannerProps) {
//    const { tokens, isMock } = useMarket();
//  
//    const totalVolume = tokens.reduce((sum, t) => sum + (t.volume24hUsd || 0), 0);
// @@ -39,7 +48,7 @@ export function HeroBanner() {
//  
//    return (
//      <section className="hero-section relative isolate min-h-[400px] overflow-hidden">
// -      <BullArtwork />
// +      <BullArtwork reflection={vision.reflection} reflectionKey={vision.status === "ready" ? vision.mint : "signature"} motion={motion} />
//        <div className="relative mx-auto flex min-h-[400px] w-full max-w-[1350px] flex-col justify-start px-6 py-9 sm:px-10 lg:px-0 lg:py-9">
//          <div className="max-w-[650px]">
//            <h1 className="max-w-[620px] text-4xl font-black leading-[0.98] tracking-[-0.055em] text-foreground sm:text-5xl lg:text-[64px]">
// @@ -74,6 +83,28 @@ export function HeroBanner() {
//            </div>
//          </div>
//        </div>
// +      <div className="hero-vision-position pointer-events-none absolute inset-x-0 bottom-5 z-10 mx-auto w-full max-w-[1350px] px-6 sm:px-10 lg:px-0">
// +        <div className="hero-vision-control pointer-events-auto inline-flex h-8 max-w-[calc(100vw-88px)] items-center gap-2 rounded-lg border border-border bg-background/90 px-2.5 text-[11px] text-muted">
// +          <Eye aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-brand-emerald" />
// +          <label htmlFor="market-vision" className="hidden shrink-0 sm:inline">Market vision</label>
// +          <div className="relative min-w-0">
// +            <select
// +              id="market-vision"
// +              aria-label="Market vision: choose a token to reflect in the sunglasses"
// +              value={vision.mint}
// +              onChange={(event) => onSelectToken(tokens.find((token) => token.mint === event.target.value) ?? null)}
// +              className="w-[135px] max-w-full appearance-none rounded bg-transparent py-1 pr-5 font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-brand-emerald"
// +            >
// +              <option value="">StreetFun signature</option>
// +              {tokens.map((token) => <option key={token.mint} value={token.mint}>${token.symbol}</option>)}
// +            </select>
// +            <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-0 top-1.5 h-3 w-3" />
// +          </div>
// +          <span className="shrink-0 border-l border-border pl-2 text-[10px]" role="status">
// +            {vision.status === "loading" ? "Loading…" : vision.status === "ready" ? isMock ? "Demo · 24h" : "24h history" : vision.status === "unavailable" ? "No history" : "Illustrative"}
// +          </span>
// +        </div>
// +      </div>
//      </section>
//    );
//  }
// diff --git a/src/components/tokens/TokenCard.tsx b/src/components/tokens/TokenCard.tsx
// index 3ea45da..7502bcf 100644
// --- a/src/components/tokens/TokenCard.tsx
// +++ b/src/components/tokens/TokenCard.tsx
// @@ -1,13 +1,17 @@
//  "use client";
//  
// -import React, { useState } from "react";
// +import React, { useCallback, useEffect, useRef, useState } from "react";
//  import Link from "next/link";
//  import Image from "next/image";
// -import { Copy, Check } from "lucide-react";
// +import { Copy, Check, Landmark, RotateCcw } from "lucide-react";
//  import { TokenMetadata } from "@/lib/types";
//  
//  interface TokenCardProps {
//    token: TokenMetadata;
// +  previewed?: boolean;
// +  onPreview?: (token: TokenMetadata) => void;
// +  onHoverPreview?: (token: TokenMetadata) => void;
// +  onCancelHover?: () => void;
//  }
//  
//  function formatVolume(vol: number): string {
// @@ -20,24 +24,56 @@ function formatVolume(vol: number): string {
//    return `$${vol}`;
//  }
//  
// -export function TokenCard({ token }: TokenCardProps) {
// +export function TokenCard({ token, previewed, onPreview, onHoverPreview, onCancelHover }: TokenCardProps) {
//    const [copied, setCopied] = useState(false);
// +  const [graduating, setGraduating] = useState(false);
// +  const previousGraduated = useRef(token.bondingCurve.isGraduated);
// +  const graduationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
// +  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
// +
// +  const replayGraduation = useCallback(() => {
// +    setGraduating(true);
// +    if (graduationTimer.current) clearTimeout(graduationTimer.current);
// +    graduationTimer.current = setTimeout(() => setGraduating(false), 2200);
// +  }, []);
// +
// +  useEffect(() => {
// +    if (!previousGraduated.current && token.bondingCurve.isGraduated) replayGraduation();
// +    previousGraduated.current = token.bondingCurve.isGraduated;
// +  }, [token.bondingCurve.isGraduated, replayGraduation]);
// +
// +  useEffect(() => () => {
// +    if (graduationTimer.current) clearTimeout(graduationTimer.current);
// +    if (copyTimer.current) clearTimeout(copyTimer.current);
// +  }, []);
//  
//    const handleCopyCa = (e: React.MouseEvent) => {
//      e.preventDefault();
//      e.stopPropagation();
//      navigator.clipboard.writeText(token.mint);
//      setCopied(true);
// -    setTimeout(() => setCopied(false), 1500);
// +    if (copyTimer.current) clearTimeout(copyTimer.current);
// +    copyTimer.current = setTimeout(() => setCopied(false), 1500);
//    };
//  
//    const isPositive = token.priceChange24h >= 0;
//  
//    return (
// -    <Link
// -      href={`/token/${token.mint}`}
// -      className="group relative flex flex-col justify-between rounded-2xl border border-border bg-card p-4 sm:p-5 transition-all hover:border-border-active hover:bg-card-hover shadow-sm"
// +    <article
// +      data-token={token.mint}
// +      data-previewed={previewed || undefined}
// +      data-graduating={graduating || undefined}
// +      onPointerEnter={(event) => { if (event.pointerType === "mouse") onHoverPreview?.(token); }}
// +      onPointerLeave={onCancelHover}
// +      onFocus={() => onPreview?.(token)}
// +      className="token-discovery-card group relative flex flex-col justify-between rounded-2xl border border-border bg-card p-4 sm:p-5 transition-colors hover:border-border-active hover:bg-card-hover shadow-sm"
//      >
// +      <Link
// +        href={`/token/${token.mint}`}
// +        aria-label={`Open ${token.name} ($${token.symbol})`}
// +        className="absolute inset-0 z-10 rounded-2xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand-emerald"
// +      />
// +      {graduating && <div className="graduation-wave pointer-events-none absolute inset-0 overflow-hidden rounded-2xl" aria-hidden="true" />}
//        <div>
//          {/* Top: Avatar, Name, CA button */}
//          <div className="flex items-start justify-between gap-3">
// @@ -57,9 +93,17 @@ export function TokenCard({ token }: TokenCardProps) {
//                    ${token.symbol}
//                  </span>
//                  {token.bondingCurve.isGraduated && (
// -                  <span className="rounded-md border border-slate-700/60 bg-slate-800/50 px-2 py-0.5 text-[10px] font-medium text-slate-300">
// +                  <button
// +                    type="button"
// +                    onClick={replayGraduation}
// +                    disabled={graduating}
// +                    aria-label={`Replay graduation for $${token.symbol}`}
// +                    title="Replay graduation"
// +                    className="graduation-badge relative z-20 inline-flex items-center gap-1 rounded-md border border-border-active bg-card-hover px-1.5 py-0.5 text-[10px] font-medium text-muted hover:border-brand-amber/50 hover:text-brand-amber focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-amber"
// +                  >
//                      Graduated
// -                  </span>
// +                    <RotateCcw aria-hidden="true" className="h-2.5 w-2.5" />
// +                  </button>
//                  )}
//                </div>
//                <div className="text-sm font-bold text-foreground">
// @@ -71,7 +115,7 @@ export function TokenCard({ token }: TokenCardProps) {
//            <button
//              onClick={handleCopyCa}
//              title="Copy Contract Address"
// -            className="flex items-center gap-1 rounded-lg border border-border-active/40 bg-card-hover/40 px-2 py-1 text-[11px] text-muted hover:border-border-active hover:text-foreground hover:bg-card-hover transition-colors"
// +            className="relative z-20 flex items-center gap-1 rounded-lg border border-border-active/40 bg-card-hover/40 px-2 py-1 text-[11px] text-muted hover:border-border-active hover:text-foreground hover:bg-card-hover transition-colors"
//            >
//              {copied ? (
//                <Check className="h-3 w-3 text-brand-emerald" />
// @@ -103,7 +147,8 @@ export function TokenCard({ token }: TokenCardProps) {
//              </span>
//            </div>
//            {token.bondingCurve.isGraduated ? (
// -            <span className="font-mono text-[11px] font-medium text-muted whitespace-nowrap pl-2">
// +            <span className="graduation-seal inline-flex items-center gap-1 font-mono text-[11px] font-medium text-brand-amber whitespace-nowrap pl-2">
// +              <Landmark aria-hidden="true" className="h-3 w-3 shrink-0" />
//                {token.targetEquity.symbol === "$TSPACEX"
//                  ? "Backed: $20.3M"
//                  : token.targetEquity.symbol === "$TOPAI"
// @@ -128,7 +173,9 @@ export function TokenCard({ token }: TokenCardProps) {
//              />
//            </div>
//          ) : (
// -          <div className="mt-3 mb-1 border-b border-border/80" />
// +          <div className="graduation-track relative mt-3 mb-1 border-b border-border/80" aria-hidden="true">
// +            <span className="graduation-charge absolute -top-px left-0 h-0.5 w-full rounded-full" />
// +          </div>
//          )}
//  
//          {/* Primary Metric */}
// @@ -185,6 +232,6 @@ export function TokenCard({ token }: TokenCardProps) {
//            {token.priceChange24h.toFixed(1)}%
//          </span>
//        </div>
// -    </Link>
// +    </article>
//    );
//  }

"use client";

import { useEffect, useId, useRef, type CSSProperties } from "react";
import Image from "next/image";
import { BULL_ARTWORK as art } from "./bullArtworkConfig";
import { useCityLighting } from "./useCityLighting";

export function BullArtwork() {
  const id = useId().replace(/:/g, "");
  const viewport = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const path = useRef<SVGPathElement>(null);
  const progress = useRef(art.initialProgress as number);
  useCityLighting(viewport);

  useEffect(() => {
    const container = viewport.current;
    const drawing = svg.current;
    const curve = path.current;
    if (!container || !drawing || !curve) return;

    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const length = curve.getTotalLength();
    const markers = drawing.querySelectorAll<SVGCircleElement>("[data-chart-marker]");
    const traces = drawing.querySelectorAll<SVGUseElement>("[data-chart-trace]");
    const highlights = drawing.querySelectorAll<SVGGElement>("[data-chart-highlight]");
    const tapeLight = drawing.querySelector<SVGLinearGradientElement>("[data-tape-light]");
    let visible = false;
    let frame = 0;
    let previousTime: number | null = null;

    const paint = () => {
      const p = progress.current;
      const point = curve.getPointAtLength(p * length);
      // The fade is only a safety margin; both endpoints are already outside the glass.
      const opacity = Math.min(1, p / 0.08, (1 - p) / 0.08);
      markers.forEach((marker) => {
        marker.setAttribute("cx", String(point.x));
        marker.setAttribute("cy", String(point.y));
      });
      traces.forEach((trace) => trace.setAttribute("stroke-dashoffset", String(art.traceLength - p)));
      highlights.forEach((highlight) => highlight.setAttribute("opacity", String(opacity)));
      tapeLight?.setAttribute("x1", String(point.x - 35));
      tapeLight?.setAttribute("x2", String(point.x + 12));
    };

    const tick = (now: number) => {
      if (previousTime !== null) {
        progress.current = (progress.current + (now - previousTime) / art.cycleMs) % 1;
      }
      previousTime = now;
      paint();
      frame = requestAnimationFrame(tick);
    };

    const sync = () => {
      cancelAnimationFrame(frame);
      previousTime = null;
      const reduce = preference.matches;
      if (visible && !document.hidden && !reduce) {
        frame = requestAnimationFrame(tick);
      }
    };

    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      sync();
    });
    observer.observe(container);
    preference.addEventListener("change", sync);
    document.addEventListener("visibilitychange", sync);
    paint();
    sync();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      preference.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  const stageStyle = {
    "--artwork-ratio": art.width / art.height,
    "--artwork-x": `${art.position.x * 100}%`,
    "--artwork-y": `${art.position.y * 100}%`,
  } as CSSProperties;

  return (
    <>
      <div ref={viewport} className="hero-artwork-viewport" aria-hidden="true">
        <div className="hero-artwork-faded-layer hero-bull-image">
          <div className="hero-artwork-stage" style={stageStyle}>
            <Image
              src="/generated/hero-bull-brand-glasses.png"
              alt=""
              fill
              priority
              sizes="(max-width: 900px) 900px, 100vw"
            />
          </div>
        </div>
        <div className="hero-bull-foreground-layer">
          <div className="hero-artwork-stage" style={stageStyle}>
            <Image
              src="/generated/hero-bull-foreground.png"
              alt=""
              fill
              priority
              sizes="(max-width: 900px) 900px, 100vw"
            />
          {/* City light sweep intentionally disabled.
          <div className="hero-city-light">
            <Image src="/generated/hero-bull-brand-glasses.png" alt="" fill priority sizes="(max-width: 900px) 900px, 100vw" />
          </div>
          */}
            <svg ref={svg} className="hero-chart" viewBox={`0 0 ${art.width} ${art.height}`} focusable="false">
            <defs>
              <path ref={path} id={`${id}-trend`} d={art.trend} pathLength="1" />
              <g id={`${id}-candles`}>
                {art.candles.map((candle) => (
                  <g key={candle.x}>
                    <path d={`M${candle.x} ${candle.high}V${candle.low}`} stroke="currentColor" strokeWidth="0.85" />
                    <path d={`M${candle.x} ${candle.open}V${candle.close}`} stroke="currentColor" strokeWidth="2.2" />
                  </g>
                ))}
              </g>
              <linearGradient id={`${id}-tape-light`} data-tape-light gradientUnits="userSpaceOnUse" x1="90" x2="137">
                <stop stopColor="white" stopOpacity="0" />
                <stop offset="0.7" stopColor="white" />
                <stop offset="1" stopColor="white" stopOpacity="0" />
              </linearGradient>
              <mask id={`${id}-tape-mask`} maskUnits="userSpaceOnUse" x="-64" y="-45" width="394" height="190">
                <rect x="-64" y="-45" width="394" height="190" fill={`url(#${id}-tape-light)`} />
              </mask>
              <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
                <stop className="text-hero-chart" stopColor="currentColor" stopOpacity="0.16" />
                <stop className="text-hero-chart" offset="1" stopColor="currentColor" stopOpacity="0" />
              </linearGradient>
              <radialGradient id={`${id}-shade`} cx="52%" cy="45%" r="65%">
                <stop offset="0.35" stopColor="var(--hero-glass-shadow)" stopOpacity="0" />
                <stop offset="1" stopColor="var(--hero-glass-shadow)" stopOpacity="0.8" />
              </radialGradient>
              {art.lenses.map((lens) => (
                <clipPath key={lens.name} id={`${id}-${lens.name}`} clipPathUnits="userSpaceOnUse">
                  <path d={lens.clip} />
                </clipPath>
              ))}
              <filter id={`${id}-glow`} x="-15%" y="-50%" width="130%" height="200%" colorInterpolationFilters="sRGB">
                <feGaussianBlur stdDeviation="1.3" />
              </filter>
            </defs>
            {art.lenses.map((lens) => (
              <g key={lens.name} clipPath={`url(#${id}-${lens.name})`} data-lens={lens.name}>
                <g transform={lens.mapping} opacity={lens.opacity} className="text-hero-chart">
                  <path d="M0 -20V145 M40 -20V145 M80 -20V145 M120 -20V145 M160 -20V145 M200 -20V145 M240 -20V145 M-20 20H260 M-20 55H260 M-20 90H260 M-20 125H260" fill="none" stroke="currentColor" strokeWidth="0.6" opacity="0.07" />
                  {art.candles.map((candle) => (
                    <rect key={candle.x} x={candle.x - 1.7} y={132 - candle.volume} width="3.4" height={candle.volume} fill="currentColor" opacity="0.085" />
                  ))}
                  <path d={`${art.trend} L330 145 L-64 145Z`} fill={`url(#${id}-fill)`} />
                  <use href={`#${id}-candles`} opacity="0.42" />
                  <use href={`#${id}-trend`} fill="none" stroke="currentColor" strokeWidth="3" filter={`url(#${id}-glow)`} opacity="0.4" />
                  <use href={`#${id}-trend`} fill="none" stroke="currentColor" strokeWidth={art.lineWidth} strokeLinejoin="round" opacity="0.75" />
                  <g className="hero-chart-travel" data-chart-highlight opacity="0">
                    <use href={`#${id}-candles`} mask={`url(#${id}-tape-mask)`} />
                    <use data-chart-trace href={`#${id}-trend`} fill="none" stroke="currentColor" strokeWidth="4" strokeDasharray={`${art.traceLength} 1`} filter={`url(#${id}-glow)`} opacity="0.7" />
                    <use data-chart-trace href={`#${id}-trend`} fill="none" stroke="var(--hero-chart-core)" strokeWidth="2.1" strokeDasharray={`${art.traceLength} 1`} strokeLinecap="round" strokeLinejoin="round" />
                    <circle data-chart-marker r="5" fill="currentColor" filter={`url(#${id}-glow)`} opacity="0.7" />
                    <circle data-chart-marker r={art.markerRadius} fill="var(--hero-chart-core)" />
                  </g>
                </g>
                <rect {...lens.bounds} fill={`url(#${id}-shade)`} />
              </g>
            ))}
            </svg>
          </div>
        </div>
      </div>
    </>
  );
}

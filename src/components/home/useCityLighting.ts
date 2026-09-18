"use client";

import { useEffect, type RefObject } from "react";

/** Relight the source windows occasionally; the camera and artwork stay fixed. */
export function useCityLighting(viewport: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const container = viewport.current;
    const light = container?.querySelector<HTMLElement>(".hero-city-light");
    if (!container || !light) return;
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    let visible = false, frame = 0, previous = 0, elapsed = 0;
    const tick = (now: number) => {
      const dt = previous ? Math.min(64, now - previous) : 0;
      previous = now;
      elapsed += dt;
      // A five-second pass followed by a long quiet interval.
      const phase = (elapsed % 18_000) / 18_000;
      const pass = Math.min(1, phase / 0.28);
      light.style.setProperty("--city-light-x", `${-20 + pass * 140}%`);
      light.style.opacity = String(phase < 0.28 ? Math.sin(pass * Math.PI) * 0.52 : 0);
      frame = requestAnimationFrame(tick);
    };
    const sync = () => {
      cancelAnimationFrame(frame);
      previous = 0;
      if (visible && !document.hidden && !preference.matches) frame = requestAnimationFrame(tick);
      if (preference.matches) light.style.opacity = "0";
    };
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); });
    observer.observe(container);
    document.addEventListener("visibilitychange", sync);
    preference.addEventListener("change", sync);
    sync();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("visibilitychange", sync);
      preference.removeEventListener("change", sync);
    };
  }, [viewport]);
}

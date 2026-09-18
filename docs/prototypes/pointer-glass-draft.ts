// Pointer-responsive glass — deferred at the user’s request.
// This commented draft is not imported or rendered.
//
// "use client";
//
// import { useEffect, type RefObject } from "react";
//
// /** Light moves across the fixed artwork. No React updates on animation frames. */
// export function useArtworkLighting(viewport: RefObject<HTMLDivElement | null>, svg: RefObject<SVGSVGElement | null>) {
//   useEffect(() => {
//     const container = viewport.current;
//     const drawing = svg.current;
//     const hero = container?.closest("section");
//     if (!container || !drawing || !hero) return;
//     const stage = container.querySelector<HTMLElement>(".hero-artwork-stage")!;
//     const light = container.querySelector<HTMLElement>(".hero-city-light")!;
//     const glints = drawing.querySelectorAll<SVGGElement>("[data-glass-glint]");
//     const preference = matchMedia("(prefers-reduced-motion: reduce)");
//     let visible = false, frame = 0, previous = 0, elapsed = 0;
//     let target = 0.5, current = 0.5, strength = 0, targetStrength = 0, pulseUntil = 0;
//     let bounds = hero.getBoundingClientRect();
//     const measure = () => { bounds = hero.getBoundingClientRect(); };
//     const move = (event: PointerEvent) => {
//       if (event.pointerType !== "mouse") return;
//       target = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
//       targetStrength = 1;
//     };
//     const leave = () => { targetStrength = 0; };
//     const pulse = () => { if (visible) { pulseUntil = elapsed + 900; current = 0.2; target = 0.85; } };
//     const touch = (event: PointerEvent) => { if (event.pointerType !== "mouse") pulse(); };
//     const focus = (event: FocusEvent) => { if (event.target instanceof HTMLElement && event.target.matches(":focus-visible")) pulse(); };
//     const tick = (now: number) => {
//       const dt = previous ? Math.min(64, now - previous) : 0;
//       previous = now;
//       elapsed += dt;
//       const ease = 1 - Math.exp(-dt / 110);
//       current += (target - current) * ease;
//       strength += ((elapsed < pulseUntil ? 1 : targetStrength) - strength) * ease;
//       glints.forEach((glint) => {
//         glint.setAttribute("transform", `translate(${-85 + current * 395} 0)`);
//         glint.setAttribute("opacity", String(strength * 0.7));
//       });
//       // A short pass, then a long quiet interval. Mask reveals the source windows.
//       const phase = (elapsed % 18_000) / 18_000;
//       const pass = Math.min(1, phase / 0.28);
//       light.style.setProperty("--city-light-x", `${-20 + pass * 140}%`);
//       light.style.opacity = String(phase < 0.28 ? Math.sin(pass * Math.PI) * 0.52 : 0);
//       frame = requestAnimationFrame(tick);
//     };
//     const sync = () => {
//       cancelAnimationFrame(frame); previous = 0;
//       if (visible && !document.hidden && !preference.matches) frame = requestAnimationFrame(tick);
//       if (preference.matches) {
//         light.style.opacity = "0";
//         glints.forEach(g => g.setAttribute("opacity", "0"));
//       }
//     };
//     const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; measure(); sync(); });
//     const resize = new ResizeObserver(measure);
//     observer.observe(container); resize.observe(stage);
//     hero.addEventListener("pointermove", move, { passive: true });
//     hero.addEventListener("pointerleave", leave);
//     hero.addEventListener("pointerdown", touch, { passive: true });
//     document.addEventListener("focusin", focus);
//     document.addEventListener("visibilitychange", sync);
//     window.addEventListener("scroll", measure, { passive: true });
//     preference.addEventListener("change", sync);
//     sync();
//     return () => {
//       cancelAnimationFrame(frame); observer.disconnect(); resize.disconnect();
//       hero.removeEventListener("pointermove", move); hero.removeEventListener("pointerleave", leave);
//       hero.removeEventListener("pointerdown", touch); document.removeEventListener("focusin", focus);
//       document.removeEventListener("visibilitychange", sync); window.removeEventListener("scroll", measure);
//       preference.removeEventListener("change", sync);
//     };
//   }, [viewport, svg]);
// }
//
// --- SVG gradient ---
//               <linearGradient id={`${id}-specular`}>
//                 <stop stopColor="var(--hero-chart-core)" stopOpacity="0" />
//                 <stop offset="0.46" stopColor="var(--hero-chart-core)" stopOpacity="0.04" />
//                 <stop offset="0.56" stopColor="var(--hero-chart-core)" stopOpacity="0.45" />
//                 <stop offset="0.7" stopColor="var(--hero-chart-core)" stopOpacity="0.12" />
//                 <stop offset="1" stopColor="var(--hero-chart-core)" stopOpacity="0" />
//               </linearGradient>
//
// --- Lens markup ---
//                   <g data-glass-glint className="hero-glass-glint" opacity="0">
//                     <path d="M-9 -35 C15 14 18 91 49 154 L67 154 C40 76 36 10 13 -35Z" fill={`url(#${id}-specular)`} />
//                   </g>

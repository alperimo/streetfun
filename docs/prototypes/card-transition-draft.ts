// Expanding card transition — deferred at the user’s request (motion discomfort).
// Commented reference only. Normal Next.js links handle navigation.
//
// "use client";
//
// import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, type MouseEvent, type ReactNode } from "react";
// import { usePathname, useRouter } from "next/navigation";
//
// type Navigate = (event: MouseEvent<HTMLAnchorElement>, source: HTMLElement) => void;
// const TokenTransitionContext = createContext<Navigate>(() => {});
//
// /** Wait for the App Router commit before the browser captures the destination. */
// export function TokenTransitionProvider({ children }: { children: ReactNode }) {
//   const router = useRouter();
//   const pathname = usePathname();
//   const pending = useRef<{ path: string; done: () => void; cancel: () => void } | null>(null);
//
//   useLayoutEffect(() => {
//     if (pending.current?.path === pathname) pending.current.done();
//   }, [pathname]);
//   useEffect(() => () => pending.current?.cancel(), []);
//
//   const navigate = useCallback<Navigate>((event, source) => {
//     if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey ||
//       event.currentTarget.target === "_blank" || !document.startViewTransition ||
//       window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
//
//     event.preventDefault();
//     if (pending.current) return;
//     const href = new URL(event.currentTarget.href).pathname;
//     source.classList.add("token-route-origin");
//     document.documentElement.classList.add("token-route-transition");
//     let timeout: ReturnType<typeof setTimeout>;
//     let finishUpdate = () => {};
//     const transition = document.startViewTransition(() => new Promise<void>((resolve) => {
//       finishUpdate = resolve;
//       // Slow routes must never leave the page frozen behind a snapshot.
//       timeout = setTimeout(() => { transition.skipTransition(); resolve(); }, 1800);
//       pending.current = { path: href, done: resolve, cancel: () => { transition.skipTransition(); resolve(); } };
//       router.push(href);
//     }));
//     const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
//     const onPreference = () => { if (preference.matches) transition.skipTransition(); };
//     preference.addEventListener("change", onPreference);
//     const cleanup = () => {
//       clearTimeout(timeout);
//       finishUpdate();
//       source.classList.remove("token-route-origin");
//       document.documentElement.classList.remove("token-route-transition");
//       preference.removeEventListener("change", onPreference);
//       pending.current = null;
//     };
//     // A skipped animation still navigates; consume browser cancellation rejections.
//     void transition.ready.catch(() => {});
//     void transition.updateCallbackDone.catch(() => {});
//     void transition.finished.then(cleanup, cleanup);
//   }, [router]);
//
//   return <TokenTransitionContext.Provider value={navigate}>{children}</TokenTransitionContext.Provider>;
// }
//
// export const useTokenTransition = () => useContext(TokenTransitionContext);
//
// --- Transition CSS ---
// /* Only the chosen card participates; ordinary links retain native navigation. */
// .token-route-origin,
// .token-route-transition .token-route-destination { view-transition-name: token-surface; }
// .token-route-origin [data-transition-avatar],
// .token-route-transition .token-route-destination [data-transition-avatar] { view-transition-name: token-avatar; }
// .token-route-origin [data-transition-symbol],
// .token-route-transition .token-route-destination [data-transition-symbol] { view-transition-name: token-symbol; }
// .token-route-origin [data-transition-backing],
// .token-route-transition .token-route-destination [data-transition-backing] { view-transition-name: token-backing; }
//
// ::view-transition-group(token-surface),
// ::view-transition-group(token-avatar),
// ::view-transition-group(token-symbol),
// ::view-transition-group(token-backing) {
//   animation-duration: 520ms;
//   animation-timing-function: cubic-bezier(0.22, 0.75, 0.2, 1);
// }
// ::view-transition-old(root) { animation: none; opacity: 0; }
// ::view-transition-new(root) { animation: none; }
// ::view-transition-group(root) { animation-duration: 520ms; }
// ::view-transition-old(token-surface),
// ::view-transition-new(token-surface) { height: 100%; overflow: clip; border-radius: 16px; }
//
// @media (prefers-reduced-motion: reduce) {
//   .hero-city-light { display: none; }
//   ::view-transition-group(*) { animation-duration: 0s !important; }
// }
//

// Art-directed market tape: rallies, abrupt pullbacks, then a stronger breakout.
// These are decorative coordinates, not prices. No randomness or live data.
const levels = [101, 96, 100, 90, 93, 86, 94, 83, 78, 82, 75, 81, 72, 63, 70, 65,
  68, 57, 47, 55, 50, 56, 65, 59, 63, 52, 49, 54, 43, 47, 32, 38, 26, 34,
  23, 29, 15, 23, 14, 20, 7, 12, 1, 8, -3, 2, -9, -4, -15];
const candles = levels.map((close, index) => {
  const open = index === 0 ? 105 : levels[index - 1];
  const x = index * 5;
  const high = Math.min(open, close) - [3, 5, 2, 7, 4][index % 5];
  const low = Math.max(open, close) + [4, 2, 5, 3][index % 4];
  return { x, open, close, high, low, volume: 9 + Math.abs(open - close) * 1.5 };
});
const trend = `M-64 119 L-38 113 L-16 107 ${levels.map((y, i) => `L${i * 5} ${y}`).join(" ")} L280 -20 L330 -27`;

/** All coordinates refer to the original 1881 × 836 artwork, never the viewport. */
export const BULL_ARTWORK = {
  width: 1881,
  height: 836,
  position: { x: 0.78, y: 0.54 },
  cycleMs: 12_000,
  initialProgress: 0.46,
  traceLength: 0.12,
  lineWidth: 1.65,
  markerRadius: 2.35,
  // Extended at both ends: the highlight is outside both clips at the loop seam.
  trend,
  candles,
  lenses: [
    {
      name: "left",
      // Inset from the smaller opening, including the nose occlusion below it.
      clip: "M1118 437 C1123 421 1189 406 1222 406 C1240 405 1248 412 1249 424 C1252 443 1246 469 1239 481 C1228 492 1213 498 1197 503 C1175 509 1154 514 1140 523 C1132 522 1129 514 1124 501 C1117 481 1114 458 1116 446 Q1116 441 1118 437Z",
      mapping: "matrix(0.64 -0.13 0.035 0.78 1098 435)",
      opacity: 0.76,
      bounds: { x: 1108, y: 398, width: 150, height: 134 },
    },
    {
      name: "right",
      clip: "M1322 400 C1329 384 1397 363 1455 357 C1478 354 1492 357 1498 369 C1506 386 1506 433 1500 453 C1496 467 1475 474 1440 481 C1407 489 1377 495 1361 486 C1346 479 1332 458 1325 438 C1319 421 1318 410 1322 400Z",
      mapping: "matrix(0.87 -0.18 0.055 0.91 1310 387)",
      opacity: 1,
      bounds: { x: 1311, y: 350, width: 202, height: 149 },
    },
  ],
} as const;

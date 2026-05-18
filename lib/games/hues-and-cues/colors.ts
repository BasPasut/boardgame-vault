export const GRID_COLS = 30;
export const GRID_ROWS = 16;

// 30 hues spanning the full visible spectrum
const HUES = [
   0,  12,  24,  36,  48,  60,  72,  84,  96, 108,
  120, 132, 144, 156, 168, 180, 192, 204, 216, 228,
  240, 252, 264, 276, 288, 300, 312, 324, 336, 348,
];

// 16 rows: top (A) = very dark jewel tones → bottom (P) = light but clearly coloured
// Matches the physical board: dark top rows, bright middle, lighter bottom rows.
// Saturation stays high (≥62%) so every row is identifiable and clueable.
const ROW_STYLES = [
  { l: 13, s: 75 },  // A
  { l: 19, s: 82 },  // B
  { l: 26, s: 87 },  // C
  { l: 33, s: 90 },  // D
  { l: 40, s: 92 },  // E
  { l: 46, s: 93 },  // F
  { l: 51, s: 93 },  // G
  { l: 56, s: 92 },  // H
  { l: 61, s: 91 },  // I
  { l: 65, s: 89 },  // J
  { l: 69, s: 86 },  // K
  { l: 73, s: 83 },  // L
  { l: 76, s: 79 },  // M
  { l: 79, s: 74 },  // N
  { l: 82, s: 68 },  // O
  { l: 85, s: 62 },  // P
];

// Convert HSL to explicit sRGB so every browser/device renders identical colours.
// Leaving it as hsl() lets iOS Safari interpret it in Display P3, causing
// different-looking colours on iPhone vs desktop.
function hslToRgb(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  const r = Math.round(f(0) * 255);
  const g = Math.round(f(8) * 255);
  const b = Math.round(f(4) * 255);
  return `rgb(${r},${g},${b})`;
}

export function getColor(x: number, y: number): string {
  const hue = HUES[x] ?? 0;
  const { l, s } = ROW_STYLES[y] ?? { l: 50, s: 80 };
  return hslToRgb(hue, s, l);
}

export function manhattan(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

// d=0: 3pts (bullseye)  d=1-2: 2pts (ring 1)  d=3-4: 1pt (ring 2)  d>4: 0pts
export function scoreForDistance(d: number): number {
  if (d === 0) return 3;
  if (d <= 2) return 2;
  if (d <= 4) return 1;
  return 0;
}

export const PIN_COLORS = [
  "#ef4444",
  "#3b82f6",
  "#22c55e",
  "#f59e0b",
  "#8b5cf6",
  "#ec4899",
  "#06b6d4",
  "#84cc16",
  "#f97316",
  "#6366f1",
];

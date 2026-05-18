export const GRID_COLS = 30;
export const GRID_ROWS = 16;

// 30 hues spanning the full visible spectrum
const HUES = [
   0,  12,  24,  36,  48,  60,  72,  84,  96, 108,
  120, 132, 144, 156, 168, 180, 192, 204, 216, 228,
  240, 252, 264, 276, 288, 300, 312, 324, 336, 348,
];

// 16 rows: top = light pastel → bottom = very dark saturated
const ROW_STYLES = [
  { l: 87, s: 52 },
  { l: 80, s: 65 },
  { l: 73, s: 76 },
  { l: 66, s: 83 },
  { l: 59, s: 88 },
  { l: 52, s: 91 },
  { l: 46, s: 93 },
  { l: 40, s: 93 },
  { l: 35, s: 91 },
  { l: 29, s: 87 },
  { l: 24, s: 81 },
  { l: 19, s: 73 },
  { l: 14, s: 63 },
  { l: 10, s: 51 },
  { l: 6,  s: 38 },
  { l: 3,  s: 24 },
];

export function getColor(x: number, y: number): string {
  const hue = HUES[x] ?? 0;
  const { l, s } = ROW_STYLES[y] ?? { l: 50, s: 80 };
  return `hsl(${hue}, ${s}%, ${l}%)`;
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

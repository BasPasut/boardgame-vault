export const GRID_COLS = 30;
export const GRID_ROWS = 16;

// 30 hues spanning the full visible spectrum
const HUES = [
   0,  12,  24,  36,  48,  60,  72,  84,  96, 108,
  120, 132, 144, 156, 168, 180, 192, 204, 216, 228,
  240, 252, 264, 276, 288, 300, 312, 324, 336, 348,
];

// 16 rows: top = very light pastel → bottom = very dark saturated
const ROW_STYLES = [
  { l: 95, s: 28 },
  { l: 89, s: 48 },
  { l: 82, s: 65 },
  { l: 75, s: 77 },
  { l: 67, s: 85 },
  { l: 60, s: 90 },
  { l: 53, s: 93 },
  { l: 47, s: 93 },
  { l: 41, s: 91 },
  { l: 35, s: 87 },
  { l: 29, s: 81 },
  { l: 23, s: 73 },
  { l: 17, s: 63 },
  { l: 12, s: 51 },
  { l: 7,  s: 38 },
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

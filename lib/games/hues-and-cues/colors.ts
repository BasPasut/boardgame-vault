export const GRID_COLS = 10;
export const GRID_ROWS = 10;

// Hue for each column — full spectrum + warm/cool balance
const HUES = [0, 25, 55, 85, 135, 170, 205, 245, 285, 330];

// Lightness + saturation per row (top = light, bottom = dark)
const ROW_STYLES = [
  { l: 93, s: 60 },
  { l: 83, s: 72 },
  { l: 73, s: 82 },
  { l: 63, s: 89 },
  { l: 53, s: 93 },
  { l: 44, s: 90 },
  { l: 36, s: 85 },
  { l: 28, s: 78 },
  { l: 20, s: 68 },
  { l: 13, s: 55 },
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

// d=0: 3pts  d=1-2: 2pts  d=3-4: 1pt  d>4: 0pts
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

import type { PlacedTile, Doors, Floor, Rotation } from "../types";
import { getTile } from "../data/tiles";

type Direction = "north" | "east" | "south" | "west";

const OPPOSITE: Record<Direction, Direction> = {
  north: "south", south: "north", east: "west", west: "east",
};
const DELTA: Record<Direction, { dx: number; dy: number }> = {
  north: { dx: 0, dy: -1 }, south: { dx: 0, dy: 1 },
  east:  { dx: 1, dy: 0  }, west:  { dx: -1, dy: 0 },
};

/** Rotate a doors object clockwise by one step (90°) */
function rotateDoors90(d: Doors): Doors {
  return { north: d.west, east: d.north, south: d.east, west: d.south };
}

/** Apply N 90° clockwise rotations to a door config */
export function rotateDoors(base: Doors, rotation: Rotation): Doors {
  let d = { ...base };
  const steps = rotation / 90;
  for (let i = 0; i < steps; i++) d = rotateDoors90(d);
  return d;
}

/** Find the tile placed at (floor, x, y) */
export function tileAt(tiles: PlacedTile[], floor: Floor, x: number, y: number): PlacedTile | undefined {
  return tiles.find((t) => t.floor === floor && t.x === x && t.y === y);
}

/** Check if two adjacent tiles have a valid door connection */
export function areDoorConnected(
  from: PlacedTile, to: PlacedTile, direction: Direction,
): boolean {
  return from.doors[direction] && to.doors[OPPOSITE[direction]];
}

/**
 * Get all valid moves from a position (BFS up to `speed` steps).
 * Returns Set of "floor,x,y" strings reachable.
 * lockedDoors: array of "floor,x,y,dir" strings — connections that cannot be traversed.
 */
export function getReachable(
  tiles: PlacedTile[],
  floor: Floor, x: number, y: number,
  speed: number,
  lockedDoors: string[] = [],
): Set<string> {
  const lockedSet = new Set(lockedDoors);

  function isLocked(f: Floor, tx: number, ty: number, dir: Direction): boolean {
    return lockedSet.has(`${f},${tx},${ty},${dir}`) ||
           lockedSet.has(`${f},${tx + DELTA[dir].dx},${ty + DELTA[dir].dy},${OPPOSITE[dir]}`);
  }

  const visited = new Set<string>();
  const queue: { floor: Floor; x: number; y: number; steps: number }[] = [
    { floor, x, y, steps: 0 },
  ];
  visited.add(`${floor},${x},${y}`);

  while (queue.length) {
    const cur = queue.shift()!;
    if (cur.steps >= speed) continue;

    const curTile = tileAt(tiles, cur.floor, cur.x, cur.y);
    if (!curTile) continue;

    // Check stairwells — allow floor change to any stairwell on another floor
    const def = getTile(curTile.tile_id);
    if (def?.type === "stairwell") {
      for (const f of [0, 1, 2] as Floor[]) {
        if (f === cur.floor) continue;
        // Connect to ALL stairwell tiles on the other floor (not just same x,y)
        const stairwellsOnFloor = tiles.filter(
          (t) => t.floor === f && getTile(t.tile_id)?.type === "stairwell",
        );
        for (const sw of stairwellsOnFloor) {
          const key = `${f},${sw.x},${sw.y}`;
          if (!visited.has(key)) {
            visited.add(key);
            queue.push({ floor: f, x: sw.x, y: sw.y, steps: cur.steps + 1 });
          }
        }
      }
    }

    for (const dir of ["north", "east", "south", "west"] as Direction[]) {
      if (!curTile.doors[dir]) continue;
      if (isLocked(cur.floor, cur.x, cur.y, dir)) continue; // locked door
      const { dx, dy } = DELTA[dir];
      const nx = cur.x + dx, ny = cur.y + dy;
      const neighbor = tileAt(tiles, cur.floor, nx, ny);
      if (!neighbor) continue; // unexplored — cannot move there yet
      if (!neighbor.doors[OPPOSITE[dir]]) continue; // door doesn't connect
      const key = `${cur.floor},${nx},${ny}`;
      if (!visited.has(key)) {
        visited.add(key);
        queue.push({ floor: cur.floor, x: nx, y: ny, steps: cur.steps + 1 });
      }
    }
  }

  visited.delete(`${floor},${x},${y}`); // remove starting position
  return visited;
}

/**
 * Get all unexplored doors on a floor — positions where a tile could be placed.
 * Returns array of { x, y, fromDir } objects.
 */
export function getUnexploredDoors(
  tiles: PlacedTile[], floor: Floor,
): { x: number; y: number; fromTile: PlacedTile; direction: Direction }[] {
  const results: { x: number; y: number; fromTile: PlacedTile; direction: Direction }[] = [];
  const placed = tiles.filter((t) => t.floor === floor);

  for (const tile of placed) {
    for (const dir of ["north", "east", "south", "west"] as Direction[]) {
      if (!tile.doors[dir]) continue;
      const { dx, dy } = DELTA[dir];
      const nx = tile.x + dx, ny = tile.y + dy;
      if (!tileAt(tiles, floor, nx, ny)) {
        // No tile there — this is an unexplored door
        results.push({ x: nx, y: ny, fromTile: tile, direction: dir });
      }
    }
  }
  return results;
}

/**
 * Auto-rotate a tile definition so that its required door (the one connecting
 * back to fromDir) is open. Returns the rotation or null if impossible.
 */
export function findValidRotation(
  tileId: string, requiredDoor: Direction,
): { rotation: Rotation; doors: Doors } | null {
  const def = getTile(tileId);
  if (!def) return null;

  for (const r of [0, 90, 180, 270] as Rotation[]) {
    const d = rotateDoors(def.doors, r);
    if (d[requiredDoor]) return { rotation: r, doors: d };
  }
  return null; // no valid rotation (rare — tile has no suitable door)
}

/**
 * Like findValidRotation but satisfies ALL required doors simultaneously.
 * Used when a new tile position has multiple placed neighbors with open doors toward it.
 */
export function findValidRotationMulti(
  tileId: string, requiredDoors: Direction[],
): { rotation: Rotation; doors: Doors } | null {
  const def = getTile(tileId);
  if (!def) return null;
  for (const r of [0, 90, 180, 270] as Rotation[]) {
    const d = rotateDoors(def.doors, r);
    if (requiredDoors.every((rd) => d[rd])) return { rotation: r, doors: d };
  }
  return null;
}

/** Build a new PlacedTile at (floor, x, y) connecting from fromDir */
export function buildPlacedTile(
  tileId: string, floor: Floor, x: number, y: number,
  requiredDoor: Direction, revealedBy: string,
): PlacedTile | null {
  const valid = findValidRotation(tileId, requiredDoor);
  if (!valid) return null;
  return {
    tile_id: tileId, floor, x, y,
    rotation: valid.rotation, doors: valid.doors,
    revealed_by: revealedBy,
  };
}

/**
 * BFS shortest path from (floor,x,y) to (tf,tx,ty).
 * Returns array of {floor,x,y} positions from start (exclusive) to end (inclusive),
 * or null if unreachable.
 */
export function findPath(
  tiles: PlacedTile[],
  floor: Floor, x: number, y: number,
  tf: Floor, tx: number, ty: number,
  lockedDoors: string[] = [],
): { floor: Floor; x: number; y: number }[] | null {
  const lockedSet = new Set(lockedDoors);
  function isLocked(f: Floor, cx: number, cy: number, dir: Direction): boolean {
    return lockedSet.has(`${f},${cx},${cy},${dir}`) ||
           lockedSet.has(`${f},${cx + DELTA[dir].dx},${cy + DELTA[dir].dy},${OPPOSITE[dir]}`);
  }

  type Node = { floor: Floor; x: number; y: number };
  const startKey = `${floor},${x},${y}`;
  const endKey   = `${tf},${tx},${ty}`;
  const parent = new Map<string, string | null>();
  parent.set(startKey, null);
  const queue: Node[] = [{ floor, x, y }];

  outer: while (queue.length) {
    const cur = queue.shift()!;
    const curKey = `${cur.floor},${cur.x},${cur.y}`;
    if (curKey === endKey) break;

    const curTile = tileAt(tiles, cur.floor, cur.x, cur.y);
    if (!curTile) continue;

    const def = getTile(curTile.tile_id);
    if (def?.type === "stairwell") {
      for (const f of [0, 1, 2] as Floor[]) {
        if (f === cur.floor) continue;
        const stairwells = tiles.filter((t) => t.floor === f && getTile(t.tile_id)?.type === "stairwell");
        for (const sw of stairwells) {
          const k = `${f},${sw.x},${sw.y}`;
          if (!parent.has(k)) { parent.set(k, curKey); queue.push({ floor: f, x: sw.x, y: sw.y }); }
          if (k === endKey) break outer;
        }
      }
    }

    for (const dir of ["north", "east", "south", "west"] as Direction[]) {
      if (!curTile.doors[dir]) continue;
      if (isLocked(cur.floor, cur.x, cur.y, dir)) continue;
      const { dx, dy } = DELTA[dir];
      const nx = cur.x + dx, ny = cur.y + dy;
      const neighbor = tileAt(tiles, cur.floor, nx, ny);
      if (!neighbor || !neighbor.doors[OPPOSITE[dir]]) continue;
      const k = `${cur.floor},${nx},${ny}`;
      if (!parent.has(k)) { parent.set(k, curKey); queue.push({ floor: cur.floor, x: nx, y: ny }); }
      if (k === endKey) break outer;
    }
  }

  if (!parent.has(endKey)) return null;

  const path: Node[] = [];
  let cur: string | null | undefined = endKey;
  while (cur && cur !== startKey) {
    const [f, px, py] = cur.split(",").map(Number);
    path.unshift({ floor: f as Floor, x: px, y: py });
    cur = parent.get(cur);
  }
  return path;
}

/** Starting tiles for each floor */
export function buildStartingTiles(): PlacedTile[] {
  const ground = buildPlacedTile("entrance-hall",    1, 0, 0, "south", "system")!;
  const upper  = buildPlacedTile("upper-landing",    2, 0, 0, "south", "system")!;
  const base   = buildPlacedTile("basement-landing", 0, 0, 0, "south", "system")!;
  return [ground, upper, base];
}

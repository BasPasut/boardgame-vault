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
 */
export function getReachable(
  tiles: PlacedTile[],
  floor: Floor, x: number, y: number,
  speed: number,
): Set<string> {
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

    // Check stairwells — allow floor change
    const def = getTile(curTile.tile_id);
    if (def?.type === "stairwell") {
      // Connect to the stairwell tile on adjacent floor if it exists at same x,y
      for (const f of [0, 1, 2] as Floor[]) {
        if (f === cur.floor) continue;
        const adj = tileAt(tiles, f, cur.x, cur.y);
        if (adj && getTile(adj.tile_id)?.type === "stairwell") {
          const key = `${f},${cur.x},${cur.y}`;
          if (!visited.has(key)) {
            visited.add(key);
            queue.push({ floor: f, x: cur.x, y: cur.y, steps: cur.steps + 1 });
          }
        }
      }
    }

    for (const dir of ["north", "east", "south", "west"] as Direction[]) {
      if (!curTile.doors[dir]) continue;
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

/** Starting tiles for each floor */
export function buildStartingTiles(): PlacedTile[] {
  const ground = buildPlacedTile("entrance-hall",    1, 0, 0, "south", "system")!;
  const upper  = buildPlacedTile("upper-landing",    2, 0, 0, "south", "system")!;
  const base   = buildPlacedTile("basement-landing", 0, 0, 0, "south", "system")!;
  return [ground, upper, base];
}

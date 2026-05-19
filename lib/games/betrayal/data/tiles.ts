import type { TileDefinition } from "../types";

// Doors: north=top, east=right, south=bottom, west=left
export const TILE_DEFINITIONS: TileDefinition[] = [
  // ─────────────────────────────────────────────
  // GROUND FLOOR (floor 1)
  // ─────────────────────────────────────────────
  {
    id: "entrance-hall",
    name: "Entrance Hall",
    floors: [1],
    doors: { north: false, east: true, south: true, west: false },
    type: "normal",
    description: "The grand entrance to the mansion. All explorers begin here.",
    image: "/images/games/betrayal/rooms/ground-entrance-hall.png",
    isStarting: true,
  },
  {
    id: "foyer",
    name: "Foyer",
    floors: [1],
    doors: { north: true, east: true, south: false, west: true },
    type: "event",
    description: "A small antechamber. Something feels wrong from the moment you enter.",
    image: "/images/games/betrayal/rooms/ground-foyer.png",
  },
  {
    id: "dining-room",
    name: "Dining Room",
    floors: [1],
    doors: { north: true, east: false, south: true, west: true },
    type: "event",
    description: "A long table set for a dinner that was never finished.",
    image: "/images/games/betrayal/rooms/ground-dining-room.png",
  },
  {
    id: "kitchen",
    name: "Kitchen",
    floors: [1],
    doors: { north: false, east: true, south: false, west: true },
    type: "item",
    description: "A stone kitchen, still warm from a fire that should have died long ago.",
    image: "/images/games/betrayal/rooms/ground-kitchen.png",
  },
  {
    id: "library",
    name: "Library",
    floors: [1],
    doors: { north: true, east: false, south: true, west: false },
    type: "omen",
    description: "Shelves of forbidden knowledge. Something here should not be read.",
    image: "/images/games/betrayal/rooms/ground-library.png",
  },
  {
    id: "parlor",
    name: "Parlor",
    floors: [1],
    doors: { north: false, east: true, south: true, west: true },
    type: "omen",
    description: "Arranged for a séance. The candle burns black.",
    image: "/images/games/betrayal/rooms/ground-parlor.png",
  },
  {
    id: "ballroom",
    name: "Ballroom",
    floors: [1],
    doors: { north: true, east: true, south: false, west: true },
    type: "event",
    description: "A crumbling dance hall. You can almost hear the music.",
    image: "/images/games/betrayal/rooms/ground-ballroom.png",
  },
  {
    id: "garden",
    name: "Garden",
    floors: [1],
    doors: { north: true, east: false, south: false, west: true },
    type: "event",
    description: "A walled garden of dead roses. The iron gate is chained shut.",
    image: "/images/games/betrayal/rooms/ground-garden.png",
  },
  {
    id: "junk-room",
    name: "Junk Room",
    floors: [1],
    doors: { north: false, east: true, south: true, west: false },
    type: "item",
    description: "Decades of discarded things — one of them might still be useful.",
    image: "/images/games/betrayal/rooms/ground-junk-room.png",
  },
  {
    id: "servants-quarters",
    name: "Servants' Quarters",
    floors: [1],
    doors: { north: true, east: false, south: false, west: true },
    type: "normal",
    description: "Small beds, neatly made — as if their occupants just stepped out.",
    image: "/images/games/betrayal/rooms/ground-servants-quarters.png",
  },
  {
    id: "ground-stairwell",
    name: "Grand Staircase",
    floors: [1],
    doors: { north: true, east: true, south: false, west: true },
    type: "stairwell",
    description: "A sweeping staircase leading to the upper floor.",
    image: "/images/games/betrayal/rooms/ground-stairwell.png",
  },

  // ─────────────────────────────────────────────
  // UPPER FLOOR (floor 2)
  // ─────────────────────────────────────────────
  {
    id: "upper-landing",
    name: "Upper Landing",
    floors: [2],
    doors: { north: false, east: true, south: true, west: true },
    type: "stairwell",
    description: "The top of the staircase. Hallways stretch in every direction.",
    image: "/images/games/betrayal/rooms/upper-landing.png",
    isStarting: true,
  },
  {
    id: "master-bedroom",
    name: "Master Bedroom",
    floors: [2],
    doors: { north: false, east: true, south: true, west: false },
    type: "omen",
    description: "A vast bedroom with a four-poster bed. The wardrobe breathes.",
    image: "/images/games/betrayal/rooms/upper-master-bedroom.png",
  },
  {
    id: "study",
    name: "Study",
    floors: [2],
    doors: { north: true, east: false, south: false, west: true },
    type: "item",
    description: "Maps, diagrams, and frantic handwriting cover every surface.",
    image: "/images/games/betrayal/rooms/upper-study.png",
  },
  {
    id: "gallery",
    name: "Art Gallery",
    floors: [2],
    doors: { north: false, east: false, south: true, west: true },
    type: "event",
    description: "Portraits line the walls. Every face wears an expression of terror.",
    image: "/images/games/betrayal/rooms/upper-gallery.png",
  },
  {
    id: "guest-bedroom",
    name: "Guest Bedroom",
    floors: [2],
    doors: { north: true, east: true, south: false, west: false },
    type: "event",
    description: "A modest room. The scratch marks on the door came from inside.",
    image: "/images/games/betrayal/rooms/upper-guest-bedroom.png",
  },
  {
    id: "tower",
    name: "Tower Room",
    floors: [2],
    doors: { north: false, east: false, south: true, west: false },
    type: "omen",
    description: "The highest point. Strange symbols cover the stone floor.",
    image: "/images/games/betrayal/rooms/upper-tower.png",
  },
  {
    id: "collapsed-room",
    name: "Collapsed Room",
    floors: [2],
    doors: { north: true, east: false, south: false, west: true },
    type: "event",
    description: "The floor has partially given way. Red light glows from below.",
    image: "/images/games/betrayal/rooms/upper-collapsed-room.png",
  },

  // ─────────────────────────────────────────────
  // BASEMENT (floor 0)
  // ─────────────────────────────────────────────
  {
    id: "basement-landing",
    name: "Basement Landing",
    floors: [0],
    doors: { north: true, east: true, south: false, west: false },
    type: "stairwell",
    description: "The foot of the stairs. The darkness below smells of old earth.",
    image: "/images/games/betrayal/rooms/basement-landing.png",
    isStarting: true,
  },
  {
    id: "wine-cellar",
    name: "Wine Cellar",
    floors: [0],
    doors: { north: false, east: true, south: false, west: true },
    type: "item",
    description: "Racks of dusty bottles. The liquid in some is not wine.",
    image: "/images/games/betrayal/rooms/basement-wine-cellar.png",
  },
  {
    id: "furnace-room",
    name: "Furnace Room",
    floors: [0],
    doors: { north: true, east: false, south: false, west: true },
    type: "event",
    description: "A furnace that should be cold. It is not.",
    image: "/images/games/betrayal/rooms/basement-furnace-room.png",
  },
  {
    id: "vault",
    name: "Vault",
    floors: [0],
    doors: { north: false, east: false, south: true, west: true },
    type: "item",
    description: "The vault door was blasted outward. The inside holds only claw marks.",
    image: "/images/games/betrayal/rooms/basement-vault.png",
  },
  {
    id: "crypt",
    name: "Crypt",
    floors: [0],
    doors: { north: true, east: true, south: false, west: false },
    type: "omen",
    description: "Stone coffins line the walls. One is freshly disturbed.",
    image: "/images/games/betrayal/rooms/basement-crypt.png",
  },
  {
    id: "underground-lake",
    name: "Underground Lake",
    floors: [0],
    doors: { north: false, east: true, south: true, west: false },
    type: "event",
    description: "Still black water in a cavern. Something large creates a ripple.",
    image: "/images/games/betrayal/rooms/basement-underground-lake.png",
  },
  {
    id: "dungeon",
    name: "Dungeon",
    floors: [0],
    doors: { north: true, east: false, south: true, west: false },
    type: "omen",
    description: "Iron cells with chains. One door is broken from the inside.",
    image: "/images/games/betrayal/rooms/basement-dungeon.png",
  },
];

// Tile pool per floor (starting tiles excluded from draw pool)
export function buildTilePools(): Record<0 | 1 | 2, string[]> {
  const pools: Record<0 | 1 | 2, string[]> = { 0: [], 1: [], 2: [] };
  for (const tile of TILE_DEFINITIONS) {
    if (tile.isStarting) continue;
    for (const floor of tile.floors) {
      pools[floor].push(tile.id);
    }
  }
  return pools;
}

export function getTile(id: string): TileDefinition | undefined {
  return TILE_DEFINITIONS.find((t) => t.id === id);
}

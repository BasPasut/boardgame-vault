import type { HauntScenario } from "../types";

// 10 carefully chosen haunts covering the most common omen/room combos.
// Each haunt has clear win conditions implementable in code.
export const HAUNTS: HauntScenario[] = [
  {
    number: 1,
    name: "The Awakening",
    triggerOmen: "omen-skull",
    triggerRooms: ["crypt", "dungeon", "basement-landing"],
    traitorObjective: "You are possessed. Kill all heroes — drag them to the Crypt before they escape.",
    heroObjective: "Find the Holy Symbol and the Ancient Book. Perform the ritual in the Crypt to banish the traitor.",
    traitorPowers: ["You move 1 extra room per turn.", "You cannot be killed — only banished."],
    heroPowers: ["Two items needed: Holy Symbol + Ancient Book.", "Ritual requires a Knowledge roll of 5+ in the Crypt."],
  },
  {
    number: 2,
    name: "The Escape",
    triggerOmen: "omen-key",
    triggerRooms: ["vault", "dungeon", "basement-landing"],
    traitorObjective: "Seal all exits. Hold the Skeleton Key. If no hero escapes in 10 turns, you win.",
    heroObjective: "At least one hero must reach the Garden with a Speed roll of 4+ to escape the mansion.",
    traitorPowers: ["You can lock any door adjacent to you as an action.", "You know where all heroes are."],
    heroPowers: ["Garden is the escape route.", "Speed roll 4+ in the Garden = escape.", "Any one hero escaping wins for heroes."],
  },
  {
    number: 3,
    name: "The Séance",
    triggerOmen: "omen-girl",
    triggerRooms: ["parlor", "library", "gallery"],
    traitorObjective: "Complete the dark ritual — be in the Parlor with 3 omen cards at the start of your turn.",
    heroObjective: "Destroy the Black Candle in the Parlor. A hero with the Holy Symbol must spend an action there.",
    traitorPowers: ["You can force one hero per turn to make a Sanity roll or lose 1 Sanity.", "You know the location of all omen cards."],
    heroPowers: ["Holy Symbol + action in Parlor = ritual broken.", "Destroying the candle requires Might 4+ or the Axe."],
  },
  {
    number: 4,
    name: "The Monster Within",
    triggerOmen: "omen-mask",
    triggerRooms: ["master-bedroom", "guest-bedroom", "collapsed-room"],
    traitorObjective: "You transform each night phase. Kill 2 heroes before they can flee the mansion.",
    heroObjective: "Survive. Escape through the Garden or the Vault exit. Any 3 heroes escaping wins.",
    traitorPowers: ["+2 Might during your turn.", "You heal 1 Might at the start of each of your turns."],
    heroPowers: ["Escape routes: Garden (Speed 4+) or Vault (Might 4+ to break the door).", "3 heroes must escape for heroes to win."],
  },
  {
    number: 5,
    name: "The Haunting",
    triggerOmen: "omen-candle",
    triggerRooms: ["entrance-hall", "foyer", "ballroom"],
    traitorObjective: "Extinguish all light — destroy all Lanterns and Candles held by heroes. Then kill one hero.",
    heroObjective: "At least one hero must keep a light source and make it to the Tower Room with it.",
    traitorPowers: ["You can steal an item from a hero in your room as an action.", "Darkness: heroes without a light source lose 1 Speed."],
    heroPowers: ["Tower Room is the safe zone once a hero with a light source reaches it.", "Light sources: Lantern or Black Candle."],
  },
  {
    number: 6,
    name: "The Body in the Library",
    triggerOmen: "omen-book",
    triggerRooms: ["library", "study", "gallery"],
    traitorObjective: "You are the murderer. Kill all heroes using only the Sacrificial Dagger or the Knife.",
    heroObjective: "Identify the murderer — vote as a group in the Dining Room (all living heroes must be present). Correct majority vote wins.",
    traitorPowers: ["+1 to attack rolls with Knife or Sacrificial Dagger.", "You may move through locked doors."],
    heroPowers: ["Gather evidence: each item room reveals a clue about the traitor's location trail.", "Vote in Dining Room with all heroes present."],
  },
  {
    number: 7,
    name: "Possession",
    triggerOmen: "omen-crystal-ball",
    triggerRooms: ["parlor", "crypt", "tower"],
    traitorObjective: "You are a spirit. Possess heroes one by one — a hero possessed for 2 turns becomes your ally.",
    heroObjective: "Find the Amulet and bring it to the Tower. An Amulet holder cannot be possessed.",
    traitorPowers: ["Each turn, attempt possession of one hero in your room: they make Sanity roll 4+ or become possessed.", "Possessed heroes act on your turn."],
    heroPowers: ["Amulet holder is immune to possession.", "Delivering Amulet to Tower seals the spirit permanently."],
  },
  {
    number: 8,
    name: "The Flood",
    triggerOmen: "omen-ring",
    triggerRooms: ["underground-lake", "basement-landing", "wine-cellar"],
    traitorObjective: "Flood the basement. Every basement room fills in 2 turns — any hero there at the end loses 3 Might.",
    heroObjective: "All heroes must reach the Ground Floor within 4 turns. Then find the Vault and seal it.",
    traitorPowers: ["You can move freely between flooded rooms (you breathe underwater).", "Flooding spreads 1 room per round automatically."],
    heroPowers: ["4 turns to evacuate basement.", "Sealing the Vault (Might 5+) stops the flood."],
  },
  {
    number: 9,
    name: "Blood Banquet",
    triggerOmen: "omen-holy-symbol",
    triggerRooms: ["dining-room", "kitchen", "ballroom"],
    traitorObjective: "Trap heroes in the Dining Room. When 3+ heroes are there simultaneously, you win.",
    heroObjective: "Never let 3+ heroes be in the Dining Room at once. Survive 8 rounds.",
    traitorPowers: ["You can lock doors adjacent to the Dining Room.", "Heroes in the Dining Room make a Might roll each turn or lose 1 Might."],
    heroPowers: ["Survive 8 rounds = heroes win.", "Avoid clustering in the Dining Room.", "Holy Symbol prevents you from being forced to move."],
  },
  {
    number: 10,
    name: "The Final Darkness",
    triggerOmen: "omen-dog",
    triggerRooms: ["furnace-room", "collapsed-room", "tower"],
    traitorObjective: "Destroy the mansion's only light source — reach the Furnace Room and roll Might 5+ to destroy it. All lights go out permanently.",
    heroObjective: "Stop the traitor from reaching the Furnace. At least one hero must guard it until round 10.",
    traitorPowers: ["+2 Speed toward the Furnace Room.", "Heroes without a light source lose 1 Sanity per turn."],
    heroPowers: ["Guarding the Furnace Room (staying in it) prevents destruction.", "Reaching round 10 with Furnace intact = heroes win."],
  },
];

// Haunt lookup: given omen + room, find the haunt number
// Falls back to haunt 10 if no specific match
export function findHaunt(omenId: string, roomId: string): HauntScenario {
  const specific = HAUNTS.find(
    (h) => h.triggerOmen === omenId && h.triggerRooms.includes(roomId),
  );
  if (specific) return specific;
  // fallback: match by omen only
  const byOmen = HAUNTS.find((h) => h.triggerOmen === omenId);
  if (byOmen) return byOmen;
  // final fallback
  return HAUNTS[HAUNTS.length - 1];
}

export function getHaunt(number: number): HauntScenario | undefined {
  return HAUNTS.find((h) => h.number === number);
}

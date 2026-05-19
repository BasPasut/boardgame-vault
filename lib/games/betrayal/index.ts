import type { GameConfig } from "../registry";

export const betrayalConfig: GameConfig = {
  id: "betrayal-at-house-on-the-hill",

  name: {
    en: "Betrayal at House on the Hill",
    th: "Betrayal at House on the Hill",
  },
  description: {
    en: "Explore a haunted mansion tile by tile — until one among you becomes the traitor.",
    th: "สำรวจคฤหาสน์ผีสิงทีละห้อง จนกระทั่งหนึ่งในพวกคุณกลายเป็นผู้ทรยศ",
  },
  tagline: {
    en: "The house always wins... or does it?",
    th: "คฤหาสน์ชนะเสมอ... หรือเปล่า?",
  },

  category: "exploration",
  minPlayers: 3,
  maxPlayers: 6,
  estimatedTime: "60–120 min",
  available: true,
  hasHost: false,
  coverImage: "/images/games/betrayal/cover.png",
  cardTheme: "from-stone-950 to-amber-950",

  lobby: {
    en: {
      title: "The Mansion Awaits",
      subtitle: "Choose your character and enter the house",
      hostLabel: "Host",
      waitingForHost: "Waiting for the Host to start...",
      loadingText: "Entering the mansion...",
    },
    th: {
      title: "คฤหาสน์รอคอย",
      subtitle: "เลือกตัวละครและเข้าสู่คฤหาสน์",
      hostLabel: "Host",
      waitingForHost: "รอ Host เริ่มเกม...",
      loadingText: "กำลังเข้าสู่คฤหาสน์...",
    },
  },

  audio: {
    // Only the lobby track is played here; BetrayalPlaying.tsx handles in-game audio.
    forPhase: (phase) => (phase === "lobby" ? "/audio/betrayal/lobby.mp3" : null),
  },

  ownedPhases: ["playing", "ended"],

  initialState: () => ({
    phase: "explore",
    haunt_number: null,
    traitor_id: null,
    winner: null,
    placed_tiles: [],
    remaining_tiles: { 0: [], 1: [], 2: [] },
    item_deck: [],
    omen_deck: [],
    event_deck: [],
    item_discard: [],
    omen_discard: [],
    event_discard: [],
    omen_count: 0,
    turn_order: [],
    current_turn_index: 0,
    turn_phase: "move",
    moves_used: 0,
    player_states: {},
    event_log: [],
    haunt_objectives: null,
    pending_card: null,
    turn_drawn_tiles: [],
  }),
};

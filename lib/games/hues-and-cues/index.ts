import type { GameConfig } from "../registry";

export const hncConfig: GameConfig = {
  id: "hues-and-cues",

  name: {
    en: "Hues & Cues",
    th: "Hues & Cues",
  },
  description: {
    en: "A color-guessing party game where one clue leads to a spectrum of interpretations.",
    th: "เกมปาร์ตี้ทายสี ที่คำใบ้เดียวนำไปสู่การตีความที่หลากหลาย",
  },
  tagline: {
    en: "One word. A million shades.",
    th: "คำเดียว ล้านเฉด",
  },

  category: "party",
  minPlayers: 3,
  maxPlayers: 10,
  estimatedTime: "30–60 min",
  available: true,
  hasHost: false,
  coverImage: "/images/games/hues-and-cues/cover.png",
  cardTheme: "from-pink-900 via-purple-900 to-indigo-900",

  lobby: {
    en: {
      title: "Color Room Ready",
      subtitle: "Share the code with your friends to join",
      hostLabel: "Host",
      waitingForHost: "Waiting for the Host to start...",
      loadingText: "Loading room...",
    },
    th: {
      title: "ห้องสีพร้อมแล้ว",
      subtitle: "แชร์รหัสให้เพื่อนเพื่อเข้าร่วม",
      hostLabel: "Host",
      waitingForHost: "รอ Host เริ่มเกม...",
      loadingText: "กำลังโหลดห้อง...",
    },
  },

  audio: {
    // HnCPlaying.tsx manages its own audio; page.tsx is silent for all HnC phases.
    forPhase: () => null,
  },

  ownedPhases: ["playing", "ended"],

  initialState: () => ({
    round: 0,
    total_rounds: 0,
    score_to_win: 25,
    cue_giver_order: [],
    target: { x: 0, y: 0 },
    clues: [],
    sub_phase: "giving-clue",
    guesses: {},
    scores: {},
  }),
};

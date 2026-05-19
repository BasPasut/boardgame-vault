import type { GameConfig } from "../registry";

export const sotConfig: GameConfig = {
  id: "shadows-over-thornwick",

  name: {
    en: "Shadows Over Thornwick",
    th: "Shadows Over Thornwick",
  },
  description: {
    en: "A social deduction game of hidden roles, logical deduction, and bluffing.",
    th: "เกมสืบสวนสังคม บทบาทซ่อนเร้น การใช้เหตุผล และการหลอกลวง",
  },
  tagline: {
    en: "Trust no one. Deduce everything.",
    th: "อย่าไว้ใจใคร ใช้เหตุผลทุกอย่าง",
  },

  category: "deduction",
  minPlayers: 5,
  maxPlayers: 16, // 1 storyteller + up to 15 players
  estimatedTime: "60–120 min",
  available: true,
  hasHost: true, // storyteller acts as moderator
  coverImage: "/images/games/shadows-over-thornwick/cover.png",
  cardTheme: "from-purple-950 to-red-950",

  lobby: {
    en: {
      title: "The Village Awaits",
      subtitle: "Share the code with your friends to join",
      hostLabel: "Storyteller",
      waitingForHost: "Waiting for the Storyteller...",
      loadingText: "Entering Thornwick...",
    },
    th: {
      title: "หมู่บ้านรอคอย",
      subtitle: "แชร์รหัสให้เพื่อนเพื่อเข้าร่วม",
      hostLabel: "Storyteller",
      waitingForHost: "รอ Storyteller...",
      loadingText: "กำลังเข้าสู่ธอร์นวิค...",
    },
  },

  audio: {
    forPhase: (phase) => {
      if (phase === "night") return "/audio/ambient-night.mp3";
      if (phase === "day")   return "/audio/ambient-day.mp3";
      return "/audio/ambient-lobby.mp3"; // lobby, role-reveal, ended
    },
  },

  /**
   * SoT's game phases (role-reveal, day, night, ended) are currently rendered
   * inline inside [code]/page.tsx.  Once SoTPlaying.tsx is extracted, add those
   * phases here and register the component in app/session/[code]/gameRegistry.ts.
   */
  ownedPhases: [],

  initialState: () => ({
    script_id: "the-first-shadows",
    day_number: 1,
    night_index: 0,
    role_assignments: {},
  }),
};

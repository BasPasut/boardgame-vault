import type { GameConfig } from "../registry";

export const secretHitlerConfig: GameConfig = {
  id: "secret-hitler",

  name: { en: "Secret Hitler", th: "ซีเคร็ต ฮิตเลอร์" },
  description: {
    en: "Liberals vs Fascists in a political game of hidden roles and power struggles.",
    th: "เสรีนิยม vs ฟาสซิสต์ เกมการเมืองของบทบาทซ่อนเร้นและการแย่งชิงอำนาจ",
  },
  tagline: {
    en: "Keep your friends close. Keep your identity closer.",
    th: "รักษาเพื่อนให้ใกล้ ตัวตนให้ใกล้กว่า",
  },

  category: "deduction",
  minPlayers: 5,
  maxPlayers: 10,
  estimatedTime: "45–60 min",
  available: false,
  hasHost: false,

  coverImage: null,
  cardTheme: "from-amber-950 to-red-900",

  lobby: {
    en: { title: "The Chamber Awaits", subtitle: "Share the code to join", hostLabel: "Host", waitingForHost: "Waiting for the Host...", loadingText: "Entering the chamber..." },
    th: { title: "ห้องประชุมรอคอย", subtitle: "แชร์รหัสเพื่อเข้าร่วม", hostLabel: "Host", waitingForHost: "รอ Host...", loadingText: "กำลังเข้าสู่ห้องประชุม..." },
  },

  audio: { forPhase: () => null },

  ownedPhases: [],

  initialState: () => ({}),
};

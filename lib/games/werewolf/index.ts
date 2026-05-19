import type { GameConfig } from "../registry";

export const werewolfConfig: GameConfig = {
  id: "werewolf",

  name: { en: "Werewolf", th: "หมาป่า" },
  description: {
    en: "Classic social deduction. Villagers vs Werewolves in a battle of wits and deception.",
    th: "เกมคลาสสิก ชาวบ้าน vs หมาป่า ในการต่อสู้ด้วยปัญญาและการหลอกลวง",
  },
  tagline: {
    en: "Trust your gut. Or die trying.",
    th: "เชื่อสัญชาตญาณ หรือตายไปกับมัน",
  },

  category: "deduction",
  minPlayers: 6,
  maxPlayers: 20,
  estimatedTime: "20–40 min",
  available: false,
  hasHost: true,

  coverImage: null,
  cardTheme: "from-slate-900 to-stone-900",

  lobby: {
    en: { title: "The Village Gathers", subtitle: "Share the code to join", hostLabel: "Moderator", waitingForHost: "Waiting for the Moderator...", loadingText: "Entering the village..." },
    th: { title: "หมู่บ้านรวมตัว", subtitle: "แชร์รหัสเพื่อเข้าร่วม", hostLabel: "ผู้ดำเนินเกม", waitingForHost: "รอผู้ดำเนินเกม...", loadingText: "กำลังเข้าสู่หมู่บ้าน..." },
  },

  audio: { forPhase: () => null },

  ownedPhases: [],

  initialState: () => ({}),
};

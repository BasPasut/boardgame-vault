import type { GameConfig } from "../registry";
import type { KTCGameState } from "./types";

export type { KTCGameState };

// ─── Grapheme-aware char splitting ────────────────────────────────────────────

function toChars(s: string): string[] {
  if (
    typeof Intl !== "undefined" &&
    "Segmenter" in Intl
  ) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const seg = new (Intl as any).Segmenter("th", { granularity: "grapheme" });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return [...seg.segment(s)].map((x: any) => x.segment as string);
  }
  return [...s]; // Unicode code-point fallback
}

// ─── Sub-word conflict detection ──────────────────────────────────────────────

/**
 * Returns the first common substring of length ≥ 2 found between `newWord`
 * and any word in `existingWords`.  Returns null if the word is valid.
 *
 * Examples:
 *   "ไฟฟ้า" vs ["รถไฟ"]  →  { sub: "ไฟ", with: "รถไฟ" }   (invalid)
 *   "น้ำแข็ง" vs ["รถไฟ"] →  null                          (valid)
 */
export function findSubWordConflict(
  newWord: string,
  existingWords: string[]
): { sub: string; with: string } | null {
  const norm = (w: string) => w.trim().toLowerCase();
  const newNorm = norm(newWord);
  const newChars = toChars(newNorm);

  for (const existing of existingWords) {
    const exNorm = norm(existing);

    // Check every substring of newWord (len ≥ 2) against existingWord
    for (let i = 0; i < newChars.length; i++) {
      for (let len = 2; len <= newChars.length - i; len++) {
        const sub = newChars.slice(i, i + len).join("");
        if (exNorm.includes(sub)) {
          return { sub, with: existing };
        }
      }
    }

    // Also check every substring of existingWord against newWord
    // (covers cases where existing is shorter than new)
    const exChars = toChars(exNorm);
    for (let i = 0; i < exChars.length; i++) {
      for (let len = 2; len <= exChars.length - i; len++) {
        const sub = exChars.slice(i, i + len).join("");
        if (newNorm.includes(sub)) {
          return { sub, with: existing };
        }
      }
    }
  }

  return null;
}

// ─── Game config ──────────────────────────────────────────────────────────────

export const ktcConfig: GameConfig = {
  id: "kam-tong-chuom",

  name: {
    en: "Let's Connect the Word",
    th: "คำต้องเชื่อม",
  },
  description: {
    en: "Say a Thai word that shares no common syllable with any previously said word — or get eliminated!",
    th: "พูดคำที่ไม่มีพยางค์ร่วมกับคำที่เคยพูดไปแล้วในรอบนี้ — ไม่งั้นออก!",
  },
  tagline: {
    en: "Speak. Connect. Survive.",
    th: "พูด. เชื่อม. รอดชีวิต.",
  },

  category: "party",
  minPlayers: 3,
  maxPlayers: 10,
  estimatedTime: "15–30 min",
  available: true,
  hasHost: false,
  coverImage: "/images/games/kam-tong-chuom/cover.png",
  cardTheme: "from-emerald-950 via-teal-950 to-cyan-950",

  lobby: {
    en: {
      title: "Word Room Ready",
      subtitle: "Share the code — don't share your words!",
      hostLabel: "Host",
      waitingForHost: "Waiting for the host to start...",
      loadingText: "Loading room...",
    },
    th: {
      title: "ห้องคำพร้อมแล้ว",
      subtitle: "แชร์รหัส — แต่อย่าแชร์คำ!",
      hostLabel: "Host",
      waitingForHost: "รอ Host เริ่มเกม...",
      loadingText: "กำลังโหลดห้อง...",
    },
  },

  audio: {
    forPhase: () => null,
  },

  ownedPhases: ["playing", "ended"],

  initialState: (): Record<string, unknown> => ({
    phase: "playing",
    total_rounds: 3,
    current_round: 1,
    all_players: [],
    active_players: [],
    current_turn_index: 0,
    turn_started_at: null,
    turn_duration_s: 8,
    words: [],
    scores: {},
    challenge: null,
    round_winner_id: null,
    winner: null,
    event_log: [],
  } satisfies KTCGameState),
};

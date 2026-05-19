/**
 * GAME REGISTRY — single source of truth for all games.
 *
 * To add a new game:
 *   1. Create lib/games/{game-id}/index.ts  →  export const myConfig: GameConfig = { ... }
 *   2. Import it here and add one entry to GAME_REGISTRY
 *   3. Create the playing component, then add it to app/session/[code]/gameRegistry.ts
 *
 * Nothing else needs to change.
 */

import type { Language } from "@/types/game";
import { sotConfig } from "./shadows-over-thornwick";
import { hncConfig } from "./hues-and-cues";
import { betrayalConfig } from "./betrayal";
import { werewolfConfig } from "./werewolf";
import { secretHitlerConfig } from "./secret-hitler";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LobbyStrings {
  /** Header title shown in the lobby (e.g. "The Village Awaits") */
  title: string;
  /** Subtitle / invite hint */
  subtitle: string;
  /** Label for the room creator's role (e.g. "Storyteller" | "Host") */
  hostLabel: string;
  /** Text shown to non-host players waiting in lobby */
  waitingForHost: string;
  /** Loading spinner copy shown while joining */
  loadingText: string;
}

export interface GameConfig {
  /** Unique slug — must match the value stored in sessions.game_id */
  id: string;

  name: Record<Language, string>;
  description: Record<Language, string>;
  tagline: Record<Language, string>;

  /** Drives the category section on the home page */
  category: "deduction" | "exploration" | "party";

  minPlayers: number;
  maxPlayers: number;
  /** Display string shown on cards (e.g. "45–90 min") */
  estimatedTime: string;

  /** false → shows "Coming Soon" badge; no component needed */
  available: boolean;

  /**
   * Whether the room creator acts as a dedicated host/moderator who doesn't
   * play as a regular player. Drives the "Your Name (Storyteller)" vs
   * "Your Name (Host)" label and the player-list display.
   */
  hasHost: boolean;

  /**
   * Path to the cover image used on game cards (relative to /public).
   * null → shows a placeholder with the category icon.
   */
  coverImage: string | null;

  /**
   * Tailwind bg-gradient class applied to the card's image area when the
   * cover image is loading or absent (e.g. "from-purple-950 to-red-950").
   */
  cardTheme: string;

  /** Lobby copy, keyed by language */
  lobby: Record<Language, LobbyStrings>;

  /**
   * Audio sources for phases rendered by [code]/page.tsx (i.e. lobby + any
   * game-specific phases not delegated to a PlayingComponent).
   * Return null to silence.  The playing components manage their own audio.
   */
  audio: {
    /** Called with the current phase string; return the audio src or null. */
    forPhase: (phase: string) => string | null;
  };

  /**
   * Phases where the dedicated PlayingComponent takes full control of rendering.
   * [code]/page.tsx simply delegates when `phase` is in this list.
   * Keep empty ([]) for games whose playing phases are still inline in page.tsx.
   */
  ownedPhases: string[];

  /**
   * Factory: returns the initial game_state object written to the DB when a
   * session is created.  Keep it light — no imports of card/tile data here;
   * that initialisation happens inside the PlayingComponent at game-start.
   */
  initialState: () => Record<string, unknown>;
}

// ─── Registry ─────────────────────────────────────────────────────────────────

export const GAME_REGISTRY: Record<string, GameConfig> = {
  [sotConfig.id]:           sotConfig,
  [hncConfig.id]:           hncConfig,
  [betrayalConfig.id]:      betrayalConfig,
  [werewolfConfig.id]:      werewolfConfig,
  [secretHitlerConfig.id]:  secretHitlerConfig,
};

/** Derive GameId from the registry so the type stays in sync automatically. */
export type GameId = keyof typeof GAME_REGISTRY;

/** Convenience: all games sorted so available ones appear first. */
export const ORDERED_GAMES: GameConfig[] = Object.values(GAME_REGISTRY).sort(
  (a, b) => Number(b.available) - Number(a.available)
);

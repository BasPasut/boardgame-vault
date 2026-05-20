/**
 * COMPONENT REGISTRY — maps game IDs to their playing React components.
 *
 * This is the ONLY file that needs to change when adding a new game's component.
 * Steps:
 *   1. Create the PlayingComponent (e.g. NewGamePlaying.tsx) in this folder.
 *   2. Import it below and add one entry to PLAYING_COMPONENTS.
 *   3. Ensure the game's `ownedPhases` in lib/games/registry.ts lists the phases
 *      your component handles (typically ["playing", "ended"]).
 *
 * Do NOT import game logic or data here — only React components.
 */

"use client";

import type { ComponentType } from "react";
import type { Player } from "@/types/game";

// ─── Shared props contract ────────────────────────────────────────────────────
// Every PlayingComponent receives this shape.  Extend with game-specific
// props inside the component using a typed cast on dbSession.game_state.

export interface CommonPlayingProps {
  code: string;
  dbSession: {
    code: string;
    game_id: string;
    phase: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    game_state: any;
  };
  players: Player[];
  myPlayerId: string | null;
  isHost: boolean;
}

// ─── Import playing components ────────────────────────────────────────────────

import { HnCPlaying } from "./HnCPlaying";
import BetrayalPlaying from "./BetrayalPlaying";
import KTCPlaying from "./KTCPlaying";
// import SoTPlaying from "./SoTPlaying";  ← uncomment when SoTPlaying.tsx is extracted

// ─── Registry ─────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const PLAYING_COMPONENTS: Record<string, ComponentType<any>> = {
  "hues-and-cues":                   HnCPlaying,
  "betrayal-at-house-on-the-hill":   BetrayalPlaying,
  "kam-tong-chuom":                  KTCPlaying,
  // "shadows-over-thornwick":       SoTPlaying,   ← add when extracted
};

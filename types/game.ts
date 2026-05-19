/**
 * Core domain types shared across the platform.
 *
 * GameId is re-exported from the registry so the type stays in sync with
 * GAME_REGISTRY automatically — no manual updating required.
 */

// Re-export from registry so any import of GameId gets the live union.
export type { GameId } from "@/lib/games/registry";

export type Language = "en" | "th";

export type Team = "good" | "evil";

export type RoleType = "townsfolk" | "outsider" | "minion" | "demon" | "storyteller";

/**
 * All possible session phases across all games.
 * Game-specific phases (e.g. "role-reveal", "day", "night") live here so the
 * DB column type covers every game without a schema change.
 */
export type GamePhase =
  | "lobby"
  | "role-reveal"   // SoT
  | "day"           // SoT
  | "night"         // SoT
  | "playing"       // HnC, Betrayal (and future games)
  | "ended";

export interface Role {
  id: string;
  name: { en: string; th: string };
  type: RoleType;
  team: Team;
  description: { en: string; th: string };
  ability: { en: string; th: string };
  image: string;
  firstNight?: number;
  otherNights?: number;
}

export interface Player {
  id: string;
  name: string;
  isAlive: boolean;
  isStoryteller: boolean;
  roleId?: string;
  votedToday?: boolean;
  nominatedToday?: boolean;
}

export interface NominationVote {
  nominatorId: string;
  nomineeId: string;
  votes: string[];
  executed: boolean;
}

export interface Session {
  id: string;
  code: string;
  gameId: string; // use string (not GameId) so DB values never cause TS errors
  hostId: string;
  phase: GamePhase;
  players: Player[];
  script: string;
  day: number;
  nomination?: NominationVote;
  winner?: Team;
  createdAt: string;
}

/** Static metadata about a game — distinct from runtime Session state. */
export interface Game {
  id: string;
  name: { en: string; th: string };
  description: { en: string; th: string };
  minPlayers: number;
  maxPlayers: number;
  image: string;
  available: boolean;
}

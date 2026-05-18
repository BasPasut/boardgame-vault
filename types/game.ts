export type Language = "en" | "th";

export type GameId = "shadows-over-thornwick" | "hues-and-cues";

export type Team = "good" | "evil";

export type RoleType = "townsfolk" | "outsider" | "minion" | "demon" | "storyteller";

export type GamePhase = "lobby" | "role-reveal" | "day" | "night" | "playing" | "ended";

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
  gameId: GameId;
  hostId: string;
  phase: GamePhase;
  players: Player[];
  script: string;
  day: number;
  nomination?: NominationVote;
  winner?: Team;
  createdAt: string;
}

export interface Game {
  id: GameId;
  name: { en: string; th: string };
  description: { en: string; th: string };
  minPlayers: number;
  maxPlayers: number;
  image: string;
  theme: {
    primary: string;
    secondary: string;
    accent: string;
  };
  available: boolean;
}

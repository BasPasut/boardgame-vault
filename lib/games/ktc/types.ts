// ─── Types for คำต้องเชื่อม (Let's Connect the Word) ────────────────────────

export type KTCPhase = "playing" | "challenge" | "round_end" | "ended";

export interface KTCWord {
  word: string;
  player_id: string;
  timestamp: string;
}

export interface KTCChallenge {
  /** The player who pressed Challenge */
  challenger_id: string;
  /** The player whose last word is being challenged */
  challenged_player_id: string;
  /** The word being contested */
  challenged_word: string;
  started_at: string;
  /** ISO timestamp when the 60-second discussion period ends */
  discussion_end_at: string;
  /** playerId → which side they voted for */
  votes: Record<string, "challenger" | "challenged">;
}

export interface KTCEventEntry {
  id: string;
  timestamp: string;
  type: "word" | "eliminate" | "challenge" | "vote" | "round" | "system";
  player_id?: string;
  message_th: string;
  message_en: string;
}

export interface KTCGameState {
  phase: KTCPhase;

  /** Total number of rounds to play */
  total_rounds: number;
  /** 1-based current round */
  current_round: number;

  /** All player IDs who started the game (constant) */
  all_players: string[];
  /** Players still active in this round (shrinks on elimination) */
  active_players: string[];

  /** Index into active_players whose turn it is */
  current_turn_index: number;
  /** ISO timestamp when the current turn began (null = not started) */
  turn_started_at: string | null;
  /** Seconds per turn */
  turn_duration_s: number;

  /** Words spoken in the current sub-round (resets on each elimination) */
  words: KTCWord[];

  /** Cumulative scores across all rounds */
  scores: Record<string, number>;

  /** Non-null while phase === "challenge" */
  challenge: KTCChallenge | null;

  /** The player who survived until last in this round */
  round_winner_id: string | null;

  /** Overall game winner (set when phase === "ended") */
  winner: string | null;

  event_log: KTCEventEntry[];
}

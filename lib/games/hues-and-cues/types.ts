export interface HnCGameState {
  round: number;
  total_rounds: number;
  score_to_win: number;
  cue_giver_order: string[];
  target: { x: number; y: number };
  clues: string[];
  sub_phase: "giving-clue" | "guessing" | "reveal";
  guesses: Record<string, { x: number; y: number }>;
  scores: Record<string, number>;
  round_scores?: Record<string, number>;
}

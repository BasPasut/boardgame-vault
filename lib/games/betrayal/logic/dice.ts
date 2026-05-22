/**
 * Betrayal at House on the Hill — dice helpers
 *
 * The custom 8-sided dice have only 3 pip values:
 *   0 → 2 faces (25%)   1 → 3 faces (37.5%)   2 → 3 faces (37.5%)
 * Mean per die = 9/8 = 1.125  (NOT 1.0 from uniform 0-2)
 */

export function rollOneBetrayalDie(): number {
  const r = Math.random();
  if (r < 2 / 8) return 0; // 25%
  if (r < 5 / 8) return 1; // 37.5%
  return 2;                 // 37.5%
}

export function rollDice(n: number): number[] {
  return Array.from({ length: n }, rollOneBetrayalDie);
}

/** Same weighted distribution — used for animation frame randomisation */
export function randomBetrayalFace(): number {
  return rollOneBetrayalDie();
}

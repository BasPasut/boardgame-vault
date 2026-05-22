/**
 * Betrayal at House on the Hill — combat & win-condition helpers
 *
 * Pure functions with no React / UI dependencies — safe to import anywhere.
 */

import type { PlayerGameState, BetrayalGameState } from "@/lib/games/betrayal/types";

// ─── Death check ───────────────────────────────────────────────────────────────
/** A character dies if either Might OR Sanity hits 0. */
export function isDead(might: number, sanity: number): boolean {
  return might <= 0 || sanity <= 0;
}

// ─── Amulet ───────────────────────────────────────────────────────────────────
/**
 * Once per game, the Amulet of the Ages lets a player survive what would
 * otherwise be a fatal blow — drop to 1 Sanity instead.  Consumes the item.
 */
export function checkAmulet(
  ps: PlayerGameState,
): { state: PlayerGameState; saved: boolean } {
  if (!ps.is_dead || !(ps.items ?? []).includes("amulet")) {
    return { state: ps, saved: false };
  }
  return {
    state: {
      ...ps,
      sanity: 1,
      might: Math.max(ps.might, 1),
      is_dead: false,
      items: ps.items.filter((id) => id !== "amulet"),
    },
    saved: true,
  };
}

// ─── Weapon bonuses ───────────────────────────────────────────────────────────
/**
 * Returns the effective attack-Might dice count for a player,
 * including bonuses from held weapon items.
 */
export function getAttackMight(state: PlayerGameState | null): number {
  if (!state) return 1;
  let bonus = 0;
  const items = state.items ?? [];
  if (items.includes("axe"))                bonus += 2;
  if (items.includes("knife"))              bonus += 1;
  if (items.includes("sacrificial-dagger")) bonus += 3;
  return Math.max(1, state.might + bonus);
}

// ─── Win condition ─────────────────────────────────────────────────────────────
/**
 * Returns the winning team if the haunt is definitively over, or null.
 * Call after every state mutation that could kill a player.
 */
export function checkWinCondition(
  playerStates: BetrayalGameState["player_states"],
  phase: string,
): "heroes" | "traitor" | null {
  if (phase !== "haunt") return null;
  const traitorDead = Object.values(playerStates).some(
    (ps) => ps.is_traitor && ps.is_dead,
  );
  if (traitorDead) return "heroes";
  const heroes = Object.values(playerStates).filter((ps) => !ps.is_traitor);
  if (heroes.length > 0 && heroes.every((ps) => ps.is_dead)) return "traitor";
  return null;
}

/**
 * Betrayal Bot Engine
 *
 * Runs on the host's browser only. When the current player's ID starts with
 * "bot-", the hook waits a short "thinking" delay and then executes the full
 * turn (move → card draw → optional attack → advance turn) in a single DB
 * write so all clients see the result simultaneously.
 *
 * Bot strategy:
 *   Explore phase  → Prefer exploring new tiles; otherwise move to a random
 *                    reachable room. Auto-draw any card found in the room.
 *   Haunt phase    → Same movement, but attacks any enemy sharing its tile
 *                    (after moving) before ending the turn.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import type { BetrayalGameState, Floor, PlayerGameState } from "./types";
import {
  getReachable,
  getUnexploredDoors,
  buildPlacedTile,
  tileAt,
} from "./logic/mapEngine";
import { getTile } from "./data/tiles";
import { getCard } from "./data/cards";
import { findHaunt } from "./data/haunts";
import type { Player } from "@/types/game";

// ─── Constants ────────────────────────────────────────────────────────────────

/** How long the bot "thinks" before acting (ms) */
const BOT_THINK_MS = 1600;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stamp() {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function rollOneBetrayalDie(): number {
  const r = Math.random();
  if (r < 2 / 8) return 0;  // 25%
  if (r < 5 / 8) return 1;  // 37.5%
  return 2;                   // 37.5%
}
function rollDice(n: number) {
  return Array.from({ length: n }, rollOneBetrayalDie);
}

function mkLog(
  type: BetrayalGameState["event_log"][0]["type"],
  botId: string,
  message: string,
): BetrayalGameState["event_log"][0] {
  return {
    id: Math.random().toString(36).slice(2),
    timestamp: new Date().toISOString(),
    type,
    player_id: botId,
    message,
  };
}

/** Persist the entire game_state to Supabase in one round-trip. */
async function writeGs(code: string, gs: BetrayalGameState) {
  await supabase.from("sessions").update({ game_state: gs }).eq("code", code);
}

const isDead = (might: number, sanity: number) => might <= 0 || sanity <= 0;

function getAttackMight(state: PlayerGameState): number {
  let bonus = 0;
  const items = state.items ?? [];
  if (items.includes("axe"))                bonus += 2;
  if (items.includes("knife"))              bonus += 1;
  if (items.includes("sacrificial-dagger")) bonus += 3;
  return Math.max(1, state.might + bonus);
}

/** Advance `current_turn_index`, skipping eliminated players. */
function nextTurnGs(gs: BetrayalGameState): BetrayalGameState {
  const len = gs.turn_order.length;
  let nextIdx = (gs.current_turn_index + 1) % len;
  let attempts = 0;
  while (gs.player_states[gs.turn_order[nextIdx]]?.is_dead && attempts < len) {
    nextIdx = (nextIdx + 1) % len;
    attempts++;
  }
  return { ...gs, current_turn_index: nextIdx, turn_phase: "move", moves_used: 0 };
}

// ─── Inline card resolution ───────────────────────────────────────────────────

/**
 * Resolves a card draw for a bot.
 * Returns the updated game-state; never touches React state or shows any overlay.
 */
function resolveCardForBot(
  gs: BetrayalGameState,
  cardId: string,
  botId: string,
  botState: PlayerGameState,
  pushBotLog: (msg: string) => void,
): BetrayalGameState {
  const card = getCard(cardId);
  if (!card) return gs;

  const deckKey    = `${card.type}_deck`    as "item_deck" | "omen_deck" | "event_deck";
  const discardKey = `${card.type}_discard` as "item_discard" | "omen_discard" | "event_discard";

  const newLog = [
    ...gs.event_log,
    mkLog("card_draw", botId, `🤖 drew ${card.type} card: ${card.name}`),
  ];

  pushBotLog(`Drew ${card.type}: "${card.name}"`);

  let patch: Partial<BetrayalGameState> = {
    [deckKey]:    gs[deckKey].slice(1),
    [discardKey]: [cardId, ...gs[discardKey]],
    event_log:    newLog.slice(-30),
  };

  // Item — add to inventory + apply pickup stat bonuses
  if (card.type === "item") {
    const newItems = [...(botState.items ?? []), cardId];
    let updatedBot = { ...botState, items: newItems };
    if (cardId === "holy-symbol")  updatedBot.sanity    = Math.min(updatedBot.sanity    + 2, 8);
    if (cardId === "ancient-book") updatedBot.knowledge  = Math.min(updatedBot.knowledge + 2, 8);
    if (cardId === "healing-salve") updatedBot.might     = Math.min(updatedBot.might     + 2, 8);
    pushBotLog(`Picked up ${card.name}`);
    patch.player_states = { ...gs.player_states, [botId]: updatedBot };
  }

  // Omen — apply stat effects then haunt roll
  if (card.type === "omen") {
    // Omen stat effects (applied regardless of haunt state)
    const existingPS = (patch.player_states ?? gs.player_states) as Record<string, PlayerGameState>;
    let updatedBot = { ...(existingPS[botId] as PlayerGameState) };
    if (cardId === "omen-candle") updatedBot.knowledge = Math.min(updatedBot.knowledge + 1, 8);
    if (cardId === "omen-dog")    updatedBot.speed      = Math.min(updatedBot.speed     + 1, 8);
    if (cardId === "omen-girl") {
      updatedBot.sanity  = Math.max(updatedBot.sanity - 1, 0);
      updatedBot.is_dead = isDead(updatedBot.might, updatedBot.sanity);
    }
    if (cardId === "omen-mask") {
      updatedBot.might     = Math.max(updatedBot.might - 1, 0);
      updatedBot.knowledge = Math.min(updatedBot.knowledge + 2, 8);
      updatedBot.is_dead   = isDead(updatedBot.might, updatedBot.sanity);
    }
    if (cardId === "omen-book" && gs.item_deck.length > 0) {
      const itemId = gs.item_deck[0];
      updatedBot.items = [...(updatedBot.items ?? []), itemId];
      patch.item_deck    = gs.item_deck.slice(1);
      patch.item_discard = [itemId, ...(gs.item_discard ?? [])];
    }
    if (cardId === "omen-skull") {
      const allPS = { ...existingPS };
      for (const pid of Object.keys(allPS)) {
        const s = allPS[pid];
        const newSanity = Math.max(s.sanity - 1, 0);
        allPS[pid] = { ...s, sanity: newSanity, is_dead: isDead(s.might, newSanity) };
      }
      patch.player_states = allPS;
    } else if (cardId === "omen-holy-symbol") {
      // All players in same room roll Sanity (3+) or lose 1
      const allPS = { ...existingPS };
      for (const pid of Object.keys(allPS)) {
        const ps = allPS[pid];
        if (ps.floor === botState.floor && ps.x === botState.x && ps.y === botState.y) {
          const roll = rollDice(2).reduce((a, b) => a + b, 0);
          if (roll < 3) {
            const newSanity = Math.max(ps.sanity - 1, 0);
            allPS[pid] = { ...ps, sanity: newSanity, is_dead: isDead(ps.might, newSanity) };
          }
        }
      }
      patch.player_states = allPS;
    } else {
      patch.player_states = { ...existingPS, [botId]: updatedBot };
    }

    if (gs.phase === "haunt") {
      // Haunt already running — don't re-trigger
      pushBotLog(`Omen drawn but haunt already started — skipping haunt roll`);
    } else {
      const newOmenCount = gs.omen_count + 1;
      patch.omen_count = newOmenCount;

      const roll    = rollDice(2);
      const rollSum = roll.reduce((a, b) => a + b, 0);
      pushBotLog(`Haunt roll: ${rollSum} (need < ${newOmenCount}) → ${rollSum < newOmenCount ? "🩸 HAUNT" : "safe"}`);

      if (rollSum < newOmenCount) {
        const currentTile = tileAt(gs.placed_tiles, botState.floor, botState.x, botState.y);
        const haunt = findHaunt(cardId, currentTile?.tile_id ?? "");

        // Pick a random living human as traitor (bots and already-traitors excluded if possible)
        const eligible = gs.turn_order.filter(
          (id) => id !== botId && !id.startsWith("bot-") && !gs.player_states[id]?.is_dead && !gs.player_states[id]?.is_traitor,
        );
        const fallback = gs.turn_order.filter(
          (id) => !gs.player_states[id]?.is_dead && !gs.player_states[id]?.is_traitor,
        );
        const traitorId = eligible.length > 0
          ? eligible[Math.floor(Math.random() * eligible.length)]
          : fallback.length > 0
          ? fallback[Math.floor(Math.random() * fallback.length)]
          : botId;

        const newPlayerStates = { ...gs.player_states };
        if (newPlayerStates[traitorId]) {
          newPlayerStates[traitorId] = {
            ...(newPlayerStates[traitorId] as PlayerGameState),
            is_traitor: true,
          };
        }

        pushBotLog(`🩸 Haunt "${haunt.name}" begins! Traitor: ${traitorId}`);

        patch = {
          ...patch,
          phase:            "haunt",
          haunt_number:     haunt.number,
          traitor_id:       traitorId,
          player_states:    newPlayerStates,
          haunt_objectives: { traitor: haunt.traitorObjective, heroes: haunt.heroObjective },
          event_log: [
            ...(patch.event_log ?? newLog),
            mkLog("haunt", botId, `The Haunt begins! "${haunt.name}"`),
          ].slice(-30),
        };
      }
    }
  }

  return { ...gs, ...patch };
}

// ─── Full bot turn ────────────────────────────────────────────────────────────

async function executeBotTurn(
  gs: BetrayalGameState,
  players: Player[],
  code: string,
  botId: string,
  pushBotLog: (msg: string) => void,
) {
  let cur = { ...gs }; // mutable working copy — written once at the end
  const botState = cur.player_states[botId] as PlayerGameState | undefined;
  const botName  = players.find((p) => p.id === botId)?.name ?? botId;

  // Skip dead bots
  if (!botState || botState.is_dead) {
    pushBotLog(`${botName}: eliminated — skipping`);
    await writeGs(code, nextTurnGs(cur));
    return;
  }

  // ── 1. Move / Explore ───────────────────────────────────────────────────────
  const isRestrained = (cur.restrained_players ?? []).includes(botId);
  const movesLeft = isRestrained ? Math.max(0, botState.speed - 1) : botState.speed; // rope restraint reduces speed by 1
  const floor = botState.floor;

  const unexplored   = getUnexploredDoors(cur.placed_tiles, floor);
  const reachable    = getReachable(cur.placed_tiles, floor, botState.x, botState.y, movesLeft, cur.locked_doors ?? []);
  const hasMoreTiles = cur.remaining_tiles[floor].length > 0;

  // Candidates for exploration (unexplored doors reachable from bot's position)
  const explorableFromHere = unexplored.filter(({ fromTile }) => {
    const isHere = botState.x === fromTile.x && botState.y === fromTile.y;
    const key    = `${fromTile.floor},${fromTile.x},${fromTile.y}`;
    return isHere || reachable.has(key);
  });

  let landedTileId: string | null = null; // used to check for card triggers
  let movedBotState = { ...botState };

  if (explorableFromHere.length > 0 && hasMoreTiles && Math.random() < 0.65) {
    // ── Explore a new room ──────────────────────────────────────────────────
    const pick = explorableFromHere[Math.floor(Math.random() * explorableFromHere.length)];
    const pool = cur.remaining_tiles[floor];

    // Determine required door direction (new tile must have a door facing the neighbor)
    const dirs: { dx: number; dy: number; rd: "north" | "south" | "east" | "west" }[] = [
      { dx: 0, dy: -1, rd: "north" },
      { dx: 0, dy:  1, rd: "south" },
      { dx: 1, dy:  0, rd: "east"  },
      { dx: -1, dy: 0, rd: "west"  },
    ];
    let requiredDoor: "north" | "south" | "east" | "west" = "south";
    for (const { dx, dy, rd } of dirs) {
      if (tileAt(cur.placed_tiles, floor, pick.x + dx, pick.y + dy)) {
        requiredDoor = rd;
        break;
      }
    }

    // Shuffle pool and try each tile until one fits (prevents infinite no-fit loops)
    const shuffledPool = [...pool].sort(() => Math.random() - 0.5);
    let placed = null;
    let chosenIdx = -1;
    let chosenTileId = "";
    for (let attempt = 0; attempt < shuffledPool.length; attempt++) {
      const candidate = shuffledPool[attempt];
      const result = buildPlacedTile(candidate, floor, pick.x, pick.y, requiredDoor, botId);
      if (result) {
        placed = result;
        chosenTileId = candidate;
        chosenIdx = pool.indexOf(candidate);
        break;
      }
    }

    if (placed) {
      const tileDef = getTile(chosenTileId);
      pushBotLog(`${botName}: Discovered "${tileDef?.name ?? chosenTileId}"`);

      cur = {
        ...cur,
        placed_tiles:    [...cur.placed_tiles, placed],
        remaining_tiles: { ...cur.remaining_tiles, [floor]: pool.filter((_, i) => i !== chosenIdx) },
        player_states: {
          ...cur.player_states,
          [botId]: { ...botState, x: pick.x, y: pick.y },
        },
        moves_used: botState.speed,
        turn_phase: "action",
        event_log:  [
          ...cur.event_log,
          mkLog("tile_reveal", botId, `🤖 ${botName} discovered "${tileDef?.name}"`),
        ].slice(-30),
      };
      movedBotState = { ...botState, x: pick.x, y: pick.y };
      landedTileId  = chosenTileId;
    }
    // If no tile fit, fall through to normal move
  }

  if (!landedTileId) {
    // ── Move to a reachable tile ────────────────────────────────────────────
    const reachableArr = Array.from(reachable)
      .map((key) => {
        const parts = key.split(",").map(Number);
        return { floor: parts[0] as Floor, x: parts[1], y: parts[2] };
      })
      .filter(({ floor: f, x, y }) => !(f === botState.floor && x === botState.x && y === botState.y));

    if (reachableArr.length > 0) {
      const target  = reachableArr[Math.floor(Math.random() * reachableArr.length)];
      const tile    = tileAt(cur.placed_tiles, target.floor, target.x, target.y);
      const tileDef = getTile(tile?.tile_id ?? "");
      pushBotLog(`${botName}: Moved to "${tileDef?.name ?? "room"}" (${target.x},${target.y}) floor ${target.floor}`);

      cur = {
        ...cur,
        player_states: {
          ...cur.player_states,
          [botId]: { ...botState, x: target.x, y: target.y, floor: target.floor },
        },
        moves_used: botState.speed,
        turn_phase: "action",
        event_log:  [
          ...cur.event_log,
          mkLog("move", botId, `🤖 ${botName} moved to "${tileDef?.name}"`),
        ].slice(-30),
      };
      movedBotState = { ...botState, x: target.x, y: target.y, floor: target.floor };
      landedTileId  = tile?.tile_id ?? null;
    } else {
      pushBotLog(`${botName}: Nowhere to move — ending turn`);
      cur = { ...cur, turn_phase: "action" };
    }
  }

  // ── 2. Auto-draw card from the room (once per tile per turn) ─────────────
  if (landedTileId) {
    const tileDef = getTile(landedTileId);
    const landedTileKey = `${movedBotState.floor},${movedBotState.x},${movedBotState.y}`;
    const alreadyDrawn = (movedBotState.drawn_tiles ?? []).includes(landedTileKey);
    if (!alreadyDrawn && tileDef?.type && tileDef.type !== "normal" && tileDef.type !== "stairwell") {
      let cardId: string | null = null;
      if (tileDef.type === "item"  && cur.item_deck.length  > 0) cardId = cur.item_deck[0];
      if (tileDef.type === "omen"  && cur.omen_deck.length  > 0) cardId = cur.omen_deck[0];
      if (tileDef.type === "event" && cur.event_deck.length > 0) cardId = cur.event_deck[0];

      if (cardId) {
        cur = resolveCardForBot(cur, cardId, botId, movedBotState, pushBotLog);
        // Permanently mark drawn in player state
        const freshBot = cur.player_states[botId] as PlayerGameState;
        cur = {
          ...cur,
          turn_phase: "action",
          player_states: {
            ...cur.player_states,
            [botId]: { ...freshBot, drawn_tiles: [...new Set([...(freshBot.drawn_tiles ?? []), landedTileKey])] },
          },
        };
      }
    }
  }

  // ── 3. Haunt combat (attack an enemy on the same tile) ───────────────────
  const freshBotState = cur.player_states[botId] as PlayerGameState;
  if (cur.phase === "haunt" && freshBotState && !freshBotState.is_dead) {
    const enemies = players.filter((p) => {
      if (p.id === botId) return false;
      const ps = cur.player_states[p.id] as PlayerGameState | undefined;
      if (!ps || ps.is_dead) return false;
      const sameTeam =
        freshBotState.is_traitor === ps.is_traitor; // bots on same team don't fight each other
      if (sameTeam) return false;
      return (
        ps.floor === freshBotState.floor &&
        ps.x    === freshBotState.x      &&
        ps.y    === freshBotState.y
      );
    });

    if (enemies.length > 0) {
      const target      = enemies[Math.floor(Math.random() * enemies.length)];
      const targetState = cur.player_states[target.id] as PlayerGameState;

      const atkRolls    = rollDice(getAttackMight(freshBotState));
      const defRolls    = rollDice(Math.max(1, targetState.might));
      const atkTotal    = atkRolls.reduce((a, b) => a + b, 0);
      const defTotal    = defRolls.reduce((a, b) => a + b, 0);

      const newPlayerStates = { ...cur.player_states };
      let combatMsg = "";

      if (atkTotal > defTotal) {
        const dmg      = atkTotal - defTotal;
        const newMight = Math.max(0, targetState.might - dmg);
        newPlayerStates[target.id] = { ...targetState, might: newMight, is_dead: isDead(newMight, targetState.sanity) };
        // Sacrificial Dagger costs 1 Sanity per use
        if (freshBotState.items?.includes("sacrificial-dagger")) {
          const newSanity = Math.max(0, freshBotState.sanity - 1);
          newPlayerStates[botId] = { ...freshBotState, sanity: newSanity, is_dead: isDead(freshBotState.might, newSanity) };
        }
        combatMsg = `🤖 ${botName} hit ${target.name} for ${dmg} Might${isDead(newMight, targetState.sanity) ? " — eliminated!" : ""}`;
        pushBotLog(`Attack vs ${target.name}: ${atkTotal} vs ${defTotal} → hit for ${dmg}`);
      } else if (defTotal > atkTotal) {
        const dmg      = defTotal - atkTotal;
        const newMight = Math.max(0, freshBotState.might - dmg);
        newPlayerStates[botId] = { ...freshBotState, might: newMight, is_dead: isDead(newMight, freshBotState.sanity) };
        combatMsg = `🤖 ${botName} was countered by ${target.name} for ${dmg} Might`;
        pushBotLog(`Attack vs ${target.name}: ${atkTotal} vs ${defTotal} → countered for ${dmg}`);
      } else {
        combatMsg = `🤖 ${botName} and ${target.name} draw (${atkTotal})`;
        pushBotLog(`Attack vs ${target.name}: ${atkTotal} vs ${defTotal} → draw`);
      }

      cur = {
        ...cur,
        player_states: newPlayerStates,
        event_log: [...cur.event_log, mkLog("stat", botId, combatMsg)].slice(-30),
      };
    }
  }

  // ── 4. Advance turn ────────────────────────────────────────────────────────
  pushBotLog(`${botName}: Turn complete`);
  await writeGs(code, nextTurnGs(cur));
}

// ─── Public hook ──────────────────────────────────────────────────────────────

export interface BotEngineResult {
  botLog: string[];
  isBotTurn: boolean;
}

export function useBotEngine({
  isHost,
  gs,
  players,
  code,
}: {
  isHost: boolean;
  gs: BetrayalGameState;
  players: Player[];
  code: string;
}): BotEngineResult {
  const [botLog, setBotLog] = useState<string[]>([]);
  const executingRef        = useRef(false);
  const lastTurnKeyRef      = useRef<string>("");

  const pushBotLog = useCallback((msg: string) => {
    setBotLog((prev) => [`[${stamp()}] ${msg}`, ...prev].slice(0, 40));
  }, []);

  const currentPlayerId = gs.turn_order[gs.current_turn_index] ?? null;
  const isBotTurn = !!currentPlayerId?.startsWith("bot-");

  useEffect(() => {
    if (!isHost) return;
    if (!isBotTurn) return;
    if (gs.winner || gs.phase === "ended") return;

    // Unique key for the current turn-state so we don't re-trigger after each
    // re-render without an actual turn change
    const key = `${gs.current_turn_index}:${gs.turn_phase}:${gs.moves_used}`;
    if (key === lastTurnKeyRef.current) return;
    if (executingRef.current) return;

    lastTurnKeyRef.current = key;
    executingRef.current   = true;

    const timer = setTimeout(async () => {
      try {
        await executeBotTurn(gs, players, code, currentPlayerId!, pushBotLog);
      } catch (err) {
        pushBotLog(`⚠ Error: ${String(err)}`);
        console.error("[BotEngine]", err);
      } finally {
        executingRef.current = false;
      }
    }, BOT_THINK_MS);

    return () => {
      clearTimeout(timer);
      executingRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isHost, isBotTurn, gs.current_turn_index, gs.turn_phase, gs.moves_used, gs.winner, gs.phase]);

  return { botLog, isBotTurn };
}

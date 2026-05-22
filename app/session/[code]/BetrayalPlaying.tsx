"use client";

import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import Link from "next/link";
import NextImage from "next/image";
import { supabase } from "@/lib/supabase";
import { getLang, saveLang } from "@/lib/utils/lang";
import { useAmbientAudio, useSfx } from "@/lib/hooks/useAmbientAudio";
import type { BetrayalGameState, Floor, PlayerGameState, MonsterState } from "@/lib/games/betrayal/types";
import { getTile } from "@/lib/games/betrayal/data/tiles";
import { getCharacter } from "@/lib/games/betrayal/data/characters";
import { getCard, shuffle } from "@/lib/games/betrayal/data/cards";
import { findHaunt, getHaunt } from "@/lib/games/betrayal/data/haunts";
import {
  getUnexploredDoors,
  buildPlacedTile, tileAt, findValidRotationMulti, findPath,
} from "@/lib/games/betrayal/logic/mapEngine";
import type { Player } from "@/types/game";
import { useBotEngine } from "@/lib/games/betrayal/botEngine";
import { rollDice } from "@/lib/games/betrayal/logic/dice";
import { isDead, checkAmulet, getAttackMight, checkWinCondition } from "@/lib/games/betrayal/logic/combat";
import { StatBar } from "./betrayal/components/StatBar";
import { DiceOverlay } from "./betrayal/components/DiceOverlay";
import { CombatOverlay, type CombatResultData } from "./betrayal/components/CombatOverlay";
import { MansionMap, FLOOR_NAMES, FLOOR_COLORS, PLAYER_COLORS, playerColor, TILE_PX } from "./betrayal/components/MansionMap";
import { HauntReveal } from "./betrayal/components/HauntReveal";
import { CardOverlay } from "./betrayal/components/CardOverlay";
import { BetrayalChat } from "./betrayal/components/BetrayalChat";
import { VictoryScreen } from "./betrayal/components/VictoryScreen";

// ─── Interfaces ───────────────────────────────────────────────────────────────
interface BetrayalDbSession {
  code: string;
  game_id: string;
  phase: "lobby" | "playing" | "ended";
  game_state: BetrayalGameState;
}

interface Props {
  code: string;
  dbSession: BetrayalDbSession;
  players: Player[];
  myPlayerId: string | null;
  isHost: boolean;
}

// ─── Local constants still needed in the main component render ────────────────
const STAT_COLOR: Record<string, string> = {
  speed: "#3b82f6", might: "#ef4444", sanity: "#a855f7", knowledge: "#22c55e",
};
const OPPOSITE_DIR = { north: "south", south: "north", east: "west", west: "east" } as const;

// ─── UI components — all extracted to betrayal/components/* ──────────────────
// StatBar       → ./betrayal/components/StatBar.tsx
// MansionMap    → ./betrayal/components/MansionMap.tsx  (incl. MapTile, UnexploredDoor)
// HauntReveal   → ./betrayal/components/HauntReveal.tsx
// CardOverlay   → ./betrayal/components/CardOverlay.tsx
// DiceOverlay   → ./betrayal/components/DiceOverlay.tsx  (incl. GothicDie)
// CombatOverlay → ./betrayal/components/CombatOverlay.tsx
// BetrayalChat  → ./betrayal/components/BetrayalChat.tsx
// VictoryScreen → ./betrayal/components/VictoryScreen.tsx

// ─── Global injected CSS ─────────────────────────────────────────────────────
const STAT_FLASH_STYLE = `
@keyframes statFloat {
  0%   { opacity: 1; transform: translateY(0) scale(1.2); }
  40%  { opacity: 1; transform: translateY(-10px) scale(1); }
  100% { opacity: 0; transform: translateY(-22px) scale(0.85); }
}
@keyframes yourTurnPulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.6; }
}
/* Ghost-gothic button hover glow */
.btn-betrayal:hover  { filter: brightness(1.18); transform: translateY(-1px); box-shadow: 0 4px 16px rgba(0,0,0,0.5); }
.btn-betrayal:active { transform: translateY(0);  filter: brightness(0.95); }
.btn-betrayal { transition: filter 0.15s, transform 0.15s, box-shadow 0.15s; }
.btn-betrayal:disabled { filter: none; transform: none; box-shadow: none; cursor: not-allowed; }
/* Item chip hover */
.item-chip:hover { filter: brightness(1.25); transform: scale(1.04); }
.item-chip { transition: filter 0.12s, transform 0.12s; }
/* Floor button hover */
.floor-btn:hover { filter: brightness(1.2); }
.floor-btn { transition: filter 0.12s, background 0.12s; }
`;

// ─── Main Component ───────────────────────────────────────────────────────────
export default function BetrayalPlaying({ code, dbSession, players, myPlayerId, isHost }: Props) {
  const [lang, setLangState] = useState<"en" | "th">(() => getLang());
  const setLang = (l: "en" | "th") => { setLangState(l); saveLang(l); };
  const gs = dbSession.game_state;

  const audioTrack = gs.winner === "heroes"
    ? "/audio/betrayal/heroes-win.mp3"
    : gs.winner === "traitor"
    ? "/audio/betrayal/traitor-wins.mp3"
    : gs.phase === "haunt"
    ? "/audio/betrayal/haunt-phase.mp3"
    : "/audio/betrayal/exploring.mp3";
  const { muted, toggleMute } = useAmbientAudio(audioTrack);
  const playSfx = useSfx();

  const myIndex = players.findIndex((p) => p.id === myPlayerId);
  const myState = myPlayerId ? gs.player_states[myPlayerId] ?? null : null;
  const myChar = myState ? getCharacter(myState.character_id) : null;

  // isDead, checkAmulet, getAttackMight — imported from lib/games/betrayal/logic/combat

  const currentPlayerId = gs.turn_order[gs.current_turn_index] ?? null;
  const isMyTurn = currentPlayerId === myPlayerId;
  const currentPlayer = players.find((p) => p.id === currentPlayerId);

  const [pendingCard, setPendingCard] = useState<string | null>(null);
  const [viewingItemCard, setViewingItemCard] = useState<string | null>(null);
  const [animPos, setAnimPos] = useState<{ floor: Floor; x: number; y: number } | null>(null);
  const isAnimatingRef = useRef(false);
  const [diceResult, setDiceResult] = useState<{ values: number[]; label: string; diceCount?: number } | null>(null);
  const [hauntDismissed, setHauntDismissed] = useState(false);
  const [showAttackTargets, setShowAttackTargets] = useState(false);
  const [showRevolverTargets, setShowRevolverTargets] = useState(false);
  const [showRopeTargets, setShowRopeTargets] = useState(false);
  const [showDynamiteTargets, setShowDynamiteTargets] = useState(false);
  const [combatResult, setCombatResult] = useState<CombatResultData | null>(null);
  const [discoveryChoice, setDiscoveryChoice] = useState<[string, string] | null>(null);
  const [smellingSaltsTarget, setSmellingSaltsTarget] = useState<string[] | null>(null);
  const [confirmWinnerRole, setConfirmWinnerRole] = useState<"heroes" | "traitor" | null>(null);
  const [statFlashes, setStatFlashes] = useState<Record<string, { delta: number; key: number }>>({});
  const prevStatsRef = useRef<{ speed: number; might: number; sanity: number; knowledge: number } | null>(null);
  const [showBotLog, setShowBotLog] = useState(false);
  const [showHauntGuide, setShowHauntGuide] = useState(false);
  const [showEventLog, setShowEventLog] = useState(false);
  const [showDeathPopup, setShowDeathPopup] = useState(false);

  // Clear animPos once the DB confirms the player reached the animated destination
  useEffect(() => {
    if (!animPos || !myState) return;
    if (myState.floor === animPos.floor && myState.x === animPos.x && myState.y === animPos.y) {
      setAnimPos(null);
      isAnimatingRef.current = false;
    }
  }, [myState?.floor, myState?.x, myState?.y, animPos]);

  // Show death popup when my character dies
  const prevIsDead = useRef(false);
  useEffect(() => {
    const nowDead = myState?.is_dead ?? false;
    if (nowDead && !prevIsDead.current) setShowDeathPopup(true);
    prevIsDead.current = nowDead;
  }, [myState?.is_dead]);

  // Detect stat changes → drive StatBar flash animation
  useEffect(() => {
    if (!myState) return;
    const prev = prevStatsRef.current;
    if (prev) {
      const STATS = ["speed", "might", "sanity", "knowledge"] as const;
      const newFlashes: Record<string, { delta: number; key: number }> = {};
      for (const stat of STATS) {
        const delta = myState[stat] - prev[stat];
        if (delta !== 0) newFlashes[stat] = { delta, key: Date.now() };
      }
      if (Object.keys(newFlashes).length > 0) {
        setStatFlashes(newFlashes);
        setTimeout(() => setStatFlashes({}), 1800);
      }
    }
    prevStatsRef.current = { speed: myState.speed, might: myState.might, sanity: myState.sanity, knowledge: myState.knowledge };
  }, [myState?.speed, myState?.might, myState?.sanity, myState?.knowledge]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-open haunt guide when haunt begins
  const prevPhaseRef = useRef<string | null>(null);
  useEffect(() => {
    if (gs.phase === "haunt" && prevPhaseRef.current !== "haunt") setShowHauntGuide(true);
    prevPhaseRef.current = gs.phase;
  }, [gs.phase]);

  // Bot engine — runs silently on host's browser, auto-plays bot turns
  const { botLog, isBotTurn } = useBotEngine({ isHost, gs, players, code });

  // Valid attack targets: living opposing-team players on the same tile
  const validAttackTargets = useMemo(() => {
    if (gs.phase !== "haunt" || !myState || gs.turn_phase !== "action") return [];
    return players.filter((p) => {
      if (p.id === myPlayerId) return false;
      const ps = gs.player_states[p.id];
      if (!ps || ps.is_dead) return false;
      if (ps.is_traitor === myState.is_traitor) return false; // same team
      return ps.floor === myState.floor && ps.x === myState.x && ps.y === myState.y;
    });
  }, [gs, myState, myPlayerId, players]);

  // Phase-independent check: is there an opponent on the same tile right now?
  const canAttack = useMemo(() => {
    if (gs.phase !== "haunt" || !myState) return false;
    return players.some((p) => {
      if (p.id === myPlayerId) return false;
      const ps = gs.player_states[p.id];
      if (!ps || ps.is_dead) return false;
      if (ps.is_traitor === myState.is_traitor) return false;
      return ps.floor === myState.floor && ps.x === myState.x && ps.y === myState.y;
    });
  }, [gs.phase, gs.player_states, myState, myPlayerId, players]);

  // Revolver targets: enemies on the same floor (ranged)
  const revolverTargets = useMemo(() => {
    if (gs.phase !== "haunt" || !myState || gs.turn_phase !== "action") return [];
    if (!(myState.items ?? []).includes("revolver")) return [];
    return players.filter((p) => {
      if (p.id === myPlayerId) return false;
      const ps = gs.player_states[p.id];
      if (!ps || ps.is_dead) return false;
      if (ps.is_traitor === myState.is_traitor) return false;
      return ps.floor === myState.floor; // same floor, any room
    });
  }, [gs, myState, myPlayerId, players]);

  // ── Supabase updater ──────────────────────────────────────────────────────
  const updateGs = useCallback(async (patch: Partial<BetrayalGameState>) => {
    const next = { ...gs, ...patch };
    await supabase.from("sessions").update({ game_state: next }).eq("code", code);
  }, [gs, code]);

  const addLog = useCallback((type: BetrayalGameState["event_log"][0]["type"], message: string) => {
    return {
      id: Math.random().toString(36).slice(2),
      timestamp: new Date().toISOString(),
      type, player_id: myPlayerId ?? "system", message,
    };
  }, [myPlayerId]);

  // ── Move ──────────────────────────────────────────────────────────────────
  const handleMove = useCallback(async (x: number, y: number, floor: Floor) => {
    if (!isMyTurn || !myState || gs.turn_phase !== "move") return;
    if (x === myState.x && y === myState.y && floor === myState.floor) return;
    if (isAnimatingRef.current) return; // block clicks during animation

    const tile = tileAt(gs.placed_tiles, floor, x, y);
    if (!tile) return;
    const def = getTile(tile.tile_id);
    const newLog = [...gs.event_log];

    const isRestrained = (gs.restrained_players ?? []).includes(myPlayerId ?? "");
    const isChilled    = (gs.chilled_players   ?? []).includes(myPlayerId ?? "");
    const effectiveSpeed = Math.max(0, myState.speed - (isRestrained ? 1 : 0) - (isChilled ? 1 : 0));

    // ── CSS sliding animation + move cost ───────────────────────────────────
    // Path is computed first so cost = path.length (rooms actually traversed).
    // Previously cost was hardcoded to 1 regardless of distance — players could
    // jump 4 rooms and still have their full speed remaining.
    const path = findPath(
      gs.placed_tiles,
      myState.floor, myState.x, myState.y,
      floor, x, y,
      gs.locked_doors ?? [],
    );
    const moveCost    = path?.length ?? 1;          // each room in path costs 1 move
    const newMovesUsed = gs.moves_used + moveCost;
    const movesLeft   = effectiveSpeed - newMovesUsed;

    if (path && path.length > 0) {
      isAnimatingRef.current = true;
      // Pin floating token at origin so browser knows where to transition FROM
      setAnimPos({ floor: myState.floor, x: myState.x, y: myState.y });
      // Two rAFs guarantee the browser painted the token at origin before we move it
      await new Promise<void>(res => requestAnimationFrame(() => requestAnimationFrame(() => res())));
      // Walk every step of the path (CSS slides each leg in 240 ms)
      for (const step of path) {
        setAnimPos(step);
        playSfx("/audio/betrayal/sfx/footstep.mp3");
        await new Promise<void>(res => setTimeout(res, 250)); // 10 ms buffer after 240 ms transition
      }
      // animPos stays at destination; useEffect clears it once myState catches up
    }

    // Check card tile BEFORE the patch so we can mark drawn_tiles atomically with the move
    const tileKey = `${floor},${x},${y}`;
    const alreadyDrawn = (myState.drawn_tiles ?? []).includes(tileKey);
    const isCardTile = !alreadyDrawn && !!def?.type && def.type !== "normal" && def.type !== "stairwell";
    const newDrawnTiles = isCardTile
      ? [...new Set([...(myState.drawn_tiles ?? []), tileKey])]
      : (myState.drawn_tiles ?? []);

    const newPlayerStates = {
      ...gs.player_states,
      [myPlayerId!]: { ...myState, x, y, floor, drawn_tiles: newDrawnTiles },
    };

    let patch: Partial<BetrayalGameState> = {
      player_states: newPlayerStates,
      moves_used: newMovesUsed,
    };

    newLog.push(addLog("move", `${players.find(p => p.id === myPlayerId)?.name} moved to ${def?.name}`));
    patch.event_log = newLog.slice(-30);

    if (movesLeft <= 0) patch.turn_phase = "action";

    // Trigger card popup — reshuffle discard into deck if exhausted (physical game rule)
    if (isCardTile) {
      type DeckKey    = "item_deck"    | "omen_deck"    | "event_deck";
      type DiscardKey = "item_discard" | "omen_discard" | "event_discard";
      const t = def!.type as "item" | "omen" | "event";
      const deckKey    = `${t}_deck`    as DeckKey;
      const discardKey = `${t}_discard` as DiscardKey;
      let deck    = gs[deckKey]    as string[];
      let discard = gs[discardKey] as string[];

      if (deck.length === 0 && discard.length > 0) {
        deck    = shuffle([...discard]);
        discard = [];
        // Include reshuffle in the same DB write so all clients see it atomically
        patch[deckKey]    = deck;
        patch[discardKey] = discard;
        patch.event_log = [...(patch.event_log ?? gs.event_log), addLog("system", `${t} deck exhausted — discard reshuffled 🔀`)].slice(-30);
      }

      const cardId = deck[0] ?? null;
      await updateGs(patch);
      if (cardId) setPendingCard(cardId);
    } else {
      await updateGs(patch);
    }
  }, [isMyTurn, myState, gs, myPlayerId, players, addLog, updateGs, playSfx]);

  // ── Reveal tile ───────────────────────────────────────────────────────────
  const handleRevealTile = useCallback(async (x: number, y: number, floor: Floor) => {
    if (!isMyTurn || !myState) return;
    const pool = gs.remaining_tiles[floor];
    if (pool.length === 0) return;

    // Collect ALL required doors: every adjacent placed tile that has an open door
    // pointing toward (x,y). The new tile must have matching doors for ALL of them.
    const OPP: Record<string, "north" | "south" | "east" | "west"> = {
      north: "south", south: "north", east: "west", west: "east",
    };
    const adjCheck = [
      { dx: 0, dy: -1, dir: "north" as const },
      { dx: 0, dy: 1,  dir: "south" as const },
      { dx: 1, dy: 0,  dir: "east"  as const },
      { dx: -1, dy: 0, dir: "west"  as const },
    ];
    const requiredDoors: ("north" | "south" | "east" | "west")[] = [];
    for (const { dx, dy, dir } of adjCheck) {
      const adj = tileAt(gs.placed_tiles, floor, x + dx, y + dy);
      if (adj && adj.doors[OPP[dir]]) requiredDoors.push(dir);
    }
    // If no adjacent tile has a door toward (x,y) the position is stale — abort.
    if (requiredDoors.length === 0) return;

    const startIdx = Math.floor(Math.random() * pool.length);
    let placed = null;
    let tileId = "";
    let newPool = pool;

    // Phase 1: find a tile that satisfies ALL required doors (full connectivity)
    for (let attempt = 0; attempt < pool.length; attempt++) {
      const idx = (startIdx + attempt) % pool.length;
      const candidate = pool[idx];
      const valid = findValidRotationMulti(candidate, requiredDoors);
      if (valid) {
        placed = { tile_id: candidate, floor, x, y, rotation: valid.rotation, doors: valid.doors, revealed_by: myPlayerId! };
        tileId = candidate;
        newPool = pool.filter((_, i) => i !== idx);
        break;
      }
    }

    // Phase 2: no tile satisfies all constraints — fall back to satisfying just ONE
    // required door so the player always has a way back (prevents stuck tiles).
    if (!placed) {
      for (const singleReq of requiredDoors) {
        for (let attempt = 0; attempt < pool.length; attempt++) {
          const idx = (startIdx + attempt) % pool.length;
          const candidate = pool[idx];
          const valid = findValidRotationMulti(candidate, [singleReq]);
          if (valid) {
            placed = { tile_id: candidate, floor, x, y, rotation: valid.rotation, doors: valid.doors, revealed_by: myPlayerId! };
            tileId = candidate;
            newPool = pool.filter((_, i) => i !== idx);
            break;
          }
        }
        if (placed) break;
      }
    }

    if (!placed) return; // pool exhausted

    const newTiles = [...gs.placed_tiles, placed];
    const newRemaining = { ...gs.remaining_tiles, [floor]: newPool };
    const newLog = [...gs.event_log, addLog("tile_reveal", `${players.find(p => p.id === myPlayerId)?.name} discovered ${getTile(tileId)?.name}`)];

    const tileKey = `${floor},${x},${y}`;
    const newDef = getTile(tileId);
    const willDrawCard = !!(newDef?.type && newDef.type !== "normal" && newDef.type !== "stairwell");
    // Permanently mark this tile as drawn in the player's own state
    const newDrawnTiles = willDrawCard
      ? [...new Set([...(myState.drawn_tiles ?? []), tileKey])]
      : [...(myState.drawn_tiles ?? [])];

    // Move player into new tile
    const newPlayerStates = {
      ...gs.player_states,
      [myPlayerId!]: { ...myState, x, y, floor, drawn_tiles: newDrawnTiles },
    };

    // Animate player stepping onto the newly revealed tile (always 1 step away)
    if (!isAnimatingRef.current) {
      isAnimatingRef.current = true;
      setAnimPos({ floor: myState.floor, x: myState.x, y: myState.y });
      await new Promise<void>(res => requestAnimationFrame(() => requestAnimationFrame(() => res())));
      setAnimPos({ floor, x, y });
      playSfx("/audio/betrayal/sfx/footstep.mp3");
      await new Promise<void>(res => setTimeout(res, 250));
    }

    // Reshuffle discard into deck if exhausted (physical game rule)
    const revealPatch: Partial<BetrayalGameState> = {
      placed_tiles: newTiles,
      remaining_tiles: newRemaining,
      player_states: newPlayerStates,
      moves_used: myState.speed,
      turn_phase: "action",
      event_log: newLog.slice(-30),
    };
    let revealCardId: string | null = null;
    if (willDrawCard) {
      type DeckKey    = "item_deck"    | "omen_deck"    | "event_deck";
      type DiscardKey = "item_discard" | "omen_discard" | "event_discard";
      const t = newDef!.type as "item" | "omen" | "event";
      const deckKey    = `${t}_deck`    as DeckKey;
      const discardKey = `${t}_discard` as DiscardKey;
      let deck    = gs[deckKey]    as string[];
      let discard = gs[discardKey] as string[];
      if (deck.length === 0 && discard.length > 0) {
        deck    = shuffle([...discard]);
        discard = [];
        revealPatch[deckKey]    = deck;
        revealPatch[discardKey] = discard;
        revealPatch.event_log   = [...newLog, addLog("system", `${t} deck exhausted — discard reshuffled 🔀`)].slice(-30);
      }
      revealCardId = deck[0] ?? null;
    }

    playSfx("/audio/betrayal/sfx/tile-reveal.mp3");
    await updateGs(revealPatch);
    if (revealCardId) setPendingCard(revealCardId);
  }, [isMyTurn, myState, gs, myPlayerId, players, addLog, updateGs, playSfx]);

  // ── Draw card (resolve pending card) ─────────────────────────────────────
  const handleDrawCard = useCallback(async (cardId: string, cardType: "item" | "omen" | "event") => {
    if (!myState) return;
    const deckKey = `${cardType}_deck` as "item_deck" | "omen_deck" | "event_deck";
    const discardKey = `${cardType}_discard` as "item_discard" | "omen_discard" | "event_discard";

    // Reshuffle discard if deck somehow empty at confirm time (race condition safety)
    const liveDeck = gs[deckKey].length > 0
      ? gs[deckKey]
      : shuffle([...gs[discardKey]].filter(id => id !== cardId));
    const newDeck    = liveDeck.slice(1);
    const newDiscard = [cardId, ...gs[discardKey]];
    const playerName = players.find(p => p.id === myPlayerId)?.name ?? "?";
    const newLog = [...gs.event_log, addLog("card_draw", `${playerName} drew ${getCard(cardId)?.name}`)];

    // Permanently mark this tile as drawn in the player's own state
    const tileKey = `${myState.floor},${myState.x},${myState.y}`;
    const newDrawnTiles = [...new Set([...(myState.drawn_tiles ?? []), tileKey])];

    let patch: Partial<BetrayalGameState> = {
      [deckKey]: newDeck,
      [discardKey]: newDiscard,
      event_log: newLog.slice(-30),
    };

    // ── Item card ──────────────────────────────────────────────────────────
    if (cardType === "item") {
      playSfx("/audio/betrayal/sfx/item-pickup.mp3");
      const newItems = [...(myState.items ?? []), cardId];
      let updatedState = { ...myState, items: newItems, drawn_tiles: newDrawnTiles };
      // Apply immediate pickup stat bonuses
      const char = myChar;
      if (cardId === "holy-symbol") {
        updatedState.sanity = Math.min(updatedState.sanity + 2, char?.sanityMax ?? 8);
        newLog.push(addLog("stat", `${playerName} gained +2 Sanity from Holy Symbol`));
      } else if (cardId === "ancient-book") {
        updatedState.knowledge = Math.min(updatedState.knowledge + 2, char?.knowledgeMax ?? 8);
        newLog.push(addLog("stat", `${playerName} gained +2 Knowledge from Ancient Book`));
      } else if (cardId === "candle") {
        updatedState.knowledge = Math.min(updatedState.knowledge + 1, char?.knowledgeMax ?? 8);
        newLog.push(addLog("stat", `${playerName} gained +1 Knowledge from Black Candle`));
      }
      patch.player_states = { ...gs.player_states, [myPlayerId!]: updatedState };
    }

    // ── Omen card ──────────────────────────────────────────────────────────
    if (cardType === "omen") {
      playSfx("/audio/betrayal/sfx/omen-draw.mp3");

      // Apply immediate stat effects for this omen
      let updatedState = { ...myState, drawn_tiles: newDrawnTiles };
      const char = myChar;
      if (cardId === "omen-candle") {
        updatedState.knowledge = Math.min(myState.knowledge + 1, char?.knowledgeMax ?? 8);
      } else if (cardId === "omen-girl") {
        updatedState.sanity = Math.max(myState.sanity - 1, 0);
        updatedState.is_dead = isDead(updatedState.might, updatedState.sanity);
        if (updatedState.is_dead) {
          const { state: saved, saved: didSave } = checkAmulet(updatedState);
          if (didSave) { updatedState = saved; newLog.push(addLog("stat", `${playerName}'s Amulet saved them from death!`)); }
          else playSfx("/audio/betrayal/sfx/scream.mp3");
        }
        // Ghost warns you: reveal a random unexplored room on your floor
        const unexploredDoors = getUnexploredDoors(gs.placed_tiles, myState.floor);
        const floorPool = (gs.remaining_tiles as Record<number, string[]>)[myState.floor] ?? [];
        if (unexploredDoors.length > 0 && floorPool.length > 0) {
          const doorEntry = unexploredDoors[Math.floor(Math.random() * unexploredDoors.length)];
          const tileId = floorPool[Math.floor(Math.random() * floorPool.length)];
          const requiredDoor = OPPOSITE_DIR[doorEntry.direction];
          const placed = buildPlacedTile(tileId, myState.floor, doorEntry.x, doorEntry.y, requiredDoor, myPlayerId!);
          if (placed) {
            patch.placed_tiles = [...gs.placed_tiles, placed];
            patch.remaining_tiles = {
              ...gs.remaining_tiles,
              [myState.floor]: floorPool.filter(id => id !== tileId),
            } as Record<Floor, string[]>;
            newLog.push(addLog("system", `👻 The ghost girl reveals: ${getTile(tileId)?.name ?? tileId}`));
          }
        }
      } else if (cardId === "omen-mask") {
        updatedState.might = Math.max(myState.might - 1, 0);
        updatedState.knowledge = Math.min(myState.knowledge + 2, char?.knowledgeMax ?? 8);
        updatedState.is_dead = isDead(updatedState.might, updatedState.sanity);
        if (updatedState.is_dead) {
          const { state: saved, saved: didSave } = checkAmulet(updatedState);
          if (didSave) { updatedState = saved; newLog.push(addLog("stat", `${playerName}'s Amulet saved them from death!`)); }
          else playSfx("/audio/betrayal/sfx/scream.mp3");
        }
      } else if (cardId === "omen-dog") {
        updatedState.speed = Math.min(myState.speed + 1, char?.speedMax ?? 8);
        newLog.push(addLog("stat", `${playerName} gained +1 Speed from the Spectral Hound`));
      } else if (cardId === "omen-key") {
        // Skeleton Key: opens all currently locked doors
        if ((gs.locked_doors ?? []).length > 0) {
          patch.locked_doors = [];
          newLog.push(addLog("system", `${playerName} used the Skeleton Key — all locked doors are now open 🔓`));
        } else {
          newLog.push(addLog("system", `${playerName} found the Skeleton Key (no locked doors currently)`));
        }
      } else if (cardId === "omen-crystal-ball") {
        // Crystal Ball: reveal top card of each remaining deck
        const topItem  = gs.item_deck[0]  ? getCard(gs.item_deck[0])?.name  : "empty";
        const topOmen  = gs.omen_deck[0]  ? getCard(gs.omen_deck[0])?.name  : "empty";
        const topEvent = gs.event_deck[0] ? getCard(gs.event_deck[0])?.name : "empty";
        newLog.push(addLog("system", `🔮 Crystal Ball: Item deck top → ${topItem} | Omen deck top → ${topOmen} | Event deck top → ${topEvent}`));
      } else if (cardId === "omen-ring") {
        // Mourning Ring: reveal one player's role — only meaningful after haunt starts
        if (gs.phase === "haunt") {
          const others = gs.turn_order.filter(id => id !== myPlayerId && !gs.player_states[id]?.is_dead);
          if (others.length > 0) {
            const revealId = others[Math.floor(Math.random() * others.length)];
            const revealedPs = gs.player_states[revealId];
            const revealedName = players.find(p => p.id === revealId)?.name ?? revealId;
            const role = revealedPs?.is_traitor ? "⚔ TRAITOR" : "🕯 Hero";
            newLog.push(addLog("system", `💍 Mourning Ring reveals: ${revealedName} is a ${role}`));
          }
        } else {
          newLog.push(addLog("system", `💍 Mourning Ring: roles will be revealed once the Haunt begins`));
        }
      } else if (cardId === "omen-book" && gs.item_deck.length > 0) {
        // Draw 1 item card immediately
        const itemId = gs.item_deck[0];
        updatedState.items = [...(myState.items ?? []), itemId];
        patch.item_deck = gs.item_deck.slice(1);
        patch.item_discard = [itemId, ...gs.item_discard];
        newLog.push(addLog("stat", `${playerName} found an item from The Book: ${itemId}`));
      }

      // omen-skull: all players lose 1 sanity
      if (cardId === "omen-skull") {
        const allStates = { ...gs.player_states };
        for (const pid of Object.keys(allStates)) {
          const newSanity = Math.max(allStates[pid].sanity - 1, 0);
          let ps = { ...allStates[pid], sanity: newSanity, is_dead: isDead(allStates[pid].might, newSanity) };
          if (ps.is_dead) {
            const { state: saved, saved: didSave } = checkAmulet(ps);
            if (didSave) { ps = saved; newLog.push(addLog("stat", `${players.find(p => p.id === pid)?.name ?? pid}'s Amulet saved them!`)); }
          }
          allStates[pid] = ps;
        }
        allStates[myPlayerId!] = { ...allStates[myPlayerId!], drawn_tiles: newDrawnTiles };
        patch.player_states = allStates;
      } else if (cardId === "omen-holy-symbol") {
        // All players in the SAME ROOM make a Sanity roll (3+) or lose 1 Sanity
        const roomStates = { ...gs.player_states };
        for (const pid of Object.keys(roomStates)) {
          const ps = roomStates[pid];
          if (ps.floor === myState.floor && ps.x === myState.x && ps.y === myState.y) {
            const roll = rollDice(2).reduce((a, b) => a + b, 0);
            if (roll < 3) {
              const newSanity = Math.max(ps.sanity - 1, 0);
              let newPs = { ...ps, sanity: newSanity, is_dead: isDead(ps.might, newSanity) };
              if (newPs.is_dead) {
                const { state: saved, saved: didSave } = checkAmulet(newPs);
                if (didSave) { newPs = saved; newLog.push(addLog("stat", `${pid === myPlayerId ? playerName : pid}'s Amulet saved them!`)); }
              }
              roomStates[pid] = newPs;
              newLog.push(addLog("stat", `${pid === myPlayerId ? playerName : pid} failed Sanity roll (${roll}) — lost 1 Sanity`));
            }
          }
        }
        roomStates[myPlayerId!] = { ...roomStates[myPlayerId!], drawn_tiles: newDrawnTiles };
        patch.player_states = roomStates;
      } else {
        patch.player_states = { ...gs.player_states, [myPlayerId!]: updatedState };
      }

      // Guard: don't trigger haunt if it already started (race condition prevention)
      if (gs.phase === "haunt") {
        await updateGs(patch);
        setPendingCard(null);
        return;
      }

      const newOmenCount = gs.omen_count + 1;
      patch.omen_count = newOmenCount;

      const roll = rollDice(2);
      const rollSum = roll.reduce((a, b) => a + b, 0);

      if (rollSum < newOmenCount) {
        playSfx("/audio/betrayal/sfx/haunt-begin.mp3");
        setTimeout(() => playSfx("/audio/betrayal/sfx/monster-roar.mp3"), 2200);
        const currentTile = tileAt(gs.placed_tiles, myState.floor, myState.x, myState.y);
        const haunt = findHaunt(cardId, currentTile?.tile_id ?? "");
        // Pick traitor: exclude triggerer and already-traitors
        const eligible = gs.turn_order.filter(
          (id) => id !== myPlayerId && !gs.player_states[id]?.is_dead && !gs.player_states[id]?.is_traitor,
        );
        const traitorId = eligible.length > 0
          ? eligible[Math.floor(Math.random() * eligible.length)]
          : myPlayerId!;

        const newPlayerStates = { ...(patch.player_states ?? gs.player_states) };
        newPlayerStates[traitorId] = { ...newPlayerStates[traitorId], is_traitor: true };

        // Guarantee haunt-required items are findable: bubble them to the top of the item deck
        const HAUNT_ITEM_MAP: Record<string, string> = {
          "Holy Symbol": "holy-symbol", "Ancient Book": "ancient-book",
          "Amulet": "amulet", "Healing Salve": "healing-salve",
          "Smelling Salts": "smelling-salts", "Axe": "axe", "Rope": "rope",
          "Candle": "candle", "Lantern": "lantern", "Lucky Coin": "lucky-coin",
          "Sacrificial Dagger": "sacrificial-dagger", "Knife": "knife",
        };
        const hauntText = [haunt.heroObjective, haunt.traitorObjective, ...(haunt.heroPowers ?? []), ...(haunt.traitorPowers ?? [])].join(" ");
        const neededIds = Object.entries(HAUNT_ITEM_MAP).filter(([label]) => hauntText.includes(label)).map(([, id]) => id);
        const baseDeck = patch.item_deck ?? gs.item_deck;
        const priority = neededIds.filter(id => baseDeck.includes(id));
        const guaranteedDeck = priority.length > 0 ? [...priority, ...baseDeck.filter(id => !priority.includes(id))] : baseDeck;

        // Spawn one monster in the basement (basement landing)
        const basementLanding = gs.placed_tiles.find(t => t.floor === 0 && t.tile_id === "basement-landing");
        const spawnFloor: Floor = basementLanding ? 0 : myState.floor;
        const spawnX = basementLanding ? basementLanding.x : myState.x;
        const spawnY = basementLanding ? basementLanding.y : myState.y;
        const spawnedMonster: MonsterState = {
          floor: spawnFloor, x: spawnX, y: spawnY,
          name: "The Creature", image: "/images/games/betrayal/monster.png",
        };

        patch = {
          ...patch,
          phase: "haunt",
          haunt_number: haunt.number,
          traitor_id: traitorId,
          player_states: newPlayerStates,
          item_deck: guaranteedDeck,
          haunt_objectives: { traitor: haunt.traitorObjective, heroes: haunt.heroObjective },
          monsters: [spawnedMonster],
          event_log: [...newLog, addLog("haunt", `The Haunt begins! "${haunt.name}" — a creature stirs in the basement...`)].slice(-30),
        };
      } else {
        playSfx("/audio/betrayal/sfx/dice-roll.mp3");
        setDiceResult({ values: roll, label: `Haunt Roll — need < ${newOmenCount}, rolled ${rollSum}. Safe.` });
      }
    }

    // ── Event card ─────────────────────────────────────────────────────────
    if (cardType === "event") {
      playSfx("/audio/betrayal/sfx/ghost-ambient.mp3");
      const char = myChar;
      let updatedState = { ...myState, drawn_tiles: newDrawnTiles };

      if (cardId === "ev-dark-vision") {
        const roll = rollDice(2);
        const total = roll.reduce((a, b) => a + b, 0);
        if (total >= 3) { // 3+ ≈42% success (4+ was only 14% — impossible to achieve reliably)
          updatedState.knowledge = Math.min(myState.knowledge + 1, char?.knowledgeMax ?? 8);
          newLog.push(addLog("stat", `${playerName} gained +1 Knowledge from Dark Vision (rolled ${total})`));
        } else {
          updatedState.sanity = Math.max(myState.sanity - 1, 0);
          updatedState.is_dead = isDead(updatedState.might, updatedState.sanity);
          newLog.push(addLog("stat", `${playerName} lost 1 Sanity from Dark Vision (rolled ${total})`));
          if (updatedState.is_dead) {
            const { state: saved, saved: didSave } = checkAmulet(updatedState);
            if (didSave) { updatedState = saved; newLog.push(addLog("stat", `${playerName}'s Amulet saved them!`)); }
            else playSfx("/audio/betrayal/sfx/scream.mp3");
          }
        }
        setDiceResult({ values: roll, label: `Dark Vision — rolled ${total}`, diceCount: 2 });
        patch.player_states = { ...gs.player_states, [myPlayerId!]: updatedState };
      } else if (cardId === "ev-cold-spot") {
        // Track temporarily — speed is restored at the start of their next turn (handleEndTurn)
        patch.chilled_players = [...new Set([...(gs.chilled_players ?? []), myPlayerId!])];
        newLog.push(addLog("stat", `${playerName} is chilled by Cold Spot — -1 Speed until next turn 🥶`));
        patch.player_states = { ...gs.player_states, [myPlayerId!]: updatedState };
      } else if (cardId === "ev-writing") {
        const roll = rollDice(1);
        const total = roll[0];
        if (total >= 3 && gs.item_deck.length > 0) {
          const itemId = gs.item_deck[0];
          const newItems = [...(myState.items ?? []), itemId];
          updatedState.items = newItems;
          patch.item_deck = gs.item_deck.slice(1);
          patch.item_discard = [itemId, ...gs.item_discard];
          newLog.push(addLog("stat", `${playerName} found an item from Writing on the Wall (rolled ${total})`));
        } else if (total < 3) {
          updatedState.sanity = Math.max(myState.sanity - 1, 0);
          updatedState.is_dead = isDead(updatedState.might, updatedState.sanity);
          newLog.push(addLog("stat", `${playerName} lost 1 Sanity from Writing on the Wall (rolled ${total})`));
          if (updatedState.is_dead) {
            const { state: saved, saved: didSave } = checkAmulet(updatedState);
            if (didSave) { updatedState = saved; newLog.push(addLog("stat", `${playerName}'s Amulet saved them!`)); }
            else playSfx("/audio/betrayal/sfx/scream.mp3");
          }
        }
        setDiceResult({ values: roll, label: `Writing on the Wall — rolled ${total}`, diceCount: 1 });
        patch.player_states = { ...gs.player_states, [myPlayerId!]: updatedState };
      } else if (cardId === "ev-portrait") {
        const floorStates = { ...gs.player_states };
        for (const pid of Object.keys(floorStates)) {
          if (floorStates[pid].floor === myState.floor) {
            const newSanity = Math.max(floorStates[pid].sanity - 1, 0);
            let ps = { ...floorStates[pid], sanity: newSanity, is_dead: isDead(floorStates[pid].might, newSanity) };
            if (ps.is_dead) {
              const { state: saved, saved: didSave } = checkAmulet(ps);
              if (didSave) { ps = saved; newLog.push(addLog("stat", `${players.find(p => p.id === pid)?.name ?? pid}'s Amulet saved them!`)); }
            }
            floorStates[pid] = ps;
          }
        }
        // Record drawn_tiles for current player
        floorStates[myPlayerId!] = { ...floorStates[myPlayerId!], drawn_tiles: newDrawnTiles };
        newLog.push(addLog("stat", `Everyone on floor ${myState.floor} lost 1 Sanity (Screaming Portrait)`));
        patch.player_states = floorStates;
      } else if (cardId === "ev-falling") {
        const roll = rollDice(2);
        const total = roll.reduce((a, b) => a + b, 0);
        updatedState.might = Math.max(myState.might - total, 0);
        updatedState.is_dead = isDead(updatedState.might, updatedState.sanity);
        newLog.push(addLog("stat", `${playerName} lost ${total} Might from Falling`));
        if (updatedState.is_dead) {
          const { state: saved, saved: didSave } = checkAmulet(updatedState);
          if (didSave) { updatedState = saved; newLog.push(addLog("stat", `${playerName}'s Amulet saved them!`)); }
          else playSfx("/audio/betrayal/sfx/scream.mp3");
        } else playSfx("/audio/betrayal/sfx/stat-drop.mp3");
        setDiceResult({ values: roll, label: `Falling — rolled ${total} Might damage`, diceCount: 2 });
        patch.player_states = { ...gs.player_states, [myPlayerId!]: updatedState };
      } else if (cardId === "ev-the-smell") {
        const roll = rollDice(3);
        const total = roll.reduce((a, b) => a + b, 0);
        if (total <= 4) {
          updatedState.might = Math.max(myState.might - 2, 0);
          updatedState.is_dead = isDead(updatedState.might, updatedState.sanity);
          newLog.push(addLog("stat", `${playerName} lost 2 Might from The Smell (rolled ${total})`));
          if (updatedState.is_dead) {
            const { state: saved, saved: didSave } = checkAmulet(updatedState);
            if (didSave) { updatedState = saved; newLog.push(addLog("stat", `${playerName}'s Amulet saved them!`)); }
            else playSfx("/audio/betrayal/sfx/scream.mp3");
          } else playSfx("/audio/betrayal/sfx/stat-drop.mp3");
          // Spawn a monster at the player's current location
          const smellMonster: MonsterState = {
            floor: myState.floor, x: myState.x, y: myState.y,
            name: "The Creature", image: "/images/games/betrayal/monster.png",
          };
          patch.monsters = [...(gs.monsters ?? []), smellMonster];
          newLog.push(addLog("system", `☠ Something emerges from the darkness...`));
          playSfx("/audio/betrayal/sfx/monster-roar.mp3");
        } else {
          newLog.push(addLog("stat", `${playerName} escaped The Smell (rolled ${total})`));
        }
        setDiceResult({ values: roll, label: `The Smell — rolled ${total}`, diceCount: 3 });
        patch.player_states = { ...gs.player_states, [myPlayerId!]: updatedState };
      } else if (cardId === "ev-discovery") {
        // Draw 2 items; player picks 1 to keep, the other returns to the bottom of the deck
        let itemDeck = [...gs.item_deck];
        const drawn: string[] = [];
        for (let i = 0; i < 2 && itemDeck.length > 0; i++) drawn.push(itemDeck.shift()!);
        patch.item_deck = itemDeck; // remove drawn cards from deck immediately
        patch.player_states = { ...gs.player_states, [myPlayerId!]: updatedState };
        if (drawn.length === 2) {
          // Show choice overlay — cards are in limbo until player picks
          newLog.push(addLog("stat", `${playerName} found 2 items — must choose 1 to keep`));
          patch.event_log = newLog.slice(-30);
          await updateGs(patch);
          setPendingCard(null);
          setDiscoveryChoice([drawn[0], drawn[1]]);
          return; // early return — the choice handler will give the item + return the other
        } else if (drawn.length === 1) {
          updatedState.items = [...(myState.items ?? []), drawn[0]];
          patch.player_states = { ...gs.player_states, [myPlayerId!]: updatedState };
          newLog.push(addLog("stat", `${playerName} discovered an item from Discovery`));
        }
      } else if (cardId === "ev-locked-door") {
        // Lock a random door on the current tile that connects to a neighbor
        const curTile = gs.placed_tiles.find(t => t.floor === myState.floor && t.x === myState.x && t.y === myState.y);
        const activeDoors = (["north","east","south","west"] as const).filter(dir => {
          if (!curTile?.doors[dir]) return false;
          const dx = dir === "east" ? 1 : dir === "west" ? -1 : 0;
          const dy = dir === "south" ? 1 : dir === "north" ? -1 : 0;
          return !!gs.placed_tiles.find(t => t.floor === myState.floor && t.x === myState.x + dx && t.y === myState.y + dy);
        });
        const chosenDir = activeDoors.length > 0
          ? activeDoors[Math.floor(Math.random() * activeDoors.length)]
          : null;
        if (chosenDir) {
          const lockKey = `${myState.floor},${myState.x},${myState.y},${chosenDir}`;
          patch.locked_doors = [...new Set([...(gs.locked_doors ?? []), lockKey])];
          newLog.push(addLog("system", `Locked Door: the ${chosenDir} exit of this room is sealed 🔒 (Might 4+ or Skeleton Key to open)`));
        } else {
          newLog.push(addLog("system", `Locked Door: no connected exits to seal in this room`));
        }
        patch.player_states = { ...gs.player_states, [myPlayerId!]: updatedState };
      } else {
        // Fallback: still persist drawn_tiles
        patch.player_states = { ...gs.player_states, [myPlayerId!]: updatedState };
      }
      patch.event_log = newLog.slice(-30);
    }

    setPendingCard(null);
    await updateGs(patch);
  }, [myState, myChar, gs, myPlayerId, players, addLog, updateGs, playSfx]);

  // ── Attack ────────────────────────────────────────────────────────────────
  const handleAttack = useCallback(async (targetId: string) => {
    if (!isMyTurn || !myState || gs.turn_phase !== "action" || gs.phase !== "haunt") return;
    const targetState = gs.player_states[targetId];
    if (!targetState || targetState.is_dead) return;

    // Roll Might dice — attacker gets weapon item bonuses, defender uses base Might
    const attackerRolls = rollDice(getAttackMight(myState));
    const defenderRolls = rollDice(Math.max(1, targetState.might));
    const attackTotal = attackerRolls.reduce((a, b) => a + b, 0);
    const defendTotal = defenderRolls.reduce((a, b) => a + b, 0);

    const attackerPlayer = players.find((p) => p.id === myPlayerId);
    const targetPlayer   = players.find((p) => p.id === targetId);

    let winner: "attacker" | "defender" | "tie" = "tie";
    let damage = 0;
    const newPlayerStates = { ...gs.player_states };

    const newLog2 = [...gs.event_log];
    if (attackTotal > defendTotal) {
      winner = "attacker";
      damage = attackTotal - defendTotal;
      // Axe: if attacker rolled 4+ total, deal +1 bonus damage
      if ((myState.items ?? []).includes("axe") && attackTotal >= 4) damage += 1;
      const newMight = Math.max(0, targetState.might - damage);
      let tps = { ...targetState, might: newMight, is_dead: isDead(newMight, targetState.sanity) };
      if (tps.is_dead) {
        const { state: saved, saved: didSave } = checkAmulet(tps);
        if (didSave) { tps = saved; newLog2.push(addLog("stat", `${players.find(p => p.id === targetId)?.name ?? targetId}'s Amulet saved them!`)); }
      }
      newPlayerStates[targetId] = tps;
      if (newPlayerStates[targetId].is_dead) playSfx("/audio/betrayal/sfx/scream.mp3");
      else playSfx("/audio/betrayal/sfx/stat-drop.mp3");
    } else if (defendTotal > attackTotal) {
      winner = "defender";
      damage = defendTotal - attackTotal;
      const newMight = Math.max(0, myState.might - damage);
      let mps = { ...myState, might: newMight, is_dead: isDead(newMight, myState.sanity) };
      if (mps.is_dead) {
        const { state: saved, saved: didSave } = checkAmulet(mps);
        if (didSave) { mps = saved; newLog2.push(addLog("stat", `${players.find(p => p.id === myPlayerId)?.name ?? "?"}'s Amulet saved them!`)); }
      }
      newPlayerStates[myPlayerId!] = mps;
      if (newPlayerStates[myPlayerId!].is_dead) playSfx("/audio/betrayal/sfx/scream.mp3");
      else playSfx("/audio/betrayal/sfx/stat-drop.mp3");
    } else {
      playSfx("/audio/betrayal/sfx/dice-roll.mp3");
    }

    // Sacrificial Dagger costs 1 Sanity every time it's used, win or lose
    if (myState.items?.includes("sacrificial-dagger")) {
      const base = newPlayerStates[myPlayerId!] ?? myState;
      const newSanity = Math.max(0, base.sanity - 1);
      let mps = { ...base, sanity: newSanity, is_dead: isDead(base.might, newSanity) };
      if (mps.is_dead) {
        const { state: saved, saved: didSave } = checkAmulet(mps);
        if (didSave) { mps = saved; newLog2.push(addLog("stat", `${players.find(p => p.id === myPlayerId)?.name ?? "?"}'s Amulet saved them!`)); }
      }
      newPlayerStates[myPlayerId!] = mps;
      newLog2.push(addLog("stat", `Sacrificial Dagger costs ${players.find(p => p.id === myPlayerId)?.name ?? "?"} 1 Sanity`));
    }

    const resultMsg =
      winner === "tie"
        ? `${attackerPlayer?.name} attacked ${targetPlayer?.name} — draw (${attackTotal} vs ${defendTotal})`
        : winner === "attacker"
        ? `${attackerPlayer?.name} hit ${targetPlayer?.name} for ${damage} Might${newPlayerStates[targetId].is_dead ? " — eliminated!" : ""}`
        : `${targetPlayer?.name} countered ${attackerPlayer?.name} for ${damage} Might${newPlayerStates[myPlayerId!]?.is_dead ? " — eliminated!" : ""}`;

    newLog2.push(addLog("stat", resultMsg));
    const combatPatch = { player_states: newPlayerStates, turn_phase: "done" as const, event_log: newLog2.slice(-30) };
    const autoWinner = checkWinCondition(newPlayerStates, gs.phase);
    if (autoWinner) {
      await supabase.from("sessions").update({ phase: "ended", game_state: { ...gs, ...combatPatch, winner: autoWinner, phase: "ended" } }).eq("code", code);
    } else {
      await updateGs(combatPatch);
    }

    setCombatResult({
      attackerName: attackerPlayer?.name ?? "?",
      targetName: targetPlayer?.name ?? "?",
      attackerRolls,
      defenderRolls,
      damage,
      winner,
    });
    setShowAttackTargets(false);
  }, [isMyTurn, myState, gs, myPlayerId, players, code, addLog, updateGs, playSfx]);

  // ── Revolver attack (ranged — same floor) ─────────────────────────────────
  const handleRevolverAttack = useCallback(async (targetId: string) => {
    if (!isMyTurn || !myState || gs.turn_phase !== "action" || gs.phase !== "haunt") return;
    const targetState = gs.player_states[targetId];
    if (!targetState || targetState.is_dead) return;

    const attackerRolls = rollDice(getAttackMight(myState));
    const defenderRolls = rollDice(Math.max(1, targetState.might));
    const atkSum = attackerRolls.reduce((a, b) => a + b, 0);
    const defSum = defenderRolls.reduce((a, b) => a + b, 0);

    let winner: "attacker" | "defender" | "tie" = "tie";
    let damage = 0;
    if (atkSum > defSum) { winner = "attacker"; damage = atkSum - defSum; }
    else if (defSum > atkSum) { winner = "defender"; damage = defSum - atkSum; }

    const newPlayerStates = { ...gs.player_states };
    const attackerPlayer = players.find(p => p.id === myPlayerId);
    const targetPlayer   = players.find(p => p.id === targetId);

    const revolverLog = [...gs.event_log];
    if (winner === "attacker") {
      const newMight = Math.max(0, targetState.might - damage);
      let tps = { ...targetState, might: newMight, is_dead: isDead(newMight, targetState.sanity) };
      if (tps.is_dead) {
        const { state: saved, saved: didSave } = checkAmulet(tps);
        if (didSave) { tps = saved; revolverLog.push(addLog("stat", `${targetPlayer?.name}'s Amulet saved them!`)); }
        else playSfx("/audio/betrayal/sfx/scream.mp3");
      }
      newPlayerStates[targetId] = tps;
    } else if (winner === "defender") {
      const newMight = Math.max(0, myState.might - damage);
      let mps = { ...myState, might: newMight, is_dead: isDead(newMight, myState.sanity) };
      if (mps.is_dead) {
        const { state: saved, saved: didSave } = checkAmulet(mps);
        if (didSave) { mps = saved; revolverLog.push(addLog("stat", `${attackerPlayer?.name}'s Amulet saved them!`)); }
        else playSfx("/audio/betrayal/sfx/scream.mp3");
      }
      newPlayerStates[myPlayerId!] = mps;
    }

    const resultMsg = winner === "tie"
      ? `${attackerPlayer?.name} missed ${targetPlayer?.name} with the Revolver`
      : winner === "attacker"
      ? `${attackerPlayer?.name} shot ${targetPlayer?.name} for ${damage} Might${newPlayerStates[targetId].is_dead ? " — eliminated!" : ""}`
      : `${targetPlayer?.name} evaded and countered ${attackerPlayer?.name} for ${damage} Might`;

    revolverLog.push(addLog("stat", resultMsg));
    const revolverPatch = { player_states: newPlayerStates, turn_phase: "done" as const, event_log: revolverLog.slice(-30) };
    const autoWinner = checkWinCondition(newPlayerStates, gs.phase);
    if (autoWinner) {
      await supabase.from("sessions").update({ phase: "ended", game_state: { ...gs, ...revolverPatch, winner: autoWinner, phase: "ended" } }).eq("code", code);
    } else {
      await updateGs(revolverPatch);
    }

    setCombatResult({ attackerName: attackerPlayer?.name ?? "?", targetName: targetPlayer?.name ?? "?", attackerRolls, defenderRolls, damage, winner });
    setShowRevolverTargets(false);
  }, [isMyTurn, myState, gs, myPlayerId, players, code, addLog, updateGs, playSfx]);

  // ── Rope attack (restrain target — they lose 1 Speed next turn) ───────────
  const handleRopeAttack = useCallback(async (targetId: string) => {
    if (!isMyTurn || !myState || gs.turn_phase !== "action" || gs.phase !== "haunt") return;
    if (!(myState.items ?? []).includes("rope")) return;
    const targetState = gs.player_states[targetId];
    if (!targetState || targetState.is_dead) return;

    const attackerRolls = rollDice(getAttackMight(myState));
    const defenderRolls = rollDice(Math.max(1, targetState.might));
    const atkTotal = attackerRolls.reduce((a, b) => a + b, 0);
    const defTotal = defenderRolls.reduce((a, b) => a + b, 0);

    const attackerPlayer = players.find(p => p.id === myPlayerId);
    const targetPlayer = players.find(p => p.id === targetId);

    let newRestrained = [...(gs.restrained_players ?? [])];
    let resultMsg: string;

    if (atkTotal > defTotal) {
      newRestrained = [...new Set([...newRestrained, targetId])];
      resultMsg = `${attackerPlayer?.name} restrained ${targetPlayer?.name} with Rope (${atkTotal} vs ${defTotal}) — they lose 1 Speed next turn`;
    } else {
      resultMsg = `${targetPlayer?.name} broke free from Rope (${atkTotal} vs ${defTotal})`;
    }
    playSfx("/audio/betrayal/sfx/dice-roll.mp3");

    const newLog = [...gs.event_log, addLog("stat", resultMsg)].slice(-30);
    await updateGs({ restrained_players: newRestrained, turn_phase: "done", event_log: newLog });
    setDiceResult({ values: [...attackerRolls, ...defenderRolls], label: resultMsg });
    setShowRopeTargets(false);
  }, [isMyTurn, myState, gs, myPlayerId, players, addLog, updateGs, playSfx]);

  // ── Dynamite (destroy a door, deal 2 Might to everyone in room) ───────────
  const handleDynamite = useCallback(async (dir: "north" | "east" | "south" | "west") => {
    if (!isMyTurn || !myState || !myPlayerId || gs.turn_phase !== "action") return;
    if (!(myState.items ?? []).includes("dynamite")) return;

    const lockKey = `${myState.floor},${myState.x},${myState.y},${dir}`;
    const newLocked = [...new Set([...(gs.locked_doors ?? []), lockKey])];
    const newPlayerStates = { ...gs.player_states };
    const playerName = players.find(p => p.id === myPlayerId)?.name ?? "?";
    const newLog = [...gs.event_log];

    // Damage all players in the same room (including self!)
    for (const [pid, ps] of Object.entries(newPlayerStates)) {
      if (ps.is_dead || ps.floor !== myState.floor || ps.x !== myState.x || ps.y !== myState.y) continue;
      const newMight = Math.max(0, ps.might - 2);
      let damaged = { ...ps, might: newMight, is_dead: isDead(newMight, ps.sanity) };
      if (damaged.is_dead) {
        const { state: saved, saved: didSave } = checkAmulet(damaged);
        if (didSave) { damaged = saved; newLog.push(addLog("stat", `${players.find(p => p.id === pid)?.name ?? pid}'s Amulet saved them!`)); }
      }
      newPlayerStates[pid] = damaged;
    }

    // Remove dynamite from my inventory
    newPlayerStates[myPlayerId] = {
      ...newPlayerStates[myPlayerId],
      items: (newPlayerStates[myPlayerId].items ?? []).filter(id => id !== "dynamite"),
    };

    newLog.push(addLog("stat", `${playerName} used Dynamite! ${dir} door destroyed 💥 — everyone in room took 2 Might damage`));
    playSfx("/audio/betrayal/sfx/stat-drop.mp3");

    await updateGs({ locked_doors: newLocked, player_states: newPlayerStates, turn_phase: "done", event_log: newLog.slice(-30) });
    setShowDynamiteTargets(false);
  }, [isMyTurn, myState, myPlayerId, gs, players, addLog, updateGs, playSfx]);

  // ── Haunt-specific actions ────────────────────────────────────────────────
  // Generic helper: roll and compare to threshold, updating game state accordingly.
  const handleHauntRoll = useCallback(async (
    statKey: "might" | "sanity" | "knowledge" | "speed",
    threshold: number,
    diceLabel: string,
    onSuccess: (patch: Partial<BetrayalGameState>, log: BetrayalGameState["event_log"]) => void,
    onFail?: (patch: Partial<BetrayalGameState>, log: BetrayalGameState["event_log"]) => void,
  ) => {
    if (!isMyTurn || !myState) return;
    const statValue = myState[statKey] ?? 1;
    const rolls = rollDice(Math.max(1, statValue));
    const total = rolls.reduce((a, b) => a + b, 0);
    const success = total >= threshold;
    const patch: Partial<BetrayalGameState> = {};
    const log = [...gs.event_log];
    if (success) onSuccess(patch, log);
    else if (onFail) onFail(patch, log);
    setDiceResult({ values: rolls, diceCount: Math.max(1, statValue), label: `${diceLabel} — rolled ${total} (need ${threshold}+) ${success ? "✅ Success!" : "❌ Failed"}` });
    if (Object.keys(patch).length > 0 || log.length !== gs.event_log.length) {
      patch.event_log = log.slice(-30);
      await updateGs(patch);
    }
  }, [isMyTurn, myState, gs, updateGs, setDiceResult]);

  // ── Haunt 1 / 16: Crypt Ritual ────────────────────────────────────────────
  // Haunt 1: heroes with Holy Symbol + Ancient Book roll Knowledge 5+ in Crypt → heroes win.
  // Haunt 16: hero with Holy Symbol rolls Knowledge 4+ in Crypt → resets traitor's ritual progress.
  const handleCryptRitual = useCallback(async () => {
    if (!isMyTurn || !myState || !myPlayerId) return;
    const playerName = players.find(p => p.id === myPlayerId)?.name ?? "?";
    const hn = gs.haunt_number;

    if (hn === 1) {
      // Need Holy Symbol + Ancient Book
      const hasItems = (myState.items ?? []).includes("holy-symbol") && (myState.items ?? []).includes("ancient-book");
      if (!hasItems) { alert("You need both the Holy Symbol and the Ancient Book."); return; }
      await handleHauntRoll("knowledge", 5, "Crypt Ritual (Knowledge 5+)",
        (patch, log) => {
          log.push(addLog("haunt", `${playerName} completed the ritual! The spirit is banished — Heroes Win!`));
          patch.winner = "heroes";
          patch.phase = "ended";
        },
        (_patch, log) => {
          log.push(addLog("stat", `${playerName} failed the ritual — try again next turn.`));
        },
      );
      if (gs.phase !== "ended") await updateGs({ turn_phase: "done" });
    } else if (hn === 16) {
      // Need Holy Symbol only
      if (!(myState.items ?? []).includes("holy-symbol")) { alert("You need the Holy Symbol."); return; }
      await handleHauntRoll("knowledge", 4, "Crypt Purification (Knowledge 4+)",
        (patch, log) => {
          const counters = { ...(gs.haunt_counters ?? {}) };
          counters.ritual_progress = 0;
          patch.haunt_counters = counters;
          log.push(addLog("stat", `${playerName} purified the Crypt — the traitor's ritual progress is reset!`));
        },
        (_patch, log) => {
          log.push(addLog("stat", `${playerName} failed to purify the Crypt.`));
        },
      );
      await updateGs({ turn_phase: "done" });
    }
  }, [isMyTurn, myState, myPlayerId, gs, players, addLog, updateGs, handleHauntRoll]);

  // ── Haunt 3: Parlor Ritual (destroy Black Candle) ──────────────────────────
  const handleParlorRitual = useCallback(async () => {
    if (!isMyTurn || !myState || !myPlayerId) return;
    if (!(myState.items ?? []).includes("holy-symbol")) { alert("You need the Holy Symbol."); return; }
    const playerName = players.find(p => p.id === myPlayerId)?.name ?? "?";
    // Might 4+ OR has Axe to destroy candle
    const hasAxe = (myState.items ?? []).includes("axe");
    await handleHauntRoll("might", hasAxe ? 1 : 4, `Destroy Black Candle (${hasAxe ? "Axe auto-succeeds" : "Might 4+"})`,
      (_patch, log) => {
        log.push(addLog("haunt", `${playerName} destroyed the Black Candle with the Holy Symbol! Heroes Win!`));
      },
      (_patch, log) => { log.push(addLog("stat", `${playerName} could not destroy the candle — try again.`)); },
    );
    await updateGs({ turn_phase: "done" });
  }, [isMyTurn, myState, myPlayerId, gs, players, addLog, updateGs, handleHauntRoll]);

  // ── Haunt 5: Tower Light Beacon ────────────────────────────────────────────
  const handleTowerBeacon = useCallback(async () => {
    if (!isMyTurn || !myState || !myPlayerId) return;
    const hasLight = (myState.items ?? []).some(id => id === "lantern" || id === "candle" || id === "omen-candle");
    if (!hasLight) { alert("You need a light source (Lantern or Candle)."); return; }
    const playerName = players.find(p => p.id === myPlayerId)?.name ?? "?";
    const newLog = [...gs.event_log, addLog("haunt", `${playerName} lit the beacon in the Tower! The darkness retreats — Heroes Win!`)].slice(-30);
    playSfx("/audio/betrayal/sfx/haunt-begin.mp3");
    await supabase.from("sessions").update({ phase: "ended", game_state: { ...gs, winner: "heroes", phase: "ended", event_log: newLog } }).eq("code", code);
  }, [isMyTurn, myState, myPlayerId, gs, players, addLog, code, playSfx]);

  // ── Haunt 7: Possess a hero ────────────────────────────────────────────────
  const handlePossessHero = useCallback(async (targetId: string) => {
    if (!isMyTurn || !myState || !myPlayerId || !myState.is_traitor) return;
    const targetPs = gs.player_states[targetId];
    if (!targetPs || targetPs.is_dead) return;
    // Amulet holder is immune
    if ((targetPs.items ?? []).includes("amulet")) {
      await updateGs({ event_log: [...gs.event_log, addLog("stat", `${players.find(p=>p.id===targetId)?.name ?? "?"} is protected by the Amulet — cannot be possessed!`)].slice(-30) });
      return;
    }
    const targetName = players.find(p => p.id === targetId)?.name ?? "?";
    const rolls = rollDice(Math.max(1, targetPs.sanity));
    const total = rolls.reduce((a, b) => a + b, 0);
    const resisted = total >= 4;
    const counters = { ...(gs.haunt_counters ?? {}) };
    const possessed = gs.possessed_heroes ?? {};
    const newLog = [...gs.event_log];

    if (resisted) {
      newLog.push(addLog("stat", `${targetName} resisted possession (Sanity roll ${total} ≥ 4)!`));
    } else {
      const prev = possessed[targetId] ?? 0;
      const next = prev + 1;
      if (next >= 2) {
        // Fully possessed → becomes traitor ally
        const newStates = { ...gs.player_states, [targetId]: { ...targetPs, is_traitor: true } };
        newLog.push(addLog("haunt", `${targetName} is fully possessed and joins the traitor!`));
        setDiceResult({ values: rolls, diceCount: Math.max(1, targetPs.sanity), label: `Possession — ${targetName} rolled ${total} < 4 → FULLY POSSESSED!` });
        await updateGs({ player_states: newStates, possessed_heroes: { ...possessed, [targetId]: next }, haunt_counters: counters, turn_phase: "done", event_log: newLog.slice(-30) });
        return;
      } else {
        newLog.push(addLog("stat", `${targetName} is partially possessed (${next}/2)! If possessed again, they join the traitor.`));
      }
      possessed[targetId] = next;
    }
    setDiceResult({ values: rolls, diceCount: Math.max(1, targetPs.sanity), label: `Possession attempt — ${targetName} rolled ${total} (need 4+ to resist)` });
    await updateGs({ possessed_heroes: possessed, haunt_counters: counters, turn_phase: "done", event_log: newLog.slice(-30) });
  }, [isMyTurn, myState, myPlayerId, gs, players, addLog, updateGs]);

  // ── Haunt 7: Amulet to Tower (hero win) ────────────────────────────────────
  const handleAmuletToTower = useCallback(async () => {
    if (!isMyTurn || !myState || !myPlayerId) return;
    if (!(myState.items ?? []).includes("amulet")) { alert("You need the Amulet."); return; }
    const playerName = players.find(p => p.id === myPlayerId)?.name ?? "?";
    const newLog = [...gs.event_log, addLog("haunt", `${playerName} brought the Amulet to the Tower — the spirit is sealed! Heroes Win!`)].slice(-30);
    playSfx("/audio/betrayal/sfx/haunt-begin.mp3");
    await supabase.from("sessions").update({ phase: "ended", game_state: { ...gs, winner: "heroes", phase: "ended", event_log: newLog } }).eq("code", code);
  }, [isMyTurn, myState, myPlayerId, gs, players, addLog, code, playSfx]);

  // ── Haunt 8: Vault Seal (Might 5+) ────────────────────────────────────────
  const handleVaultSeal = useCallback(async () => {
    if (!isMyTurn || !myState || !myPlayerId) return;
    const playerName = players.find(p => p.id === myPlayerId)?.name ?? "?";
    await handleHauntRoll("might", 5, "Seal the Vault (Might 5+)",
      (_patch, log) => {
        log.push(addLog("haunt", `${playerName} sealed the Vault — the flood is stopped! Heroes Win!`));
      },
      (_patch, log) => { log.push(addLog("stat", `${playerName} couldn't seal the Vault — not strong enough yet.`)); },
    );
    await updateGs({ turn_phase: "done" });
  }, [isMyTurn, myState, myPlayerId, gs, players, addLog, updateGs, handleHauntRoll]);

  // ── Haunt 10: Destroy Furnace (Traitor — Might 5+) ────────────────────────
  const handleFurnaceDestroy = useCallback(async () => {
    if (!isMyTurn || !myState || !myPlayerId || !myState.is_traitor) return;
    const playerName = players.find(p => p.id === myPlayerId)?.name ?? "?";
    await handleHauntRoll("might", 5, "Destroy the Furnace (Might 5+)",
      (_patch, log) => {
        log.push(addLog("haunt", `${playerName} destroyed the Furnace — darkness falls forever! Traitor Wins!`));
      },
      (_patch, log) => { log.push(addLog("stat", `${playerName} couldn't destroy the Furnace yet.`)); },
    );
    await updateGs({ turn_phase: "done" });
  }, [isMyTurn, myState, myPlayerId, gs, players, addLog, updateGs, handleHauntRoll]);

  // ── Haunt 11: Burn the Skull in Furnace (Might 4+) ───────────────────────
  const handleBurnSkull = useCallback(async () => {
    if (!isMyTurn || !myState || !myPlayerId) return;
    if (!(myState.items ?? []).includes("omen-skull")) { alert("You need the Skull."); return; }
    const playerName = players.find(p => p.id === myPlayerId)?.name ?? "?";
    await handleHauntRoll("might", 4, "Burn the Skull (Might 4+)",
      (patch, log) => {
        // Remove skull from inventory
        patch.player_states = { ...gs.player_states, [myPlayerId]: { ...myState, items: (myState.items ?? []).filter(id => id !== "omen-skull") } };
        log.push(addLog("haunt", `${playerName} burned the Skull in the Furnace — the traitor's power is broken! Now fight the traitor normally.`));
      },
      (_patch, log) => { log.push(addLog("stat", `${playerName} failed to destroy the Skull.`)); },
    );
    await updateGs({ turn_phase: "done" });
  }, [isMyTurn, myState, myPlayerId, gs, players, addLog, updateGs, handleHauntRoll]);

  // ── Haunt 13: Gallery Ritual (2 heroes + Knowledge 4+ same turn) ──────────
  const handleGalleryRitual = useCallback(async () => {
    if (!isMyTurn || !myState || !myPlayerId) return;
    // Count heroes on this tile
    const heroCopresentIds = gs.turn_order.filter(id => {
      if (id === myPlayerId) return false;
      const ps = gs.player_states[id];
      return ps && !ps.is_dead && !ps.is_traitor && ps.floor === myState.floor && ps.x === myState.x && ps.y === myState.y;
    });
    if (heroCopresentIds.length < 1) { alert("You need at least one other hero in the Gallery."); return; }
    const playerName = players.find(p => p.id === myPlayerId)?.name ?? "?";
    // Both me and a partner must roll Knowledge 4+
    const myRolls = rollDice(Math.max(1, myState.knowledge));
    const myTotal = myRolls.reduce((a, b) => a + b, 0);
    const partnerPs = gs.player_states[heroCopresentIds[0]];
    const partnerRolls = rollDice(Math.max(1, partnerPs.knowledge));
    const partnerTotal = partnerRolls.reduce((a, b) => a + b, 0);
    const partnerName = players.find(p => p.id === heroCopresentIds[0])?.name ?? "?";
    const success = myTotal >= 4 && partnerTotal >= 4;
    const newLog = [...gs.event_log];
    newLog.push(addLog("stat", `Gallery Ritual: ${playerName} rolled ${myTotal}, ${partnerName} rolled ${partnerTotal} (both need 4+) → ${success ? "✅ SUCCESS!" : "❌ Failed"}`));
    if (success) newLog.push(addLog("haunt", "The wedding portrait is destroyed — Heroes Win!"));
    setDiceResult({ values: [...myRolls, ...partnerRolls], label: `Gallery Ritual — ${playerName}: ${myTotal}, ${partnerName}: ${partnerTotal} (need 4+)` });
    const patch: Partial<BetrayalGameState> = { turn_phase: "done", event_log: newLog.slice(-30) };
    if (success) { patch.winner = "heroes"; patch.phase = "ended"; await supabase.from("sessions").update({ phase: "ended", game_state: { ...gs, ...patch } }).eq("code", code); }
    else await updateGs(patch);
  }, [isMyTurn, myState, myPlayerId, gs, players, addLog, updateGs, code]);

  // ── Haunt 16: Crypt traitor ritual tracking (host-side) ───────────────────
  // Tracked in handleEndTurn: if traitor starts turn in Crypt → increment ritual_progress

  // ── Haunt 17: Shatter Crystal Ball ────────────────────────────────────────
  // Two heroes in same room as crystal ball (omen-crystal-ball held by someone) + Knowledge 3+
  const handleShatterCrystalBall = useCallback(async () => {
    if (!isMyTurn || !myState || !myPlayerId) return;
    // Check: at least one other hero on same tile
    const allies = gs.turn_order.filter(id => {
      if (id === myPlayerId) return false;
      const ps = gs.player_states[id];
      return ps && !ps.is_dead && !ps.is_traitor && ps.floor === myState.floor && ps.x === myState.x && ps.y === myState.y;
    });
    if (allies.length < 1) { alert("You need at least one other hero in the same room."); return; }
    const playerName = players.find(p => p.id === myPlayerId)?.name ?? "?";
    const partnerName = players.find(p => p.id === allies[0])?.name ?? "?";
    const myRolls = rollDice(Math.max(1, myState.knowledge));
    const myTotal = myRolls.reduce((a, b) => a + b, 0);
    const partnerPs = gs.player_states[allies[0]];
    const partnerRolls = rollDice(Math.max(1, partnerPs.knowledge));
    const partnerTotal = partnerRolls.reduce((a, b) => a + b, 0);
    const success = myTotal >= 3 && partnerTotal >= 3;
    const newLog = [...gs.event_log];
    newLog.push(addLog("stat", `Shatter Crystal Ball: ${playerName}: ${myTotal}, ${partnerName}: ${partnerTotal} (both need 3+) → ${success ? "✅ SUCCESS!" : "❌ Failed"}`));
    if (success) newLog.push(addLog("haunt", "The Crystal Ball shatters — all curses lifted! Heroes Win!"));
    setDiceResult({ values: [...myRolls, ...partnerRolls], label: `Crystal Ball: ${playerName}: ${myTotal}, ${partnerName}: ${partnerTotal}` });
    const patch: Partial<BetrayalGameState> = { turn_phase: "done", event_log: newLog.slice(-30) };
    if (success) { patch.winner = "heroes"; patch.phase = "ended"; await supabase.from("sessions").update({ phase: "ended", game_state: { ...gs, ...patch } }).eq("code", code); }
    else await updateGs(patch);
  }, [isMyTurn, myState, myPlayerId, gs, players, addLog, updateGs, code]);

  // ── Haunt 19: Place ritual marker (Traitor) ────────────────────────────────
  const handlePlaceMarker = useCallback(async () => {
    if (!isMyTurn || !myState || !myPlayerId || !myState.is_traitor) return;
    const key = `marker_${myState.floor},${myState.x},${myState.y}`;
    const counters = { ...(gs.haunt_counters ?? {}) };
    if (counters[key]) { alert("A marker is already placed in this room."); return; }
    counters[key] = 1;
    const markerCount = Object.keys(counters).filter(k => k.startsWith("marker_")).length;
    const playerName = players.find(p => p.id === myPlayerId)?.name ?? "?";
    const newLog = [...gs.event_log, addLog("stat", `${playerName} placed a ritual marker (${markerCount}/4). ${markerCount >= 4 ? "The demon is summoned — Traitor Wins!" : ""}`)].slice(-30);
    if (markerCount >= 4) {
      await supabase.from("sessions").update({ phase: "ended", game_state: { ...gs, haunt_counters: counters, winner: "traitor", phase: "ended", turn_phase: "done", event_log: newLog } }).eq("code", code);
    } else {
      await updateGs({ haunt_counters: counters, turn_phase: "done", event_log: newLog });
    }
  }, [isMyTurn, myState, myPlayerId, gs, players, addLog, updateGs, code]);

  // ── Haunt 19: Destroy ritual marker (Hero — Sanity 4+) ────────────────────
  const handleDestroyMarker = useCallback(async () => {
    if (!isMyTurn || !myState || !myPlayerId) return;
    const key = `marker_${myState.floor},${myState.x},${myState.y}`;
    const counters = { ...(gs.haunt_counters ?? {}) };
    if (!counters[key]) { alert("There is no marker in this room."); return; }
    const playerName = players.find(p => p.id === myPlayerId)?.name ?? "?";
    // Holy Symbol auto-destroys
    const hasHolySymbol = (myState.items ?? []).includes("holy-symbol");
    if (hasHolySymbol) {
      delete counters[key];
      const newLog = [...gs.event_log, addLog("stat", `${playerName} destroyed the ritual marker with the Holy Symbol!`)].slice(-30);
      await updateGs({ haunt_counters: counters, turn_phase: "done", event_log: newLog });
      return;
    }
    await handleHauntRoll("sanity", 4, "Destroy Marker (Sanity 4+)",
      (patch, log) => {
        delete counters[key];
        patch.haunt_counters = counters;
        log.push(addLog("stat", `${playerName} destroyed the ritual marker!`));
      },
      (_patch, log) => { log.push(addLog("stat", `${playerName} failed to destroy the marker.`)); },
    );
    await updateGs({ turn_phase: "done" });
  }, [isMyTurn, myState, myPlayerId, gs, players, addLog, updateGs, handleHauntRoll]);

  // ── Haunt 21: Blood drain (Traitor free action) ────────────────────────────
  const handleBloodDrain = useCallback(async (targetId: string) => {
    if (!isMyTurn || !myState || !myPlayerId || !myState.is_traitor) return;
    const targetPs = gs.player_states[targetId];
    if (!targetPs || targetPs.is_dead) return;
    const newMight = Math.max(0, targetPs.might - 1);
    const counters = { ...(gs.haunt_counters ?? {}) };
    counters.blood_drained = (counters.blood_drained ?? 0) + 1;
    const targetName = players.find(p => p.id === targetId)?.name ?? "?";
    const newLog = [...gs.event_log, addLog("stat", `Blood drain: ${targetName} loses 1 Might (total drained: ${counters.blood_drained}/10)`)].slice(-30);
    const newStates = { ...gs.player_states, [targetId]: { ...targetPs, might: newMight, is_dead: isDead(newMight, targetPs.sanity) } };
    if (counters.blood_drained >= 10) {
      await supabase.from("sessions").update({ phase: "ended", game_state: { ...gs, player_states: newStates, haunt_counters: counters, winner: "traitor", phase: "ended", event_log: [...newLog, addLog("haunt", "The blood price is paid — Traitor Wins!")].slice(-30) } }).eq("code", code);
    } else {
      await updateGs({ player_states: newStates, haunt_counters: counters, event_log: newLog });
    }
  }, [isMyTurn, myState, myPlayerId, gs, players, addLog, updateGs, code]);

  // ── Haunt 21: Library counter-rite (Ancient Book + Knowledge 5+) ──────────
  const handleLibraryRite = useCallback(async () => {
    if (!isMyTurn || !myState || !myPlayerId) return;
    if (!(myState.items ?? []).includes("ancient-book")) { alert("You need the Ancient Book."); return; }
    const playerName = players.find(p => p.id === myPlayerId)?.name ?? "?";
    await handleHauntRoll("knowledge", 5, "Library Counter-Rite (Knowledge 5+)",
      (_patch, log) => { log.push(addLog("haunt", `${playerName} performed the counter-rite! The bargain is broken — Heroes Win!`)); },
      (_patch, log) => { log.push(addLog("stat", `${playerName} failed the counter-rite — not enough knowledge yet.`)); },
    );
    await updateGs({ turn_phase: "done" });
  }, [isMyTurn, myState, myPlayerId, gs, players, addLog, updateGs, handleHauntRoll]);

  // ── Haunt 23: Tower Lantern beacon tracking ────────────────────────────────
  // Tracked at end of each turn: if hero with Lantern starts turn in Tower → increment beacon_turns_<pid>
  // Button to manually confirm "I'm in the Tower with Lantern" (visual aid)

  // ── Haunt 25: Entrance Hall anchor (Lucky Coin + Knowledge 4+) ────────────
  const handleEntranceHallAnchor = useCallback(async () => {
    if (!isMyTurn || !myState || !myPlayerId) return;
    if (!(myState.items ?? []).includes("lucky-coin")) { alert("You need the Lucky Coin."); return; }
    const playerName = players.find(p => p.id === myPlayerId)?.name ?? "?";
    await handleHauntRoll("knowledge", 4, "Anchor the Mansion (Knowledge 4+)",
      (_patch, log) => { log.push(addLog("haunt", `${playerName} stabilised the convergence! The mansion holds — Heroes Win!`)); },
      (_patch, log) => { log.push(addLog("stat", `${playerName} failed to anchor the mansion.`)); },
    );
    await updateGs({ turn_phase: "done" });
  }, [isMyTurn, myState, myPlayerId, gs, players, addLog, updateGs, handleHauntRoll]);

  // ── Haunt 24: Create antidote (Healing Salve + Holy Symbol + Knowledge 4+) ─
  const handleCreateAntidote = useCallback(async () => {
    if (!isMyTurn || !myState || !myPlayerId) return;
    const items = myState.items ?? [];
    if (!items.includes("healing-salve") || !items.includes("holy-symbol")) {
      alert("You need both the Healing Salve and the Holy Symbol."); return;
    }
    const playerName = players.find(p => p.id === myPlayerId)?.name ?? "?";
    await handleHauntRoll("knowledge", 4, "Create Antidote (Knowledge 4+)",
      (patch, log) => {
        const counters = { ...(gs.haunt_counters ?? {}) };
        counters[`antidote_holder`] = 1;
        patch.haunt_counters = counters;
        // Consume Healing Salve
        patch.player_states = { ...gs.player_states, [myPlayerId]: { ...myState, items: items.filter(id => id !== "healing-salve") } };
        log.push(addLog("stat", `${playerName} created the antidote! Now share a room with infected heroes to cure them.`));
      },
      (_patch, log) => { log.push(addLog("stat", `${playerName} failed to create the antidote.`)); },
    );
    await updateGs({ turn_phase: "done" });
  }, [isMyTurn, myState, myPlayerId, gs, players, addLog, updateGs, handleHauntRoll]);

  // ── Haunt 24: Distribute antidote ─────────────────────────────────────────
  const handleDistributeAntidote = useCallback(async () => {
    if (!isMyTurn || !myState || !myPlayerId) return;
    const counters = { ...(gs.haunt_counters ?? {}) };
    if (!counters["antidote_holder"]) { alert("No antidote has been created yet."); return; }
    // Find infected heroes in same room
    const infected = gs.turn_order.filter(id => {
      if (id === myPlayerId) return false;
      const ps = gs.player_states[id];
      return ps && !ps.is_dead && counters[`infected_${id}`] && ps.floor === myState.floor && ps.x === myState.x && ps.y === myState.y;
    });
    if (infected.length === 0) { alert("No infected heroes in this room."); return; }
    const newStates = { ...gs.player_states };
    const cured: string[] = [];
    for (const id of infected) {
      delete counters[`infected_${id}`];
      cured.push(players.find(p => p.id === id)?.name ?? id);
    }
    const playerName = players.find(p => p.id === myPlayerId)?.name ?? "?";
    const newLog = [...gs.event_log, addLog("stat", `${playerName} cured: ${cured.join(", ")} of the plague!`)].slice(-30);
    await updateGs({ player_states: newStates, haunt_counters: counters, event_log: newLog });
  }, [isMyTurn, myState, myPlayerId, gs, players, addLog, updateGs]);

  // ── [State] Possession target picker ─────────────────────────────────────
  const [showPossessionTargets, setShowPossessionTargets] = useState(false);
  const [showBloodDrainTargets, setShowBloodDrainTargets] = useState(false);

  // Possession targets: heroes in same room as traitor
  const possessionTargets = useMemo(() => {
    if (gs.phase !== "haunt" || !myState?.is_traitor || gs.turn_phase !== "action") return [];
    return players.filter(p => {
      if (p.id === myPlayerId) return false;
      const ps = gs.player_states[p.id];
      return ps && !ps.is_dead && !ps.is_traitor && ps.floor === myState.floor && ps.x === myState.x && ps.y === myState.y;
    });
  }, [gs, myState, myPlayerId, players]);

  // Blood drain targets: heroes in same room as traitor
  const bloodDrainTargets = useMemo(() => {
    if (gs.phase !== "haunt" || !myState?.is_traitor || gs.turn_phase !== "action") return [];
    return players.filter(p => {
      if (p.id === myPlayerId) return false;
      const ps = gs.player_states[p.id];
      return ps && !ps.is_dead && !ps.is_traitor && ps.floor === myState.floor && ps.x === myState.x && ps.y === myState.y;
    });
  }, [gs, myState, myPlayerId, players]);

  // ── End turn ──────────────────────────────────────────────────────────────
  const handleEndTurn = useCallback(async () => {
    if (!isMyTurn) return;
    // Advance index, skipping eliminated players
    let nextIndex = (gs.current_turn_index + 1) % gs.turn_order.length;
    let attempts = 0;
    while (
      gs.player_states[gs.turn_order[nextIndex]]?.is_dead &&
      attempts < gs.turn_order.length
    ) {
      nextIndex = (nextIndex + 1) % gs.turn_order.length;
      attempts++;
    }
    // Clear restraint + chill for the player ending their turn (both last 1 turn)
    const currentId = gs.turn_order[gs.current_turn_index];
    const newRestrained = (gs.restrained_players ?? []).filter(id => id !== currentId);
    const newChilled    = (gs.chilled_players   ?? []).filter(id => id !== currentId);

    // Monster movement + damage (host-only, haunt phase)
    let newMonsters = gs.monsters ?? [];
    let newPlayerStates = { ...gs.player_states };
    const monsterLog: typeof gs.event_log = [];

    // Monster moves once per full round (when turn wraps back to player 0)
    const completedRound = nextIndex <= gs.current_turn_index;

    if (isHost && gs.phase === "haunt" && newMonsters.length > 0 && completedRound) {
      // Heroes the monster can target (alive, not traitor, no Holy Symbol protection)
      const heroIds = gs.turn_order.filter(id => {
        const ps = gs.player_states[id];
        return ps && !ps.is_dead && !ps.is_traitor;
      });
      // Heroes protected by Holy Symbol — monster cannot enter their tile
      const protectedIds = new Set(heroIds.filter(id => (gs.player_states[id]?.items ?? []).includes("holy-symbol")));
      const targetableHeroes = heroIds.filter(id => !protectedIds.has(id));

      let monsterMoved = false;
      newMonsters = newMonsters.map(monster => {
        let nearest: { id: string; ps: PlayerGameState } | null = null;
        let nearestDist = Infinity;
        for (const hid of targetableHeroes) {
          const ps = gs.player_states[hid];
          if (!ps) continue;
          const dist = Math.abs(ps.x - monster.x) + Math.abs(ps.y - monster.y) + (ps.floor !== monster.floor ? 10 : 0);
          if (dist < nearestDist) { nearestDist = dist; nearest = { id: hid, ps }; }
        }
        if (!nearest) return monster;

        const path = findPath(
          gs.placed_tiles,
          monster.floor, monster.x, monster.y,
          nearest.ps.floor, nearest.ps.x, nearest.ps.y,
          gs.locked_doors ?? [],
        );
        if (!path || path.length === 0) return monster;
        const next = path[0];
        monsterMoved = true;
        return { ...monster, floor: next.floor, x: next.x, y: next.y };
      });

      if (monsterMoved) {
        playSfx("/audio/betrayal/sfx/monster-stomp.mp3");
        monsterLog.push(addLog("system", "☠ Something heavy moves in the dark..."));
      }

      // Deal damage to unprotected heroes sharing a tile with the monster
      for (const monster of newMonsters) {
        for (const hid of heroIds) {
          if (protectedIds.has(hid)) continue;
          const ps = newPlayerStates[hid];
          if (!ps || ps.is_dead) continue;
          if (ps.floor === monster.floor && ps.x === monster.x && ps.y === monster.y) {
            const char = getCharacter(ps.character_id);
            const newMight = Math.max(0, ps.might - 1);
            newPlayerStates[hid] = { ...ps, might: newMight };
            const heroName = players.find(p => p.id === hid)?.name ?? "?";
            monsterLog.push(addLog("stat", `☠ ${monster.name} attacks ${heroName}! -1 Might (now ${newMight}/${char?.mightMax ?? "?"})`));
            if (newMight <= 0) {
              let dps = { ...newPlayerStates[hid], is_dead: true };
              const { state: amuletSaved, saved: didSave } = checkAmulet(dps);
              if (didSave) {
                dps = amuletSaved;
                monsterLog.push(addLog("stat", `${heroName}'s Amulet saved them from the creature!`));
              } else {
                monsterLog.push(addLog("death", `${heroName} was killed by the creature!`));
              }
              newPlayerStates[hid] = dps;
            }
          }
        }
      }
    }

    let newCounters = { ...(gs.haunt_counters ?? {}) };
    let hauntAutoLog: typeof gs.event_log = [];
    let hauntAutoPatch: Partial<BetrayalGameState> = {};

    // ── Per-round haunt auto-effects (host runs these once per full round) ────
    if (isHost && gs.phase === "haunt" && completedRound) {
      newCounters.round = (newCounters.round ?? 0) + 1;
      const round = newCounters.round;
      const hn = gs.haunt_number;

      // Haunt 2: traitor lock counter — track turns elapsed (heroes lose if no one escapes in 10)
      // Haunt 4: traitor heals 1 Might per round
      if (hn === 4) {
        const traitorId = gs.traitor_id;
        if (traitorId && newPlayerStates[traitorId] && !newPlayerStates[traitorId].is_dead) {
          const traitorPs = newPlayerStates[traitorId];
          const traitorChar = getCharacter(traitorPs.character_id);
          const healed = Math.min(traitorPs.might + 1, traitorChar?.mightMax ?? 8);
          newPlayerStates[traitorId] = { ...traitorPs, might: healed };
          hauntAutoLog.push(addLog("stat", `☠ The Monster Within heals: Traitor regenerates 1 Might (now ${healed})`));
        }
      }

      // Haunt 9: heroes win at round 8 if traitor hasn't won yet
      if (hn === 9 && round >= 8) {
        hauntAutoLog.push(addLog("haunt", `Round ${round}: Heroes survived Blood Banquet for 8 rounds — Heroes Win!`));
        hauntAutoPatch.winner = "heroes";
        hauntAutoPatch.phase = "ended";
      }

      // Haunt 10: heroes win at round 10 if furnace not destroyed
      if (hn === 10 && round >= 10) {
        hauntAutoLog.push(addLog("haunt", `Round ${round}: Heroes guarded the Furnace for 10 rounds — Heroes Win!`));
        hauntAutoPatch.winner = "heroes";
        hauntAutoPatch.phase = "ended";
      }

      // Haunt 15: heroes win at round 10
      if (hn === 15 && round >= 10) {
        hauntAutoLog.push(addLog("haunt", `Round ${round}: Dawn breaks — heroes survived the Nightmare! Heroes Win!`));
        hauntAutoPatch.winner = "heroes";
        hauntAutoPatch.phase = "ended";
      }

      // Haunt 15: sanity drain for traitor's room (traitor applies Sanity drain)
      if (hn === 15) {
        const traitorId = gs.traitor_id;
        if (traitorId && newPlayerStates[traitorId]) {
          const tps = newPlayerStates[traitorId];
          for (const [pid, ps] of Object.entries(newPlayerStates)) {
            if (ps.is_dead || ps.is_traitor || (ps.items ?? []).includes("holy-symbol")) continue;
            if (ps.floor === tps.floor && ps.x === tps.x && ps.y === tps.y) {
              const newSanity = Math.max(0, ps.sanity - 1);
              newPlayerStates[pid] = { ...ps, sanity: newSanity, is_dead: isDead(ps.might, newSanity) };
              hauntAutoLog.push(addLog("stat", `Nightmare: ${players.find(p => p.id === pid)?.name ?? pid} loses 1 Sanity in the traitor's presence`));
            }
          }
        }
      }

      // Haunt 22: Kitchen/Dining Room drain
      if (hn === 22) {
        const drainTiles = gs.placed_tiles.filter(t => t.tile_id === "kitchen" || t.tile_id === "dining-room");
        for (const [pid, ps] of Object.entries(newPlayerStates)) {
          if (ps.is_dead || ps.is_traitor) continue;
          if (drainTiles.some(t => t.floor === ps.floor && t.x === ps.x && t.y === ps.y)) {
            const newMight = Math.max(0, ps.might - 1);
            newPlayerStates[pid] = { ...ps, might: newMight, is_dead: isDead(newMight, ps.sanity) };
            hauntAutoLog.push(addLog("stat", `The Feast: ${players.find(p => p.id === pid)?.name ?? pid} loses 1 Might in the Kitchen/Dining Room`));
          }
        }
      }

      // Haunt 23: Tower Lantern beacon tracking
      if (hn === 23) {
        const towerTiles = gs.placed_tiles.filter(t => t.tile_id === "tower");
        for (const [pid, ps] of Object.entries(newPlayerStates)) {
          if (ps.is_dead || ps.is_traitor) continue;
          const hasLantern = (ps.items ?? []).some(id => id === "lantern" || id === "candle" || id === "omen-candle");
          if (!hasLantern) { delete newCounters[`beacon_turns_${pid}`]; continue; }
          const onTower = towerTiles.some(t => t.floor === ps.floor && t.x === ps.x && t.y === ps.y);
          if (onTower) {
            newCounters[`beacon_turns_${pid}`] = (newCounters[`beacon_turns_${pid}`] ?? 0) + 1;
            hauntAutoLog.push(addLog("stat", `${players.find(p=>p.id===pid)?.name ?? pid} holds the beacon in the Tower (${newCounters[`beacon_turns_${pid}`]}/2 turns)`));
            if (newCounters[`beacon_turns_${pid}`] >= 2) {
              hauntAutoLog.push(addLog("haunt", "The beacon drives away the drowned child — Heroes Win!"));
              hauntAutoPatch.winner = "heroes";
              hauntAutoPatch.phase = "ended";
            }
          } else {
            newCounters[`beacon_turns_${pid}`] = 0; // reset if they leave
          }
        }
      }

      // Haunt 16: Traitor ritual progress (if traitor is in Crypt)
      if (hn === 16) {
        const traitorId = gs.traitor_id;
        if (traitorId && newPlayerStates[traitorId]) {
          const tps = newPlayerStates[traitorId];
          const onCrypt = gs.placed_tiles.some(t => t.tile_id === "crypt" && t.floor === tps.floor && t.x === tps.x && t.y === tps.y);
          if (onCrypt) {
            newCounters.ritual_progress = (newCounters.ritual_progress ?? 0) + 1;
            hauntAutoLog.push(addLog("stat", `Ritual progress: traitor in Crypt (${newCounters.ritual_progress}/2 turns required)`));
            if (newCounters.ritual_progress >= 2) {
              hauntAutoLog.push(addLog("haunt", "The Resurrection ritual is complete — Traitor Wins!"));
              hauntAutoPatch.winner = "traitor";
              hauntAutoPatch.phase = "ended";
            }
          }
        }
      }

      // Haunt 8: Flood — basement heroes take damage after turn 4
      if (hn === 8) {
        newCounters.flood_turn = (newCounters.flood_turn ?? 0) + 1;
        if (newCounters.flood_turn > 4) {
          const basementHeroes = Object.entries(newPlayerStates).filter(([, ps]) => ps.floor === 0 && !ps.is_dead && !ps.is_traitor);
          for (const [pid, ps] of basementHeroes) {
            const newMight = Math.max(0, ps.might - 3);
            newPlayerStates[pid] = { ...ps, might: newMight, is_dead: isDead(newMight, ps.sanity) };
            hauntAutoLog.push(addLog("stat", `Flood: ${players.find(p => p.id === pid)?.name ?? pid} takes 3 Might damage in the flooded basement!`));
          }
        }
      }

      // Haunt 24: Infection spread (infected heroes in same room infect others for 1 turn)
      if (hn === 24) {
        const infectedIds = Object.keys(newCounters).filter(k => k.startsWith("infected_")).map(k => k.replace("infected_", ""));
        for (const infId of infectedIds) {
          const infPs = newPlayerStates[infId];
          if (!infPs || infPs.is_dead) continue;
          // Sanity drain for infected heroes
          const newSanity = Math.max(0, infPs.sanity - 1);
          newPlayerStates[infId] = { ...infPs, sanity: newSanity, is_dead: isDead(infPs.might, newSanity) };
          hauntAutoLog.push(addLog("stat", `Plague: ${players.find(p => p.id === infId)?.name ?? infId} loses 1 Sanity from infection`));
          // Spread to adjacent players
          for (const [pid, ps] of Object.entries(newPlayerStates)) {
            if (pid === infId || ps.is_dead || newCounters[`infected_${pid}`]) continue;
            if (ps.floor === infPs.floor && ps.x === infPs.x && ps.y === infPs.y) {
              newCounters[`infected_${pid}`] = 1;
              hauntAutoLog.push(addLog("stat", `Plague spreads: ${players.find(p => p.id === pid)?.name ?? pid} is now infected!`));
            }
          }
        }
      }
    }

    // ── Haunt 4: traitor gets +2 Might bonus on their turn (tracked via UI) ───
    // Handled in haunt guide text — not a state change

    const newLog = [...gs.event_log, ...monsterLog, ...hauntAutoLog].slice(-30);
    const endTurnPatch: Partial<BetrayalGameState> = {
      current_turn_index: nextIndex,
      turn_phase: "move" as const,
      moves_used: 0,
      restrained_players: newRestrained,
      chilled_players: newChilled,
      monsters: newMonsters,
      haunt_counters: newCounters,
      ...(monsterLog.length > 0 || hauntAutoLog.length > 0 ? { player_states: newPlayerStates, event_log: newLog } : {}),
    };

    // Check win conditions after auto-effects
    const autoWinner = hauntAutoPatch.winner ?? (
      (monsterLog.length > 0 || hauntAutoLog.length > 0) ? checkWinCondition(newPlayerStates, gs.phase) : null
    );
    if (autoWinner || hauntAutoPatch.phase === "ended") {
      await supabase.from("sessions").update({ phase: "ended", game_state: { ...gs, ...endTurnPatch, ...hauntAutoPatch, winner: autoWinner ?? hauntAutoPatch.winner, phase: "ended", event_log: newLog } }).eq("code", code);
      return;
    }
    await updateGs(endTurnPatch);
  }, [isMyTurn, isHost, gs, players, code, updateGs, addLog, playSfx]);

  // ── Use item (consumables) ────────────────────────────────────────────────
  const handleUseItem = useCallback(async (itemId: string) => {
    if (!isMyTurn || !myState || !myPlayerId) return;
    const char = myChar;
    if (!char) return;
    let updatedState = { ...myState };
    const newItems = myState.items.filter((id) => id !== itemId);
    updatedState.items = newItems;
    const playerName = players.find(p => p.id === myPlayerId)?.name ?? "?";
    const newLog = [...gs.event_log];

    if (itemId === "healing-salve") {
      const newMight = Math.min(char.mightMax, myState.might + 2);
      updatedState.might = newMight;
      newLog.push(addLog("stat", `${playerName} used Healing Salve (+2 Might)`));
      await updateGs({ player_states: { ...gs.player_states, [myPlayerId]: updatedState }, event_log: newLog.slice(-30) });
    } else if (itemId === "smelling-salts") {
      // Show target picker — "a player in your room" (card text); includes self
      const roomMates = players.filter(p => {
        const ps = gs.player_states[p.id];
        return ps && !ps.is_dead && ps.floor === myState.floor && ps.x === myState.x && ps.y === myState.y;
      });
      if (roomMates.length <= 1) {
        // Only self in the room — heal self immediately
        const newSanity = Math.min(char.sanityMax, myState.sanity + 2);
        updatedState.sanity = newSanity;
        newLog.push(addLog("stat", `${playerName} used Smelling Salts on themselves (+2 Sanity)`));
        await updateGs({ player_states: { ...gs.player_states, [myPlayerId]: updatedState }, event_log: newLog.slice(-30) });
      } else {
        // Let the player pick a target; consume the item now
        await updateGs({ player_states: { ...gs.player_states, [myPlayerId]: updatedState }, event_log: newLog.slice(-30) });
        setSmellingSaltsTarget(roomMates.map(p => p.id));
      }
      return;
    }
  }, [isMyTurn, myState, myPlayerId, myChar, players, gs, addLog, updateGs]);

  // ── Smelling Salts target heal ────────────────────────────────────────────
  const handleSmellingSaltsHeal = useCallback(async (targetId: string) => {
    const targetPs = gs.player_states[targetId];
    const targetChar = getCharacter(targetPs?.character_id ?? "");
    if (!targetPs || !targetChar) return;
    const playerName = players.find(p => p.id === myPlayerId)?.name ?? "?";
    const targetName = players.find(p => p.id === targetId)?.name ?? "?";
    const newSanity = Math.min(targetChar.sanityMax, targetPs.sanity + 2);
    const newLog = [...gs.event_log,
      addLog("stat", `${playerName} used Smelling Salts on ${targetName} (+2 Sanity)`),
    ].slice(-30);
    await updateGs({
      player_states: { ...gs.player_states, [targetId]: { ...targetPs, sanity: newSanity } },
      event_log: newLog,
    });
    setSmellingSaltsTarget(null);
    playSfx("/audio/betrayal/sfx/item-pickup.mp3");
  }, [gs, myPlayerId, players, addLog, updateGs, playSfx]);

  // ── Discovery pick (ev-discovery: keep 1, return 1 to deck bottom) ───────
  const handleDiscoveryPick = useCallback(async (keptId: string, returnedId: string) => {
    if (!myState || !myPlayerId) return;
    const playerName = players.find(p => p.id === myPlayerId)?.name ?? "?";
    const newItems = [...(myState.items ?? []), keptId];
    // returnedId goes back to the bottom of the item deck (not discard)
    const newItemDeck = [...gs.item_deck, returnedId];
    const newLog = [...gs.event_log,
      addLog("stat", `${playerName} kept ${getCard(keptId)?.name} and returned ${getCard(returnedId)?.name} to the deck`),
    ].slice(-30);
    await updateGs({
      player_states: { ...gs.player_states, [myPlayerId]: { ...myState, items: newItems } },
      item_deck: newItemDeck,
      event_log: newLog,
    });
    setDiscoveryChoice(null);
    playSfx("/audio/betrayal/sfx/item-pickup.mp3");
  }, [myState, myPlayerId, players, gs, addLog, updateGs, playSfx]);

  // ── Declare winner ────────────────────────────────────────────────────────
  const handleDeclareWinner = useCallback(async (winner: "heroes" | "traitor") => {
    await supabase.from("sessions").update({ phase: "ended", game_state: { ...gs, winner, phase: "ended" } }).eq("code", code);
  }, [gs, code]);

  // ─── Render ───────────────────────────────────────────────────────────────

  // Victory screen — shown when session or game phase is ended
  if (dbSession.phase === "ended" || gs.winner) {
    return <VictoryScreen gs={gs} players={players} myPlayerId={myPlayerId} />;
  }

  const myObjective = gs.haunt_objectives
    ? myState?.is_traitor
      ? gs.haunt_objectives.traitor
      : gs.haunt_objectives.heroes
    : null;

  const showHauntReveal = gs.phase === "haunt" && !hauntDismissed && gs.haunt_number != null;

  return (
    <div className="min-h-screen lg:h-screen flex flex-col lg:overflow-hidden" style={{ background: "#0a0708" }}>
      {/* Inject stat-flash keyframes once */}
      <style>{STAT_FLASH_STYLE}</style>

      {/* Haunt reveal overlay */}
      {showHauntReveal && gs.haunt_objectives && (
        <HauntReveal
          hauntName={`Haunt #${gs.haunt_number}`}
          isTraitor={!!myState?.is_traitor}
          objective={myState?.is_traitor ? gs.haunt_objectives.traitor : gs.haunt_objectives.heroes}
          onDismiss={() => setHauntDismissed(true)}
        />
      )}

      {/* Item card viewer (tap item chip to inspect) */}
      {viewingItemCard && (
        <CardOverlay cardId={viewingItemCard} lang={lang} onDismiss={() => setViewingItemCard(null)} startRevealed />
      )}

      {/* Death popup */}
      {showDeathPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.85)" }}>
          <div className="max-w-xs w-full mx-4 rounded-2xl p-6 text-center space-y-4"
            style={{ background: "rgba(10,4,4,0.98)", border: "1px solid rgba(239,68,68,0.4)" }}>
            <div className="text-5xl">💀</div>
            <h2 className="text-2xl font-black" style={{ color: "#ef4444", fontFamily: "var(--font-gothic)" }}>You Have Died</h2>
            <p className="text-sm" style={{ color: "#7a6a5a" }}>Your character has been eliminated from the mansion.</p>
            <button
              onClick={async () => {
                setShowDeathPopup(false);
                if (isMyTurn) await handleEndTurn();
              }}
              className="w-full py-3 rounded-xl text-sm font-bold"
              style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)", color: "#ef4444", fontFamily: "var(--font-gothic)" }}>
              {isMyTurn ? "End Turn" : "Dismiss"}
            </button>
          </div>
        </div>
      )}

      {/* Card overlay */}
      {pendingCard && <CardOverlay cardId={pendingCard} lang={lang} onDismiss={() => {
        const card = getCard(pendingCard);
        if (card) handleDrawCard(pendingCard, card.type as "item" | "omen" | "event");
        else setPendingCard(null);
      }} />}

      {/* Dice overlay */}
      {diceResult && (
        <DiceOverlay
          values={diceResult.values}
          label={diceResult.label}
          onDismiss={() => setDiceResult(null)}
          rerollFn={(diceResult.diceCount && isMyTurn && (myState?.items ?? []).includes("lucky-coin")) ? () => {
            // consume Lucky Coin
            const newItems = (myState?.items ?? []).filter(id => id !== "lucky-coin");
            updateGs({ player_states: { ...gs.player_states, [myPlayerId!]: { ...myState!, items: newItems } } });
            return rollDice(diceResult.diceCount!);
          } : undefined}
        />
      )}

      {/* Combat result overlay */}
      {combatResult && <CombatOverlay result={combatResult} onDismiss={() => setCombatResult(null)} />}

      {/* Win confirmation modal */}
      {confirmWinnerRole && (() => {
        const scenario = getHaunt(gs.haunt_number ?? -1);
        const isTraitor = confirmWinnerRole === "traitor";
        const accent = isTraitor ? "#ef4444" : "#22c55e";
        const winObj  = isTraitor ? scenario?.traitorObjective : scenario?.heroObjective;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.88)" }}>
            <div className="max-w-sm w-full rounded-2xl p-6 space-y-4" style={{ background: "rgba(8,5,12,0.99)", border: `1px solid ${accent}50` }}>
              <h2 className="text-xl font-black text-center" style={{ color: accent, fontFamily: "var(--font-gothic)" }}>
                {isTraitor ? "⚔ Declare Traitor Victory?" : "🕯 Declare Heroes Win?"}
              </h2>
              {scenario && (
                <div className="rounded-xl p-3 text-xs space-y-1" style={{ background: `${accent}0d`, border: `1px solid ${accent}30` }}>
                  <p className="font-bold uppercase tracking-widest" style={{ color: accent, fontSize: 9 }}>Haunt #{gs.haunt_number} — {scenario.name}</p>
                  <p style={{ color: "#c8b89a" }}>{winObj}</p>
                </div>
              )}
              <p className="text-xs text-center" style={{ color: "#7a6a5a" }}>
                {lang === "th"
                  ? "ทุกคนเห็นด้วยว่าเงื่อนไขชนะสำเร็จแล้วหรือไม่?"
                  : "Has everyone agreed the win condition has been met?"}
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button onClick={() => setConfirmWinnerRole(null)}
                  className="py-2.5 rounded-xl text-sm font-bold"
                  style={{ background: "rgba(90,74,58,0.2)", border: "1px solid rgba(90,74,58,0.4)", color: "#7a6a5a" }}>
                  {lang === "th" ? "ยังไม่ถึงเวลา" : "Not yet"}
                </button>
                <button onClick={() => { handleDeclareWinner(confirmWinnerRole); setConfirmWinnerRole(null); }}
                  className="py-2.5 rounded-xl text-sm font-bold"
                  style={{ background: `${accent}22`, border: `1px solid ${accent}60`, color: accent, fontFamily: "var(--font-gothic)" }}>
                  {lang === "th" ? "ยืนยัน!" : "Confirm!"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Discovery choice overlay — pick 1 item to keep, the other returns to deck */}
      {discoveryChoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.85)" }}>
          <div className="max-w-sm w-full rounded-2xl p-6 space-y-4" style={{ background: "rgba(8,5,12,0.98)", border: "1px solid rgba(99,102,241,0.4)" }}>
            <h2 className="text-lg font-black text-center" style={{ color: "#e8d5b0", fontFamily: "var(--font-gothic)" }}>
              {lang === "th" ? "เลือก 1 ไอเทมที่จะเก็บ" : "Discovery — Choose 1 Item to Keep"}
            </h2>
            <p className="text-xs text-center" style={{ color: "#7a6a5a" }}>
              {lang === "th" ? "อีกชิ้นจะถูกคืนไปที่ก้นสำรับ" : "The other will be returned to the bottom of the deck."}
            </p>
            <div className="grid grid-cols-2 gap-3">
              {discoveryChoice.map((cid, i) => {
                const c = getCard(cid);
                const other = discoveryChoice[1 - i];
                return (
                  <button key={cid} onClick={() => handleDiscoveryPick(cid, other)}
                    className="flex flex-col items-center gap-2 rounded-xl p-4 transition-all"
                    style={{ background: "rgba(212,175,55,0.08)", border: "1px solid rgba(212,175,55,0.3)" }}>
                    <span className="text-3xl">📦</span>
                    <span className="text-sm font-bold text-center" style={{ color: "#e8d5b0" }}>{lang === "th" && c?.nameTh ? c.nameTh : c?.name}</span>
                    <span className="text-xs text-center" style={{ color: "#7a6a5a" }}>{lang === "th" && c?.descriptionTh ? c.descriptionTh : c?.description}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Smelling Salts target picker */}
      {smellingSaltsTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.85)" }}>
          <div className="max-w-xs w-full rounded-2xl p-6 space-y-4" style={{ background: "rgba(8,5,12,0.98)", border: "1px solid rgba(168,85,247,0.4)" }}>
            <h2 className="text-lg font-black text-center" style={{ color: "#e8d5b0", fontFamily: "var(--font-gothic)" }}>
              {lang === "th" ? "เลือกผู้เล่นที่จะฟื้นฟูจิตใจ" : "Smelling Salts — Choose Target"}
            </h2>
            <div className="space-y-2">
              {smellingSaltsTarget.map(pid => {
                const p = players.find(x => x.id === pid);
                const ps = gs.player_states[pid];
                const ch = getCharacter(ps?.character_id ?? "");
                return (
                  <button key={pid} onClick={() => handleSmellingSaltsHeal(pid)}
                    className="w-full flex items-center gap-3 rounded-xl px-4 py-3 transition-all"
                    style={{ background: "rgba(168,85,247,0.1)", border: "1px solid rgba(168,85,247,0.3)" }}>
                    <span className="font-bold text-sm" style={{ color: "#e8d5b0" }}>{p?.name ?? pid}</span>
                    <span className="text-xs ml-auto" style={{ color: "#a855f7" }}>◈{ps?.sanity}/{ch?.sanityMax}</span>
                  </button>
                );
              })}
            </div>
            <button onClick={() => setSmellingSaltsTarget(null)} className="w-full py-2 rounded-xl text-xs" style={{ color: "#5a4a3a" }}>
              {lang === "th" ? "ยกเลิก" : "Cancel"}
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="sticky top-0 z-20 flex-shrink-0" style={{ background: "rgba(10,7,8,0.97)", backdropFilter: "blur(8px)", borderBottom: "1px solid rgba(212,175,55,0.12)" }}>
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs" style={{ color: "#5a4a3a" }}>Betrayal at House on the Hill</p>
            <p className="text-sm font-bold truncate" style={{ color: "#e8d5b0", fontFamily: "var(--font-gothic)" }}>
              {gs.phase === "haunt" ? `⚔ Haunt #${gs.haunt_number}` : "🕯 Exploring..."}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Omen count */}
            <div className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs"
              style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)" }}>
              <span style={{ color: "#ef4444" }}>☠</span>
              <span style={{ color: "#c8b89a" }}>{gs.omen_count}</span>
            </div>
            {/* Round counter — only during haunt */}
            {gs.phase === "haunt" && (gs.haunt_counters?.round ?? 0) > 0 && (
              <div className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs"
                style={{ background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)" }}>
                <span style={{ color: "#818cf8" }}>⏳</span>
                <span style={{ color: "#c8b89a" }}>R{gs.haunt_counters?.round ?? 0}</span>
              </div>
            )}
            {/* Current turn */}
            <div className="px-2 py-1 rounded-lg text-xs font-bold"
              style={{
                background: isBotTurn ? "rgba(99,102,241,0.10)" : isMyTurn ? "rgba(212,175,55,0.18)" : "rgba(212,175,55,0.06)",
                border: `1px solid ${isBotTurn ? "rgba(99,102,241,0.3)" : isMyTurn ? "rgba(212,175,55,0.55)" : "rgba(212,175,55,0.15)"}`,
                color: isBotTurn ? "#818cf8" : isMyTurn ? "#d4af37" : "#5a4a3a",
                animation: isMyTurn && !isBotTurn ? "yourTurnPulse 2s ease-in-out infinite" : undefined,
                boxShadow: isMyTurn && !isBotTurn ? "0 0 10px rgba(212,175,55,0.25)" : undefined,
              }}>
              {isBotTurn
                ? `🤖 ${currentPlayer?.name ?? "Bot"} thinking…`
                : isMyTurn
                ? "✨ Your turn"
                : `${currentPlayer?.name ?? "?"}'s turn`}
            </div>
            {/* Mute toggle */}
            <button
              onClick={toggleMute}
              className="px-2 py-1 rounded-lg text-xs"
              style={{ background: "rgba(212,175,55,0.08)", border: "1px solid rgba(212,175,55,0.15)", color: "#7a6a5a", opacity: muted ? 0.5 : 1 }}
              title={muted ? "Unmute" : "Mute"}
            >
              {muted ? "🔇" : "🔊"}
            </button>
            {/* Language toggle */}
            <button
              onClick={() => setLang(lang === "en" ? "th" : "en")}
              className="px-2 py-1 rounded-lg text-xs"
              style={{ background: "rgba(212,175,55,0.08)", border: "1px solid rgba(212,175,55,0.15)" }}
            >
              <span style={{ color: lang === "en" ? "#d4af37" : "#5a4a3a" }}>EN</span>
              <span style={{ color: "#3a2a1a" }}> / </span>
              <span style={{ color: lang === "th" ? "#d4af37" : "#5a4a3a" }}>TH</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Split layout: map | sidebar ───────────────────────────────────── */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">

        {/* ── Map column ─────────────────────────────────────────────────── */}
        <div className="flex-1 min-h-0 flex flex-col gap-2 p-3 overflow-hidden">

          {/* Objective banner (haunt phase) */}
          {gs.phase === "haunt" && myObjective && hauntDismissed && (
            <div className="flex-shrink-0 px-3 py-2 rounded-lg text-xs" style={{
              background: myState?.is_traitor ? "rgba(239,68,68,0.08)" : "rgba(212,175,55,0.06)",
              border: `1px solid ${myState?.is_traitor ? "rgba(239,68,68,0.2)" : "rgba(212,175,55,0.15)"}`,
              color: myState?.is_traitor ? "#ef4444" : "#c8a84a",
            }}>
              <span className="font-bold">{myState?.is_traitor ? "⚔ Your Objective: " : "🕯 Heroes' Objective: "}</span>
              {myObjective}
            </div>
          )}

          {/* Map — fills remaining column height on desktop */}
          <MansionMap
            gs={gs} players={players} myPlayerId={myPlayerId}
            myState={myState} isMyTurn={isMyTurn}
            onMove={handleMove} onRevealTile={handleRevealTile}
            animPos={animPos}
          />
        </div>

        {/* ── Sidebar ────────────────────────────────────────────────────── */}
        <aside
          className="flex-shrink-0 lg:w-80 xl:w-96 flex flex-col gap-3 p-3 overflow-y-auto border-t lg:border-t-0 lg:border-l max-h-[48vh] lg:max-h-none"
          style={{ borderColor: "rgba(212,175,55,0.08)" }}
        >
          {/* Haunt scenario guide — collapsible */}
          {gs.phase === "haunt" && gs.haunt_number != null && (() => {
            const scenario = getHaunt(gs.haunt_number);
            if (!scenario) return null;
            const isTraitor = myState?.is_traitor ?? false;
            const accent = isTraitor ? "#ef4444" : "#22c55e";
            const bg     = isTraitor ? "rgba(239,68,68,0.06)" : "rgba(34,197,94,0.06)";
            const border = isTraitor ? "rgba(239,68,68,0.2)" : "rgba(34,197,94,0.18)";
            const powers = isTraitor ? scenario.traitorPowers : scenario.heroPowers;
            const objective = isTraitor ? scenario.traitorObjective : scenario.heroObjective;

            // ── Map/item status checker ─────────────────────────────────────
            // Scan all objectives + powers text for known rooms and items
            const allText = [scenario.heroObjective, scenario.traitorObjective, ...(scenario.heroPowers ?? []), ...(scenario.traitorPowers ?? [])].join(" ");

            const ROOM_KEYWORDS: { label: string; tileId: string; floor: 0|1|2 }[] = [
              { label: "Crypt",        tileId: "crypt",            floor: 0 },
              { label: "Dungeon",      tileId: "dungeon",          floor: 0 },
              { label: "Vault",        tileId: "vault",            floor: 0 },
              { label: "Underground Lake", tileId: "underground-lake", floor: 0 },
              { label: "Furnace Room", tileId: "furnace-room",     floor: 0 },
              { label: "Wine Cellar",  tileId: "wine-cellar",      floor: 0 },
              { label: "Garden",       tileId: "garden",           floor: 1 },
              { label: "Parlor",       tileId: "parlor",           floor: 1 },
              { label: "Library",      tileId: "library",          floor: 1 },
              { label: "Ballroom",     tileId: "ballroom",         floor: 1 },
              { label: "Kitchen",      tileId: "kitchen",          floor: 1 },
              { label: "Dining Room",  tileId: "dining-room",      floor: 1 },
              { label: "Tower",        tileId: "tower",            floor: 2 },
              { label: "Gallery",      tileId: "gallery",          floor: 2 },
              { label: "Study",        tileId: "study",            floor: 2 },
              { label: "Entrance Hall",tileId: "entrance-hall",    floor: 1 },
            ];

            const ITEM_KEYWORDS: { label: string; itemId: string }[] = [
              { label: "Holy Symbol",   itemId: "holy-symbol" },
              { label: "Ancient Book",  itemId: "ancient-book" },
              { label: "Amulet",        itemId: "amulet" },
              { label: "Lantern",       itemId: "lantern" },
              { label: "Lucky Coin",    itemId: "lucky-coin" },
              { label: "Healing Salve", itemId: "healing-salve" },
              { label: "Rope",          itemId: "rope" },
              { label: "Skeleton Key",  itemId: "omen-key" },
              { label: "Skull",         itemId: "omen-skull" },
              { label: "Axe",           itemId: "axe" },
              { label: "Candle",        itemId: "candle" },
            ];

            const mentionedRooms = ROOM_KEYWORDS.filter(r => allText.includes(r.label));
            const mentionedItems = ITEM_KEYWORDS.filter(i => allText.includes(i.label));

            const placedTileIds = new Set(gs.placed_tiles.map(t => t.tile_id));

            const getRoomStatus = (tileId: string, floor: 0|1|2) => {
              if (placedTileIds.has(tileId)) return { icon: "✅", text: "on map", color: "#22c55e" };
              const inPool = (gs.remaining_tiles[floor] ?? []).includes(tileId);
              if (inPool) return { icon: "🗺", text: "not yet explored", color: "#f59e0b" };
              return { icon: "❌", text: "not available", color: "#ef4444" };
            };

            const getItemStatus = (itemId: string) => {
              // Check if it's an omen (starts with "omen-")
              if (itemId.startsWith("omen-")) {
                const inDeck = gs.omen_deck.includes(itemId);
                const inDiscard = gs.omen_discard.includes(itemId);
                if (inDeck) return { icon: "🃏", text: "in omen deck", color: "#f59e0b" };
                if (inDiscard) return { icon: "✅", text: "already drawn", color: "#22c55e" };
                return { icon: "❓", text: "unknown", color: "#7a6a5a" };
              }
              // Regular item
              const inDeck = gs.item_deck.includes(itemId);
              const holders: string[] = [];
              for (const [pid, ps] of Object.entries(gs.player_states)) {
                if ((ps.items ?? []).includes(itemId)) {
                  const pName = players.find(p => p.id === pid)?.name ?? pid;
                  holders.push(ps.is_traitor ? `${pName}(⚔)` : pName);
                }
              }
              if (holders.length > 0) return { icon: "🎒", text: `held by ${holders.join(", ")}`, color: holders.some(h => h.includes("⚔")) ? "#ef4444" : "#22c55e" };
              if (inDeck) return { icon: "🃏", text: "in item deck", color: "#f59e0b" };
              return { icon: "❌", text: "not available", color: "#ef4444" };
            };

            const hasStatusItems = mentionedRooms.length > 0 || mentionedItems.length > 0;

            return (
              <div className="flex-shrink-0 rounded-xl overflow-hidden text-xs" style={{ border: `1px solid ${border}` }}>
                {/* Toggle header */}
                <button
                  onClick={() => setShowHauntGuide(v => !v)}
                  className="w-full flex items-center justify-between px-3 py-2.5"
                  style={{ background: bg }}>
                  <span className="font-black uppercase tracking-widest" style={{ color: accent, fontFamily: "var(--font-gothic)" }}>
                    {isTraitor ? "⚔" : "🕯"} Haunt #{gs.haunt_number} — {scenario.name}
                  </span>
                  <span style={{ color: accent, fontSize: 10 }}>{showHauntGuide ? "▲" : "▼"}</span>
                </button>
                {showHauntGuide && <div className="px-3 pb-3 space-y-2" style={{ background: bg }}>
                {/* Show MY objective prominently */}
                <div className="rounded-lg p-2" style={{ background: `${accent}12`, border: `1px solid ${accent}30` }}>
                  <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: accent, fontSize: 9 }}>
                    {isTraitor ? "⚔ Your Goal (Traitor)" : "🕯 Your Goal (Heroes)"}
                  </p>
                  <p style={{ color: "#c8b89a" }}>{objective}</p>
                </div>
                {/* Show OTHER side's objective so everyone understands the game */}
                <div className="rounded-lg p-2" style={{ background: "rgba(90,74,58,0.12)", border: "1px solid rgba(90,74,58,0.2)" }}>
                  <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "#7a6a5a", fontSize: 9 }}>
                    {isTraitor ? "🕯 Heroes' Goal" : "⚔ Traitor's Goal"}
                  </p>
                  <p style={{ color: "#5a4a3a" }}>{isTraitor ? scenario.heroObjective : scenario.traitorObjective}</p>
                </div>
                {powers && powers.length > 0 && (
                  <ul className="space-y-1 pl-2">
                    {powers.map((p, i) => (
                      <li key={i} style={{ color: "#7a6a5a" }}>• {p}</li>
                    ))}
                  </ul>
                )}
                {/* Live status check for required rooms and items */}
                {hasStatusItems && (
                  <div className="mt-2 pt-2 space-y-1" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                    <p className="font-bold uppercase tracking-widest" style={{ color: "#5a4a3a", fontSize: 9 }}>Scenario status</p>
                    {mentionedRooms.map(r => {
                      const s = getRoomStatus(r.tileId, r.floor);
                      return (
                        <div key={r.tileId} className="flex items-center gap-1.5">
                          <span>{s.icon}</span>
                          <span style={{ color: "#7a6a5a" }}>{r.label}:</span>
                          <span style={{ color: s.color }}>{s.text}</span>
                        </div>
                      );
                    })}
                    {mentionedItems.map(it => {
                      const s = getItemStatus(it.itemId);
                      return (
                        <div key={it.itemId} className="flex items-center gap-1.5">
                          <span>{s.icon}</span>
                          <span style={{ color: "#7a6a5a" }}>{it.label}:</span>
                          <span style={{ color: s.color }}>{s.text}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
                {/* Haunt counter status (round, progress, markers, etc.) */}
                {(() => {
                  const counters = gs.haunt_counters ?? {};
                  const hn = gs.haunt_number;
                  const rows: React.ReactNode[] = [];

                  if ((counters.round ?? 0) > 0) {
                    const roundLimit = hn === 9 ? 8 : hn === 10 ? 10 : hn === 15 ? 10 : hn === 22 ? 8 : null;
                    rows.push(
                      <div key="round" className="flex items-center gap-1.5">
                        <span>⏳</span>
                        <span style={{ color: "#7a6a5a" }}>Rounds elapsed:</span>
                        <span style={{ color: "#c8b89a" }}>{counters.round}{roundLimit ? `/${roundLimit}` : ""}</span>
                      </div>
                    );
                  }
                  if (counters.ritual_progress) {
                    rows.push(<div key="ritual" className="flex items-center gap-1.5"><span>🕯</span><span style={{ color: "#7a6a5a" }}>Traitor Crypt ritual:</span><span style={{ color: "#f59e0b" }}>{counters.ritual_progress}/2 turns</span></div>);
                  }
                  if (counters.blood_drained) {
                    rows.push(<div key="blood" className="flex items-center gap-1.5"><span>🩸</span><span style={{ color: "#7a6a5a" }}>Blood drained:</span><span style={{ color: "#ef4444" }}>{counters.blood_drained}/10 Might</span></div>);
                  }
                  const markerCount = Object.keys(counters).filter(k => k.startsWith("marker_")).length;
                  if (markerCount > 0) {
                    rows.push(<div key="markers" className="flex items-center gap-1.5"><span>🕯</span><span style={{ color: "#7a6a5a" }}>Ritual markers:</span><span style={{ color: "#f59e0b" }}>{markerCount}/4 placed</span></div>);
                  }
                  const infectedIds = Object.keys(counters).filter(k => k.startsWith("infected_"));
                  if (infectedIds.length > 0) {
                    const names = infectedIds.map(k => players.find(p => p.id === k.replace("infected_",""))?.name ?? k.replace("infected_","")).join(", ");
                    rows.push(<div key="infected" className="flex items-center gap-1.5"><span>🦠</span><span style={{ color: "#7a6a5a" }}>Infected:</span><span style={{ color: "#ef4444" }}>{names}</span></div>);
                  }
                  if (counters["antidote_holder"]) {
                    rows.push(<div key="antidote" className="flex items-center gap-1.5"><span>💉</span><span style={{ color: "#22c55e" }}>Antidote created!</span></div>);
                  }
                  if (rows.length === 0) return null;
                  return (
                    <div className="mt-2 pt-2 space-y-1" style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                      <p className="font-bold uppercase tracking-widest" style={{ color: "#5a4a3a", fontSize: 9 }}>Haunt progress</p>
                      {rows}
                    </div>
                  );
                })()}
                </div>}
              </div>
            );
          })()}

          {/* Monster tracker — always visible during haunt so players know where it is */}
          {gs.phase === "haunt" && (gs.monsters ?? []).length > 0 && (() => {
            const FLOOR_LABEL = { 0: "Basement", 1: "Ground Floor", 2: "Upper Floor" };
            return (
              <div className="flex-shrink-0 rounded-xl p-2.5 space-y-1.5" style={{ background: "rgba(127,29,29,0.18)", border: "1px solid rgba(239,68,68,0.3)" }}>
                <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "#ef4444", fontFamily: "var(--font-gothic)", fontSize: 9 }}>
                  ☠ Monster Location
                </p>
                {gs.monsters.map((m, i) => {
                  const onMyFloor = myState ? m.floor === myState.floor : false;
                  const nearestHero = (() => {
                    let best: string | null = null, bestDist = Infinity;
                    for (const [pid, ps] of Object.entries(gs.player_states)) {
                      if (ps.is_dead || ps.is_traitor) continue;
                      const d = Math.abs(ps.x - m.x) + Math.abs(ps.y - m.y) + (ps.floor !== m.floor ? 10 : 0);
                      if (d < bestDist) { bestDist = d; best = pid; }
                    }
                    return best ? players.find(p => p.id === best)?.name ?? "?" : null;
                  })();
                  return (
                    <div key={i} className="flex items-center gap-2">
                      <div className="relative w-7 h-7 rounded-full overflow-hidden flex-shrink-0"
                        style={{ border: "1.5px solid #ef4444", boxShadow: "0 0 6px rgba(239,68,68,0.6)" }}>
                        <NextImage src={m.image} alt={m.name} fill sizes="28px" className="object-cover" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold leading-none" style={{ color: "#fca5a5" }}>{m.name}</p>
                        <p className="text-xs leading-snug" style={{ color: onMyFloor ? "#ef4444" : "#7a6a5a" }}>
                          {FLOOR_LABEL[m.floor as 0|1|2]}{onMyFloor ? " 👁 (your floor)" : ""}
                        </p>
                        {nearestHero && <p className="text-xs" style={{ color: "#5a4a3a" }}>Hunting: {nearestHero}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* Phase indicator */}
          <div className="flex-shrink-0 flex items-center justify-between">
            <span className="text-xs tracking-widest uppercase" style={{ color: "#5a4a3a", fontFamily: "var(--font-gothic)" }}>
              {gs.phase === "haunt" ? `Haunt #${gs.haunt_number}` : "Explore Phase"}
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full" style={{
              background: gs.turn_phase === "move" ? "rgba(59,130,246,0.15)" : gs.turn_phase === "action" ? "rgba(239,68,68,0.12)" : "rgba(212,175,55,0.08)",
              color: gs.turn_phase === "move" ? "#3b82f6" : gs.turn_phase === "action" ? "#ef4444" : "#7a6a5a",
              border: `1px solid ${gs.turn_phase === "move" ? "rgba(59,130,246,0.25)" : gs.turn_phase === "action" ? "rgba(239,68,68,0.2)" : "rgba(212,175,55,0.1)"}`,
            }}>
              {isMyTurn ? (gs.turn_phase === "move" ? "Move" : gs.turn_phase === "action" ? "Action" : "Done") : `${currentPlayer?.name ?? "?"}'s turn`}
            </span>
          </div>

          {/* Victory declaration — visible to any player during haunt */}
          {gs.phase === "haunt" && myState && (
            <div className="flex-shrink-0 flex gap-2">
              {myState.is_traitor ? (
                <button onClick={() => setConfirmWinnerRole("traitor")}
                  className="btn-betrayal flex-1 py-3 min-h-[44px] rounded-xl text-sm font-bold"
                  style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)", color: "#ef4444", fontFamily: "var(--font-gothic)" }}>
                  ⚔ Declare Traitor Victory
                </button>
              ) : (
                <button onClick={() => setConfirmWinnerRole("heroes")}
                  className="btn-betrayal flex-1 py-3 min-h-[44px] rounded-xl text-sm font-bold"
                  style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)", color: "#22c55e", fontFamily: "var(--font-gothic)" }}>
                  🕯 Declare Heroes Win
                </button>
              )}
            </div>
          )}

          {/* Action bar */}
          {isMyTurn && (
            <div className="flex-shrink-0 flex flex-col gap-2">
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={handleEndTurn}
                  className="btn-betrayal flex-1 py-3 min-h-[44px] rounded-xl text-sm font-bold"
                  style={{ background: "rgba(212,175,55,0.1)", border: "1px solid rgba(212,175,55,0.3)", color: "#d4af37", fontFamily: "var(--font-gothic)" }}>
                  End Turn
                </button>

                {/* Haunt move phase: let player voluntarily switch to action without exhausting all moves */}
                {gs.phase === "haunt" && gs.turn_phase === "move" && (
                  <button
                    disabled={!canAttack}
                    onClick={async () => { await updateGs({ turn_phase: "action" }); }}
                    className="btn-betrayal flex-1 py-3 min-h-[44px] rounded-xl text-sm font-bold"
                    style={{
                      background: canAttack ? "rgba(239,68,68,0.08)" : "rgba(100,100,100,0.05)",
                      border: `1px solid ${canAttack ? "rgba(239,68,68,0.25)" : "rgba(100,100,100,0.2)"}`,
                      color: canAttack ? "#ef4444" : "#555",
                      fontFamily: "var(--font-gothic)",
                      cursor: canAttack ? "pointer" : "not-allowed",
                      opacity: canAttack ? 1 : 0.5,
                    }}>
                    ⚔ Take Action
                  </button>
                )}

                {gs.phase === "haunt" && gs.turn_phase === "action" && validAttackTargets.length > 0 && !showAttackTargets && !showRevolverTargets && (
                  <button onClick={() => setShowAttackTargets(true)}
                    className="btn-betrayal flex-1 py-3 min-h-[44px] rounded-xl text-sm font-bold"
                    style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.35)", color: "#ef4444", fontFamily: "var(--font-gothic)" }}>
                    ⚔ Attack
                  </button>
                )}
                {gs.phase === "haunt" && gs.turn_phase === "action" && revolverTargets.length > 0 && !showAttackTargets && !showRevolverTargets && (
                  <button onClick={() => setShowRevolverTargets(true)}
                    className="btn-betrayal flex-1 py-3 min-h-[44px] rounded-xl text-sm font-bold"
                    style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.35)", color: "#f97316", fontFamily: "var(--font-gothic)" }}>
                    🔫 Revolver
                  </button>
                )}
                {/* Garden escape — only for haunts where Garden is an escape route */}
                {gs.phase === "haunt" && isMyTurn && !myState?.is_traitor && gs.turn_phase === "action" && (() => {
                  const scenario = getHaunt(gs.haunt_number ?? -1);
                  const gardenRelevant = scenario && (
                    scenario.heroObjective.includes("Garden") ||
                    (scenario.heroPowers ?? []).some(p => p.includes("Garden"))
                  );
                  if (!gardenRelevant) return null;
                  const onGarden = myState && gs.placed_tiles.find(t =>
                    t.tile_id === "garden" && t.floor === myState.floor && t.x === myState.x && t.y === myState.y
                  );
                  if (!onGarden) return null;
                  return (
                    <button
                      onClick={() => {
                        const rolls = rollDice(Math.max(1, myState!.speed));
                        const total = rolls.reduce((a, b) => a + b, 0);
                        setDiceResult({ values: rolls, diceCount: Math.max(1, myState!.speed), label: total >= 4
                          ? `🏃 Garden Escape — ${total} ≥ 4! You escaped! Declare Heroes Win if all needed heroes are out.`
                          : `🏃 Garden Escape — ${total} < 4. Not fast enough — try again next turn.` });
                      }}
                      className="btn-betrayal flex-1 py-3 min-h-[44px] rounded-xl text-sm font-bold"
                      style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)", color: "#22c55e", fontFamily: "var(--font-gothic)" }}>
                      🏃 Garden Escape (Speed 4+)
                    </button>
                  );
                })()}
                {/* Vault escape — haunt #4: Might 4+ to break out through the Vault */}
                {gs.phase === "haunt" && isMyTurn && !myState?.is_traitor && gs.turn_phase === "action" && gs.haunt_number === 4 && (() => {
                  const onVault = myState && gs.placed_tiles.find(t =>
                    t.tile_id === "vault" && t.floor === myState.floor && t.x === myState.x && t.y === myState.y
                  );
                  if (!onVault) return null;
                  return (
                    <button
                      onClick={() => {
                        const rolls = rollDice(Math.max(1, myState!.might));
                        const total = rolls.reduce((a, b) => a + b, 0);
                        setDiceResult({ values: rolls, diceCount: Math.max(1, myState!.might), label: total >= 4
                          ? `💪 Vault Break — ${total} ≥ 4! You broke through! Declare Heroes Win if 3 heroes have escaped.`
                          : `💪 Vault Break — ${total} < 4. Not strong enough — try again next turn.` });
                      }}
                      className="btn-betrayal flex-1 py-3 min-h-[44px] rounded-xl text-sm font-bold"
                      style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)", color: "#22c55e", fontFamily: "var(--font-gothic)" }}>
                      💪 Vault Break (Might 4+)
                    </button>
                  );
                })()}
                {/* Rope attack — restrain a target in same room */}
                {gs.phase === "haunt" && gs.turn_phase === "action" && (myState?.items ?? []).includes("rope") && validAttackTargets.length > 0 && !showRopeTargets && !showAttackTargets && !showRevolverTargets && !showDynamiteTargets && (
                  <button onClick={() => setShowRopeTargets(true)}
                    className="btn-betrayal flex-1 py-3 min-h-[44px] rounded-xl text-sm font-bold"
                    style={{ background: "rgba(245,158,11,0.12)", border: "1px solid rgba(245,158,11,0.35)", color: "#f59e0b", fontFamily: "var(--font-gothic)" }}>
                    🪢 Rope
                  </button>
                )}
                {/* Dynamite — destroy a door in this room */}
                {gs.phase === "haunt" && gs.turn_phase === "action" && (myState?.items ?? []).includes("dynamite") && !showDynamiteTargets && !showAttackTargets && !showRevolverTargets && !showRopeTargets && (() => {
                  const curTile = myState && gs.placed_tiles.find(t => t.tile_id !== undefined && t.floor === myState.floor && t.x === myState.x && t.y === myState.y);
                  if (!curTile) return null;
                  const availableDoors = (["north","east","south","west"] as const).filter(dir => {
                    if (!curTile.doors[dir]) return false;
                    const dx = dir === "east" ? 1 : dir === "west" ? -1 : 0;
                    const dy = dir === "south" ? 1 : dir === "north" ? -1 : 0;
                    return !!gs.placed_tiles.find(t => t.floor === myState!.floor && t.x === myState!.x + dx && t.y === myState!.y + dy);
                  });
                  if (availableDoors.length === 0) return null;
                  return (
                    <button onClick={() => setShowDynamiteTargets(true)}
                      className="btn-betrayal flex-1 py-3 min-h-[44px] rounded-xl text-sm font-bold"
                      style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.35)", color: "#ef4444", fontFamily: "var(--font-gothic)" }}>
                      💣 Dynamite
                    </button>
                  );
                })()}
              </div>

              {showAttackTargets && (
                <div className="rounded-xl p-3 space-y-2"
                  style={{ background: "rgba(13,8,8,0.95)", border: "1px solid rgba(239,68,68,0.25)" }}>
                  <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "#ef4444", fontFamily: "var(--font-gothic)" }}>
                    ⚔ Choose target
                  </p>
                  {validAttackTargets.map((target) => {
                    const tState = gs.player_states[target.id];
                    const tChar = tState ? getCharacter(tState.character_id) : null;
                    return (
                      <button key={target.id}
                        onClick={() => handleAttack(target.id)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left"
                        style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)", color: "#e8d5b0" }}>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold" style={{ fontFamily: "var(--font-gothic)" }}>{target.name}</p>
                          {tChar && <p className="text-xs" style={{ color: "#7a6a5a" }}>{tChar.name} · Might {tState?.might ?? "?"}</p>}
                        </div>
                        <span className="text-sm flex-shrink-0" style={{ color: "#ef4444" }}>Roll →</span>
                      </button>
                    );
                  })}
                  <button onClick={() => setShowAttackTargets(false)}
                    className="w-full py-1.5 rounded-lg text-xs" style={{ color: "#5a4a3a" }}>
                    Cancel
                  </button>
                </div>
              )}

              {showRevolverTargets && (
                <div className="rounded-xl p-3 space-y-2"
                  style={{ background: "rgba(13,8,8,0.95)", border: "1px solid rgba(249,115,22,0.25)" }}>
                  <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "#f97316", fontFamily: "var(--font-gothic)" }}>
                    🔫 Shoot target (same floor)
                  </p>
                  {revolverTargets.map((target) => {
                    const tState = gs.player_states[target.id];
                    const tChar = tState ? getCharacter(tState.character_id) : null;
                    return (
                      <button key={target.id}
                        onClick={() => handleRevolverAttack(target.id)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left"
                        style={{ background: "rgba(249,115,22,0.07)", border: "1px solid rgba(249,115,22,0.2)", color: "#e8d5b0" }}>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold" style={{ fontFamily: "var(--font-gothic)" }}>{target.name}</p>
                          {tChar && <p className="text-xs" style={{ color: "#7a6a5a" }}>{tChar.name} · Might {tState?.might ?? "?"}</p>}
                        </div>
                        <span className="text-sm flex-shrink-0" style={{ color: "#f97316" }}>Shoot →</span>
                      </button>
                    );
                  })}
                  <button onClick={() => setShowRevolverTargets(false)}
                    className="w-full py-1.5 rounded-lg text-xs" style={{ color: "#5a4a3a" }}>
                    Cancel
                  </button>
                </div>
              )}

              {showRopeTargets && (
                <div className="rounded-xl p-3 space-y-2"
                  style={{ background: "rgba(13,8,8,0.95)", border: "1px solid rgba(245,158,11,0.25)" }}>
                  <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "#f59e0b", fontFamily: "var(--font-gothic)" }}>
                    🪢 Restrain target (Might roll)
                  </p>
                  {validAttackTargets.map((target) => {
                    const tState = gs.player_states[target.id];
                    const tChar = tState ? getCharacter(tState.character_id) : null;
                    return (
                      <button key={target.id}
                        onClick={() => handleRopeAttack(target.id)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left"
                        style={{ background: "rgba(245,158,11,0.07)", border: "1px solid rgba(245,158,11,0.2)", color: "#e8d5b0" }}>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold" style={{ fontFamily: "var(--font-gothic)" }}>{target.name}</p>
                          {tChar && <p className="text-xs" style={{ color: "#7a6a5a" }}>{tChar.name} · Might {tState?.might ?? "?"}</p>}
                        </div>
                        <span className="text-sm flex-shrink-0" style={{ color: "#f59e0b" }}>Bind →</span>
                      </button>
                    );
                  })}
                  <button onClick={() => setShowRopeTargets(false)}
                    className="w-full py-1.5 rounded-lg text-xs" style={{ color: "#5a4a3a" }}>
                    Cancel
                  </button>
                </div>
              )}

              {showDynamiteTargets && (() => {
                const curTile = myState && gs.placed_tiles.find(t => t.floor === myState.floor && t.x === myState.x && t.y === myState.y);
                if (!curTile) return null;
                const availableDoors = (["north","east","south","west"] as const).filter(dir => {
                  if (!curTile.doors[dir]) return false;
                  const dx = dir === "east" ? 1 : dir === "west" ? -1 : 0;
                  const dy = dir === "south" ? 1 : dir === "north" ? -1 : 0;
                  return !!gs.placed_tiles.find(t => t.floor === myState!.floor && t.x === myState!.x + dx && t.y === myState!.y + dy);
                });
                return (
                  <div className="rounded-xl p-3 space-y-2"
                    style={{ background: "rgba(13,8,8,0.95)", border: "1px solid rgba(239,68,68,0.25)" }}>
                    <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "#ef4444", fontFamily: "var(--font-gothic)" }}>
                      💣 Blow up which door?
                    </p>
                    <p className="text-xs" style={{ color: "#7a6a5a" }}>Everyone in this room takes 2 Might damage!</p>
                    {availableDoors.map(dir => (
                      <button key={dir}
                        onClick={() => handleDynamite(dir)}
                        className="w-full px-3 py-2.5 rounded-lg text-left text-sm font-bold"
                        style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)", color: "#ef4444", fontFamily: "var(--font-gothic)" }}>
                        {dir.charAt(0).toUpperCase() + dir.slice(1)} door
                      </button>
                    ))}
                    <button onClick={() => setShowDynamiteTargets(false)}
                      className="w-full py-1.5 rounded-lg text-xs" style={{ color: "#5a4a3a" }}>
                      Cancel
                    </button>
                  </div>
                );
              })()}

              {/* ── Haunt-specific action panels ─────────────────────────── */}
              {gs.phase === "haunt" && isMyTurn && myState && gs.turn_phase === "action" && (() => {
                const hn = gs.haunt_number;
                if (!hn) return null;
                const buttons: React.ReactNode[] = [];
                const curTileId = gs.placed_tiles.find(t => t.floor === myState.floor && t.x === myState.x && t.y === myState.y)?.tile_id ?? "";
                const items = myState.items ?? [];
                const counters = gs.haunt_counters ?? {};

                // ── Haunt 1: Crypt ritual (heroes) ──────────────────────────
                if (hn === 1 && !myState.is_traitor && curTileId === "crypt") {
                  const hasItems = items.includes("holy-symbol") && items.includes("ancient-book");
                  buttons.push(
                    <button key="crypt-ritual" onClick={handleCryptRitual}
                      className="w-full py-2.5 rounded-xl text-sm font-bold"
                      style={{ background: hasItems ? "rgba(168,85,247,0.15)" : "rgba(60,60,60,0.1)", border: `1px solid ${hasItems ? "rgba(168,85,247,0.4)" : "rgba(100,100,100,0.2)"}`, color: hasItems ? "#a855f7" : "#555", fontFamily: "var(--font-gothic)", opacity: hasItems ? 1 : 0.5 }}>
                      📖 Crypt Ritual — Knowledge 5+ {!hasItems && "(need Holy Symbol + Ancient Book)"}
                    </button>
                  );
                }

                // ── Haunt 3: Parlor ritual (heroes) ─────────────────────────
                if (hn === 3 && !myState.is_traitor && curTileId === "parlor") {
                  const hasHoly = items.includes("holy-symbol");
                  buttons.push(
                    <button key="parlor-ritual" onClick={handleParlorRitual}
                      className="w-full py-2.5 rounded-xl text-sm font-bold"
                      style={{ background: hasHoly ? "rgba(168,85,247,0.15)" : "rgba(60,60,60,0.1)", border: `1px solid ${hasHoly ? "rgba(168,85,247,0.4)" : "rgba(100,100,100,0.2)"}`, color: hasHoly ? "#a855f7" : "#555", fontFamily: "var(--font-gothic)", opacity: hasHoly ? 1 : 0.5 }}>
                      🕯 Destroy Black Candle (Might 4+) {!hasHoly && "(need Holy Symbol)"}
                    </button>
                  );
                }

                // ── Haunt 5: Tower beacon (heroes) ───────────────────────────
                if (hn === 5 && !myState.is_traitor && curTileId === "tower") {
                  const hasLight = items.some(id => id === "lantern" || id === "candle" || id === "omen-candle");
                  buttons.push(
                    <button key="tower-beacon" onClick={handleTowerBeacon}
                      className="w-full py-2.5 rounded-xl text-sm font-bold"
                      style={{ background: hasLight ? "rgba(251,191,36,0.15)" : "rgba(60,60,60,0.1)", border: `1px solid ${hasLight ? "rgba(251,191,36,0.4)" : "rgba(100,100,100,0.2)"}`, color: hasLight ? "#fbbf24" : "#555", fontFamily: "var(--font-gothic)", opacity: hasLight ? 1 : 0.5 }}>
                      🔦 Light the Tower Beacon {!hasLight && "(need Lantern or Candle)"}
                    </button>
                  );
                }

                // ── Haunt 7: Possess hero (traitor) ─────────────────────────
                if (hn === 7 && myState.is_traitor && possessionTargets.length > 0) {
                  if (!showPossessionTargets) {
                    buttons.push(
                      <button key="possess-btn" onClick={() => setShowPossessionTargets(true)}
                        className="w-full py-2.5 rounded-xl text-sm font-bold"
                        style={{ background: "rgba(168,85,247,0.15)", border: "1px solid rgba(168,85,247,0.4)", color: "#a855f7", fontFamily: "var(--font-gothic)" }}>
                        👻 Possess a Hero (Sanity 4+ to resist)
                      </button>
                    );
                  } else {
                    buttons.push(
                      <div key="possess-panel" className="rounded-xl p-3 space-y-2" style={{ background: "rgba(13,8,8,0.95)", border: "1px solid rgba(168,85,247,0.25)" }}>
                        <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "#a855f7", fontFamily: "var(--font-gothic)" }}>👻 Possess which hero?</p>
                        {possessionTargets.map(p => {
                          const ps = gs.player_states[p.id];
                          const possCount = (gs.possessed_heroes ?? {})[p.id] ?? 0;
                          const hasAmulet = (ps?.items ?? []).includes("amulet");
                          return (
                            <button key={p.id} onClick={() => { handlePossessHero(p.id); setShowPossessionTargets(false); }}
                              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left"
                              style={{ background: "rgba(168,85,247,0.07)", border: "1px solid rgba(168,85,247,0.2)", color: "#e8d5b0" }}>
                              <div className="flex-1"><p className="text-sm font-bold">{p.name}</p>
                                <p className="text-xs" style={{ color: "#7a6a5a" }}>Sanity {ps?.sanity ?? "?"} · Possessed {possCount}/2{hasAmulet ? " · 🛡 Amulet" : ""}</p></div>
                              <span style={{ color: "#a855f7" }}>Possess →</span>
                            </button>
                          );
                        })}
                        <button onClick={() => setShowPossessionTargets(false)} className="w-full py-1.5 rounded-lg text-xs" style={{ color: "#5a4a3a" }}>Cancel</button>
                      </div>
                    );
                  }
                }

                // ── Haunt 7: Amulet to Tower (heroes) ───────────────────────
                if (hn === 7 && !myState.is_traitor && curTileId === "tower" && items.includes("amulet")) {
                  buttons.push(
                    <button key="amulet-tower" onClick={handleAmuletToTower}
                      className="w-full py-2.5 rounded-xl text-sm font-bold"
                      style={{ background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.4)", color: "#22c55e", fontFamily: "var(--font-gothic)" }}>
                      🔮 Deliver Amulet to Tower — Seal the Spirit!
                    </button>
                  );
                }

                // ── Haunt 8: Vault seal (heroes) ────────────────────────────
                if (hn === 8 && !myState.is_traitor && curTileId === "vault") {
                  buttons.push(
                    <button key="vault-seal" onClick={handleVaultSeal}
                      className="w-full py-2.5 rounded-xl text-sm font-bold"
                      style={{ background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.4)", color: "#22c55e", fontFamily: "var(--font-gothic)" }}>
                      💪 Seal the Vault — Stop the Flood (Might 5+)
                    </button>
                  );
                }

                // ── Haunt 10: Destroy Furnace (traitor) ─────────────────────
                if (hn === 10 && myState.is_traitor && curTileId === "furnace-room") {
                  buttons.push(
                    <button key="furnace-destroy" onClick={handleFurnaceDestroy}
                      className="w-full py-2.5 rounded-xl text-sm font-bold"
                      style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)", color: "#ef4444", fontFamily: "var(--font-gothic)" }}>
                      🔥 Destroy the Furnace (Might 5+)
                    </button>
                  );
                }

                // ── Haunt 11: Burn Skull in Furnace (heroes) ────────────────
                if (hn === 11 && !myState.is_traitor && curTileId === "furnace-room" && items.includes("omen-skull")) {
                  buttons.push(
                    <button key="burn-skull" onClick={handleBurnSkull}
                      className="w-full py-2.5 rounded-xl text-sm font-bold"
                      style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)", color: "#ef4444", fontFamily: "var(--font-gothic)" }}>
                      💀 Burn the Skull (Might 4+)
                    </button>
                  );
                }

                // ── Haunt 13: Gallery Ritual (heroes) ───────────────────────
                if (hn === 13 && !myState.is_traitor && curTileId === "gallery") {
                  const allies = gs.turn_order.filter(id => {
                    if (id === myPlayerId) return false;
                    const ps = gs.player_states[id];
                    return ps && !ps.is_dead && !ps.is_traitor && ps.floor === myState.floor && ps.x === myState.x && ps.y === myState.y;
                  });
                  const ready = allies.length >= 1;
                  buttons.push(
                    <button key="gallery-ritual" onClick={handleGalleryRitual}
                      className="w-full py-2.5 rounded-xl text-sm font-bold"
                      style={{ background: ready ? "rgba(168,85,247,0.15)" : "rgba(60,60,60,0.1)", border: `1px solid ${ready ? "rgba(168,85,247,0.4)" : "rgba(100,100,100,0.2)"}`, color: ready ? "#a855f7" : "#555", fontFamily: "var(--font-gothic)", opacity: ready ? 1 : 0.5 }}>
                      🖼 Destroy Wedding Portrait — Both Knowledge 4+ {!ready && "(need another hero here)"}
                    </button>
                  );
                }

                // ── Haunt 16: Crypt purification (heroes) ────────────────────
                if (hn === 16 && !myState.is_traitor && curTileId === "crypt") {
                  const hasHoly = items.includes("holy-symbol");
                  buttons.push(
                    <button key="crypt-purify" onClick={handleCryptRitual}
                      className="w-full py-2.5 rounded-xl text-sm font-bold"
                      style={{ background: hasHoly ? "rgba(34,197,94,0.15)" : "rgba(60,60,60,0.1)", border: `1px solid ${hasHoly ? "rgba(34,197,94,0.4)" : "rgba(100,100,100,0.2)"}`, color: hasHoly ? "#22c55e" : "#555", fontFamily: "var(--font-gothic)", opacity: hasHoly ? 1 : 0.5 }}>
                      ✝ Purify the Crypt — Reset Ritual (Knowledge 4+) {!hasHoly && "(need Holy Symbol)"}
                    </button>
                  );
                }

                // ── Haunt 17: Shatter Crystal Ball (heroes) ──────────────────
                if (hn === 17 && !myState.is_traitor) {
                  const allies = gs.turn_order.filter(id => {
                    if (id === myPlayerId) return false;
                    const ps = gs.player_states[id];
                    return ps && !ps.is_dead && !ps.is_traitor && ps.floor === myState.floor && ps.x === myState.x && ps.y === myState.y;
                  });
                  const ready = allies.length >= 1;
                  buttons.push(
                    <button key="shatter-ball" onClick={handleShatterCrystalBall}
                      className="w-full py-2.5 rounded-xl text-sm font-bold"
                      style={{ background: ready ? "rgba(168,85,247,0.15)" : "rgba(60,60,60,0.1)", border: `1px solid ${ready ? "rgba(168,85,247,0.4)" : "rgba(100,100,100,0.2)"}`, color: ready ? "#a855f7" : "#555", fontFamily: "var(--font-gothic)", opacity: ready ? 1 : 0.5 }}>
                      🔮 Shatter Crystal Ball — Both Knowledge 3+ {!ready && "(need another hero here)"}
                    </button>
                  );
                }

                // ── Haunt 19: Place marker (traitor) ─────────────────────────
                if (hn === 19 && myState.is_traitor) {
                  const key = `marker_${myState.floor},${myState.x},${myState.y}`;
                  const alreadyPlaced = !!counters[key];
                  const markerCount = Object.keys(counters).filter(k => k.startsWith("marker_")).length;
                  buttons.push(
                    <button key="place-marker" onClick={handlePlaceMarker} disabled={alreadyPlaced}
                      className="w-full py-2.5 rounded-xl text-sm font-bold"
                      style={{ background: alreadyPlaced ? "rgba(60,60,60,0.1)" : "rgba(239,68,68,0.15)", border: `1px solid ${alreadyPlaced ? "rgba(100,100,100,0.2)" : "rgba(239,68,68,0.4)"}`, color: alreadyPlaced ? "#555" : "#ef4444", fontFamily: "var(--font-gothic)", opacity: alreadyPlaced ? 0.5 : 1 }}>
                      🕯 Place Ritual Marker ({markerCount}/4 placed) {alreadyPlaced && "— already placed here"}
                    </button>
                  );
                }

                // ── Haunt 19: Destroy marker (heroes) ───────────────────────
                if (hn === 19 && !myState.is_traitor) {
                  const key = `marker_${myState.floor},${myState.x},${myState.y}`;
                  const markerHere = !!counters[key];
                  if (markerHere) {
                    buttons.push(
                      <button key="destroy-marker" onClick={handleDestroyMarker}
                        className="w-full py-2.5 rounded-xl text-sm font-bold"
                        style={{ background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.4)", color: "#22c55e", fontFamily: "var(--font-gothic)" }}>
                        🗡 Destroy Ritual Marker — Sanity 4+ {items.includes("holy-symbol") && "(Holy Symbol: auto!)"}
                      </button>
                    );
                  }
                }

                // ── Haunt 21: Blood drain (traitor) ──────────────────────────
                if (hn === 21 && myState.is_traitor && bloodDrainTargets.length > 0) {
                  const drained = counters.blood_drained ?? 0;
                  if (!showBloodDrainTargets) {
                    buttons.push(
                      <button key="blood-drain-btn" onClick={() => setShowBloodDrainTargets(true)}
                        className="w-full py-2.5 rounded-xl text-sm font-bold"
                        style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)", color: "#ef4444", fontFamily: "var(--font-gothic)" }}>
                        🩸 Blood Drain — Free Action ({drained}/10 Might drained)
                      </button>
                    );
                  } else {
                    buttons.push(
                      <div key="blood-drain-panel" className="rounded-xl p-3 space-y-2" style={{ background: "rgba(13,8,8,0.95)", border: "1px solid rgba(239,68,68,0.25)" }}>
                        <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "#ef4444", fontFamily: "var(--font-gothic)" }}>🩸 Drain which hero?</p>
                        {bloodDrainTargets.map(p => {
                          const ps = gs.player_states[p.id];
                          return (
                            <button key={p.id} onClick={() => { handleBloodDrain(p.id); setShowBloodDrainTargets(false); }}
                              className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left"
                              style={{ background: "rgba(239,68,68,0.07)", border: "1px solid rgba(239,68,68,0.2)", color: "#e8d5b0" }}>
                              <div className="flex-1"><p className="text-sm font-bold">{p.name}</p>
                                <p className="text-xs" style={{ color: "#7a6a5a" }}>Might {ps?.might ?? "?"}</p></div>
                              <span style={{ color: "#ef4444" }}>Drain →</span>
                            </button>
                          );
                        })}
                        <button onClick={() => setShowBloodDrainTargets(false)} className="w-full py-1.5 rounded-lg text-xs" style={{ color: "#5a4a3a" }}>Cancel</button>
                      </div>
                    );
                  }
                }

                // ── Haunt 21: Library counter-rite (heroes) ──────────────────
                if (hn === 21 && !myState.is_traitor && curTileId === "library") {
                  const hasBook = items.includes("ancient-book");
                  buttons.push(
                    <button key="library-rite" onClick={handleLibraryRite}
                      className="w-full py-2.5 rounded-xl text-sm font-bold"
                      style={{ background: hasBook ? "rgba(168,85,247,0.15)" : "rgba(60,60,60,0.1)", border: `1px solid ${hasBook ? "rgba(168,85,247,0.4)" : "rgba(100,100,100,0.2)"}`, color: hasBook ? "#a855f7" : "#555", fontFamily: "var(--font-gothic)", opacity: hasBook ? 1 : 0.5 }}>
                      📖 Counter-Rite — Knowledge 5+ {!hasBook && "(need Ancient Book)"}
                    </button>
                  );
                }

                // ── Haunt 24: Create antidote (heroes) ───────────────────────
                if (hn === 24 && !myState.is_traitor && !counters["antidote_holder"]) {
                  const hasBoth = items.includes("healing-salve") && items.includes("holy-symbol");
                  buttons.push(
                    <button key="create-antidote" onClick={handleCreateAntidote}
                      className="w-full py-2.5 rounded-xl text-sm font-bold"
                      style={{ background: hasBoth ? "rgba(34,197,94,0.15)" : "rgba(60,60,60,0.1)", border: `1px solid ${hasBoth ? "rgba(34,197,94,0.4)" : "rgba(100,100,100,0.2)"}`, color: hasBoth ? "#22c55e" : "#555", fontFamily: "var(--font-gothic)", opacity: hasBoth ? 1 : 0.5 }}>
                      💉 Create Antidote — Knowledge 4+ {!hasBoth && "(need Healing Salve + Holy Symbol)"}
                    </button>
                  );
                }

                // ── Haunt 24: Distribute antidote (heroes) ───────────────────
                if (hn === 24 && !myState.is_traitor && counters["antidote_holder"]) {
                  buttons.push(
                    <button key="distribute-antidote" onClick={handleDistributeAntidote}
                      className="w-full py-2.5 rounded-xl text-sm font-bold"
                      style={{ background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.4)", color: "#22c55e", fontFamily: "var(--font-gothic)" }}>
                      💉 Distribute Antidote (share room with infected)
                    </button>
                  );
                }

                // ── Haunt 25: Entrance Hall anchor (heroes) ───────────────────
                if (hn === 25 && !myState.is_traitor && curTileId === "entrance-hall") {
                  const hasCoin = items.includes("lucky-coin");
                  buttons.push(
                    <button key="eh-anchor" onClick={handleEntranceHallAnchor}
                      className="w-full py-2.5 rounded-xl text-sm font-bold"
                      style={{ background: hasCoin ? "rgba(168,85,247,0.15)" : "rgba(60,60,60,0.1)", border: `1px solid ${hasCoin ? "rgba(168,85,247,0.4)" : "rgba(100,100,100,0.2)"}`, color: hasCoin ? "#a855f7" : "#555", fontFamily: "var(--font-gothic)", opacity: hasCoin ? 1 : 0.5 }}>
                      🪙 Anchor the Mansion — Knowledge 4+ {!hasCoin && "(need Lucky Coin)"}
                    </button>
                  );
                }

                if (buttons.length === 0) return null;
                return (
                  <div className="space-y-2 pt-1">
                    <p className="text-xs font-bold uppercase tracking-widest px-1" style={{ color: "#5a4a3a", fontSize: 9, fontFamily: "var(--font-gothic)" }}>⚡ Haunt Actions</p>
                    {buttons}
                  </div>
                );
              })()}
            </div>
          )}

          {/* My character panel */}
          {myChar && myState && (
            <div className="rounded-xl p-3 space-y-2" style={{ background: "rgba(13,10,26,0.8)", border: "1px solid rgba(212,175,55,0.1)" }}>
              <div className="flex items-center gap-3">
                <div className="relative w-10 h-10 rounded-full overflow-hidden flex-shrink-0"
                  style={{ background: "rgba(255,255,255,0.05)", border: `2px solid ${playerColor(myIndex)}` }}>
                  <NextImage src={myChar.image} alt={myChar.name} fill priority sizes="80px" className="object-cover" />
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-sm truncate" style={{ color: "#e8d5b0", fontFamily: "var(--font-gothic)" }}>{myChar.name}</p>
                  <p className="text-xs italic leading-snug line-clamp-3" style={{ color: "#5a4a3a" }}>{myChar.trait[lang]}</p>
                </div>
                {myState.is_traitor && (
                  <span className="ml-auto flex-shrink-0 text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(239,68,68,0.2)", color: "#ef4444" }}>Traitor</span>
                )}
              </div>
              <div className="space-y-1">
                <StatBar label="Speed"     value={myState.speed}     max={myChar.speedMax}     color={STAT_COLOR.speed}      flash={statFlashes.speed} />
                <StatBar label="Might"     value={myState.might}     max={myChar.mightMax}     color={STAT_COLOR.might}      flash={statFlashes.might} />
                <StatBar label="Sanity"    value={myState.sanity}    max={myChar.sanityMax}    color={STAT_COLOR.sanity}     flash={statFlashes.sanity} />
                <StatBar label="Knowledge" value={myState.knowledge}  max={myChar.knowledgeMax} color={STAT_COLOR.knowledge}  flash={statFlashes.knowledge} />
              </div>
              {myState.items.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {myState.items.map((itemId) => {
                    const item = getCard(itemId);
                    const isConsumable = itemId === "healing-salve" || itemId === "smelling-salts";
                    const ITEM_EMOJI: Record<string, string> = {
                      "healing-salve": "💊", "smelling-salts": "🧪",
                      "amulet": "🔮", "lantern": "🕯️", "lucky-coin": "🪙",
                      "axe": "🪓", "knife": "🗡️", "sacrificial-dagger": "⚔️",
                      "rope": "🪢", "dynamite": "💣", "revolver": "🔫",
                      "holy-symbol": "✝️", "ancient-book": "📖", "candle": "🕯️",
                      "omen-key": "🔑", "omen-skull": "💀",
                    };
                    return item ? (
                      <div key={itemId} className="item-chip flex items-center gap-1 px-2 py-1 rounded-lg text-xs cursor-pointer"
                        style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)", color: "#f59e0b" }}
                        onClick={() => setViewingItemCard(itemId)}>
                        <span>{ITEM_EMOJI[itemId] ?? "📦"}</span>
                        {item.name}
                        {isConsumable && isMyTurn && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleUseItem(itemId); }}
                            className="ml-1 px-1.5 py-0.5 rounded text-xs font-bold"
                            style={{ background: "rgba(245,158,11,0.25)", color: "#fcd34d", fontSize: "0.65rem" }}>
                            Use
                          </button>
                        )}
                      </div>
                    ) : null;
                  })}
                </div>
              )}
            </div>
          )}

          {/* All players summary */}
          <div className="rounded-xl p-3 space-y-2" style={{ background: "rgba(13,10,26,0.6)", border: "1px solid rgba(255,255,255,0.05)" }}>
            <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: "#5a4a3a", fontFamily: "var(--font-gothic)" }}>
              All Players
            </p>
            {players.map((p, idx) => {
              const ps = gs.player_states[p.id];
              const ch = ps ? getCharacter(ps.character_id) : null;
              const isDead = ps?.is_dead ?? false;
              return (
                <div key={p.id} className="flex items-center gap-2"
                  style={{ opacity: isDead ? 0.4 : 1 }}>
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-white flex-shrink-0"
                    style={{ background: isDead ? "#374151" : playerColor(idx), fontSize: 10, fontWeight: "bold" }}>
                    {isDead ? "✝" : p.name[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs truncate" style={{ color: p.id === myPlayerId ? "#e8d5b0" : "#7a6a5a" }}>
                      {p.id.startsWith("bot-") && <span className="mr-1 text-indigo-400">🤖</span>}
                      {p.name}
                      {ps?.is_traitor && p.id === myPlayerId && <span className="ml-1 text-red-400">⚔</span>}
                      {isDead && <span className="ml-1" style={{ color: "#5a4a3a" }}>eliminated</span>}
                    </p>
                    {ch && ps && !isDead && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="text-xs" style={{ color: "#5a4a3a" }}>{ch.name}</span>
                        <span className="ml-1 text-xs" style={{ color: STAT_COLOR.might }}>⚔{ps.might}</span>
                        <span className="text-xs" style={{ color: STAT_COLOR.sanity }}>◈{ps.sanity}</span>
                      </div>
                    )}
                  </div>
                  {p.id === currentPlayerId && !isDead && (
                    <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full" style={{ background: "#d4af37" }} />
                  )}
                </div>
              );
            })}
          </div>

          {/* Event log — collapsible */}
          <div className="rounded-xl overflow-hidden flex-shrink-0"
            style={{ background: "rgba(13,10,26,0.6)", border: "1px solid rgba(255,255,255,0.05)" }}>
            <button
              onClick={() => setShowEventLog(v => !v)}
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-bold"
              style={{ color: "#5a4a3a", fontFamily: "var(--font-gothic)" }}>
              <span>Event Log {gs.event_log.length > 0 && <span style={{ color: "#3a2a1a" }}>({gs.event_log.length})</span>}</span>
              <span style={{ color: "#4a3a2a" }}>{showEventLog ? "▲" : "▼"}</span>
            </button>
            {showEventLog && (
              <div className="px-3 pb-3 space-y-1 max-h-48 overflow-y-auto">
                {gs.event_log.slice().reverse().map((ev) => {
                  const evColor = ev.type === "death" ? "#ef4444"
                    : ev.type === "haunt" ? "#a855f7"
                    : ev.type === "omen"  ? "#ef4444"
                    : ev.type === "stat"  ? "#f59e0b"
                    : ev.type === "system" ? "#3b82f6"
                    : ev.type === "card_draw" ? "#22c55e"
                    : ev.type === "tile_reveal" ? "#22c55e"
                    : "#7a6a5a";
                  return (
                    <p key={ev.id} className="text-xs leading-snug" style={{ color: evColor }}>
                      <span style={{ color: "#4a3a2a", marginRight: 4 }}>{new Date(ev.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                      {ev.message}
                    </p>
                  );
                })}
                {gs.event_log.length === 0 && <p className="text-xs" style={{ color: "#3a2a1a" }}>The mansion awaits...</p>}
              </div>
            )}
          </div>

          {/* Bot log — host-only, visible when bots are in the game */}
          {isHost && players.some((p) => p.id.startsWith("bot-")) && (
            <div className="rounded-xl overflow-hidden flex-shrink-0"
              style={{ border: "1px solid rgba(99,102,241,0.2)", background: "rgba(10,10,26,0.7)" }}>
              <button
                onClick={() => setShowBotLog((v) => !v)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs font-bold"
                style={{ color: "#818cf8", fontFamily: "var(--font-gothic)" }}
              >
                <span>🤖 Bot Log {botLog.length > 0 && `(${botLog.length})`}</span>
                <span style={{ color: "#4a4a8a" }}>{showBotLog ? "▲" : "▼"}</span>
              </button>
              {showBotLog && (
                <div className="px-3 pb-3 space-y-1 max-h-40 overflow-y-auto">
                  {botLog.length === 0 && (
                    <p className="text-xs italic" style={{ color: "#3a3a6a" }}>Bots standing by…</p>
                  )}
                  {botLog.map((entry, i) => (
                    <p key={i} className="text-xs leading-snug" style={{ color: "#6366f1" }}>{entry}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </aside>
      </div>

      {/* Chat — floating, phase-aware, isolated by role during haunt */}
      {myPlayerId && (
        <BetrayalChat
          code={code}
          myPlayerId={myPlayerId}
          players={players}
          gs={gs}
          myState={myState}
        />
      )}
    </div>
  );
}

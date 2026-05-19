"use client";

import { useState, useCallback, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { getLang } from "@/lib/utils/lang";
import { useAmbientAudio, useSfx } from "@/lib/hooks/useAmbientAudio";
import type { BetrayalGameState, PlacedTile, Floor, PlayerGameState } from "@/lib/games/betrayal/types";
import { TILE_DEFINITIONS, getTile, buildTilePools } from "@/lib/games/betrayal/data/tiles";
import { CHARACTERS, getCharacter } from "@/lib/games/betrayal/data/characters";
import { ITEM_CARDS, OMEN_CARDS, EVENT_CARDS, getCard, shuffle } from "@/lib/games/betrayal/data/cards";
import { findHaunt } from "@/lib/games/betrayal/data/haunts";
import {
  getReachable, getUnexploredDoors, buildPlacedTile,
  buildStartingTiles, tileAt,
} from "@/lib/games/betrayal/logic/mapEngine";
import type { Player } from "@/types/game";

// ─── Tile size in px ──────────────────────────────────────────────────────────
const TILE_PX = 90;

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

// ─── Helpers ──────────────────────────────────────────────────────────────────
const FLOOR_NAMES: Record<Floor, string> = { 0: "Basement", 1: "Ground Floor", 2: "Upper Floor" };
const FLOOR_COLORS: Record<Floor, string> = {
  0: "rgba(20,40,30,0.95)",
  1: "rgba(30,20,10,0.95)",
  2: "rgba(20,20,40,0.95)",
};
const STAT_COLOR: Record<string, string> = {
  speed: "#3b82f6", might: "#ef4444", sanity: "#a855f7", knowledge: "#22c55e",
};
const PLAYER_COLORS = [
  "#ef4444","#3b82f6","#22c55e","#f59e0b","#8b5cf6","#ec4899",
];

function playerColor(index: number) { return PLAYER_COLORS[index % PLAYER_COLORS.length]; }

function rollDice(n: number): number[] {
  return Array.from({ length: n }, () => Math.floor(Math.random() * 3)); // 0-2, sum=haunt dice
}
function rollD6(n: number): number {
  let sum = 0;
  for (let i = 0; i < n; i++) sum += Math.floor(Math.random() * 6) + 1;
  return sum;
}

// ─── Stat Bar ─────────────────────────────────────────────────────────────────
function StatBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-xs w-16 flex-shrink-0" style={{ color: "#7a6a5a" }}>{label}</span>
      <div className="flex gap-0.5">
        {Array.from({ length: max }, (_, i) => (
          <div key={i} className="w-3 h-3 rounded-sm" style={{
            background: i < value ? color : "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.08)",
          }} />
        ))}
      </div>
      <span className="text-xs" style={{ color }}>{value}</span>
    </div>
  );
}

// ─── Map Tile ─────────────────────────────────────────────────────────────────
function MapTile({
  tile, playersHere, isReachable, isMyPosition, onClick, isNew,
}: {
  tile: PlacedTile;
  playersHere: { player: Player; index: number; isDead?: boolean }[];
  isReachable: boolean;
  isMyPosition: boolean;
  onClick: () => void;
  isNew: boolean;
}) {
  const def = getTile(tile.tile_id);
  const typeColor = {
    item: "rgba(245,158,11,0.7)", omen: "rgba(239,68,68,0.7)",
    event: "rgba(99,102,241,0.7)", stairwell: "rgba(34,197,94,0.7)", normal: "transparent",
  }[def?.type ?? "normal"];

  return (
    <div
      onClick={onClick}
      className={`absolute flex flex-col items-center justify-end p-0.5 cursor-pointer select-none transition-all ${isNew ? "animate-tile-reveal" : ""}`}
      style={{
        width: TILE_PX, height: TILE_PX,
        left: 0, top: 0,
        border: isMyPosition
          ? "2px solid #d4af37"
          : isReachable
          ? "2px solid rgba(212,175,55,0.5)"
          : "1px solid rgba(255,255,255,0.08)",
        borderRadius: 6,
        background: def?.image
          ? `url(${def.image}) center/cover`
          : "rgba(30,20,10,0.8)",
        boxShadow: isReachable ? "0 0 12px rgba(212,175,55,0.3)" : undefined,
        overflow: "hidden",
      }}
    >
      {/* Type badge */}
      {def?.type && def.type !== "normal" && (
        <div className="absolute top-1 right-1 w-2 h-2 rounded-full" style={{ background: typeColor }} />
      )}

      {/* Door indicators */}
      {tile.doors.north && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3 h-1 rounded-b" style={{ background: "rgba(212,175,55,0.6)" }} />}
      {tile.doors.south && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3 h-1 rounded-t" style={{ background: "rgba(212,175,55,0.6)" }} />}
      {tile.doors.east  && <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-3 rounded-l" style={{ background: "rgba(212,175,55,0.6)" }} />}
      {tile.doors.west  && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-3 rounded-r" style={{ background: "rgba(212,175,55,0.6)" }} />}

      {/* Overlay label */}
      <div className="w-full text-center px-0.5 py-0.5 text-xs leading-tight truncate"
        style={{ background: "rgba(0,0,0,0.65)", color: "#e8d5b0", fontSize: 9, fontFamily: "var(--font-gothic)" }}>
        {def?.name ?? tile.tile_id}
      </div>

      {/* Player tokens */}
      {playersHere.length > 0 && (
        <div className="absolute top-1 left-1 flex flex-wrap gap-0.5">
          {playersHere.slice(0, 4).map(({ player, index, isDead }) => (
            <div key={player.id} className="w-4 h-4 rounded-full flex items-center justify-center text-white font-bold"
              style={{
                background: isDead ? "#374151" : playerColor(index),
                fontSize: 7,
                border: "1px solid rgba(0,0,0,0.5)",
                opacity: isDead ? 0.4 : 1,
              }}>
              {isDead ? "✝" : player.name[0].toUpperCase()}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Unexplored Door Button ────────────────────────────────────────────────────
function UnexploredDoor({ onClick, canExplore }: { onClick: () => void; canExplore: boolean }) {
  return (
    <div onClick={canExplore ? onClick : undefined}
      className="absolute flex items-center justify-center"
      style={{
        width: TILE_PX, height: TILE_PX, left: 0, top: 0,
        border: `1.5px dashed ${canExplore ? "rgba(212,175,55,0.6)" : "rgba(255,255,255,0.1)"}`,
        borderRadius: 6,
        background: canExplore ? "rgba(212,175,55,0.04)" : "rgba(255,255,255,0.01)",
        cursor: canExplore ? "pointer" : "default",
      }}>
      {canExplore && (
        <span style={{ fontSize: 22, opacity: 0.5 }}>🚪</span>
      )}
    </div>
  );
}

// ─── Mansion Map ──────────────────────────────────────────────────────────────
function MansionMap({
  gs, players, myPlayerId, myState, isMyTurn, onMove, onRevealTile,
}: {
  gs: BetrayalGameState;
  players: Player[];
  myPlayerId: string | null;
  myState: PlayerGameState | null;
  isMyTurn: boolean;
  onMove: (x: number, y: number, floor: Floor) => void;
  onRevealTile: (x: number, y: number, floor: Floor) => void;
}) {
  const [viewFloor, setViewFloor] = useState<Floor>(myState?.floor ?? 1);
  const [newTileKey, setNewTileKey] = useState<string>("");

  const floorTiles = gs.placed_tiles.filter((t) => t.floor === viewFloor);

  // Compute bounding box
  const xs = floorTiles.map((t) => t.x);
  const ys = floorTiles.map((t) => t.y);
  const minX = Math.min(...xs, 0) - 1;
  const minY = Math.min(...ys, 0) - 1;
  const maxX = Math.max(...xs, 0) + 1;
  const maxY = Math.max(...ys, 0) + 1;
  const worldW = (maxX - minX + 1) * TILE_PX;
  const worldH = (maxY - minY + 1) * TILE_PX;

  // Reachable tiles for current player
  const reachable = useMemo(() => {
    if (!isMyTurn || !myState || myState.floor !== viewFloor) return new Set<string>();
    const movesLeft = myState.speed - gs.moves_used;
    if (movesLeft <= 0 || gs.turn_phase !== "move") return new Set<string>();
    return getReachable(gs.placed_tiles, viewFloor, myState.x, myState.y, movesLeft);
  }, [gs, myState, isMyTurn, viewFloor]);

  // Unexplored doors
  const unexplored = useMemo(() => getUnexploredDoors(gs.placed_tiles, viewFloor), [gs.placed_tiles, viewFloor]);

  // Filter to only doors reachable from current player's position
  const explorable = useMemo(() => {
    if (!isMyTurn || !myState || myState.floor !== viewFloor || gs.turn_phase !== "move") return [];
    const movesLeft = myState.speed - gs.moves_used;
    if (movesLeft <= 0) return [];
    // Can explore if the fromTile is reachable OR is current position
    return unexplored.filter(({ fromTile }) => {
      const key = `${fromTile.floor},${fromTile.x},${fromTile.y}`;
      const isHere = myState.x === fromTile.x && myState.y === fromTile.y;
      return isHere || reachable.has(key);
    });
  }, [unexplored, reachable, isMyTurn, myState, viewFloor, gs.turn_phase]);

  const playersByTile = useMemo(() => {
    const map = new Map<string, { player: Player; index: number; isDead: boolean }[]>();
    players.forEach((p, idx) => {
      const ps = gs.player_states[p.id];
      if (!ps || ps.floor !== viewFloor) return;
      const key = `${ps.x},${ps.y}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push({ player: p, index: idx, isDead: ps.is_dead ?? false });
    });
    return map;
  }, [players, gs.player_states, viewFloor]);

  return (
    <div className="flex flex-col gap-2 flex-1 min-h-0">
      {/* Floor tabs */}
      <div className="flex gap-1.5">
        {([2, 1, 0] as Floor[]).map((f) => (
          <button key={f} onClick={() => setViewFloor(f)}
            className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
            style={{
              background: viewFloor === f ? "rgba(212,175,55,0.2)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${viewFloor === f ? "rgba(212,175,55,0.5)" : "rgba(255,255,255,0.08)"}`,
              color: viewFloor === f ? "#d4af37" : "#5a4a3a",
              fontFamily: "var(--font-gothic)",
            }}>
            {FLOOR_NAMES[f]}
            {myState?.floor === f && <span className="ml-1 text-yellow-400">●</span>}
          </button>
        ))}
      </div>

      {/* Map viewport — capped on mobile, fills column on desktop */}
      <div className="rounded-xl overflow-auto flex-1 min-h-0 max-h-[52vh] lg:max-h-none" style={{
        background: FLOOR_COLORS[viewFloor],
        border: "1px solid rgba(212,175,55,0.15)",
        minHeight: 200,
      }}>
        <div className="relative" style={{ width: worldW, height: worldH, minWidth: "100%" }}>
          {/* Placed tiles */}
          {floorTiles.map((tile) => {
            const px = (tile.x - minX) * TILE_PX;
            const py = (tile.y - minY) * TILE_PX;
            const key = `${viewFloor},${tile.x},${tile.y}`;
            const isMyPos = myState?.floor === viewFloor && myState.x === tile.x && myState.y === tile.y;
            return (
              <div key={tile.tile_id} style={{ position: "absolute", left: px, top: py }}>
                <MapTile
                  tile={tile}
                  playersHere={playersByTile.get(`${tile.x},${tile.y}`) ?? []}
                  isReachable={reachable.has(key)}
                  isMyPosition={isMyPos}
                  isNew={`${viewFloor}-${tile.x}-${tile.y}` === newTileKey}
                  onClick={() => {
                    if (reachable.has(key) || isMyPos) onMove(tile.x, tile.y, viewFloor);
                  }}
                />
              </div>
            );
          })}

          {/* Unexplored doors */}
          {unexplored.map(({ x, y, fromTile, direction }) => {
            const px = (x - minX) * TILE_PX;
            const py = (y - minY) * TILE_PX;
            const canExp = explorable.some((e) => e.x === x && e.y === y);
            return (
              <div key={`door-${x}-${y}`} style={{ position: "absolute", left: px, top: py }}>
                <UnexploredDoor
                  canExplore={canExp}
                  onClick={() => {
                    setNewTileKey(`${viewFloor}-${x}-${y}`);
                    onRevealTile(x, y, viewFloor);
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs" style={{ color: "#5a4a3a" }}>
        <span><span className="inline-block w-2 h-2 rounded-full bg-yellow-500 mr-1" />Item room</span>
        <span><span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1" />Omen room</span>
        <span><span className="inline-block w-2 h-2 rounded-full bg-indigo-500 mr-1" />Event room</span>
        <span><span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1" />Stairwell</span>
        <span>🚪 Explore new room</span>
      </div>
    </div>
  );
}

// ─── Haunt Reveal Overlay ─────────────────────────────────────────────────────
// Splash images — drop files to activate; code falls back gracefully if absent
const HAUNT_SPLASH_TRAITOR = "/images/games/betrayal/haunt-splash-traitor.png";
const HAUNT_SPLASH_HEROES  = "/images/games/betrayal/haunt-splash-heroes.png";

function HauntReveal({ hauntName, isTraitor, objective, onDismiss }: {
  hauntName: string; isTraitor: boolean; objective: string; onDismiss: () => void;
}) {
  const [splashErr, setSplashErr] = useState(false);
  const splashSrc = isTraitor ? HAUNT_SPLASH_TRAITOR : HAUNT_SPLASH_HEROES;
  const accent = isTraitor ? "#ef4444" : "#d4af37";
  const accentBg = isTraitor ? "rgba(239,68,68,0.12)" : "rgba(212,175,55,0.10)";
  const accentBorder = isTraitor ? "rgba(239,68,68,0.35)" : "rgba(212,175,55,0.25)";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: "rgba(0,0,0,0.94)" }}>
      {/* Full-bleed splash image behind content */}
      {!splashErr && (
        <img
          src={splashSrc}
          alt=""
          aria-hidden
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          style={{ opacity: 0.18, objectPosition: "center top" }}
          onError={() => setSplashErr(true)}
        />
      )}
      {/* Radial vignette over splash */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: `radial-gradient(ellipse at 50% 40%, transparent 20%, rgba(0,0,0,0.85) 75%)` }} />

      <div className="relative z-10 max-w-md w-full mx-4 mb-8 sm:mb-0 text-center space-y-5 rounded-2xl p-8"
        style={{ background: "rgba(8,5,12,0.82)", border: `1px solid ${accentBorder}`, backdropFilter: "blur(10px)" }}>
        {/* Icon — shows if no splash or as accent */}
        {splashErr && <div style={{ fontSize: 64 }}>{isTraitor ? "🗡️" : "🕯️"}</div>}

        <div>
          <p className="text-xs tracking-widest uppercase mb-1" style={{ color: accentBorder, fontFamily: "var(--font-gothic)" }}>
            {isTraitor ? "The Darkness Claims You" : "Betrayal at House on the Hill"}
          </p>
          <h1 className="text-3xl font-black" style={{ color: accent, fontFamily: "var(--font-gothic)" }}>
            {isTraitor ? "You are the Traitor" : "The Haunt Begins"}
          </h1>
          <h2 className="text-lg mt-1" style={{ color: "#e8d5b0", fontFamily: "var(--font-gothic)" }}>{hauntName}</h2>
        </div>

        <div className="rounded-xl p-4 text-left" style={{ background: accentBg, border: `1px solid ${accentBorder}` }}>
          <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: accent }}>
            {isTraitor ? "Your Objective" : "Heroes' Objective"}
          </p>
          <p className="text-sm leading-relaxed" style={{ color: "#c8b89a" }}>{objective}</p>
        </div>

        <button onClick={onDismiss} className="btn-gothic-primary w-full py-3 rounded-xl font-bold"
          style={{ fontFamily: "var(--font-gothic)" }}>
          {isTraitor ? "⚔ Embrace the Dark" : "🕯 Begin the Haunt"}
        </button>
      </div>
    </div>
  );
}

// ─── Card Overlay ─────────────────────────────────────────────────────────────
// Card back images — drop files to activate; falls back to styled placeholder
const CARD_BACK: Record<string, string> = {
  item:  "/images/games/betrayal/cards/card-back-item.png",
  omen:  "/images/games/betrayal/cards/card-back-omen.png",
  event: "/images/games/betrayal/cards/card-back-event.png",
};

function CardOverlay({ cardId, onDismiss }: { cardId: string; onDismiss: () => void }) {
  const card = getCard(cardId);
  const [imgErr, setImgErr]       = useState(false);
  const [backErr, setBackErr]     = useState(false);
  const [revealed, setRevealed]   = useState(false);

  if (!card) return null;
  const typeColor = { item: "#f59e0b", omen: "#ef4444", event: "#6366f1" }[card.type] ?? "#d4af37";
  const typeLabel = { item: "Item", omen: "Omen", event: "Event" }[card.type] ?? card.type;
  const typeEmoji = { item: "📦", omen: "☠️", event: "👁️" }[card.type] ?? "🃏";

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center p-4"
      style={{ background: "rgba(0,0,0,0.80)" }}
      onClick={revealed ? onDismiss : undefined}>

      <div className="max-w-sm w-full rounded-2xl overflow-hidden"
        style={{ background: "rgba(8,5,12,0.98)", border: `1px solid ${typeColor}60` }}
        onClick={(e) => e.stopPropagation()}>

        {/* Card image / back */}
        <div className="relative h-52 w-full flex items-center justify-center"
          style={{ background: "rgba(13,10,26,0.9)" }}>
          {/* Front art */}
          {card.image && !imgErr && revealed && (
            <img src={card.image} alt={card.name}
              className="absolute inset-0 w-full h-full object-cover"
              style={{ opacity: 0.75 }}
              onError={() => setImgErr(true)} />
          )}
          {/* Card back (shown before reveal) */}
          {!revealed && !backErr && (
            <img src={CARD_BACK[card.type]}
              alt="card back"
              className="absolute inset-0 w-full h-full object-cover"
              onError={() => setBackErr(true)} />
          )}
          {/* Fallback if no back image */}
          {!revealed && backErr && (
            <div className="flex flex-col items-center gap-2">
              <span className="text-5xl opacity-40">{typeEmoji}</span>
              <p className="text-xs tracking-widest uppercase" style={{ color: `${typeColor}80` }}>
                {typeLabel}
              </p>
            </div>
          )}
          {/* Gradient overlay on front */}
          {revealed && (
            <div className="absolute inset-0"
              style={{ background: "linear-gradient(to top, rgba(8,5,12,0.85) 0%, transparent 55%)" }} />
          )}
          {/* Type badge */}
          <div className="absolute top-3 left-3 px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-widest"
            style={{ background: `${typeColor}22`, border: `1px solid ${typeColor}55`, color: typeColor }}>
            {typeLabel}
          </div>
        </div>

        {/* Content */}
        <div className="p-5 space-y-3">
          {revealed ? (
            <>
              <h2 className="text-xl font-black" style={{ color: "#e8d5b0", fontFamily: "var(--font-gothic)" }}>
                {card.name}
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: "#c8b89a" }}>{card.description}</p>
              {card.flavour && (
                <p className="text-xs italic border-t pt-3" style={{ color: "#5a4a3a", borderColor: "rgba(212,175,55,0.1)" }}>
                  &ldquo;{card.flavour}&rdquo;
                </p>
              )}
              <button onClick={onDismiss} className="w-full py-2.5 rounded-xl text-sm font-bold mt-1"
                style={{ background: `${typeColor}22`, border: `1px solid ${typeColor}55`, color: typeColor }}>
                Understood
              </button>
            </>
          ) : (
            <button onClick={() => setRevealed(true)}
              className="w-full py-3 rounded-xl text-sm font-bold"
              style={{ background: `${typeColor}18`, border: `1px solid ${typeColor}40`, color: typeColor, fontFamily: "var(--font-gothic)" }}>
              Reveal Card
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Dice Roll Overlay ────────────────────────────────────────────────────────
// Gothic dice face images — /images/games/betrayal/dice-0.png, dice-1.png, dice-2.png
// Falls back to styled number if image is missing.
const DICE_FACES = [
  "/images/games/betrayal/dice-0.png",
  "/images/games/betrayal/dice-1.png",
  "/images/games/betrayal/dice-2.png",
];

function GothicDie({ value }: { value: number }) {
  const [err, setErr] = useState(false);
  return (
    <div className="relative w-16 h-16 rounded-xl flex items-center justify-center"
      style={{ background: "rgba(212,175,55,0.12)", border: "2px solid rgba(212,175,55,0.45)" }}>
      {!err ? (
        <img
          src={DICE_FACES[value]}
          alt={String(value)}
          className="w-12 h-12 object-contain"
          onError={() => setErr(true)}
        />
      ) : (
        <span className="text-2xl font-black" style={{ color: "#d4af37", fontFamily: "var(--font-gothic)" }}>
          {value}
        </span>
      )}
    </div>
  );
}

function DiceOverlay({ values, label, onDismiss }: { values: number[]; label: string; onDismiss: () => void }) {
  const total = values.reduce((a, b) => a + b, 0);
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.82)" }} onClick={onDismiss}>
      <div className="text-center space-y-5 rounded-2xl p-8"
        style={{ background: "rgba(8,5,12,0.95)", border: "1px solid rgba(212,175,55,0.2)", backdropFilter: "blur(8px)" }}>
        <p className="text-xs uppercase tracking-widest" style={{ color: "#5a4a3a" }}>{label}</p>
        <div className="flex gap-4 justify-center">
          {values.map((v, i) => <GothicDie key={i} value={v} />)}
        </div>
        <p className="text-4xl font-black" style={{ color: "#e8d5b0", fontFamily: "var(--font-gothic)" }}>
          {total}
        </p>
        <p className="text-xs" style={{ color: "#5a4a3a" }}>Tap anywhere to continue</p>
      </div>
    </div>
  );
}

// ─── Combat Result Overlay ────────────────────────────────────────────────────
interface CombatResultData {
  attackerName: string;
  targetName: string;
  attackerRolls: number[];
  defenderRolls: number[];
  damage: number;
  winner: "attacker" | "defender" | "tie";
}

function CombatOverlay({ result, onDismiss }: { result: CombatResultData; onDismiss: () => void }) {
  const attackTotal = result.attackerRolls.reduce((a, b) => a + b, 0);
  const defendTotal = result.defenderRolls.reduce((a, b) => a + b, 0);
  const winnerColor = result.winner === "tie" ? "#d4af37" : result.winner === "attacker" ? "#ef4444" : "#22c55e";
  const winnerBorder = result.winner === "tie" ? "rgba(212,175,55,0.2)" : result.winner === "attacker" ? "rgba(239,68,68,0.3)" : "rgba(34,197,94,0.25)";
  const winnerBg = result.winner === "tie" ? "rgba(212,175,55,0.07)" : result.winner === "attacker" ? "rgba(239,68,68,0.1)" : "rgba(34,197,94,0.08)";

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.88)" }} onClick={onDismiss}>
      <div className="max-w-sm w-full rounded-2xl p-6 space-y-5 text-center"
        style={{ background: "rgba(8,5,12,0.97)", border: "1px solid rgba(239,68,68,0.25)", backdropFilter: "blur(8px)" }}
        onClick={(e) => e.stopPropagation()}>

        <p className="text-xs uppercase tracking-widest" style={{ color: "#5a4a3a", fontFamily: "var(--font-gothic)" }}>
          ⚔ Might Combat
        </p>

        {/* Side-by-side dice */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <p className="text-xs font-bold truncate" style={{ color: "#e8d5b0" }}>{result.attackerName}</p>
            <div className="flex flex-wrap gap-1 justify-center min-h-[4rem]">
              {result.attackerRolls.length === 0
                ? <span className="text-xs self-center" style={{ color: "#5a4a3a" }}>—</span>
                : result.attackerRolls.map((v, i) => <GothicDie key={i} value={v} />)
              }
            </div>
            <p className="text-3xl font-black" style={{ color: "#d4af37", fontFamily: "var(--font-gothic)" }}>{attackTotal}</p>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-bold truncate" style={{ color: "#e8d5b0" }}>{result.targetName}</p>
            <div className="flex flex-wrap gap-1 justify-center min-h-[4rem]">
              {result.defenderRolls.length === 0
                ? <span className="text-xs self-center" style={{ color: "#5a4a3a" }}>—</span>
                : result.defenderRolls.map((v, i) => <GothicDie key={i} value={v} />)
              }
            </div>
            <p className="text-3xl font-black" style={{ color: "#d4af37", fontFamily: "var(--font-gothic)" }}>{defendTotal}</p>
          </div>
        </div>

        {/* Result banner */}
        <div className="rounded-xl px-4 py-3" style={{ background: winnerBg, border: `1px solid ${winnerBorder}` }}>
          {result.winner === "tie" && (
            <p className="text-sm font-bold" style={{ color: winnerColor }}>Draw — no damage dealt</p>
          )}
          {result.winner === "attacker" && (
            <p className="text-sm font-bold leading-relaxed" style={{ color: winnerColor }}>
              {result.targetName} takes{" "}
              <span className="text-xl">{result.damage}</span> Might damage
              {result.damage >= 4 && " 💀"}
            </p>
          )}
          {result.winner === "defender" && (
            <p className="text-sm font-bold leading-relaxed" style={{ color: winnerColor }}>
              Counter-strike! {result.attackerName} takes{" "}
              <span className="text-xl">{result.damage}</span> Might damage
            </p>
          )}
        </div>

        <button onClick={onDismiss}
          className="w-full py-2.5 rounded-xl text-sm font-bold"
          style={{ background: "rgba(212,175,55,0.1)", border: "1px solid rgba(212,175,55,0.25)", color: "#d4af37", fontFamily: "var(--font-gothic)" }}>
          Continue
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function BetrayalPlaying({ code, dbSession, players, myPlayerId, isHost }: Props) {
  const lang = getLang();
  const gs = dbSession.game_state;

  const { muted, toggleMute } = useAmbientAudio(
    gs.phase === "haunt"
      ? "/audio/betrayal/haunt-phase.mp3"
      : "/audio/betrayal/exploring.mp3",
  );
  const playSfx = useSfx();

  const myIndex = players.findIndex((p) => p.id === myPlayerId);
  const myState = myPlayerId ? gs.player_states[myPlayerId] ?? null : null;
  const myChar = myState ? getCharacter(myState.character_id) : null;

  const currentPlayerId = gs.turn_order[gs.current_turn_index] ?? null;
  const isMyTurn = currentPlayerId === myPlayerId;
  const currentPlayer = players.find((p) => p.id === currentPlayerId);

  const [pendingCard, setPendingCard] = useState<string | null>(null);
  const [diceResult, setDiceResult] = useState<{ values: number[]; label: string } | null>(null);
  const [hauntDismissed, setHauntDismissed] = useState(false);
  const [showAttackTargets, setShowAttackTargets] = useState(false);
  const [combatResult, setCombatResult] = useState<CombatResultData | null>(null);

  // Valid attack targets: living players on the same tile, opposing team
  const validAttackTargets = useMemo(() => {
    if (gs.phase !== "haunt" || !myState || gs.turn_phase !== "action") return [];
    return players.filter((p) => {
      if (p.id === myPlayerId) return false;
      const ps = gs.player_states[p.id];
      if (!ps || ps.is_dead) return false;
      // Same tile only
      return ps.floor === myState.floor && ps.x === myState.x && ps.y === myState.y;
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

    const tile = tileAt(gs.placed_tiles, floor, x, y);
    if (!tile) return;
    const def = getTile(tile.tile_id);
    const newLog = [...gs.event_log];

    // Cost: 1 move per room
    const newMovesUsed = gs.moves_used + 1;
    const movesLeft = myState.speed - newMovesUsed;

    const newPlayerStates = {
      ...gs.player_states,
      [myPlayerId!]: { ...myState, x, y, floor },
    };

    let patch: Partial<BetrayalGameState> = {
      player_states: newPlayerStates,
      moves_used: newMovesUsed,
    };

    newLog.push(addLog("move", `${players.find(p => p.id === myPlayerId)?.name} moved to ${def?.name}`));
    patch.event_log = newLog.slice(-30);

    // Auto-transition to action phase when moves are exhausted
    if (movesLeft <= 0) {
      patch.turn_phase = "action";
    }

    playSfx("/audio/betrayal/sfx/footstep.mp3");
    await updateGs(patch);

    // Room card trigger
    if (def?.type && def.type !== "normal" && def.type !== "stairwell") {
      let cardId: string | null = null;
      if (def.type === "item" && gs.item_deck.length > 0) cardId = gs.item_deck[0];
      if (def.type === "omen" && gs.omen_deck.length > 0) cardId = gs.omen_deck[0];
      if (def.type === "event" && gs.event_deck.length > 0) cardId = gs.event_deck[0];
      if (cardId) setPendingCard(cardId);
    }
  }, [isMyTurn, myState, gs, myPlayerId, players, addLog, updateGs, playSfx]);

  // ── Reveal tile ───────────────────────────────────────────────────────────
  const handleRevealTile = useCallback(async (x: number, y: number, floor: Floor) => {
    if (!isMyTurn || !myState) return;
    const pool = gs.remaining_tiles[floor];
    if (pool.length === 0) return;

    // Pick random tile from pool
    const idx = Math.floor(Math.random() * pool.length);
    const tileId = pool[idx];
    const newPool = pool.filter((_, i) => i !== idx);

    // Figure out required door direction (player must be coming FROM somewhere)
    // Find which adjacent placed tile has a door toward (x, y)
    const dirs = [
      { dx: 0, dy: -1, requiredDoor: "south" as const }, // north of target → need south door on new tile
      { dx: 0, dy: 1,  requiredDoor: "north" as const },
      { dx: 1, dy: 0,  requiredDoor: "west"  as const },
      { dx: -1, dy: 0, requiredDoor: "east"  as const },
    ];
    let requiredDoor: "north" | "south" | "east" | "west" = "south";
    for (const { dx, dy, requiredDoor: rd } of dirs) {
      const adj = tileAt(gs.placed_tiles, floor, x + dx, y + dy);
      if (adj) { requiredDoor = rd; break; }
    }

    const placed = buildPlacedTile(tileId, floor, x, y, requiredDoor, myPlayerId!);
    if (!placed) return; // couldn't fit — skip (draw next in production)

    const newTiles = [...gs.placed_tiles, placed];
    const newRemaining = { ...gs.remaining_tiles, [floor]: newPool };
    const newLog = [...gs.event_log, addLog("tile_reveal", `${players.find(p => p.id === myPlayerId)?.name} discovered ${getTile(tileId)?.name}`)];

    // Move player into new tile
    const newPlayerStates = {
      ...gs.player_states,
      [myPlayerId!]: { ...myState, x, y, floor },
    };

    playSfx("/audio/betrayal/sfx/tile-reveal.mp3");
    await updateGs({
      placed_tiles: newTiles,
      remaining_tiles: newRemaining,
      player_states: newPlayerStates,
      moves_used: myState.speed, // exploring costs all remaining moves
      turn_phase: "action",
      event_log: newLog.slice(-30),
    });
  }, [isMyTurn, myState, gs, myPlayerId, players, addLog, updateGs, playSfx]);

  // ── Draw card (resolve pending card) ─────────────────────────────────────
  const handleDrawCard = useCallback(async (cardId: string, cardType: "item" | "omen" | "event") => {
    if (!myState) return;
    const deckKey = `${cardType}_deck` as "item_deck" | "omen_deck" | "event_deck";
    const discardKey = `${cardType}_discard` as "item_discard" | "omen_discard" | "event_discard";

    const newDeck = gs[deckKey].slice(1);
    const newDiscard = [cardId, ...gs[discardKey]];
    const newLog = [...gs.event_log, addLog("card_draw", `${players.find(p => p.id === myPlayerId)?.name} drew ${getCard(cardId)?.name}`)];

    let patch: Partial<BetrayalGameState> = {
      [deckKey]: newDeck,
      [discardKey]: newDiscard,
      event_log: newLog.slice(-30),
    };

    if (cardType === "item") {
      playSfx("/audio/betrayal/sfx/item-pickup.mp3");
      // Add to player inventory
      const newItems = [...(myState.items ?? []), cardId];
      patch.player_states = { ...gs.player_states, [myPlayerId!]: { ...myState, items: newItems } };
    }

    if (cardType === "omen") {
      playSfx("/audio/betrayal/sfx/omen-draw.mp3");
      // Haunt roll: roll 2 dice (each 0-2), if sum < omen_count → haunt
      const newOmenCount = gs.omen_count + 1;
      patch.omen_count = newOmenCount;

      const roll = rollDice(2);
      const rollSum = roll.reduce((a, b) => a + b, 0);

      if (rollSum < newOmenCount) {
        // HAUNT BEGINS
        playSfx("/audio/betrayal/sfx/haunt-begin.mp3");
        const currentTile = tileAt(gs.placed_tiles, myState.floor, myState.x, myState.y);
        const haunt = findHaunt(cardId, currentTile?.tile_id ?? "");
        // Pick traitor randomly (not the player who triggered)
        const eligible = gs.turn_order.filter((id) => id !== myPlayerId && !gs.player_states[id]?.is_dead);
        const traitorId = eligible[Math.floor(Math.random() * eligible.length)] ?? myPlayerId!;

        const newPlayerStates = { ...gs.player_states };
        newPlayerStates[traitorId] = { ...newPlayerStates[traitorId], is_traitor: true };

        patch = {
          ...patch,
          phase: "haunt",
          haunt_number: haunt.number,
          traitor_id: traitorId,
          player_states: newPlayerStates,
          haunt_objectives: { traitor: haunt.traitorObjective, heroes: haunt.heroObjective },
          event_log: [...newLog, addLog("haunt", `The Haunt begins! "${haunt.name}"`)].slice(-30),
        };
      } else {
        playSfx("/audio/betrayal/sfx/dice-roll.mp3");
        setDiceResult({ values: roll, label: `Haunt Roll — needed < ${newOmenCount}, rolled ${rollSum}. Safe.` });
      }
    }

    if (cardType === "event") {
      playSfx("/audio/betrayal/sfx/ghost-ambient.mp3");
    }

    await updateGs(patch);
    setPendingCard(null);
  }, [myState, gs, myPlayerId, players, addLog, updateGs, playSfx]);

  // ── Attack ────────────────────────────────────────────────────────────────
  const handleAttack = useCallback(async (targetId: string) => {
    if (!isMyTurn || !myState || gs.turn_phase !== "action" || gs.phase !== "haunt") return;
    const targetState = gs.player_states[targetId];
    if (!targetState || targetState.is_dead) return;

    // Roll Might dice for both sides (each die: 0-2)
    const attackerRolls = rollDice(Math.max(1, myState.might));
    const defenderRolls = rollDice(Math.max(1, targetState.might));
    const attackTotal = attackerRolls.reduce((a, b) => a + b, 0);
    const defendTotal = defenderRolls.reduce((a, b) => a + b, 0);

    const attackerPlayer = players.find((p) => p.id === myPlayerId);
    const targetPlayer   = players.find((p) => p.id === targetId);

    let winner: "attacker" | "defender" | "tie" = "tie";
    let damage = 0;
    const newPlayerStates = { ...gs.player_states };

    if (attackTotal > defendTotal) {
      winner = "attacker";
      damage = attackTotal - defendTotal;
      const newMight = Math.max(0, targetState.might - damage);
      newPlayerStates[targetId] = {
        ...targetState,
        might: newMight,
        is_dead: newMight <= 0,
      };
      if (newMight <= 0) playSfx("/audio/betrayal/sfx/scream.mp3");
      else playSfx("/audio/betrayal/sfx/stat-drop.mp3");
    } else if (defendTotal > attackTotal) {
      winner = "defender";
      damage = defendTotal - attackTotal;
      const newMight = Math.max(0, myState.might - damage);
      newPlayerStates[myPlayerId!] = {
        ...myState,
        might: newMight,
        is_dead: newMight <= 0,
      };
      if (newMight <= 0) playSfx("/audio/betrayal/sfx/scream.mp3");
      else playSfx("/audio/betrayal/sfx/stat-drop.mp3");
    } else {
      playSfx("/audio/betrayal/sfx/dice-roll.mp3");
    }

    const resultMsg =
      winner === "tie"
        ? `${attackerPlayer?.name} attacked ${targetPlayer?.name} — draw (${attackTotal} vs ${defendTotal})`
        : winner === "attacker"
        ? `${attackerPlayer?.name} hit ${targetPlayer?.name} for ${damage} Might${newPlayerStates[targetId].is_dead ? " — eliminated!" : ""}`
        : `${targetPlayer?.name} countered ${attackerPlayer?.name} for ${damage} Might${newPlayerStates[myPlayerId!]?.is_dead ? " — eliminated!" : ""}`;

    const newLog = [...gs.event_log, addLog("stat", resultMsg)].slice(-30);

    await updateGs({
      player_states: newPlayerStates,
      turn_phase: "done", // attacking costs your action for the turn
      event_log: newLog,
    });

    setCombatResult({
      attackerName: attackerPlayer?.name ?? "?",
      targetName: targetPlayer?.name ?? "?",
      attackerRolls,
      defenderRolls,
      damage,
      winner,
    });
    setShowAttackTargets(false);
  }, [isMyTurn, myState, gs, myPlayerId, players, addLog, updateGs, playSfx]);

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
    await updateGs({
      current_turn_index: nextIndex,
      turn_phase: "move",
      moves_used: 0,
    });
  }, [isMyTurn, gs, updateGs]);

  // ── Declare winner ────────────────────────────────────────────────────────
  const handleDeclareWinner = useCallback(async (winner: "heroes" | "traitor") => {
    await supabase.from("sessions").update({ phase: "ended", game_state: { ...gs, winner, phase: "ended" } }).eq("code", code);
  }, [gs, code]);

  // ─── Render ───────────────────────────────────────────────────────────────
  const myObjective = gs.haunt_objectives
    ? myState?.is_traitor
      ? gs.haunt_objectives.traitor
      : gs.haunt_objectives.heroes
    : null;

  const showHauntReveal = gs.phase === "haunt" && !hauntDismissed && gs.haunt_number != null;

  return (
    <div className="min-h-screen lg:h-screen flex flex-col lg:overflow-hidden" style={{ background: "#0a0708" }}>
      {/* Haunt reveal overlay */}
      {showHauntReveal && gs.haunt_objectives && (
        <HauntReveal
          hauntName={`Haunt #${gs.haunt_number}`}
          isTraitor={!!myState?.is_traitor}
          objective={myState?.is_traitor ? gs.haunt_objectives.traitor : gs.haunt_objectives.heroes}
          onDismiss={() => setHauntDismissed(true)}
        />
      )}

      {/* Card overlay */}
      {pendingCard && <CardOverlay cardId={pendingCard} onDismiss={() => {
        const card = getCard(pendingCard);
        if (card) handleDrawCard(pendingCard, card.type as "item" | "omen" | "event");
        else setPendingCard(null);
      }} />}

      {/* Dice overlay */}
      {diceResult && <DiceOverlay {...diceResult} onDismiss={() => setDiceResult(null)} />}

      {/* Combat result overlay */}
      {combatResult && <CombatOverlay result={combatResult} onDismiss={() => setCombatResult(null)} />}

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
            {/* Current turn */}
            <div className="px-2 py-1 rounded-lg text-xs"
              style={{ background: "rgba(212,175,55,0.08)", border: "1px solid rgba(212,175,55,0.15)", color: isMyTurn ? "#d4af37" : "#5a4a3a" }}>
              {isMyTurn ? "Your turn" : `${currentPlayer?.name ?? "?"}'s turn`}
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
          />
        </div>

        {/* ── Sidebar ────────────────────────────────────────────────────── */}
        <aside
          className="flex-shrink-0 lg:w-80 xl:w-96 flex flex-col gap-3 p-3 overflow-y-auto border-t lg:border-t-0 lg:border-l max-h-[48vh] lg:max-h-none"
          style={{ borderColor: "rgba(212,175,55,0.08)" }}
        >
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

          {/* Action bar */}
          {isMyTurn && (
            <div className="flex-shrink-0 flex flex-col gap-2">
              <div className="flex gap-2 flex-wrap">
                <button
                  onClick={handleEndTurn}
                  className="flex-1 py-2 rounded-xl text-sm font-bold"
                  style={{ background: "rgba(212,175,55,0.1)", border: "1px solid rgba(212,175,55,0.3)", color: "#d4af37", fontFamily: "var(--font-gothic)" }}>
                  End Turn
                </button>

                {gs.phase === "haunt" && gs.turn_phase === "action" && validAttackTargets.length > 0 && !showAttackTargets && (
                  <button onClick={() => setShowAttackTargets(true)}
                    className="flex-1 py-2 rounded-xl text-sm font-bold"
                    style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.35)", color: "#ef4444", fontFamily: "var(--font-gothic)" }}>
                    ⚔ Attack
                  </button>
                )}
                {gs.phase === "haunt" && myState?.is_traitor && (
                  <button onClick={() => handleDeclareWinner("traitor")}
                    className="flex-1 py-2 rounded-xl text-sm font-bold"
                    style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)", color: "#ef4444" }}>
                    Declare Victory
                  </button>
                )}
                {gs.phase === "haunt" && !myState?.is_traitor && (
                  <button onClick={() => handleDeclareWinner("heroes")}
                    className="flex-1 py-2 rounded-xl text-sm font-bold"
                    style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)", color: "#22c55e" }}>
                    Heroes Win
                  </button>
                )}
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
            </div>
          )}

          {/* My character panel */}
          {myChar && myState && (
            <div className="rounded-xl p-3 space-y-2" style={{ background: "rgba(13,10,26,0.8)", border: "1px solid rgba(212,175,55,0.1)" }}>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0"
                  style={{ background: "rgba(255,255,255,0.05)", border: `2px solid ${playerColor(myIndex)}` }}>
                  <img src={myChar.image} alt={myChar.name} className="w-full h-full object-cover" />
                </div>
                <div className="min-w-0">
                  <p className="font-bold text-sm truncate" style={{ color: "#e8d5b0", fontFamily: "var(--font-gothic)" }}>{myChar.name}</p>
                  <p className="text-xs italic truncate" style={{ color: "#5a4a3a" }}>{myChar.trait}</p>
                </div>
                {myState.is_traitor && (
                  <span className="ml-auto flex-shrink-0 text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(239,68,68,0.2)", color: "#ef4444" }}>Traitor</span>
                )}
              </div>
              <div className="space-y-1">
                <StatBar label="Speed"     value={myState.speed}     max={myChar.speedMax}     color={STAT_COLOR.speed} />
                <StatBar label="Might"     value={myState.might}     max={myChar.mightMax}     color={STAT_COLOR.might} />
                <StatBar label="Sanity"    value={myState.sanity}    max={myChar.sanityMax}    color={STAT_COLOR.sanity} />
                <StatBar label="Knowledge" value={myState.knowledge}  max={myChar.knowledgeMax} color={STAT_COLOR.knowledge} />
              </div>
              {myState.items.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {myState.items.map((itemId) => {
                    const item = getCard(itemId);
                    return item ? (
                      <div key={itemId} className="px-2 py-1 rounded-lg text-xs"
                        style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)", color: "#f59e0b" }}>
                        {item.name}
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
                      {p.name}
                      {ps?.is_traitor && <span className="ml-1 text-red-400">⚔</span>}
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

          {/* Event log */}
          <div className="rounded-xl p-3 space-y-1 flex-1 min-h-0 overflow-y-auto"
            style={{ background: "rgba(13,10,26,0.6)", border: "1px solid rgba(255,255,255,0.05)", minHeight: 80 }}>
            <p className="text-xs font-bold mb-1" style={{ color: "#5a4a3a", fontFamily: "var(--font-gothic)" }}>Event Log</p>
            {gs.event_log.slice().reverse().map((ev) => (
              <p key={ev.id} className="text-xs" style={{ color: "#7a6a5a" }}>
                <span style={{ color: "#4a3a2a" }}>{new Date(ev.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} </span>
                {ev.message}
              </p>
            ))}
            {gs.event_log.length === 0 && <p className="text-xs" style={{ color: "#3a2a1a" }}>The mansion awaits...</p>}
          </div>
        </aside>
      </div>
    </div>
  );
}

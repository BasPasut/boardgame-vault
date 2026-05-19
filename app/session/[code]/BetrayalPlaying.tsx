"use client";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import Link from "next/link";
import NextImage from "next/image";
import { supabase } from "@/lib/supabase";
import { getLang, saveLang } from "@/lib/utils/lang";
import { useAmbientAudio, useSfx } from "@/lib/hooks/useAmbientAudio";
import type { BetrayalGameState, PlacedTile, Floor, PlayerGameState } from "@/lib/games/betrayal/types";
import { TILE_DEFINITIONS, getTile, buildTilePools } from "@/lib/games/betrayal/data/tiles";
import { CHARACTERS, getCharacter } from "@/lib/games/betrayal/data/characters";
import { ITEM_CARDS, OMEN_CARDS, EVENT_CARDS, getCard, shuffle } from "@/lib/games/betrayal/data/cards";
import { findHaunt, getHaunt } from "@/lib/games/betrayal/data/haunts";
import {
  getReachable, getUnexploredDoors, buildPlacedTile,
  buildStartingTiles, tileAt,
} from "@/lib/games/betrayal/logic/mapEngine";
import type { Player } from "@/types/game";
import { useBotEngine } from "@/lib/games/betrayal/botEngine";

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

/**
 * Betrayal's custom 8-sided dice have only 3 pip values:
 *   0 → 2 faces (25%)   1 → 3 faces (37.5%)   2 → 3 faces (37.5%)
 * Mean per die = 9/8 = 1.125  (NOT 1.0 from uniform 0-2)
 */
function rollOneBetrayalDie(): number {
  const r = Math.random();
  if (r < 2 / 8) return 0; // 25%
  if (r < 5 / 8) return 1; // 37.5%
  return 2;                 // 37.5%
}
function rollDice(n: number): number[] {
  return Array.from({ length: n }, rollOneBetrayalDie);
}

/** Same weighted distribution — used for animation frame randomisation */
function randomBetrayalFace(): number { return rollOneBetrayalDie(); }
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
  myPlayerId, currentPlayerId, deckCount,
}: {
  tile: PlacedTile;
  playersHere: { player: Player; index: number; isDead?: boolean }[];
  isReachable: boolean;
  isMyPosition: boolean;
  onClick: () => void;
  isNew: boolean;
  myPlayerId: string | null;
  currentPlayerId: string | null;
  deckCount?: number;
}) {
  const def = getTile(tile.tile_id);
  const typeColor = {
    item: "rgba(245,158,11,0.7)", omen: "rgba(239,68,68,0.7)",
    event: "rgba(99,102,241,0.7)", stairwell: "rgba(34,197,94,0.7)", normal: "transparent",
  }[def?.type ?? "normal"];

  const livingHere = playersHere.filter(p => !p.isDead);
  const hasPlayers = livingHere.length > 0;

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
          : hasPlayers
          ? "1px solid rgba(255,255,255,0.18)"
          : "1px solid rgba(255,255,255,0.08)",
        borderRadius: 6,
        background: def?.image
          ? `url(${def.image}) center/cover no-repeat`
          : "rgba(30,20,10,0.8)",
        boxShadow: isMyPosition
          ? "0 0 14px rgba(212,175,55,0.45)"
          : isReachable
          ? "0 0 12px rgba(212,175,55,0.3)"
          : hasPlayers
          ? "0 0 8px rgba(255,255,255,0.08)"
          : undefined,
        overflow: "hidden",
      }}
    >
      {/* Type badge + deck count */}
      {def?.type && def.type !== "normal" && (
        <div className="absolute top-1 right-1 flex items-center gap-0.5">
          {deckCount !== undefined && deckCount > 0 && (
            <span className="text-white font-bold leading-none px-1 rounded"
              style={{ fontSize: 7, background: typeColor }}>
              {deckCount}
            </span>
          )}
          <div className="w-2 h-2 rounded-full" style={{ background: typeColor }} />
        </div>
      )}

      {/* Door indicators */}
      {tile.doors.north && <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3 h-1 rounded-b" style={{ background: "rgba(212,175,55,0.6)" }} />}
      {tile.doors.south && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3 h-1 rounded-t" style={{ background: "rgba(212,175,55,0.6)" }} />}
      {tile.doors.east  && <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1 h-3 rounded-l" style={{ background: "rgba(212,175,55,0.6)" }} />}
      {tile.doors.west  && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-3 rounded-r" style={{ background: "rgba(212,175,55,0.6)" }} />}

      {/* Player tokens — centered in the tile, above the name bar */}
      {hasPlayers && (
        <div className="absolute inset-x-0 flex justify-center items-center gap-1 flex-wrap"
          style={{ top: 4, bottom: 18 }}>
          {livingHere.slice(0, 4).map(({ player, index }) => {
            const isMe      = player.id === myPlayerId;
            const isCurrent = player.id === currentPlayerId;
            return (
              <div key={player.id} className="relative flex-shrink-0">
                {/* Pulse ring for current-turn player */}
                {isCurrent && (
                  <div className="absolute -inset-1.5 rounded-full animate-ping"
                    style={{ background: playerColor(index), opacity: 0.4 }} />
                )}
                <div
                  className="relative w-7 h-7 rounded-full flex items-center justify-center font-black"
                  style={{
                    background: playerColor(index),
                    fontSize: 11,
                    color: "#fff",
                    border: isMe
                      ? "2px solid #fbbf24"
                      : "2px solid rgba(255,255,255,0.9)",
                    boxShadow: isMe
                      ? "0 0 10px rgba(251,191,36,0.9), 0 2px 6px rgba(0,0,0,0.8)"
                      : "0 2px 6px rgba(0,0,0,0.8)",
                    letterSpacing: 0,
                  }}
                >
                  {player.name[0].toUpperCase()}
                </div>
              </div>
            );
          })}
          {/* "+N more" badge when >4 players on a tile */}
          {livingHere.length > 4 && (
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
              style={{ background: "rgba(0,0,0,0.6)", border: "2px solid rgba(255,255,255,0.5)", fontSize: 9 }}>
              +{livingHere.length - 4}
            </div>
          )}
        </div>
      )}

      {/* Dead player ghosts — small, faded, top-left */}
      {playersHere.some(p => p.isDead) && (
        <div className="absolute top-1 left-1 flex gap-0.5">
          {playersHere.filter(p => p.isDead).slice(0, 2).map(({ player, index }) => (
            <div key={player.id}
              className="w-3.5 h-3.5 rounded-full flex items-center justify-center font-bold"
              style={{
                background: "#374151",
                fontSize: 7,
                color: "rgba(255,255,255,0.4)",
                border: "1px solid rgba(255,255,255,0.15)",
                opacity: 0.5,
              }}>
              ✝
            </div>
          ))}
        </div>
      )}

      {/* Overlay label */}
      <div className="absolute bottom-0 left-0 right-0 text-center px-0.5 py-0.5 leading-tight truncate"
        style={{ background: "rgba(0,0,0,0.72)", color: "#e8d5b0", fontSize: 9, fontFamily: "var(--font-gothic)" }}>
        {def?.name ?? tile.tile_id}
      </div>
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
  const [zoom, setZoom] = useState(1.0);

  // Auto-follow player when they change floors (e.g. via stairwell)
  useEffect(() => {
    if (myState?.floor !== undefined) setViewFloor(myState.floor);
  }, [myState?.floor]);

  // Auto-clear the "new tile" highlight after animation finishes
  useEffect(() => {
    if (!newTileKey) return;
    const t = setTimeout(() => setNewTileKey(""), 700);
    return () => clearTimeout(t);
  }, [newTileKey]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setZoom((z) => Math.max(0.45, Math.min(2.5, z - e.deltaY * 0.0012)));
    }
  }, []);

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

  const currentPlayerId = gs.turn_order[gs.current_turn_index] ?? null;

  // Reachable tiles for current player — includes cross-floor stairwell connections
  const reachable = useMemo(() => {
    if (!isMyTurn || !myState || gs.turn_phase !== "move") return new Set<string>();
    const isRestrained = (gs.restrained_players ?? []).includes(myPlayerId ?? "");
    const effectiveSpeed = isRestrained ? Math.max(0, myState.speed - 1) : myState.speed;
    const movesLeft = effectiveSpeed - gs.moves_used;
    if (movesLeft <= 0) return new Set<string>();
    return getReachable(gs.placed_tiles, myState.floor, myState.x, myState.y, movesLeft, gs.locked_doors ?? []);
  }, [gs, myState, isMyTurn, myPlayerId]);

  // Unexplored doors on the viewed floor — only show when tiles remain for that floor
  const unexplored = useMemo(() => {
    if ((gs.remaining_tiles[viewFloor]?.length ?? 0) === 0) return [];
    return getUnexploredDoors(gs.placed_tiles, viewFloor);
  }, [gs.placed_tiles, gs.remaining_tiles, viewFloor]);

  // Only show explorable doors when on the player's own floor
  const explorable = useMemo(() => {
    if (!isMyTurn || !myState || myState.floor !== viewFloor || gs.turn_phase !== "move") return [];
    const isRestrained = (gs.restrained_players ?? []).includes(myPlayerId ?? "");
    const effectiveSpeed = isRestrained ? Math.max(0, myState.speed - 1) : myState.speed;
    const movesLeft = effectiveSpeed - gs.moves_used;
    if (movesLeft <= 0) return [];
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

  // Deck count per tile type (so players know how many cards remain)
  const deckCounts: Record<string, number> = {
    item: gs.item_deck.length,
    omen: gs.omen_deck.length,
    event: gs.event_deck.length,
  };

  return (
    <div className="flex flex-col gap-2 flex-1 min-h-0">
      {/* Floor tabs + zoom controls */}
      <div className="flex items-center gap-1.5">
        <div className="flex gap-1 flex-1 flex-wrap">
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
        {/* Zoom controls */}
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => setZoom((z) => Math.max(0.45, +(z - 0.15).toFixed(2)))}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold transition-colors"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#7a6a5a" }}
            title="Zoom out"
          >−</button>
          <button
            onClick={() => setZoom(1)}
            className="text-xs px-1.5 py-1 rounded-lg min-w-[3.2rem] text-center transition-colors"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", color: "#5a4a3a" }}
            title="Reset zoom"
          >{Math.round(zoom * 100)}%</button>
          <button
            onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.15).toFixed(2)))}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-sm font-bold transition-colors"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#7a6a5a" }}
            title="Zoom in"
          >+</button>
        </div>
      </div>

      {/* Stairwell hint — visible when player is on a stairwell and has moves */}
      {isMyTurn && myState && gs.turn_phase === "move" && (((gs.restrained_players ?? []).includes(myPlayerId ?? "") ? Math.max(0, myState.speed - 1) : myState.speed) - gs.moves_used > 0) && (() => {
        const curTile = gs.placed_tiles.find(t => t.floor === myState.floor && t.x === myState.x && t.y === myState.y);
        const isOnStairwell = curTile && getTile(curTile.tile_id)?.type === "stairwell";
        const otherFloors = ([0,1,2] as Floor[]).filter(f => f !== myState.floor && gs.placed_tiles.some(t => t.floor === f && getTile(t.tile_id)?.type === "stairwell"));
        if (!isOnStairwell || otherFloors.length === 0) return null;
        return (
          <div className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs"
            style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)", color: "#22c55e" }}>
            <span>🪜 On stairwell — switch floor tab to see where you can go</span>
          </div>
        );
      })()}

      {/* Map viewport — capped on mobile, fills column on desktop */}
      <div className="rounded-xl overflow-auto flex-1 min-h-0 max-h-[52vh] lg:max-h-none" onWheel={handleWheel} style={{
        background: FLOOR_COLORS[viewFloor],
        border: "1px solid rgba(212,175,55,0.15)",
        minHeight: 200,
      }}>
        <div className="relative" style={{ width: worldW, height: worldH, minWidth: "100%", zoom: zoom }}>
          {/* Placed tiles */}
          {floorTiles.map((tile) => {
            const px = (tile.x - minX) * TILE_PX;
            const py = (tile.y - minY) * TILE_PX;
            const key = `${viewFloor},${tile.x},${tile.y}`;
            const isMyPos = myState?.floor === viewFloor && myState.x === tile.x && myState.y === tile.y;
            const tileDef = getTile(tile.tile_id);
            const dc = tileDef?.type && tileDef.type !== "normal" && tileDef.type !== "stairwell"
              ? deckCounts[tileDef.type]
              : undefined;
            return (
              <div key={tile.tile_id} style={{ position: "absolute", left: px, top: py }}>
                <MapTile
                  tile={tile}
                  playersHere={playersByTile.get(`${tile.x},${tile.y}`) ?? []}
                  isReachable={reachable.has(key)}
                  isMyPosition={isMyPos}
                  isNew={`${viewFloor}-${tile.x}-${tile.y}` === newTileKey}
                  myPlayerId={myPlayerId}
                  currentPlayerId={currentPlayerId}
                  deckCount={dc}
                  onClick={() => {
                    if (reachable.has(key)) onMove(tile.x, tile.y, viewFloor);
                  }}
                />
              </div>
            );
          })}

          {/* Locked door icons */}
          {(gs.locked_doors ?? []).filter(k => k.startsWith(`${viewFloor},`)).map(key => {
            const parts = key.split(",");
            const tx = parseInt(parts[1]), ty = parseInt(parts[2]), dir = parts[3];
            const px = (tx - minX) * TILE_PX;
            const py = (ty - minY) * TILE_PX;
            const edgeStyle: React.CSSProperties =
              dir === "north" ? { top: 0, left: "50%", transform: "translate(-50%,-50%)" } :
              dir === "south" ? { bottom: 0, left: "50%", transform: "translate(-50%,50%)" } :
              dir === "east"  ? { right: 0, top: "50%", transform: "translate(50%,-50%)" } :
                                { left: 0, top: "50%", transform: "translate(-50%,-50%)" };
            return (
              <div key={`lock-${key}`} style={{ position: "absolute", left: px, top: py, width: TILE_PX, height: TILE_PX, pointerEvents: "none" }}>
                <div style={{ position: "absolute", ...edgeStyle, fontSize: 14, zIndex: 15, background: "rgba(10,5,5,0.9)", borderRadius: 4, padding: "1px 2px", lineHeight: 1 }}>🔒</div>
              </div>
            );
          })}

          {/* Unexplored doors — only render when tile pool has rooms left for this floor */}
          {(gs.remaining_tiles[viewFloor]?.length ?? 0) > 0 && unexplored.map(({ x, y }) => {
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
        <span><span className="inline-block w-2 h-2 rounded-full bg-yellow-500 mr-1" />Item ({gs.item_deck.length})</span>
        <span><span className="inline-block w-2 h-2 rounded-full bg-red-500 mr-1" />Omen ({gs.omen_deck.length})</span>
        <span><span className="inline-block w-2 h-2 rounded-full bg-indigo-500 mr-1" />Event ({gs.event_deck.length})</span>
        <span><span className="inline-block w-2 h-2 rounded-full bg-green-500 mr-1" />Stairwell</span>
        {(gs.remaining_tiles[viewFloor]?.length ?? 0) > 0
          ? <span>🚪 {gs.remaining_tiles[viewFloor].length} room{gs.remaining_tiles[viewFloor].length !== 1 ? "s" : ""} left to explore</span>
          : <span style={{ color: "#7a6a5a" }}>🚫 No more rooms for this floor</span>
        }
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
        <NextImage
          src={splashSrc}
          alt=""
          aria-hidden
          fill
          priority
          sizes="100vw"
          className="object-cover pointer-events-none"
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

function CardOverlay({ cardId, onDismiss, lang = "en" }: { cardId: string; onDismiss: () => void; lang?: "en" | "th" }) {
  const card = getCard(cardId);
  const [imgErr, setImgErr]       = useState(false);
  const [backErr, setBackErr]     = useState(false);
  const [revealed, setRevealed]   = useState(false);

  if (!card) return null;
  const typeColor = { item: "#f59e0b", omen: "#ef4444", event: "#6366f1" }[card.type] ?? "#d4af37";
  const typeLabel = lang === "th"
    ? ({ item: "ไอเทม", omen: "ลางร้าย", event: "เหตุการณ์" }[card.type] ?? card.type)
    : ({ item: "Item", omen: "Omen", event: "Event" }[card.type] ?? card.type);
  const revealLabel   = lang === "th" ? "เปิดไพ่" : "Reveal Card";
  const dismissLabel  = lang === "th" ? "รับทราบ" : "Understood";
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
            <NextImage src={card.image} alt={card.name}
              fill priority
              sizes="(max-width: 640px) 100vw, 384px"
              className="object-contain"
              style={{ opacity: 0.85 }}
              onError={() => setImgErr(true)} />
          )}
          {/* Card back (shown before reveal) */}
          {!revealed && !backErr && (
            <NextImage src={CARD_BACK[card.type]}
              alt="card back"
              fill priority
              sizes="(max-width: 640px) 100vw, 384px"
              className="object-contain"
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
                {dismissLabel}
              </button>
            </>
          ) : (
            <button onClick={() => setRevealed(true)}
              className="w-full py-3 rounded-xl text-sm font-bold"
              style={{ background: `${typeColor}18`, border: `1px solid ${typeColor}40`, color: typeColor, fontFamily: "var(--font-gothic)" }}>
              {revealLabel}
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

function GothicDie({ value, rolling }: { value: number; rolling?: boolean }) {
  const [err, setErr]         = useState(false);
  const [display, setDisplay] = useState<number>(() => rolling ? randomBetrayalFace() : value);
  const [spinning, setSpinning] = useState(!!rolling);

  useEffect(() => {
    if (!rolling) {
      setDisplay(value);
      setSpinning(false);
      return;
    }
    setSpinning(true);
    let count = 0;
    const id = setInterval(() => {
      count++;
      if (count < 12) {
        setDisplay(randomBetrayalFace());
      } else {
        clearInterval(id);
        setDisplay(value);
        setSpinning(false);
      }
    }, 65);
    return () => clearInterval(id);
  }, [value, rolling]);

  return (
    <div
      className={`relative w-16 h-16 rounded-xl flex items-center justify-center select-none ${spinning ? "animate-dice-shake" : ""}`}
      style={{
        background: "rgba(212,175,55,0.12)",
        border: `2px solid ${spinning ? "rgba(212,175,55,0.7)" : "rgba(212,175,55,0.45)"}`,
        transition: "border-color 0.3s",
        boxShadow: spinning ? "0 0 12px rgba(212,175,55,0.25)" : undefined,
      }}
    >
      {!err ? (
        <NextImage
          src={DICE_FACES[display]}
          alt={String(display)}
          width={48} height={48}
          className="object-contain"
          style={{ transition: "none" }}
          onError={() => setErr(true)}
        />
      ) : (
        <span className="text-2xl font-black" style={{ color: "#d4af37", fontFamily: "var(--font-gothic)" }}>
          {display}
        </span>
      )}
    </div>
  );
}

function DiceOverlay({ values, label, onDismiss }: { values: number[]; label: string; onDismiss: () => void }) {
  const [rolling, setRolling] = useState(true);
  const total = values.reduce((a, b) => a + b, 0);

  useEffect(() => {
    const t = setTimeout(() => setRolling(false), 900);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.82)" }} onClick={rolling ? undefined : onDismiss}>
      <div className="text-center space-y-5 rounded-2xl p-8 animate-slide-up"
        style={{ background: "rgba(8,5,12,0.95)", border: "1px solid rgba(212,175,55,0.2)", backdropFilter: "blur(8px)" }}>
        <p className="text-xs uppercase tracking-widest" style={{ color: "#5a4a3a" }}>{label}</p>
        <div className="flex gap-4 justify-center">
          {values.map((v, i) => <GothicDie key={i} value={v} rolling={rolling} />)}
        </div>
        <p className="text-4xl font-black transition-all duration-300" style={{ color: "#e8d5b0", fontFamily: "var(--font-gothic)", opacity: rolling ? 0 : 1 }}>
          {total}
        </p>
        <p className="text-xs transition-opacity duration-300" style={{ color: "#5a4a3a", opacity: rolling ? 0 : 1 }}>
          Tap anywhere to continue
        </p>
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
  const [rolling, setRolling] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setRolling(false), 1100);
    return () => clearTimeout(t);
  }, []);

  const attackTotal = result.attackerRolls.reduce((a, b) => a + b, 0);
  const defendTotal = result.defenderRolls.reduce((a, b) => a + b, 0);
  const winnerColor = result.winner === "tie" ? "#d4af37" : result.winner === "attacker" ? "#ef4444" : "#22c55e";
  const winnerBorder = result.winner === "tie" ? "rgba(212,175,55,0.2)" : result.winner === "attacker" ? "rgba(239,68,68,0.3)" : "rgba(34,197,94,0.25)";
  const winnerBg = result.winner === "tie" ? "rgba(212,175,55,0.07)" : result.winner === "attacker" ? "rgba(239,68,68,0.1)" : "rgba(34,197,94,0.08)";

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.88)" }} onClick={rolling ? undefined : onDismiss}>
      <div className="max-w-sm w-full rounded-2xl p-6 space-y-5 text-center animate-slide-up"
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
                : result.attackerRolls.map((v, i) => <GothicDie key={i} value={v} rolling={rolling} />)
              }
            </div>
            <p className="text-3xl font-black transition-opacity duration-300" style={{ color: "#d4af37", fontFamily: "var(--font-gothic)", opacity: rolling ? 0 : 1 }}>{attackTotal}</p>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-bold truncate" style={{ color: "#e8d5b0" }}>{result.targetName}</p>
            <div className="flex flex-wrap gap-1 justify-center min-h-[4rem]">
              {result.defenderRolls.length === 0
                ? <span className="text-xs self-center" style={{ color: "#5a4a3a" }}>—</span>
                : result.defenderRolls.map((v, i) => <GothicDie key={i} value={v} rolling={rolling} />)
              }
            </div>
            <p className="text-3xl font-black transition-opacity duration-300" style={{ color: "#d4af37", fontFamily: "var(--font-gothic)", opacity: rolling ? 0 : 1 }}>{defendTotal}</p>
          </div>
        </div>

        {/* Result banner — hidden until dice settle */}
        <div className="rounded-xl px-4 py-3 transition-opacity duration-300" style={{ background: winnerBg, border: `1px solid ${winnerBorder}`, opacity: rolling ? 0 : 1 }}>
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

        <button onClick={onDismiss} disabled={rolling}
          className="w-full py-2.5 rounded-xl text-sm font-bold transition-opacity"
          style={{ opacity: rolling ? 0.3 : 1, background: "rgba(212,175,55,0.1)", border: "1px solid rgba(212,175,55,0.25)", color: "#d4af37", fontFamily: "var(--font-gothic)" }}>
          Continue
        </button>
      </div>
    </div>
  );
}

// ─── Betrayal Chat ────────────────────────────────────────────────────────────
// Explore phase  → "betrayal:all"     (everyone)
// Haunt / heroes → "betrayal:heroes"  (heroes only)
// Haunt / traitor→ "betrayal:traitor" (traitor only)

interface BetrayalMessage {
  id: string;
  session_code: string;
  from_id: string;
  to_id: string;
  body: string;
  created_at: string;
}

function BetrayalChat({
  code, myPlayerId, players, gs, myState,
}: {
  code: string;
  myPlayerId: string | null;
  players: Player[];
  gs: BetrayalGameState;
  myState: PlayerGameState | null;
}) {
  const [open, setOpen]       = useState(false);
  const [msgs, setMsgs]       = useState<BetrayalMessage[]>([]);
  const [input, setInput]     = useState("");
  const [unread, setUnread]   = useState(0);
  const endRef = useRef<HTMLDivElement>(null);

  // Which Supabase to_id does this player use right now?
  const channel = gs.phase === "haunt"
    ? (myState?.is_traitor ? "betrayal:traitor" : "betrayal:heroes")
    : "betrayal:all";

  // Messages this player is allowed to read
  const visible = msgs.filter((m) => {
    if (gs.phase !== "haunt") return m.to_id === "betrayal:all";
    return myState?.is_traitor
      ? m.to_id === "betrayal:traitor"
      : m.to_id === "betrayal:heroes";
  });

  // Load history + subscribe to new messages
  useEffect(() => {
    supabase
      .from("messages")
      .select("*")
      .eq("session_code", code)
      .in("to_id", ["betrayal:all", "betrayal:heroes", "betrayal:traitor"])
      .order("created_at")
      .then(({ data }) => { if (data) setMsgs(data as BetrayalMessage[]); });

    const sub = supabase
      .channel(`betrayal-chat-${code}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `session_code=eq.${code}` },
        (payload) => {
          const msg = payload.new as BetrayalMessage;
          if (!["betrayal:all", "betrayal:heroes", "betrayal:traitor"].includes(msg.to_id)) return;
          setMsgs((prev) => [...prev, msg]);
          if (msg.from_id !== myPlayerId) setUnread((n) => n + 1);
        })
      .subscribe();

    return () => { supabase.removeChannel(sub); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // Scroll to bottom + clear unread when panel is open
  useEffect(() => {
    if (open) {
      setUnread(0);
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 60);
    }
  }, [open, visible.length]);

  const send = async () => {
    if (!input.trim() || !myPlayerId) return;
    const body = input.trim();
    setInput("");
    await supabase.from("messages").insert({
      session_code: code,
      from_id: myPlayerId,
      to_id: channel,
      body,
    });
  };

  // UI theme derived from phase + role
  const isHaunt   = gs.phase === "haunt";
  const isTraitor = !!myState?.is_traitor;
  const accent = isHaunt ? (isTraitor ? "#ef4444" : "#22c55e") : "#d4af37";
  const panelBg = isHaunt ? (isTraitor ? "rgba(30,6,6,0.97)" : "rgba(6,20,10,0.97)") : "rgba(8,5,12,0.97)";
  const label  = isHaunt ? (isTraitor ? "💀 Traitor's Den" : "⚔ Heroes' Council") : "🏚 Manor Chat";
  const badge  = isHaunt ? (isTraitor ? "Private" : "Heroes only") : "All players";
  const placeholder = isHaunt
    ? (isTraitor ? "Scheme in secret…" : "Coordinate with your allies…")
    : "Speak to your companions…";
  const empty = isHaunt
    ? (isTraitor ? "Plan your betrayal…" : "Rally the heroes…")
    : "The mansion is silent…";

  const senderName = (id: string) => players.find((p) => p.id === id)?.name ?? "?";
  const senderIdx  = (id: string) => players.findIndex((p) => p.id === id);

  return (
    <>
      {/* ── Floating button ── */}
      {!open && (
        <button
          onClick={() => { setOpen(true); setUnread(0); }}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full flex items-center justify-center shadow-xl transition-transform hover:scale-105"
          style={{
            background: panelBg,
            border: `1.5px solid ${accent}44`,
            backdropFilter: "blur(10px)",
          }}
          title={label}
        >
          <span style={{ fontSize: 22 }}>
            {isHaunt ? (isTraitor ? "💀" : "⚔") : "💬"}
          </span>
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full text-xs flex items-center justify-center font-bold"
              style={{ background: "#8b1a1a", color: "#e8d5b0" }}>
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      )}

      {/* ── Chat panel ── */}
      {open && (
        <div
          className="fixed bottom-0 right-0 z-50 sm:bottom-6 sm:right-6 w-full sm:w-80 flex flex-col rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-2xl"
          style={{ height: 400, background: panelBg, border: `1px solid ${accent}28`, backdropFilter: "blur(14px)" }}
        >
          {/* Header */}
          <div className="flex items-center gap-2 px-4 py-3 flex-shrink-0"
            style={{ borderBottom: `1px solid ${accent}18` }}>
            <span className="flex-1 text-sm font-bold truncate"
              style={{ color: accent, fontFamily: "var(--font-gothic)" }}>
              {label}
            </span>
            <span className="flex-shrink-0 text-xs px-2 py-0.5 rounded-full"
              style={{ background: `${accent}14`, border: `1px solid ${accent}28`, color: accent }}>
              {badge}
            </span>
            <button onClick={() => setOpen(false)} className="text-sm ml-1 leading-none flex-shrink-0"
              style={{ color: "#5a4a3a" }}>✕</button>
          </div>

          {/* Haunt notice */}
          {isHaunt && (
            <div className="flex-shrink-0 px-3 py-1.5 text-center text-xs"
              style={{ background: `${accent}08`, borderBottom: `1px solid ${accent}14`, color: `${accent}99` }}>
              {isTraitor
                ? "⚔ The haunt has begun. Your plans are hidden from the heroes."
                : "🕯 The haunt has begun. Heroes only — the traitor cannot see this."}
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {visible.length === 0 && (
              <p className="text-center text-xs mt-10" style={{ color: "#3a2a1a", fontFamily: "var(--font-gothic)" }}>
                {empty}
              </p>
            )}
            {visible.map((m) => {
              const mine = m.from_id === myPlayerId;
              const idx  = senderIdx(m.from_id);
              return (
                <div key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                  {!mine && (
                    <span className="text-xs mb-0.5 px-1 font-medium"
                      style={{ color: playerColor(idx) }}>
                      {senderName(m.from_id)}
                    </span>
                  )}
                  <div className="max-w-[82%] px-3 py-2 text-sm leading-snug"
                    style={{
                      background: mine ? `${accent}1c` : "rgba(255,255,255,0.04)",
                      color: "#e8d5b0",
                      borderRadius: mine ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                      border: mine ? `1px solid ${accent}2e` : "1px solid rgba(255,255,255,0.06)",
                    }}>
                    {m.body}
                  </div>
                </div>
              );
            })}
            <div ref={endRef} />
          </div>

          {/* Input */}
          <div className="flex-shrink-0 p-3" style={{ borderTop: `1px solid ${accent}14` }}>
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder={placeholder}
                className="flex-1 px-3 py-2 rounded-xl text-sm focus:outline-none"
                style={{
                  background: "rgba(13,10,26,0.8)",
                  border: `1px solid ${accent}22`,
                  color: "#e8d5b0",
                }}
              />
              <button onClick={send} disabled={!input.trim()}
                className="px-3 py-2 rounded-xl font-bold disabled:opacity-30 transition-opacity"
                style={{ background: `${accent}1c`, color: accent }}>
                →
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Victory Screen ───────────────────────────────────────────────────────────
function VictoryScreen({
  gs, players, myPlayerId,
}: {
  gs: BetrayalGameState;
  players: Player[];
  myPlayerId: string | null;
}) {
  const heroesWin = gs.winner === "heroes";
  const myState = myPlayerId ? gs.player_states[myPlayerId] : null;
  const iWon = heroesWin ? !myState?.is_traitor : !!myState?.is_traitor;
  const accent = heroesWin ? "#d4af37" : "#ef4444";
  const accentBg = heroesWin ? "rgba(212,175,55,0.08)" : "rgba(239,68,68,0.1)";
  const accentBorder = heroesWin ? "rgba(212,175,55,0.3)" : "rgba(239,68,68,0.35)";

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden"
      style={{ background: "radial-gradient(ellipse at 50% 30%, #1a0808 0%, #0a0708 70%)" }}>
      {/* Atmospheric glow */}
      <div className="absolute inset-0 pointer-events-none"
        style={{
          background: heroesWin
            ? "radial-gradient(ellipse at 50% 20%, rgba(212,175,55,0.07) 0%, transparent 60%)"
            : "radial-gradient(ellipse at 50% 20%, rgba(139,26,26,0.12) 0%, transparent 60%)",
        }} />

      <div className="relative z-10 max-w-md w-full space-y-6 animate-slide-up">
        {/* Icon */}
        <div className="text-center">
          <div className="text-7xl mb-4 animate-victory-pulse inline-block">
            {heroesWin ? "🕯️" : "⚔️"}
          </div>
          <h1 className="text-4xl font-black mb-2" style={{ fontFamily: "var(--font-gothic)", color: accent }}>
            {heroesWin ? "The Heroes Prevail" : "The Traitor Triumphs"}
          </h1>
          <p className="text-base" style={{ color: "#7a6a5a" }}>
            {heroesWin ? "Darkness has been banished from the mansion." : "The mansion claims its prize. None shall leave."}
          </p>
        </div>

        {/* Personal result */}
        {myPlayerId && (
          <div className="rounded-xl p-4 text-center" style={{ background: iWon ? accentBg : "rgba(0,0,0,0.3)", border: `1px solid ${iWon ? accentBorder : "rgba(255,255,255,0.06)"}` }}>
            <p className="font-bold text-lg" style={{ fontFamily: "var(--font-gothic)", color: iWon ? accent : "#5a4a3a" }}>
              {iWon ? "⚔ Victory is yours" : "💀 You were defeated"}
            </p>
            {myState?.is_traitor && (
              <p className="text-xs mt-1" style={{ color: "#7a6a5a" }}>You were the Traitor</p>
            )}
          </div>
        )}

        {/* All players recap */}
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.06)" }}>
          <div className="px-4 py-2" style={{ background: "rgba(255,255,255,0.03)", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "#5a4a3a", fontFamily: "var(--font-gothic)" }}>
              Final Standings
            </p>
          </div>
          {players.map((p, idx) => {
            const ps = gs.player_states[p.id];
            const ch = ps ? getCharacter(ps.character_id) : null;
            if (!ps) return null;
            const survived = !ps.is_dead;
            return (
              <div key={p.id} className="flex items-center gap-3 px-4 py-2.5"
                style={{ borderBottom: "1px solid rgba(255,255,255,0.03)", opacity: survived ? 1 : 0.5 }}>
                {ch ? (
                  <div className="relative w-8 h-8 rounded-full overflow-hidden flex-shrink-0"
                    style={{ border: `2px solid ${ps.is_dead ? "#374151" : playerColor(idx)}` }}>
                    <NextImage src={ch.image} alt={ch.name} fill sizes="64px" className="object-cover object-top" />
                  </div>
                ) : (
                  <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-white"
                    style={{ background: ps.is_dead ? "#374151" : playerColor(idx), fontSize: 11 }}>
                    {ps.is_dead ? "✝" : p.name[0]}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate" style={{ color: survived ? "#e8d5b0" : "#5a4a3a" }}>
                    {p.name}
                    {p.id === myPlayerId && <span className="text-xs ml-1" style={{ color: "#4a3a2a" }}>(you)</span>}
                  </p>
                  {ch && <p className="text-xs truncate" style={{ color: "#5a4a3a" }}>{ch.name}</p>}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {ps.is_traitor && (
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(239,68,68,0.2)", color: "#ef4444" }}>Traitor</span>
                  )}
                  {ps.is_dead && (
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(255,255,255,0.05)", color: "#5a4a3a" }}>Eliminated</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <Link href="/" className="block w-full text-center btn-gothic-primary py-4 rounded-xl text-lg font-bold no-underline"
          style={{ fontFamily: "var(--font-gothic)" }}>
          ← Return to Vault
        </Link>
      </div>
    </div>
  );
}

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

  // Character dies if either Might OR Sanity hits 0
  const isDead = (might: number, sanity: number) => might <= 0 || sanity <= 0;

  // Amulet: once per game, survive a death — drop to 1 Sanity instead. Consumes the amulet.
  function checkAmulet(ps: PlayerGameState): { state: PlayerGameState; saved: boolean } {
    if (!ps.is_dead || !(ps.items ?? []).includes("amulet")) return { state: ps, saved: false };
    return {
      state: { ...ps, sanity: 1, might: Math.max(ps.might, 1), is_dead: false, items: ps.items.filter(id => id !== "amulet") },
      saved: true,
    };
  }

  // Effective attack Might includes weapon item bonuses
  const getAttackMight = (state: typeof myState) => {
    if (!state) return 1;
    let bonus = 0;
    const items = state.items ?? [];
    if (items.includes("axe"))                 bonus += 2;
    if (items.includes("knife"))               bonus += 1;
    if (items.includes("sacrificial-dagger")) bonus += 3;
    return Math.max(1, state.might + bonus);
  };

  const currentPlayerId = gs.turn_order[gs.current_turn_index] ?? null;
  const isMyTurn = currentPlayerId === myPlayerId;
  const currentPlayer = players.find((p) => p.id === currentPlayerId);

  const [pendingCard, setPendingCard] = useState<string | null>(null);
  const [viewingItemCard, setViewingItemCard] = useState<string | null>(null);
  const [diceResult, setDiceResult] = useState<{ values: number[]; label: string } | null>(null);
  const [hauntDismissed, setHauntDismissed] = useState(false);
  const [showAttackTargets, setShowAttackTargets] = useState(false);
  const [showRevolverTargets, setShowRevolverTargets] = useState(false);
  const [showRopeTargets, setShowRopeTargets] = useState(false);
  const [showDynamiteTargets, setShowDynamiteTargets] = useState(false);
  const [combatResult, setCombatResult] = useState<CombatResultData | null>(null);
  const [showBotLog, setShowBotLog] = useState(false);
  const [showDeathPopup, setShowDeathPopup] = useState(false);

  // Show death popup when my character dies
  const prevIsDead = useRef(false);
  useEffect(() => {
    const nowDead = myState?.is_dead ?? false;
    if (nowDead && !prevIsDead.current) setShowDeathPopup(true);
    prevIsDead.current = nowDead;
  }, [myState?.is_dead]);

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

    const tile = tileAt(gs.placed_tiles, floor, x, y);
    if (!tile) return;
    const def = getTile(tile.tile_id);
    const newLog = [...gs.event_log];

    // Cost: 1 move per room (cross-floor stairwell counts as 1)
    const newMovesUsed = gs.moves_used + 1;
    const isRestrained = (gs.restrained_players ?? []).includes(myPlayerId ?? "");
    const effectiveSpeed = isRestrained ? Math.max(0, myState.speed - 1) : myState.speed;
    const movesLeft = effectiveSpeed - newMovesUsed;

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

    playSfx("/audio/betrayal/sfx/footstep.mp3");
    await updateGs(patch);

    // Trigger card popup — tile is already marked drawn in the patch above
    if (isCardTile) {
      let cardId: string | null = null;
      if (def!.type === "item"  && gs.item_deck.length  > 0) cardId = gs.item_deck[0];
      if (def!.type === "omen"  && gs.omen_deck.length  > 0) cardId = gs.omen_deck[0];
      if (def!.type === "event" && gs.event_deck.length > 0) cardId = gs.event_deck[0];
      if (cardId) setPendingCard(cardId);
    }
  }, [isMyTurn, myState, gs, myPlayerId, players, addLog, updateGs, playSfx]);

  // ── Reveal tile ───────────────────────────────────────────────────────────
  const handleRevealTile = useCallback(async (x: number, y: number, floor: Floor) => {
    if (!isMyTurn || !myState) return;
    const pool = gs.remaining_tiles[floor];
    if (pool.length === 0) return;

    // Figure out required door direction: the new tile must have a door facing TOWARD its placed neighbor.
    const dirs = [
      { dx: 0, dy: -1, requiredDoor: "north" as const },
      { dx: 0, dy: 1,  requiredDoor: "south" as const },
      { dx: 1, dy: 0,  requiredDoor: "east"  as const },
      { dx: -1, dy: 0, requiredDoor: "west"  as const },
    ];
    let requiredDoor: "north" | "south" | "east" | "west" = "south";
    for (const { dx, dy, requiredDoor: rd } of dirs) {
      const adj = tileAt(gs.placed_tiles, floor, x + dx, y + dy);
      if (adj) { requiredDoor = rd; break; }
    }

    // Try tiles in random order until one fits the required door
    const startIdx = Math.floor(Math.random() * pool.length);
    let placed = null;
    let tileId = "";
    let newPool = pool;
    for (let attempt = 0; attempt < pool.length; attempt++) {
      const idx = (startIdx + attempt) % pool.length;
      const candidate = pool[idx];
      const candidatePlaced = buildPlacedTile(candidate, floor, x, y, requiredDoor, myPlayerId!);
      if (candidatePlaced) {
        placed = candidatePlaced;
        tileId = candidate;
        newPool = pool.filter((_, i) => i !== idx);
        break;
      }
    }
    if (!placed) return; // no tile in pool fits this door

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

    playSfx("/audio/betrayal/sfx/tile-reveal.mp3");
    await updateGs({
      placed_tiles: newTiles,
      remaining_tiles: newRemaining,
      player_states: newPlayerStates,
      moves_used: myState.speed, // exploring costs all remaining moves
      turn_phase: "action",
      event_log: newLog.slice(-30),
    });

    // Trigger card draw for the newly revealed tile
    if (willDrawCard) {
      let cardId: string | null = null;
      if (newDef!.type === "item"  && gs.item_deck.length  > 0) cardId = gs.item_deck[0];
      if (newDef!.type === "omen"  && gs.omen_deck.length  > 0) cardId = gs.omen_deck[0];
      if (newDef!.type === "event" && gs.event_deck.length > 0) cardId = gs.event_deck[0];
      if (cardId) setPendingCard(cardId);
    }
  }, [isMyTurn, myState, gs, myPlayerId, players, addLog, updateGs, playSfx]);

  // ── Draw card (resolve pending card) ─────────────────────────────────────
  const handleDrawCard = useCallback(async (cardId: string, cardType: "item" | "omen" | "event") => {
    if (!myState) return;
    const deckKey = `${cardType}_deck` as "item_deck" | "omen_deck" | "event_deck";
    const discardKey = `${cardType}_discard` as "item_discard" | "omen_discard" | "event_discard";

    const newDeck = gs[deckKey].slice(1);
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
        if (total >= 4) {
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
        setDiceResult({ values: roll, label: `Dark Vision — rolled ${total}` });
        patch.player_states = { ...gs.player_states, [myPlayerId!]: updatedState };
      } else if (cardId === "ev-cold-spot") {
        updatedState.speed = Math.max(myState.speed - 1, 0);
        newLog.push(addLog("stat", `${playerName} lost 1 Speed from Cold Spot`));
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
        setDiceResult({ values: roll, label: `Writing on the Wall — rolled ${total}` });
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
        setDiceResult({ values: roll, label: `Falling — rolled ${total} Might damage` });
        patch.player_states = { ...gs.player_states, [myPlayerId!]: updatedState };
      } else if (cardId === "ev-the-smell") {
        const roll = rollDice(2);
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
        } else {
          newLog.push(addLog("stat", `${playerName} escaped The Smell (rolled ${total})`));
        }
        setDiceResult({ values: roll, label: `The Smell — rolled ${total}` });
        patch.player_states = { ...gs.player_states, [myPlayerId!]: updatedState };
      } else if (cardId === "ev-discovery") {
        // Draw up to 2 item cards; player keeps both (simplified from "keep one")
        const drawn: string[] = [];
        let itemDeck = [...gs.item_deck];
        for (let i = 0; i < 2 && itemDeck.length > 0; i++) {
          drawn.push(itemDeck.shift()!);
        }
        if (drawn.length > 0) {
          updatedState.items = [...(myState.items ?? []), ...drawn];
          patch.item_deck = itemDeck;
          patch.item_discard = [...drawn, ...gs.item_discard];
          newLog.push(addLog("stat", `${playerName} discovered ${drawn.length} item(s) from Discovery`));
        }
        patch.player_states = { ...gs.player_states, [myPlayerId!]: updatedState };
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
      // Sacrificial Dagger costs 1 Sanity per use
      if (myState.items?.includes("sacrificial-dagger")) {
        const newSanity = Math.max(0, myState.sanity - 1);
        let mps = { ...myState, sanity: newSanity, is_dead: isDead(myState.might, newSanity) };
        if (mps.is_dead) {
          const { state: saved, saved: didSave } = checkAmulet(mps);
          if (didSave) { mps = saved; newLog2.push(addLog("stat", `${players.find(p => p.id === myPlayerId)?.name ?? "?"}'s Amulet saved them!`)); }
        }
        newPlayerStates[myPlayerId!] = mps;
      }
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

    const resultMsg =
      winner === "tie"
        ? `${attackerPlayer?.name} attacked ${targetPlayer?.name} — draw (${attackTotal} vs ${defendTotal})`
        : winner === "attacker"
        ? `${attackerPlayer?.name} hit ${targetPlayer?.name} for ${damage} Might${newPlayerStates[targetId].is_dead ? " — eliminated!" : ""}`
        : `${targetPlayer?.name} countered ${attackerPlayer?.name} for ${damage} Might${newPlayerStates[myPlayerId!]?.is_dead ? " — eliminated!" : ""}`;

    newLog2.push(addLog("stat", resultMsg));
    await updateGs({
      player_states: newPlayerStates,
      turn_phase: "done", // attacking costs your action for the turn
      event_log: newLog2.slice(-30),
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

  // ── Revolver attack (ranged — same floor) ─────────────────────────────────
  const handleRevolverAttack = useCallback(async (targetId: string) => {
    if (!isMyTurn || !myState || gs.turn_phase !== "action" || gs.phase !== "haunt") return;
    const targetState = gs.player_states[targetId];
    if (!targetState || targetState.is_dead) return;

    const attackerRolls = Array.from({ length: getAttackMight(myState) }, () => Math.floor(Math.random() * 3));
    const defenderRolls = Array.from({ length: targetState.might }, () => Math.floor(Math.random() * 3));
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
    await updateGs({ player_states: newPlayerStates, turn_phase: "done", event_log: revolverLog.slice(-30) });

    setCombatResult({ attackerName: attackerPlayer?.name ?? "?", targetName: targetPlayer?.name ?? "?", attackerRolls, defenderRolls, damage, winner });
    setShowRevolverTargets(false);
  }, [isMyTurn, myState, gs, myPlayerId, players, addLog, updateGs, playSfx]);

  // ── Rope attack (restrain target — they lose 1 Speed next turn) ───────────
  const handleRopeAttack = useCallback(async (targetId: string) => {
    if (!isMyTurn || !myState || gs.turn_phase !== "action" || gs.phase !== "haunt") return;
    if (!(myState.items ?? []).includes("rope")) return;
    const targetState = gs.player_states[targetId];
    if (!targetState || targetState.is_dead) return;

    const attackerRolls = rollDice(Math.max(1, myState.might));
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
    // Clear restraint for the player ending their turn (restraint lasts 1 turn)
    const currentId = gs.turn_order[gs.current_turn_index];
    const newRestrained = (gs.restrained_players ?? []).filter(id => id !== currentId);
    await updateGs({
      current_turn_index: nextIndex,
      turn_phase: "move",
      moves_used: 0,
      restrained_players: newRestrained,
    });
  }, [isMyTurn, gs, updateGs]);

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
    } else if (itemId === "smelling-salts") {
      const newSanity = Math.max(myState.sanity, 2);
      updatedState.sanity = newSanity;
      newLog.push(addLog("stat", `${playerName} used Smelling Salts (Sanity restored to 2)`));
    }

    await updateGs({
      player_states: { ...gs.player_states, [myPlayerId]: updatedState },
      event_log: newLog.slice(-30),
    });
  }, [isMyTurn, myState, myPlayerId, myChar, players, gs, addLog, updateGs]);

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
        <CardOverlay cardId={viewingItemCard} lang={lang} onDismiss={() => setViewingItemCard(null)} />
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
              style={{
                background: isBotTurn ? "rgba(99,102,241,0.10)" : "rgba(212,175,55,0.08)",
                border: `1px solid ${isBotTurn ? "rgba(99,102,241,0.3)" : isMyTurn ? "rgba(212,175,55,0.3)" : "rgba(212,175,55,0.15)"}`,
                color: isBotTurn ? "#818cf8" : isMyTurn ? "#d4af37" : "#5a4a3a",
              }}>
              {isBotTurn
                ? `🤖 ${currentPlayer?.name ?? "Bot"} thinking…`
                : isMyTurn
                ? "Your turn"
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
          />
        </div>

        {/* ── Sidebar ────────────────────────────────────────────────────── */}
        <aside
          className="flex-shrink-0 lg:w-80 xl:w-96 flex flex-col gap-3 p-3 overflow-y-auto border-t lg:border-t-0 lg:border-l max-h-[48vh] lg:max-h-none"
          style={{ borderColor: "rgba(212,175,55,0.08)" }}
        >
          {/* Haunt scenario guide — always visible during haunt */}
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
              <div className="flex-shrink-0 rounded-xl p-3 space-y-2 text-xs" style={{ background: bg, border: `1px solid ${border}` }}>
                <p className="font-black uppercase tracking-widest" style={{ color: accent, fontFamily: "var(--font-gothic)" }}>
                  {isTraitor ? "⚔" : "🕯"} Haunt #{gs.haunt_number} — {scenario.name}
                </p>
                <p style={{ color: "#c8b89a" }}><span className="font-bold">Goal: </span>{objective}</p>
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

          {/* Victory declaration — visible to any player during haunt (not just on turn) */}
          {gs.phase === "haunt" && myState && (
            <div className="flex-shrink-0 flex gap-2">
              {myState.is_traitor ? (
                <button onClick={() => handleDeclareWinner("traitor")}
                  className="flex-1 py-2 rounded-xl text-sm font-bold"
                  style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.4)", color: "#ef4444", fontFamily: "var(--font-gothic)" }}>
                  ⚔ Declare Traitor Victory
                </button>
              ) : (
                <button onClick={() => handleDeclareWinner("heroes")}
                  className="flex-1 py-2 rounded-xl text-sm font-bold"
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
                  className="flex-1 py-2 rounded-xl text-sm font-bold"
                  style={{ background: "rgba(212,175,55,0.1)", border: "1px solid rgba(212,175,55,0.3)", color: "#d4af37", fontFamily: "var(--font-gothic)" }}>
                  End Turn
                </button>

                {gs.phase === "haunt" && gs.turn_phase === "action" && validAttackTargets.length > 0 && !showAttackTargets && !showRevolverTargets && (
                  <button onClick={() => setShowAttackTargets(true)}
                    className="flex-1 py-2 rounded-xl text-sm font-bold"
                    style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.35)", color: "#ef4444", fontFamily: "var(--font-gothic)" }}>
                    ⚔ Attack
                  </button>
                )}
                {gs.phase === "haunt" && gs.turn_phase === "action" && revolverTargets.length > 0 && !showAttackTargets && !showRevolverTargets && (
                  <button onClick={() => setShowRevolverTargets(true)}
                    className="flex-1 py-2 rounded-xl text-sm font-bold"
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
                        setDiceResult({ values: rolls, label: total >= 4
                          ? `🏃 Garden Escape — ${total} ≥ 4! You escaped! Declare Heroes Win if all needed heroes are out.`
                          : `🏃 Garden Escape — ${total} < 4. Not fast enough — try again next turn.` });
                      }}
                      className="flex-1 py-2 rounded-xl text-sm font-bold"
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
                        setDiceResult({ values: rolls, label: total >= 4
                          ? `💪 Vault Break — ${total} ≥ 4! You broke through! Declare Heroes Win if 3 heroes have escaped.`
                          : `💪 Vault Break — ${total} < 4. Not strong enough — try again next turn.` });
                      }}
                      className="flex-1 py-2 rounded-xl text-sm font-bold"
                      style={{ background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.3)", color: "#22c55e", fontFamily: "var(--font-gothic)" }}>
                      💪 Vault Break (Might 4+)
                    </button>
                  );
                })()}
                {/* Rope attack — restrain a target in same room */}
                {gs.phase === "haunt" && gs.turn_phase === "action" && (myState?.items ?? []).includes("rope") && validAttackTargets.length > 0 && !showRopeTargets && !showAttackTargets && !showRevolverTargets && !showDynamiteTargets && (
                  <button onClick={() => setShowRopeTargets(true)}
                    className="flex-1 py-2 rounded-xl text-sm font-bold"
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
                      className="flex-1 py-2 rounded-xl text-sm font-bold"
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
                  <p className="text-xs italic leading-snug line-clamp-3" style={{ color: "#5a4a3a" }}>{myChar.trait}</p>
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
                    const isConsumable = itemId === "healing-salve" || itemId === "smelling-salts";
                    return item ? (
                      <div key={itemId} className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs cursor-pointer"
                        style={{ background: "rgba(245,158,11,0.1)", border: "1px solid rgba(245,158,11,0.25)", color: "#f59e0b" }}
                        onClick={() => setViewingItemCard(itemId)}>
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

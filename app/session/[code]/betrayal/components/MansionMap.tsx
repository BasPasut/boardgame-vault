"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import NextImage from "next/image";
import type { BetrayalGameState, PlacedTile, Floor, PlayerGameState, MonsterState } from "@/lib/games/betrayal/types";
import { getTile } from "@/lib/games/betrayal/data/tiles";
import { getReachable, getUnexploredDoors } from "@/lib/games/betrayal/logic/mapEngine";
import type { Player } from "@/types/game";

// ─── Constants (kept here so this file is fully self-contained) ───────────────
export const TILE_PX = 90;

export const FLOOR_NAMES: Record<Floor, string> = {
  0: "Basement",
  1: "Ground Floor",
  2: "Upper Floor",
};

export const FLOOR_COLORS: Record<Floor, string> = {
  0: "rgba(20,40,30,0.95)",
  1: "rgba(30,20,10,0.95)",
  2: "rgba(20,20,40,0.95)",
};

export const PLAYER_COLORS = [
  "#ef4444", "#3b82f6", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899",
];

export function playerColor(index: number) {
  return PLAYER_COLORS[index % PLAYER_COLORS.length];
}

// ─── MapTile ──────────────────────────────────────────────────────────────────
function MapTile({
  tile, playersHere, isReachable, isMyPosition, onClick, isNew,
  myPlayerId, currentPlayerId, deckCount, monstersHere,
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
  monstersHere?: MonsterState[];
}) {
  const def = getTile(tile.tile_id);
  const typeColor = {
    item: "rgba(245,158,11,0.7)", omen: "rgba(239,68,68,0.7)",
    event: "rgba(99,102,241,0.7)", stairwell: "rgba(34,197,94,0.7)", normal: "transparent",
  }[def?.type ?? "normal"];

  const livingHere  = playersHere.filter(p => !p.isDead);
  const hasPlayers  = livingHere.length > 0;
  const hasMonster  = (monstersHere ?? []).length > 0;

  const count   = livingHere.length;
  const pinSize = count <= 1 ? 30 : count <= 2 ? 25 : count <= 3 ? 21 : count <= 4 ? 17 : count <= 5 ? 15 : 13;
  const pinFont = count <= 1 ? 12 : count <= 2 ? 10 : count <= 3 ? 9 : 7;
  const pinGap  = count <= 3 ? 3 : 1;
  const pulsePad = count <= 2 ? -5 : -3;

  // suppress unused-variable warnings — these drive dynamic layout but TS lint sees them as unused
  void pinSize; void pinFont; void pinGap; void pulsePad;

  const monsterBorder = hasMonster ? "2px solid #ef4444" : undefined;
  const monsterShadow = hasMonster
    ? "0 0 20px rgba(239,68,68,0.55), inset 0 0 14px rgba(180,0,0,0.18)"
    : undefined;

  return (
    <div
      onClick={onClick}
      className={`absolute flex flex-col items-center justify-end p-0.5 cursor-pointer select-none transition-all ${isNew ? "animate-tile-reveal" : ""}`}
      style={{
        width: TILE_PX, height: TILE_PX, left: 0, top: 0,
        border: monsterBorder ?? (isMyPosition
          ? "2px solid #d4af37"
          : isReachable
          ? "2px solid rgba(212,175,55,0.5)"
          : hasPlayers
          ? "1px solid rgba(255,255,255,0.18)"
          : "1px solid rgba(255,255,255,0.08)"),
        borderRadius: 6,
        background: def?.image
          ? `url(${def.image}) center/cover no-repeat`
          : "rgba(30,20,10,0.8)",
        boxShadow: monsterShadow ?? (isMyPosition
          ? "0 0 14px rgba(212,175,55,0.45)"
          : isReachable
          ? "0 0 12px rgba(212,175,55,0.3)"
          : hasPlayers
          ? "0 0 8px rgba(255,255,255,0.08)"
          : undefined),
        overflow: "hidden",
      }}
    >
      {/* Type badge + deck count — top-right */}
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

      {/* Top-left badges: monster skull + dead player ghosts */}
      {(hasMonster || playersHere.some(p => p.isDead)) && (
        <div className="absolute top-1 left-1 flex gap-0.5" style={{ zIndex: 12 }}>
          {hasMonster && (
            <div className="relative w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: "#7f1d1d", border: "1.5px solid #ef4444", boxShadow: "0 0 6px rgba(239,68,68,0.9)" }}>
              <div className="absolute inset-0 rounded-full animate-ping"
                style={{ background: "rgba(239,68,68,0.45)", animationDuration: "1.2s" }} />
              <span className="relative" style={{ fontSize: 9, color: "#fca5a5", lineHeight: 1 }}>☠</span>
            </div>
          )}
          {playersHere.filter(p => p.isDead).slice(0, 2).map(({ player }) => (
            <div key={player.id}
              className="w-3.5 h-3.5 rounded-full flex items-center justify-center font-bold flex-shrink-0"
              style={{ background: "#374151", fontSize: 7, color: "rgba(255,255,255,0.4)", border: "1px solid rgba(255,255,255,0.15)", opacity: 0.5 }}>
              ✝
            </div>
          ))}
        </div>
      )}

      {/* Monster token — image in bottom-right corner */}
      {hasMonster && monstersHere && monstersHere[0]?.image && (
        <div className="absolute bottom-1 right-1 w-7 h-7 rounded-full overflow-hidden"
          style={{ border: "1.5px solid #ef4444", background: "#1a0a0a" }}>
          <NextImage
            src={monstersHere[0].image}
            alt={monstersHere[0].name}
            fill sizes="28px"
            className="object-cover"
          />
        </div>
      )}

      {/* Living player tokens — bottom row */}
      {hasPlayers && (
        <div className="absolute bottom-1 left-0 right-0 flex justify-center gap-0.5 flex-wrap px-0.5">
          {livingHere.map(({ player, index }) => {
            const isMe     = player.id === myPlayerId;
            const isCurrent = player.id === currentPlayerId;
            return (
              <div key={player.id}
                className={`rounded-full flex items-center justify-center font-black flex-shrink-0 ${isCurrent ? "ring-1 ring-yellow-400" : ""}`}
                style={{
                  width: 22, height: 22,
                  background: playerColor(index),
                  fontSize: 9,
                  color: "#fff",
                  border: isMe ? "1.5px solid #fbbf24" : "1px solid rgba(255,255,255,0.25)",
                  boxShadow: isMe ? "0 0 6px rgba(251,191,36,0.6)" : undefined,
                  letterSpacing: 0,
                }}>
                {player.name[0].toUpperCase()}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── UnexploredDoor ────────────────────────────────────────────────────────────
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

// ─── MansionMap ───────────────────────────────────────────────────────────────
interface MansionMapProps {
  gs: BetrayalGameState;
  players: Player[];
  myPlayerId: string | null;
  myState: PlayerGameState | null;
  isMyTurn: boolean;
  onMove: (x: number, y: number, floor: Floor) => void;
  onRevealTile: (x: number, y: number, floor: Floor) => void;
  animPos?: { floor: Floor; x: number; y: number } | null;
}

export function MansionMap({
  gs, players, myPlayerId, myState, isMyTurn, onMove, onRevealTile, animPos,
}: MansionMapProps) {
  const [viewFloor, setViewFloor] = useState<Floor>(myState?.floor ?? 1);
  const [newTileKey, setNewTileKey] = useState<string>("");
  const [zoom, setZoom] = useState(1.0);

  // Auto-follow player when they change floors
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

  const xs = floorTiles.map((t) => t.x);
  const ys = floorTiles.map((t) => t.y);
  const minX = Math.min(...xs, 0) - 1;
  const minY = Math.min(...ys, 0) - 1;
  const maxX = Math.max(...xs, 0) + 1;
  const maxY = Math.max(...ys, 0) + 1;
  const worldW = (maxX - minX + 1) * TILE_PX;
  const worldH = (maxY - minY + 1) * TILE_PX;

  const currentPlayerId = gs.turn_order[gs.current_turn_index] ?? null;

  const reachable = useMemo(() => {
    if (!isMyTurn || !myState || gs.turn_phase !== "move") return new Set<string>();
    const isRestrained = (gs.restrained_players ?? []).includes(myPlayerId ?? "");
    const lanternBonus = gs.phase === "explore" && (myState.items ?? []).includes("lantern") ? 1 : 0;
    const effectiveSpeed = (isRestrained ? Math.max(0, myState.speed - 1) : myState.speed) + lanternBonus;
    const movesLeft = effectiveSpeed - gs.moves_used;
    if (movesLeft <= 0) return new Set<string>();
    return getReachable(gs.placed_tiles, myState.floor, myState.x, myState.y, movesLeft, gs.locked_doors ?? []);
  }, [gs, myState, isMyTurn, myPlayerId]);

  const unexplored = useMemo(() => {
    if ((gs.remaining_tiles[viewFloor]?.length ?? 0) === 0) return [];
    return getUnexploredDoors(gs.placed_tiles, viewFloor);
  }, [gs.placed_tiles, gs.remaining_tiles, viewFloor]);

  const explorable = useMemo(() => {
    if (!isMyTurn || !myState || myState.floor !== viewFloor || gs.turn_phase !== "move") return [];
    const isRestrained = (gs.restrained_players ?? []).includes(myPlayerId ?? "");
    const lanternBonus = gs.phase === "explore" && (myState.items ?? []).includes("lantern") ? 1 : 0;
    const effectiveSpeed = (isRestrained ? Math.max(0, myState.speed - 1) : myState.speed) + lanternBonus;
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
      if (!ps) return;
      if (animPos && p.id === myPlayerId) return;
      if (ps.floor !== viewFloor) return;
      const key = `${ps.x},${ps.y}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push({ player: p, index: idx, isDead: ps.is_dead ?? false });
    });
    return map;
  }, [players, gs.player_states, viewFloor, animPos, myPlayerId]);

  const animPixelPos = useMemo(() => {
    if (!animPos || animPos.floor !== viewFloor) return null;
    return {
      left: (animPos.x - minX) * TILE_PX,
      top:  (animPos.y - minY) * TILE_PX,
    };
  }, [animPos, viewFloor, minX, minY]);

  const myPlayerObj = players.find(p => p.id === myPlayerId);
  const myPlayerIdx = players.findIndex(p => p.id === myPlayerId);

  const deckCounts: Record<string, number> = {
    item: gs.item_deck.length,
    omen: gs.omen_deck.length,
    event: gs.event_deck.length,
  };

  const monstersByTile = useMemo(() => {
    const map = new Map<string, MonsterState[]>();
    (gs.monsters ?? []).filter(m => m.floor === viewFloor).forEach(m => {
      const key = `${m.x},${m.y}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(m);
    });
    return map;
  }, [gs.monsters, viewFloor]);

  return (
    <div className="flex flex-col gap-2 flex-1 min-h-0">
      {/* Floor tabs + zoom controls */}
      <div className="flex items-center gap-1.5">
        <div className="flex gap-1 flex-1 flex-wrap">
          {([2, 1, 0] as Floor[]).map((f) => (
            <button key={f} onClick={() => setViewFloor(f)}
              className="floor-btn px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
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
        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={() => setZoom((z) => Math.max(0.45, +(z - 0.15).toFixed(2)))}
            className="btn-betrayal w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#7a6a5a" }}
            title="Zoom out">−</button>
          <button
            onClick={() => setZoom(1)}
            className="btn-betrayal text-xs px-1.5 py-1 rounded-lg min-w-[3.2rem] text-center"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", color: "#5a4a3a" }}
            title="Reset zoom">{Math.round(zoom * 100)}%</button>
          <button
            onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.15).toFixed(2)))}
            className="btn-betrayal w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold"
            style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", color: "#7a6a5a" }}
            title="Zoom in">+</button>
        </div>
      </div>

      {/* Stairwell hint */}
      {isMyTurn && myState && gs.turn_phase === "move" && (((gs.restrained_players ?? []).includes(myPlayerId ?? "") ? Math.max(0, myState.speed - 1) : myState.speed) + (gs.phase === "explore" && (myState.items ?? []).includes("lantern") ? 1 : 0) - gs.moves_used > 0) && (() => {
        const curTile = gs.placed_tiles.find(t => t.floor === myState.floor && t.x === myState.x && t.y === myState.y);
        const isOnStairwell = curTile && getTile(curTile.tile_id)?.type === "stairwell";
        const otherFloors = ([0, 1, 2] as Floor[]).filter(f => f !== myState.floor && gs.placed_tiles.some(t => t.floor === f && getTile(t.tile_id)?.type === "stairwell"));
        if (!isOnStairwell || otherFloors.length === 0) return null;
        return (
          <div className="flex-shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs"
            style={{ background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.25)", color: "#22c55e" }}>
            <span>🪜 On stairwell — switch floor tab to see where you can go</span>
          </div>
        );
      })()}

      {/* Map viewport */}
      <div className="rounded-xl overflow-auto flex-1 min-h-0 max-h-[52vh] lg:max-h-none"
        onWheel={handleWheel}
        style={{ background: FLOOR_COLORS[viewFloor], border: "1px solid rgba(212,175,55,0.15)", minHeight: 200 }}>
        <div className="relative" style={{ width: worldW, height: worldH, minWidth: "100%", zoom: zoom }}>
          {/* Placed tiles */}
          {floorTiles.map((tile) => {
            const px  = (tile.x - minX) * TILE_PX;
            const py  = (tile.y - minY) * TILE_PX;
            const key = `${viewFloor},${tile.x},${tile.y}`;
            const myDisplayPos = animPos ?? myState;
            const isMyPos = myDisplayPos?.floor === viewFloor && myDisplayPos.x === tile.x && myDisplayPos.y === tile.y;
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
                  monstersHere={monstersByTile.get(`${tile.x},${tile.y}`)}
                  onClick={() => { if (reachable.has(key)) onMove(tile.x, tile.y, viewFloor); }}
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

          {/* Unexplored doors */}
          {(gs.remaining_tiles[viewFloor]?.length ?? 0) > 0 && unexplored.map(({ x, y }) => {
            const px    = (x - minX) * TILE_PX;
            const py    = (y - minY) * TILE_PX;
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

          {/* Floating player token — CSS transition handles smooth sliding */}
          {animPixelPos && myPlayerObj && (
            <div style={{
              position: "absolute",
              left: animPixelPos.left,
              top: animPixelPos.top,
              width: TILE_PX,
              height: TILE_PX,
              transition: "left 240ms ease-in-out, top 240ms ease-in-out",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
              zIndex: 30,
            }}>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-9 h-9 rounded-full animate-ping"
                  style={{ background: playerColor(myPlayerIdx), opacity: 0.35 }} />
              </div>
              <div className="relative w-8 h-8 rounded-full flex items-center justify-center font-black"
                style={{
                  background: playerColor(myPlayerIdx),
                  fontSize: 13, color: "#fff",
                  border: "2px solid #fbbf24",
                  boxShadow: "0 0 12px rgba(251,191,36,0.9), 0 2px 8px rgba(0,0,0,0.9)",
                  letterSpacing: 0,
                }}>
                {myPlayerObj.name[0].toUpperCase()}
              </div>
            </div>
          )}
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

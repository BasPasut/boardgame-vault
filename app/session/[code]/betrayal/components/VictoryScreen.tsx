"use client";

import NextImage from "next/image";
import Link from "next/link";
import type { BetrayalGameState } from "@/lib/games/betrayal/types";
import { getCharacter } from "@/lib/games/betrayal/data/characters";
import type { Player } from "@/types/game";
import { playerColor } from "./MansionMap";

interface VictoryScreenProps {
  gs: BetrayalGameState;
  players: Player[];
  myPlayerId: string | null;
}

export function VictoryScreen({ gs, players, myPlayerId }: VictoryScreenProps) {
  const heroesWin   = gs.winner === "heroes";
  const myState     = myPlayerId ? gs.player_states[myPlayerId] : null;
  const iWon        = heroesWin ? !myState?.is_traitor : !!myState?.is_traitor;
  const accent      = heroesWin ? "#d4af37" : "#ef4444";
  const accentBg    = heroesWin ? "rgba(212,175,55,0.08)" : "rgba(239,68,68,0.1)";
  const accentBorder = heroesWin ? "rgba(212,175,55,0.3)" : "rgba(239,68,68,0.35)";

  return (
    <div className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden"
      style={{ background: "radial-gradient(ellipse at 50% 30%, #1a0808 0%, #0a0708 70%)" }}>
      <div className="absolute inset-0 pointer-events-none"
        style={{
          background: heroesWin
            ? "radial-gradient(ellipse at 50% 20%, rgba(212,175,55,0.07) 0%, transparent 60%)"
            : "radial-gradient(ellipse at 50% 20%, rgba(139,26,26,0.12) 0%, transparent 60%)",
        }} />

      <div className="relative z-10 max-w-md w-full space-y-6 animate-slide-up">
        <div className="text-center">
          <div className="text-7xl mb-4 animate-victory-pulse inline-block">
            {heroesWin ? "🕯️" : "⚔️"}
          </div>
          <h1 className="text-4xl font-black mb-2" style={{ fontFamily: "var(--font-gothic)", color: accent }}>
            {heroesWin ? "The Heroes Prevail" : "The Traitor Triumphs"}
          </h1>
          <p className="text-base" style={{ color: "#7a6a5a" }}>
            {heroesWin
              ? "Darkness has been banished from the mansion."
              : "The mansion claims its prize. None shall leave."}
          </p>
        </div>

        {myPlayerId && (
          <div className="rounded-xl p-4 text-center"
            style={{ background: iWon ? accentBg : "rgba(0,0,0,0.3)", border: `1px solid ${iWon ? accentBorder : "rgba(255,255,255,0.06)"}` }}>
            <p className="font-bold text-lg" style={{ fontFamily: "var(--font-gothic)", color: iWon ? accent : "#5a4a3a" }}>
              {iWon ? "⚔ Victory is yours" : "💀 You were defeated"}
            </p>
            {myState?.is_traitor && (
              <p className="text-xs mt-1" style={{ color: "#7a6a5a" }}>You were the Traitor</p>
            )}
          </div>
        )}

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
                    <span className="text-xs px-2 py-0.5 rounded-full"
                      style={{ background: "rgba(239,68,68,0.2)", color: "#ef4444" }}>Traitor</span>
                  )}
                  {ps.is_dead && (
                    <span className="text-xs px-2 py-0.5 rounded-full"
                      style={{ background: "rgba(255,255,255,0.05)", color: "#5a4a3a" }}>Eliminated</span>
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

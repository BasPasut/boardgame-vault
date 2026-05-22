"use client";

import { useState, useEffect } from "react";
import { GothicDie } from "./DiceOverlay";

export interface CombatResultData {
  attackerName: string;
  targetName: string;
  attackerRolls: number[];
  defenderRolls: number[];
  damage: number;
  winner: "attacker" | "defender" | "tie";
}

interface CombatOverlayProps {
  result: CombatResultData;
  onDismiss: () => void;
}

export function CombatOverlay({ result, onDismiss }: CombatOverlayProps) {
  const [rolling, setRolling] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setRolling(false), 1100);
    return () => clearTimeout(t);
  }, []);

  const attackTotal = result.attackerRolls.reduce((a, b) => a + b, 0);
  const defendTotal = result.defenderRolls.reduce((a, b) => a + b, 0);
  const winnerColor  = result.winner === "tie" ? "#d4af37" : result.winner === "attacker" ? "#ef4444" : "#22c55e";
  const winnerBorder = result.winner === "tie" ? "rgba(212,175,55,0.2)" : result.winner === "attacker" ? "rgba(239,68,68,0.3)" : "rgba(34,197,94,0.25)";
  const winnerBg     = result.winner === "tie" ? "rgba(212,175,55,0.07)" : result.winner === "attacker" ? "rgba(239,68,68,0.1)" : "rgba(34,197,94,0.08)";

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
            <p className="text-3xl font-black transition-opacity duration-300"
              style={{ color: "#d4af37", fontFamily: "var(--font-gothic)", opacity: rolling ? 0 : 1 }}>
              {attackTotal}
            </p>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-bold truncate" style={{ color: "#e8d5b0" }}>{result.targetName}</p>
            <div className="flex flex-wrap gap-1 justify-center min-h-[4rem]">
              {result.defenderRolls.length === 0
                ? <span className="text-xs self-center" style={{ color: "#5a4a3a" }}>—</span>
                : result.defenderRolls.map((v, i) => <GothicDie key={i} value={v} rolling={rolling} />)
              }
            </div>
            <p className="text-3xl font-black transition-opacity duration-300"
              style={{ color: "#d4af37", fontFamily: "var(--font-gothic)", opacity: rolling ? 0 : 1 }}>
              {defendTotal}
            </p>
          </div>
        </div>

        {/* Result banner — hidden until dice settle */}
        <div className="rounded-xl px-4 py-3 transition-opacity duration-300"
          style={{ background: winnerBg, border: `1px solid ${winnerBorder}`, opacity: rolling ? 0 : 1 }}>
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
          style={{
            opacity: rolling ? 0.3 : 1,
            background: "rgba(212,175,55,0.1)",
            border: "1px solid rgba(212,175,55,0.25)",
            color: "#d4af37",
            fontFamily: "var(--font-gothic)",
          }}>
          Continue
        </button>
      </div>
    </div>
  );
}

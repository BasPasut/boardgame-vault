"use client";

import { useState, useEffect } from "react";
import NextImage from "next/image";
import { randomBetrayalFace } from "@/lib/games/betrayal/logic/dice";

// Gothic dice face images — /images/games/betrayal/dice-0.png … dice-2.png
// Falls back to a styled number if the image is missing.
const DICE_FACES = [
  "/images/games/betrayal/dice-0.png",
  "/images/games/betrayal/dice-1.png",
  "/images/games/betrayal/dice-2.png",
];

// ─── Single die ───────────────────────────────────────────────────────────────
export function GothicDie({ value, rolling }: { value: number; rolling?: boolean }) {
  const [err, setErr]           = useState(false);
  const [display, setDisplay]   = useState<number>(() => rolling ? randomBetrayalFace() : value);
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

// ─── Dice roll overlay ────────────────────────────────────────────────────────
interface DiceOverlayProps {
  values: number[];
  label: string;
  onDismiss: () => void;
  /** Lucky Coin: if provided, player may reroll once */
  rerollFn?: () => number[];
}

export function DiceOverlay({ values, label, onDismiss, rerollFn }: DiceOverlayProps) {
  const [rolling, setRolling]         = useState(true);
  const [currentValues, setCurrentValues] = useState(values);
  const [rerolled, setRerolled]       = useState(false);
  const total = currentValues.reduce((a, b) => a + b, 0);

  useEffect(() => {
    const t = setTimeout(() => setRolling(false), 900);
    return () => clearTimeout(t);
  }, []);

  const handleReroll = () => {
    if (!rerollFn || rerolled || rolling) return;
    const newValues = rerollFn();
    setCurrentValues(newValues);
    setRerolled(true);
    setRolling(true);
    setTimeout(() => setRolling(false), 900);
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.82)" }} onClick={rolling ? undefined : onDismiss}>
      <div className="text-center space-y-5 rounded-2xl p-8 animate-slide-up" onClick={e => e.stopPropagation()}
        style={{ background: "rgba(8,5,12,0.95)", border: "1px solid rgba(212,175,55,0.2)", backdropFilter: "blur(8px)" }}>
        <p className="text-xs uppercase tracking-widest" style={{ color: "#5a4a3a" }}>{label}</p>
        <div className="flex gap-4 justify-center">
          {currentValues.map((v, i) => <GothicDie key={i} value={v} rolling={rolling} />)}
        </div>
        <p className="text-4xl font-black transition-all duration-300" style={{ color: "#e8d5b0", fontFamily: "var(--font-gothic)", opacity: rolling ? 0 : 1 }}>
          {total}
        </p>
        {rerollFn && !rerolled && !rolling && (
          <button onClick={handleReroll}
            className="w-full py-2 rounded-xl text-sm font-bold"
            style={{ background: "rgba(212,175,55,0.1)", border: "1px solid rgba(212,175,55,0.35)", color: "#d4af37", fontFamily: "var(--font-gothic)" }}>
            🪙 Reroll — Lucky Coin
          </button>
        )}
        {rerolled && !rolling && (
          <p className="text-xs" style={{ color: "#d4af37" }}>Lucky Coin used ✓</p>
        )}
        <p className="text-xs transition-opacity duration-300" style={{ color: "#5a4a3a", opacity: rolling ? 0 : 1 }}>
          Tap outside to continue
        </p>
      </div>
    </div>
  );
}

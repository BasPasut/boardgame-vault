"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { getLang, saveLang } from "@/lib/utils/lang";
import { useAmbientAudio } from "@/lib/hooks/useAmbientAudio";
import { supabase } from "@/lib/supabase";
import {
  getColor,
  manhattan,
  scoreForDistance,
  PIN_COLORS,
  GRID_COLS,
  GRID_ROWS,
} from "@/lib/games/hues-and-cues/colors";
import type { Player } from "@/types/game";
import type { HnCGameState } from "@/lib/games/hues-and-cues/types";
export type { HnCGameState }; // re-export so existing imports from this file still work

// ── Hues & Cues light-studio theme ──────────────────────────────────────────
const HNC = {
  bgPage:      "radial-gradient(ellipse at top, #ede8ff 0%, #f5f3ff 50%, #fafafe 100%)",
  bgHeader:    "rgba(255,255,255,0.97)",
  bgCard:      "rgba(255,255,255,0.92)",
  bgInput:     "rgba(255,255,255,0.9)",
  bgRevealRow: "rgba(248,246,255,0.8)",
  borderCard:  "rgba(120,80,220,0.1)",
  borderHdr:   "rgba(120,80,220,0.12)",
  borderInput: "rgba(124,58,237,0.25)",
  shadowCard:  "0 2px 16px rgba(100,60,200,0.06)",
  textPrim:    "#1a1230",
  textSec:     "#6b5fa8",
  textMuted:   "#9d8fc0",
  textDim:     "#c5bde0",
  accent:      "#7c3aed",
  accentLight: "rgba(124,58,237,0.08)",
  accentBorder:"rgba(124,58,237,0.3)",
};

interface HnCDbSession {
  code: string;
  game_id: string;
  phase: "lobby" | "playing" | "ended";
  game_state: HnCGameState;
}

interface Props {
  code: string;
  dbSession: HnCDbSession;
  players: Player[];
  myPlayerId: string | null;
}

// ---------- Ring distance label ----------
function ringLabel(d: number): { text: string; color: string } {
  if (d === 0) return { text: "🎯 Bull's-eye!", color: "#7c3aed" };
  if (d <= 2)  return { text: "Ring 1",         color: "#22c55e" };
  if (d <= 4)  return { text: "Ring 2",         color: "#f59e0b" };
  if (d <= 6)  return { text: "Ring 3",         color: "#6366f1" };
  return               { text: "Miss",           color: HNC.textMuted };
}

// ---------- Browser warning ----------
function ChromeWarning({ lang }: { lang: "en" | "th" }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Detect non-Chrome: Chrome has "Chrome/" but not "Edg/" or "OPR/"
    const ua = navigator.userAgent;
    const isChrome = /Chrome\//.test(ua) && !/Edg\//.test(ua) && !/OPR\//.test(ua);
    if (!isChrome) setShow(true);
  }, []);

  if (!show) return null;

  const msg =
    lang === "th"
      ? "สีบนกระดานอาจแสดงผลไม่ตรงกันบน browser นี้ — แนะนำให้เล่นบน Google Chrome เพื่อสีที่แม่นยำที่สุด"
      : "Colors may render differently on this browser. For the most accurate color matching, play on Google Chrome.";

  return (
    <div
      className="flex items-start gap-2 px-3 py-2 rounded-lg text-xs"
      style={{
        background: HNC.accentLight,
        border: `1px solid ${HNC.accentBorder}`,
        color: HNC.accent,
      }}
    >
      <span className="text-base leading-none mt-0.5 flex-shrink-0">⚠️</span>
      <span className="flex-1">{msg}</span>
      <button
        onClick={() => setShow(false)}
        className="flex-shrink-0 opacity-50 hover:opacity-100 transition-opacity leading-none"
        style={{ color: HNC.accent }}
        aria-label="Dismiss"
      >
        ✕
      </button>
    </div>
  );
}

// ---------- Color Grid (30×16) ----------
function ColorGrid({
  gs,
  players,
  myPlayerId,
  canGuess,
  onGuess,
}: {
  gs: HnCGameState;
  players: Player[];
  myPlayerId: string | null;
  canGuess: boolean;
  onGuess: (x: number, y: number) => void;
}) {
  const isReveal = gs.sub_phase === "reveal";
  const currentCueGiverId = gs.cue_giver_order[(gs.round - 1) % gs.cue_giver_order.length];
  const amICueGiver = myPlayerId === currentCueGiverId;
  const myGuess = myPlayerId ? gs.guesses[myPlayerId] : null;
  const [hoverCell, setHoverCell] = useState<{ x: number; y: number } | null>(null);
  const myPinColor = PIN_COLORS[players.findIndex((p) => p.id === myPlayerId) % PIN_COLORS.length];

  return (
    <div className="w-full select-none">
      {/* Column labels */}
      <div
        className="w-full mb-0.5"
        style={{ display: "grid", gridTemplateColumns: `16px repeat(${GRID_COLS}, 1fr)` }}
      >
        <div />
        {Array.from({ length: GRID_COLS }, (_, x) => (
          <div
            key={x}
            className="text-center font-mono"
            style={{ fontSize: "6px", color: HNC.textDim, lineHeight: "1" }}
          >
            {x + 1}
          </div>
        ))}
      </div>

      {/* Grid with row labels */}
      <div className="w-full flex gap-0.5">
        {/* Row labels */}
        <div className="flex flex-col" style={{ width: "16px", flexShrink: 0 }}>
          {Array.from({ length: GRID_ROWS }, (_, y) => (
            <div
              key={y}
              className="flex items-center justify-end pr-0.5 font-mono flex-1"
              style={{ fontSize: "6px", color: HNC.textDim, lineHeight: "1" }}
            >
              {String.fromCharCode(65 + y)}
            </div>
          ))}
        </div>

        {/* Board */}
        <div
          className="flex-1 rounded-lg overflow-hidden"
          style={{
            border: `2px solid ${HNC.accentBorder}`,
            boxShadow: "0 0 0 1px rgba(120,80,220,0.06), 0 4px 24px rgba(100,60,200,0.12)",
          }}
        >
          <div
            className="w-full"
            style={{
              display: "grid",
              gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)`,
              gridTemplateRows: `repeat(${GRID_ROWS}, 1fr)`,
              aspectRatio: `${GRID_COLS}/${GRID_ROWS}`,
              gap: "1px",
              background: "rgba(200,190,230,0.3)",
            }}
          >
            {Array.from({ length: GRID_ROWS }, (_, y) =>
              Array.from({ length: GRID_COLS }, (_, x) => {
                const color = getColor(x, y);
                const isTarget = isReveal && gs.target.x === x && gs.target.y === y;
                const isCueGiverTarget =
                  amICueGiver && gs.sub_phase !== "reveal" && gs.target.x === x && gs.target.y === y;
                const isMyGuess = !isReveal && myGuess?.x === x && myGuess?.y === y;
                const guessersHere = isReveal
                  ? players.filter((p) => gs.guesses[p.id]?.x === x && gs.guesses[p.id]?.y === y)
                  : [];

                const isHovered = canGuess && hoverCell?.x === x && hoverCell?.y === y;
                return (
                  <div
                    key={`${x}-${y}`}
                    onClick={() => canGuess && onGuess(x, y)}
                    onMouseEnter={() => canGuess && setHoverCell({ x, y })}
                    onMouseLeave={() => setHoverCell(null)}
                    className={`relative flex items-center justify-center ${canGuess ? "cursor-pointer" : ""}`}
                    style={{
                      backgroundColor: color,
                      outline: isTarget
                        ? "2px solid rgba(255,255,255,0.95)"
                        : isCueGiverTarget
                        ? "2px dashed rgba(255,255,255,0.8)"
                        : isHovered
                        ? "2px solid rgba(255,255,255,0.5)"
                        : undefined,
                      outlineOffset: "-1px",
                      zIndex: isTarget || isCueGiverTarget || isHovered ? 1 : undefined,
                    }}
                  >
                    {isCueGiverTarget && (
                      <div className="w-1.5 h-1.5 rounded-full bg-white/90 shadow-sm" />
                    )}
                    {isTarget && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div
                          className="rounded-full border border-gray-800 shadow-md"
                          style={{ width: "55%", height: "55%", background: "white" }}
                        />
                      </div>
                    )}
                    {isMyGuess && (
                      <div
                        className="rounded-full border border-white/80 shadow-md"
                        style={{
                          width: "60%",
                          height: "60%",
                          backgroundColor:
                            PIN_COLORS[players.findIndex((p) => p.id === myPlayerId) % PIN_COLORS.length],
                        }}
                      />
                    )}
                    {isHovered && !isMyGuess && (
                      <div
                        className="rounded-full border border-white/60 shadow-sm pointer-events-none"
                        style={{
                          width: "55%",
                          height: "55%",
                          backgroundColor: myPinColor,
                          opacity: 0.45,
                        }}
                      />
                    )}
                    {isReveal && guessersHere.length > 0 && (
                      <div className="absolute inset-0 flex flex-wrap items-center justify-center p-px gap-px">
                        {guessersHere.slice(0, 2).map((p) => (
                          <div
                            key={p.id}
                            className="rounded-full border border-white/70 shadow-sm"
                            style={{
                              width: guessersHere.length === 1 ? "55%" : "40%",
                              height: guessersHere.length === 1 ? "55%" : "40%",
                              backgroundColor:
                                PIN_COLORS[players.findIndex((pl) => pl.id === p.id) % PIN_COLORS.length],
                            }}
                          />
                        ))}
                        {guessersHere.length > 2 && (
                          <div
                            className="rounded-full border border-white/70 flex items-center justify-center shadow-sm"
                            style={{
                              width: "40%",
                              height: "40%",
                              background: "rgba(0,0,0,0.7)",
                              fontSize: "5px",
                              color: "white",
                              fontWeight: "bold",
                            }}
                          >
                            +{guessersHere.length - 2}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Main Component ----------
export function HnCPlaying({ code, dbSession, players, myPlayerId }: Props) {
  const [lang, setLangState] = useState<"en" | "th">(() => getLang());
  const setLang = (l: "en" | "th") => { setLangState(l); saveLang(l); };
  const [clueInput, setClueInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { muted, toggleMute } = useAmbientAudio("/audio/ambient-lobby.mp3");

  const gs = dbSession.game_state;
  const phase = dbSession.phase;

  const currentCueGiverId = gs.cue_giver_order[(gs.round - 1) % gs.cue_giver_order.length];
  const amICueGiver = myPlayerId === currentCueGiverId;
  const cueGiver = players.find((p) => p.id === currentCueGiverId);
  const isHost = players.find((p) => p.id === myPlayerId)?.isStoryteller ?? false;
  const myPinColor =
    PIN_COLORS[players.findIndex((p) => p.id === myPlayerId) % PIN_COLORS.length] ?? "#7c3aed";

  const nonCueGivers = players.filter((p) => p.id !== currentCueGiverId);
  const guessersCount = nonCueGivers.filter((p) => !!gs.guesses[p.id]).length;
  const allGuessed = guessersCount === nonCueGivers.length && nonCueGivers.length > 0;

  // Score bar: highest score relative to target
  const topScore = Math.max(0, ...players.map((p) => gs.scores[p.id] ?? 0));
  const scoreToWin = gs.score_to_win ?? 25;

  const t = {
    en: {
      round: "Round", of: "of",
      youAreCueGiver: "You are the Cue Giver",
      cueGiverIs: "Cue Giver",
      targetColor: "Your target color",
      giveClue: "Describe the color (1 word or short phrase)",
      cluePlaceholder: "e.g. ocean, sunset, rust...",
      submitClue: "Submit",
      addSecondClue: "+ Add 2nd Clue",
      clues: "Clues",
      tapToGuess: "Tap the color you think it is",
      guessed: "guessed",
      waitingForClue: "Waiting for clue...",
      canChange: "Tap to change your guess",
      reveal: "Reveal",
      nextRound: "Next Round →",
      endGame: "End Game",
      roundScores: "Round Results",
      targetWas: "Target",
      totalScores: "Scoreboard",
      pts: "pts",
      winner: "Winner!",
      tie: "It's a Tie!",
      playAgain: "Play Again",
      back: "← Home",
      allGuessedAuto: "Everyone guessed!",
      scoreboard: "Scoreboard",
      goal: "Goal",
    },
    th: {
      round: "รอบ", of: "จาก",
      youAreCueGiver: "คุณเป็นผู้ให้ Clue",
      cueGiverIs: "ผู้ให้ Clue",
      targetColor: "สีเป้าหมายของคุณ",
      giveClue: "อธิบายสี (1 คำ หรือวลีสั้นๆ)",
      cluePlaceholder: "เช่น ทะเล, พระอาทิตย์ตก, สนิม...",
      submitClue: "ส่ง",
      addSecondClue: "+ เพิ่ม Clue ที่ 2",
      clues: "Clues",
      tapToGuess: "แตะสีที่คิดว่าใช่",
      guessed: "ทายแล้ว",
      waitingForClue: "รอ Clue...",
      canChange: "แตะเพื่อเปลี่ยนคำตอบ",
      reveal: "เฉลย",
      nextRound: "รอบถัดไป →",
      endGame: "จบเกม",
      roundScores: "ผลรอบนี้",
      targetWas: "เป้าหมาย",
      totalScores: "คะแนนรวม",
      pts: "คะแนน",
      winner: "ผู้ชนะ!",
      tie: "เสมอกัน!",
      playAgain: "เล่นอีกครั้ง",
      back: "← หน้าแรก",
      allGuessedAuto: "ทุกคนทายแล้ว!",
      scoreboard: "คะแนน",
      goal: "เป้า",
    },
  }[lang];

  // ---------- Actions ----------
  const submitClue = async () => {
    if (!clueInput.trim() || gs.clues.length >= 2 || submitting) return;
    setSubmitting(true);
    await supabase.from("sessions").update({
      game_state: {
        ...gs,
        clues: [...gs.clues, clueInput.trim()],
        sub_phase: "guessing",
      },
    }).eq("code", code);
    setClueInput("");
    setSubmitting(false);
  };

  const placeGuess = async (x: number, y: number) => {
    if (!myPlayerId || amICueGiver || gs.sub_phase !== "guessing") return;
    await supabase.from("sessions").update({
      game_state: { ...gs, guesses: { ...gs.guesses, [myPlayerId]: { x, y } } },
    }).eq("code", code);
  };

  const triggerReveal = async () => {
    if (!amICueGiver && !isHost) return;
    const roundScores: Record<string, number> = {};
    let cueGiverBonus = 0;
    players.forEach((p) => {
      if (p.id === currentCueGiverId) return;
      const guess = gs.guesses[p.id];
      if (!guess) { roundScores[p.id] = 0; return; }
      const d = manhattan(guess, gs.target);
      roundScores[p.id] = scoreForDistance(d);
      // Cue giver gets 1pt for each guesser in ring 1 or ring 2 (d≤4)
      if (d <= 4) cueGiverBonus++;
    });
    if (currentCueGiverId) roundScores[currentCueGiverId] = cueGiverBonus;

    const newScores = { ...gs.scores };
    Object.entries(roundScores).forEach(([pid, pts]) => {
      newScores[pid] = (newScores[pid] ?? 0) + pts;
    });

    const newState = { ...gs, sub_phase: "reveal" as const, round_scores: roundScores, scores: newScores };
    const someoneWon = scoreToWin > 0 && Object.values(newScores).some((s) => s >= scoreToWin);

    if (someoneWon) {
      await supabase.from("sessions").update({ phase: "ended", game_state: newState }).eq("code", code);
    } else {
      await supabase.from("sessions").update({ game_state: newState }).eq("code", code);
    }
  };

  const nextRound = async () => {
    const nextRoundNum = gs.round + 1;
    const roundsExhausted = gs.total_rounds > 0 && nextRoundNum > gs.total_rounds;
    if (roundsExhausted) {
      await supabase.from("sessions").update({ phase: "ended" }).eq("code", code);
      return;
    }
    await supabase.from("sessions").update({
      game_state: {
        ...gs,
        round: nextRoundNum,
        target: { x: Math.floor(Math.random() * GRID_COLS), y: Math.floor(Math.random() * GRID_ROWS) },
        clues: [],
        sub_phase: "giving-clue",
        guesses: {},
        round_scores: undefined,
      },
    }).eq("code", code);
  };

  // ---------- Shared header ----------
  const HeaderRight = () => (
    <div className="flex items-center gap-2">
      <button
        onClick={toggleMute}
        className="btn-hnc-secondary px-2.5 py-1.5 rounded-lg text-sm flex-shrink-0"
        title={muted ? "Unmute" : "Mute"}
      >
        {muted ? "🔇" : "🔊"}
      </button>
      <button
        onClick={() => setLang(lang === "en" ? "th" : "en")}
        className="btn-hnc-secondary px-3 py-1.5 rounded-lg text-xs flex-shrink-0"
      >
        <span style={{ color: lang === "en" ? HNC.accent : HNC.textMuted }}>EN</span>
        <span style={{ color: HNC.textDim }}> / </span>
        <span style={{ color: lang === "th" ? HNC.accent : HNC.textMuted }}>TH</span>
      </button>
    </div>
  );

  // ---------- ENDED ----------
  if (phase === "ended") {
    const sorted = [...players].sort((a, b) => (gs.scores[b.id] ?? 0) - (gs.scores[a.id] ?? 0));
    const topScoreVal = gs.scores[sorted[0]?.id] ?? 0;
    const winners = sorted.filter((p) => (gs.scores[p.id] ?? 0) === topScoreVal);

    return (
      <div className="min-h-screen flex flex-col" style={{ background: HNC.bgPage }}>
        <div className="sticky top-0 z-20" style={{ background: HNC.bgHeader, backdropFilter: "blur(8px)", borderBottom: `1px solid ${HNC.borderHdr}` }}>
          <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
            <span className="text-sm font-bold" style={{ fontFamily: "var(--font-gothic)", color: HNC.accent }}>Hues & Cues</span>
            <HeaderRight />
          </div>
        </div>
        <div className="max-w-lg mx-auto px-4 py-8 w-full">
          <div className="text-center mb-8">
            <div className="text-6xl mb-4">🎨</div>
            <h1 className="text-3xl font-black mb-2" style={{ fontFamily: "var(--font-gothic)", color: HNC.textPrim }}>
              {winners.length > 1 ? t.tie : winners[0]?.name}
            </h1>
            <p className="text-sm" style={{ color: HNC.accent }}>
              {winners.length === 1 ? t.winner : ""}
            </p>
          </div>

          <div className="hnc-card rounded-2xl p-6 mb-6">
            <p className="text-xs tracking-widest uppercase mb-4" style={{ color: HNC.accent, fontFamily: "var(--font-gothic)" }}>
              {t.totalScores}
            </p>
            <div className="space-y-2">
              {sorted.map((p, i) => {
                const score = gs.scores[p.id] ?? 0;
                const pct = scoreToWin > 0 ? Math.min(100, (score / scoreToWin) * 100) : 100;
                return (
                  <div key={p.id} className="rounded-xl overflow-hidden" style={{ background: i === 0 ? "rgba(124,58,237,0.08)" : "rgba(248,246,255,0.6)" }}>
                    <div className="flex items-center gap-3 px-4 py-3">
                      <span className="text-sm w-5 flex-shrink-0" style={{ color: HNC.textMuted }}>#{i + 1}</span>
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                        style={{ background: PIN_COLORS[players.indexOf(p) % PIN_COLORS.length] + "40", color: PIN_COLORS[players.indexOf(p) % PIN_COLORS.length] }}
                      >
                        {p.name[0].toUpperCase()}
                      </div>
                      <span className="flex-1 text-sm truncate" style={{ color: p.id === myPlayerId ? HNC.textPrim : HNC.textSec }}>
                        {p.name}{p.id === myPlayerId ? " ★" : ""}
                      </span>
                      <span className="font-bold text-base flex-shrink-0" style={{ color: i === 0 ? HNC.accent : HNC.textPrim }}>
                        {score} {t.pts}
                      </span>
                    </div>
                    {scoreToWin > 0 && (
                      <div style={{ height: "3px", background: "rgba(200,190,230,0.3)" }}>
                        <div style={{ height: "100%", width: `${pct}%`, background: i === 0 ? HNC.accent : PIN_COLORS[players.indexOf(p) % PIN_COLORS.length], transition: "width 0.6s ease" }} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {scoreToWin > 0 && (
              <p className="text-center text-xs mt-3 italic" style={{ color: HNC.textMuted }}>
                {t.goal}: {scoreToWin} {t.pts}
              </p>
            )}
          </div>

          <div className="flex gap-3">
            <Link
              href="/session/create?game=hues-and-cues"
              className="btn-hnc-primary flex-1 py-4 rounded-xl font-bold text-lg text-center no-underline block"
              style={{ fontFamily: "var(--font-gothic)" }}
            >
              🎨 {t.playAgain}
            </Link>
            <Link
              href="/"
              className="btn-hnc-secondary px-5 py-4 rounded-xl font-bold text-base text-center no-underline flex-shrink-0"
              style={{ fontFamily: "var(--font-gothic)" }}
            >
              {t.back}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ---------- PLAYING ----------
  const canGuess = gs.sub_phase === "guessing" && !amICueGiver && !!myPlayerId;
  const myGuess = myPlayerId ? gs.guesses[myPlayerId] : null;
  const isLastRound = gs.total_rounds > 0 && gs.round >= gs.total_rounds;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: HNC.bgPage }}>
      {/* Sticky header */}
      <div className="sticky top-0 z-20" style={{ background: HNC.bgHeader, backdropFilter: "blur(8px)", borderBottom: `1px solid ${HNC.borderHdr}` }}>
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-xs truncate" style={{ color: HNC.textMuted }}>
              Hues &amp; Cues · {t.round} {gs.round}{gs.total_rounds > 0 ? ` ${t.of} ${gs.total_rounds}` : ""}
            </p>
            <p className="text-sm font-bold truncate" style={{ color: HNC.textPrim, fontFamily: "var(--font-gothic)" }}>
              {cueGiver?.name} 🎨
            </p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            {/* Score progress pill */}
            {scoreToWin > 0 && (
              <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs" style={{ background: HNC.accentLight, border: `1px solid ${HNC.borderCard}` }}>
                <span style={{ color: HNC.textMuted }}>{t.goal}:</span>
                <span style={{ color: HNC.accent }}>{topScore}</span>
                <span style={{ color: HNC.textDim }}>/</span>
                <span style={{ color: HNC.textMuted }}>{scoreToWin}</span>
              </div>
            )}
            <HeaderRight />
          </div>
        </div>

        {/* Score progress bar */}
        {scoreToWin > 0 && (
          <div style={{ height: "2px", background: "rgba(200,190,230,0.3)" }}>
            <div style={{ height: "100%", width: `${Math.min(100, (topScore / scoreToWin) * 100)}%`, background: "linear-gradient(to right, #a78bfa, #7c3aed)", transition: "width 0.5s ease" }} />
          </div>
        )}
      </div>

      <div className="flex-1 max-w-2xl mx-auto px-3 py-3 w-full flex flex-col gap-3">

        {/* Clue chips */}
        {gs.clues.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {gs.clues.map((clue, i) => (
              <div
                key={i}
                className="px-4 py-2 rounded-full font-black text-lg"
                style={{
                  background: HNC.accentLight,
                  border: `1px solid ${HNC.accentBorder}`,
                  color: HNC.textPrim,
                  fontFamily: "var(--font-gothic)",
                  letterSpacing: "0.02em",
                }}
              >
                {i + 1}. {clue}
              </div>
            ))}
          </div>
        )}

        {/* Browser warning — shown on non-Chrome browsers */}
        <ChromeWarning lang={lang} />

        {/* Color Grid */}
        <ColorGrid
          gs={gs}
          players={players}
          myPlayerId={myPlayerId}
          canGuess={canGuess}
          onGuess={placeGuess}
        />

        {/* Player pin legend */}
        <div className="flex flex-wrap gap-1.5">
          {players.map((p) => {
            const pinColor = PIN_COLORS[players.indexOf(p) % PIN_COLORS.length];
            const hasGuessed = !!gs.guesses[p.id];
            const isCueGiver = p.id === currentCueGiverId;
            return (
              <div
                key={p.id}
                className="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs"
                style={{
                  background: "rgba(248,246,255,0.7)",
                  border: `1px solid ${hasGuessed && !isCueGiver ? pinColor + "80" : HNC.borderCard}`,
                  color: hasGuessed || isCueGiver ? HNC.textPrim : HNC.textMuted,
                  opacity: isCueGiver ? 0.6 : 1,
                }}
              >
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: pinColor }} />
                {p.name}
                {isCueGiver && " 🎨"}
                {hasGuessed && !isCueGiver && " ✓"}
                <span style={{ color: HNC.textDim, marginLeft: "2px" }}>· {gs.scores[p.id] ?? 0}</span>
              </div>
            );
          })}
        </div>

        {/* Phase-specific controls */}

        {/* GIVING CLUE — cue giver */}
        {gs.sub_phase === "giving-clue" && amICueGiver && (
          <div className="hnc-card rounded-2xl p-4">
            <div className="flex items-center gap-3 mb-3">
              <div
                className="w-16 h-16 rounded-xl border-2 shadow-lg flex-shrink-0"
                style={{
                  backgroundColor: getColor(gs.target.x, gs.target.y),
                  borderColor: "rgba(124,58,237,0.4)",
                  boxShadow: `0 0 24px ${getColor(gs.target.x, gs.target.y)}80`,
                }}
              />
              <div>
                <p className="text-xs tracking-widest uppercase mb-0.5" style={{ color: HNC.accent, fontFamily: "var(--font-gothic)" }}>
                  {t.targetColor}
                </p>
                <p className="text-xs" style={{ color: HNC.textMuted }}>
                  Col {gs.target.x + 1} · Row {String.fromCharCode(65 + gs.target.y)}
                </p>
              </div>
            </div>
            <p className="text-xs mb-2" style={{ color: HNC.textSec }}>{t.giveClue}</p>
            <div className="flex gap-2">
              <input
                value={clueInput}
                onChange={(e) => setClueInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitClue()}
                placeholder={t.cluePlaceholder}
                maxLength={30}
                className="flex-1 px-3 py-2.5 rounded-xl text-sm focus:outline-none"
                style={{ background: HNC.bgInput, border: `1px solid ${HNC.borderInput}`, color: HNC.textPrim }}
                autoFocus
              />
              <button
                onClick={submitClue}
                disabled={!clueInput.trim() || submitting}
                className="btn-hnc-primary px-4 py-2 rounded-xl text-sm font-bold disabled:opacity-40"
              >
                {t.submitClue}
              </button>
            </div>
          </div>
        )}

        {/* GIVING CLUE — waiting players */}
        {gs.sub_phase === "giving-clue" && !amICueGiver && (
          <div className="hnc-card rounded-2xl p-4 text-center">
            <div className="text-3xl mb-2 animate-pulse">🎨</div>
            <p className="text-sm" style={{ color: HNC.textSec }}>
              {t.cueGiverIs}: <span style={{ color: HNC.textPrim }}>{cueGiver?.name}</span>
            </p>
            <p className="text-xs mt-1" style={{ color: HNC.textMuted }}>{t.waitingForClue}</p>
          </div>
        )}

        {/* GUESSING — cue giver controls */}
        {gs.sub_phase === "guessing" && amICueGiver && (
          <div className="hnc-card rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className="w-7 h-7 rounded-lg border flex-shrink-0"
                  style={{ backgroundColor: getColor(gs.target.x, gs.target.y), borderColor: HNC.accentBorder }}
                />
                <span className="text-xs" style={{ color: HNC.textSec }}>
                  {guessersCount}/{nonCueGivers.length} {t.guessed}
                </span>
              </div>
              {allGuessed && (
                <span className="text-xs" style={{ color: "#22c55e" }}>{t.allGuessedAuto}</span>
              )}
            </div>
            {gs.clues.length < 2 && (
              <div>
                <p className="text-xs mb-1.5" style={{ color: HNC.textMuted }}>
                  {lang === "en" ? "Optional 2nd clue:" : "Clue ที่ 2 (ไม่บังคับ):"}
                </p>
                <div className="flex gap-2">
                  <input
                    value={clueInput}
                    onChange={(e) => setClueInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && submitClue()}
                    placeholder={t.cluePlaceholder}
                    maxLength={30}
                    className="flex-1 px-3 py-2 rounded-xl text-sm focus:outline-none"
                    style={{ background: HNC.bgInput, border: `1px solid ${HNC.borderInput}`, color: HNC.textPrim }}
                  />
                  <button
                    onClick={submitClue}
                    disabled={!clueInput.trim() || submitting}
                    className="btn-hnc-secondary px-3 py-2 rounded-xl text-xs whitespace-nowrap disabled:opacity-40"
                  >
                    {lang === "en" ? "Add Clue 2" : "ส่ง"}
                  </button>
                </div>
              </div>
            )}
            <button
              onClick={triggerReveal}
              className="btn-hnc-primary w-full py-3 rounded-xl font-bold"
              style={{ fontFamily: "var(--font-gothic)" }}
            >
              {t.reveal} →
            </button>
          </div>
        )}

        {/* GUESSING — guesser status */}
        {gs.sub_phase === "guessing" && !amICueGiver && (
          <div className="hnc-card rounded-2xl p-4 text-center">
            <p className="text-sm mb-1" style={{ color: HNC.textSec }}>
              {myGuess ? "✓ " : "○ "}
              <span style={{ color: myGuess ? "#22c55e" : HNC.textPrim }}>
                {myGuess ? t.canChange : t.tapToGuess}
              </span>
            </p>
            <p className="text-xs" style={{ color: HNC.textMuted }}>
              {guessersCount}/{nonCueGivers.length} {t.guessed}
            </p>
            {myPlayerId && (
              <div className="flex items-center justify-center gap-2 mt-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: myPinColor }} />
                <span className="text-xs" style={{ color: HNC.textMuted }}>your pin</span>
              </div>
            )}
            {allGuessed && (
              <p className="text-xs mt-2 pt-2" style={{ color: "#22c55e", borderTop: `1px solid rgba(34,197,94,0.2)` }}>
                ✓ {t.allGuessedAuto} — {lang === "en" ? "Waiting for" : "รอ"}{" "}
                <span style={{ color: HNC.textPrim }}>{cueGiver?.name}</span>{" "}
                {lang === "en" ? "to reveal..." : "เฉลย..."}
              </p>
            )}
          </div>
        )}

        {/* REVEAL */}
        {gs.sub_phase === "reveal" && gs.round_scores && (
          <div className="hnc-card rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs tracking-widest uppercase" style={{ color: HNC.accent, fontFamily: "var(--font-gothic)" }}>
                {t.roundScores}
              </p>
              <div className="flex items-center gap-2">
                <div
                  className="w-8 h-8 rounded-lg border-2 flex-shrink-0 shadow-md"
                  style={{
                    backgroundColor: getColor(gs.target.x, gs.target.y),
                    borderColor: HNC.accentBorder,
                    boxShadow: `0 0 12px ${getColor(gs.target.x, gs.target.y)}50`,
                  }}
                />
                <div className="text-xs" style={{ color: HNC.textMuted }}>
                  <span style={{ color: HNC.textSec }}>{t.targetWas}</span>
                  {" "}{gs.target.x + 1},{String.fromCharCode(65 + gs.target.y)}
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              {players.map((p) => {
                const roundPts = gs.round_scores?.[p.id] ?? 0;
                const totalPts = gs.scores[p.id] ?? 0;
                const guess = gs.guesses[p.id];
                const dist = guess ? manhattan(guess, gs.target) : null;
                const isCueGiver = p.id === currentCueGiverId;
                const pinColor = PIN_COLORS[players.indexOf(p) % PIN_COLORS.length];
                const rl = dist !== null ? ringLabel(dist) : null;
                return (
                  <div
                    key={p.id}
                    className="flex items-center gap-2 text-sm px-3 py-2 rounded-xl"
                    style={{ background: HNC.bgRevealRow }}
                  >
                    <div
                      className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                      style={{ backgroundColor: pinColor }}
                    >
                      {p.name[0].toUpperCase()}
                    </div>
                    <span className="flex-1 truncate" style={{ color: p.id === myPlayerId ? HNC.textPrim : HNC.textSec }}>
                      {p.name}{isCueGiver ? " 🎨" : ""}
                    </span>
                    {!isCueGiver && rl !== null && (
                      <span className="text-xs px-1.5 py-0.5 rounded font-medium" style={{ background: HNC.accentLight, color: rl.color }}>
                        {rl.text}
                      </span>
                    )}
                    <span className="text-xs flex-shrink-0" style={{ color: HNC.textMuted }}>
                      {totalPts}
                    </span>
                    <span
                      className="font-bold w-12 text-right flex-shrink-0"
                      style={{ color: roundPts > 0 ? HNC.accent : HNC.textMuted }}
                    >
                      +{roundPts}
                    </span>
                  </div>
                );
              })}
            </div>

            {(amICueGiver || isHost) ? (
              <button
                onClick={nextRound}
                className="btn-hnc-primary w-full py-3 rounded-xl font-bold"
                style={{ fontFamily: "var(--font-gothic)" }}
              >
                {isLastRound ? t.endGame : t.nextRound}
              </button>
            ) : (
              <p className="text-center text-xs italic py-2" style={{ color: HNC.textMuted }}>
                {lang === "en"
                  ? <>Waiting for <span style={{ color: HNC.textSec }}>{cueGiver?.name}</span> to start the next round…</>
                  : <>รอ <span style={{ color: HNC.textSec }}>{cueGiver?.name}</span> เริ่มรอบถัดไป…</>
                }
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

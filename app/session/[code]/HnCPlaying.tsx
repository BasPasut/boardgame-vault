"use client";

import { useState } from "react";
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

export interface HnCGameState {
  round: number;
  total_rounds: number;
  score_to_win: number;
  cue_giver_order: string[];
  target: { x: number; y: number };
  clues: string[];
  sub_phase: "giving-clue" | "guessing" | "reveal";
  guesses: Record<string, { x: number; y: number }>;
  scores: Record<string, number>;
  round_scores?: Record<string, number>;
}

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

// ---------- Audio icons ----------
function AudioOnIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
      <path d="M3 9h5l7-5v16l-7-5H3z" stroke="#d4af37" strokeWidth="1.5" strokeLinejoin="round" fill="rgba(212,175,55,0.1)" />
      <path d="M7.5 10.5 L9 12 L7.5 13.5 L6 12 Z" stroke="#d4af37" strokeWidth="1" fill="rgba(212,175,55,0.25)" />
      <path d="M17 9.5a4 4 0 0 1 0 5" stroke="#d4af37" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M19.5 7a7.5 7.5 0 0 1 0 10" stroke="#d4af37" strokeWidth="1" strokeLinecap="round" strokeOpacity="0.45" />
    </svg>
  );
}
function AudioOffIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
      <path d="M3 9h5l7-5v16l-7-5H3z" stroke="#d4af37" strokeWidth="1.5" strokeLinejoin="round" fill="rgba(212,175,55,0.05)" strokeOpacity="0.5" />
      <path d="M7.5 10.5 L9 12 L7.5 13.5 L6 12 Z" stroke="#d4af37" strokeWidth="1" fill="none" strokeOpacity="0.35" />
      <line x1="17" y1="9" x2="22" y2="15" stroke="#d4af37" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="22" y1="9" x2="17" y2="15" stroke="#d4af37" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
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
            style={{ fontSize: "6px", color: "rgba(212,175,55,0.4)", lineHeight: "1" }}
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
              style={{ fontSize: "6px", color: "rgba(212,175,55,0.4)", lineHeight: "1" }}
            >
              {String.fromCharCode(65 + y)}
            </div>
          ))}
        </div>

        {/* Board */}
        <div
          className="flex-1 rounded-lg overflow-hidden shadow-2xl"
          style={{
            border: "2px solid rgba(212,175,55,0.35)",
            boxShadow: "0 0 0 1px rgba(0,0,0,0.5), 0 8px 40px rgba(0,0,0,0.7), 0 0 60px rgba(212,175,55,0.05)",
            background: "rgba(0,0,0,0.5)",
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
              background: "rgba(0,0,0,0.35)",
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

                return (
                  <div
                    key={`${x}-${y}`}
                    onClick={() => canGuess && onGuess(x, y)}
                    className={`relative flex items-center justify-center ${canGuess ? "cursor-pointer" : ""}`}
                    style={{
                      backgroundColor: color,
                      outline: isTarget
                        ? "2px solid rgba(255,255,255,0.95)"
                        : isCueGiverTarget
                        ? "2px dashed rgba(255,255,255,0.8)"
                        : undefined,
                      outlineOffset: "-1px",
                      zIndex: isTarget || isCueGiverTarget ? 1 : undefined,
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
    PIN_COLORS[players.findIndex((p) => p.id === myPlayerId) % PIN_COLORS.length] ?? "#d4af37";

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
        className="btn-gothic-secondary px-3 py-1.5 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ opacity: muted ? 0.5 : 1 }}
      >
        {muted ? <AudioOffIcon /> : <AudioOnIcon />}
      </button>
      <button
        onClick={() => setLang(lang === "en" ? "th" : "en")}
        className="btn-gothic-secondary px-3 py-1.5 rounded-lg text-xs flex-shrink-0"
      >
        <span style={{ color: lang === "en" ? "#d4af37" : "#5a4a3a" }}>EN</span>
        <span style={{ color: "#3a2a1a" }}> / </span>
        <span style={{ color: lang === "th" ? "#d4af37" : "#5a4a3a" }}>TH</span>
      </button>
    </div>
  );

  // ---------- ENDED ----------
  if (phase === "ended") {
    const sorted = [...players].sort((a, b) => (gs.scores[b.id] ?? 0) - (gs.scores[a.id] ?? 0));
    const topScoreVal = gs.scores[sorted[0]?.id] ?? 0;
    const winners = sorted.filter((p) => (gs.scores[p.id] ?? 0) === topScoreVal);

    return (
      <div className="min-h-screen flex flex-col" style={{ background: "radial-gradient(ellipse at top, #1a0a2e 0%, #0d0a1a 70%)" }}>
        <div className="sticky top-0 z-20" style={{ background: "rgba(13,10,26,0.97)", backdropFilter: "blur(8px)", borderBottom: "1px solid rgba(212,175,55,0.15)" }}>
          <div className="max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
            <span className="text-sm font-bold" style={{ fontFamily: "var(--font-gothic)", color: "#d4af37" }}>Hues & Cues</span>
            <HeaderRight />
          </div>
        </div>
        <div className="max-w-lg mx-auto px-4 py-8 w-full">
          <div className="text-center mb-8">
            <div className="text-6xl mb-4">🎨</div>
            <h1 className="text-3xl font-black mb-2" style={{ fontFamily: "var(--font-gothic)", color: "#e8d5b0" }}>
              {winners.length > 1 ? t.tie : winners[0]?.name}
            </h1>
            <p className="text-sm" style={{ color: "#d4af37" }}>
              {winners.length === 1 ? t.winner : ""}
            </p>
          </div>

          <div className="gothic-card rounded-2xl p-6 mb-6">
            <p className="text-xs tracking-widest uppercase mb-4" style={{ color: "#d4af37", fontFamily: "var(--font-gothic)" }}>
              {t.totalScores}
            </p>
            <div className="space-y-2">
              {sorted.map((p, i) => {
                const score = gs.scores[p.id] ?? 0;
                const pct = scoreToWin > 0 ? Math.min(100, (score / scoreToWin) * 100) : 100;
                return (
                  <div key={p.id} className="rounded-xl overflow-hidden" style={{ background: i === 0 ? "rgba(212,175,55,0.1)" : "rgba(45,27,78,0.4)" }}>
                    <div className="flex items-center gap-3 px-4 py-3">
                      <span className="text-sm w-5 flex-shrink-0" style={{ color: "#5a4a3a" }}>#{i + 1}</span>
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                        style={{ background: PIN_COLORS[players.indexOf(p) % PIN_COLORS.length] + "40", color: PIN_COLORS[players.indexOf(p) % PIN_COLORS.length] }}
                      >
                        {p.name[0].toUpperCase()}
                      </div>
                      <span className="flex-1 text-sm truncate" style={{ color: p.id === myPlayerId ? "#e8d5b0" : "#a08060" }}>
                        {p.name}{p.id === myPlayerId ? " ★" : ""}
                      </span>
                      <span className="font-bold text-base flex-shrink-0" style={{ color: i === 0 ? "#d4af37" : "#e8d5b0" }}>
                        {score} {t.pts}
                      </span>
                    </div>
                    {scoreToWin > 0 && (
                      <div style={{ height: "3px", background: "rgba(0,0,0,0.3)" }}>
                        <div style={{ height: "100%", width: `${pct}%`, background: i === 0 ? "#d4af37" : PIN_COLORS[players.indexOf(p) % PIN_COLORS.length], transition: "width 0.6s ease" }} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {scoreToWin > 0 && (
              <p className="text-center text-xs mt-3 italic" style={{ color: "#5a4a3a" }}>
                {t.goal}: {scoreToWin} {t.pts}
              </p>
            )}
          </div>

          <Link href="/" className="btn-gothic-primary w-full py-4 rounded-xl font-bold text-lg text-center no-underline block" style={{ fontFamily: "var(--font-gothic)" }}>
            ⚔ {t.playAgain}
          </Link>
        </div>
      </div>
    );
  }

  // ---------- PLAYING ----------
  const canGuess = gs.sub_phase === "guessing" && !amICueGiver && !!myPlayerId;
  const myGuess = myPlayerId ? gs.guesses[myPlayerId] : null;
  const isLastRound = gs.total_rounds > 0 && gs.round >= gs.total_rounds;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#0d0a1a" }}>
      {/* Sticky header */}
      <div className="sticky top-0 z-20" style={{ background: "rgba(13,10,26,0.97)", backdropFilter: "blur(8px)", borderBottom: "1px solid rgba(212,175,55,0.15)" }}>
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-xs truncate" style={{ color: "#5a4a3a" }}>
              Hues &amp; Cues · {t.round} {gs.round}{gs.total_rounds > 0 ? ` ${t.of} ${gs.total_rounds}` : ""}
            </p>
            <p className="text-sm font-bold truncate" style={{ color: "#e8d5b0", fontFamily: "var(--font-gothic)" }}>
              {cueGiver?.name} 🎨
            </p>
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            {/* Score progress pill */}
            {scoreToWin > 0 && (
              <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs" style={{ background: "rgba(45,27,78,0.6)", border: "1px solid rgba(212,175,55,0.15)" }}>
                <span style={{ color: "#5a4a3a" }}>{t.goal}:</span>
                <span style={{ color: "#d4af37" }}>{topScore}</span>
                <span style={{ color: "#3a2a1a" }}>/</span>
                <span style={{ color: "#5a4a3a" }}>{scoreToWin}</span>
              </div>
            )}
            <HeaderRight />
          </div>
        </div>

        {/* Score progress bar */}
        {scoreToWin > 0 && (
          <div style={{ height: "2px", background: "rgba(45,27,78,0.8)" }}>
            <div style={{ height: "100%", width: `${Math.min(100, (topScore / scoreToWin) * 100)}%`, background: "linear-gradient(to right, #4a3a7a, #d4af37)", transition: "width 0.5s ease" }} />
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
                  background: "rgba(212,175,55,0.12)",
                  border: "1px solid rgba(212,175,55,0.45)",
                  color: "#e8d5b0",
                  fontFamily: "var(--font-gothic)",
                  letterSpacing: "0.02em",
                }}
              >
                {i + 1}. {clue}
              </div>
            ))}
          </div>
        )}

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
                  background: "rgba(13,10,26,0.7)",
                  border: `1px solid ${hasGuessed && !isCueGiver ? pinColor + "80" : "rgba(90,74,58,0.3)"}`,
                  color: hasGuessed || isCueGiver ? "#e8d5b0" : "#5a4a3a",
                  opacity: isCueGiver ? 0.6 : 1,
                }}
              >
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: pinColor }} />
                {p.name}
                {isCueGiver && " 🎨"}
                {hasGuessed && !isCueGiver && " ✓"}
              </div>
            );
          })}
        </div>

        {/* Phase-specific controls */}

        {/* GIVING CLUE — cue giver */}
        {gs.sub_phase === "giving-clue" && amICueGiver && (
          <div className="gothic-card rounded-2xl p-4">
            <div className="flex items-center gap-3 mb-3">
              <div
                className="w-10 h-10 rounded-xl border-2 shadow-lg flex-shrink-0"
                style={{
                  backgroundColor: getColor(gs.target.x, gs.target.y),
                  borderColor: "rgba(212,175,55,0.6)",
                  boxShadow: `0 0 20px ${getColor(gs.target.x, gs.target.y)}60`,
                }}
              />
              <div>
                <p className="text-xs tracking-widest uppercase mb-0.5" style={{ color: "#d4af37", fontFamily: "var(--font-gothic)" }}>
                  {t.targetColor}
                </p>
                <p className="text-xs" style={{ color: "#5a4a3a" }}>
                  Col {gs.target.x + 1} · Row {String.fromCharCode(65 + gs.target.y)}
                </p>
              </div>
            </div>
            <p className="text-xs mb-2" style={{ color: "#7a6a5a" }}>{t.giveClue}</p>
            <div className="flex gap-2">
              <input
                value={clueInput}
                onChange={(e) => setClueInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && submitClue()}
                placeholder={t.cluePlaceholder}
                maxLength={30}
                className="flex-1 px-3 py-2.5 rounded-xl text-sm focus:outline-none"
                style={{ background: "rgba(13,10,26,0.8)", border: "1px solid rgba(212,175,55,0.3)", color: "#e8d5b0" }}
                autoFocus
              />
              <button
                onClick={submitClue}
                disabled={!clueInput.trim() || submitting}
                className="btn-gothic-primary px-4 py-2 rounded-xl text-sm font-bold disabled:opacity-40"
              >
                {t.submitClue}
              </button>
            </div>
          </div>
        )}

        {/* GIVING CLUE — waiting players */}
        {gs.sub_phase === "giving-clue" && !amICueGiver && (
          <div className="gothic-card rounded-2xl p-4 text-center">
            <div className="text-3xl mb-2 animate-pulse">🎨</div>
            <p className="text-sm" style={{ color: "#a08060" }}>
              {t.cueGiverIs}: <span style={{ color: "#e8d5b0" }}>{cueGiver?.name}</span>
            </p>
            <p className="text-xs mt-1" style={{ color: "#5a4a3a" }}>{t.waitingForClue}</p>
          </div>
        )}

        {/* GUESSING — cue giver controls */}
        {gs.sub_phase === "guessing" && amICueGiver && (
          <div className="gothic-card rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div
                  className="w-7 h-7 rounded-lg border flex-shrink-0"
                  style={{ backgroundColor: getColor(gs.target.x, gs.target.y), borderColor: "rgba(212,175,55,0.4)" }}
                />
                <span className="text-xs" style={{ color: "#7a6a5a" }}>
                  {guessersCount}/{nonCueGivers.length} {t.guessed}
                </span>
              </div>
              {allGuessed && (
                <span className="text-xs" style={{ color: "#5a9a5a" }}>{t.allGuessedAuto}</span>
              )}
            </div>
            {gs.clues.length < 2 && (
              <div className="flex gap-2">
                <input
                  value={clueInput}
                  onChange={(e) => setClueInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submitClue()}
                  placeholder={t.cluePlaceholder}
                  maxLength={30}
                  className="flex-1 px-3 py-2 rounded-xl text-sm focus:outline-none"
                  style={{ background: "rgba(13,10,26,0.8)", border: "1px solid rgba(212,175,55,0.2)", color: "#e8d5b0" }}
                />
                <button
                  onClick={submitClue}
                  disabled={!clueInput.trim() || submitting}
                  className="btn-gothic-secondary px-3 py-2 rounded-xl text-xs whitespace-nowrap disabled:opacity-40"
                >
                  {t.addSecondClue}
                </button>
              </div>
            )}
            <button
              onClick={triggerReveal}
              className="btn-gothic-primary w-full py-3 rounded-xl font-bold"
              style={{ fontFamily: "var(--font-gothic)" }}
            >
              {t.reveal} →
            </button>
          </div>
        )}

        {/* GUESSING — guesser status */}
        {gs.sub_phase === "guessing" && !amICueGiver && (
          <div className="gothic-card rounded-2xl p-4 text-center">
            <p className="text-sm mb-1" style={{ color: "#7a6a5a" }}>
              {myGuess ? "✓ " : "○ "}
              <span style={{ color: myGuess ? "#5a9a5a" : "#e8d5b0" }}>
                {myGuess ? t.canChange : t.tapToGuess}
              </span>
            </p>
            <p className="text-xs" style={{ color: "#5a4a3a" }}>
              {guessersCount}/{nonCueGivers.length} {t.guessed}
            </p>
            {myPlayerId && (
              <div className="flex items-center justify-center gap-2 mt-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: myPinColor }} />
                <span className="text-xs" style={{ color: "#5a4a3a" }}>your pin</span>
              </div>
            )}
          </div>
        )}

        {/* REVEAL */}
        {gs.sub_phase === "reveal" && gs.round_scores && (
          <div className="gothic-card rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs tracking-widest uppercase" style={{ color: "#d4af37", fontFamily: "var(--font-gothic)" }}>
                {t.roundScores}
              </p>
              <div className="flex items-center gap-2">
                <div
                  className="w-8 h-8 rounded-lg border-2 flex-shrink-0 shadow-md"
                  style={{
                    backgroundColor: getColor(gs.target.x, gs.target.y),
                    borderColor: "rgba(212,175,55,0.5)",
                    boxShadow: `0 0 12px ${getColor(gs.target.x, gs.target.y)}50`,
                  }}
                />
                <div className="text-xs" style={{ color: "#5a4a3a" }}>
                  <span style={{ color: "#7a6a5a" }}>{t.targetWas}</span>
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
                return (
                  <div
                    key={p.id}
                    className="flex items-center gap-2 text-sm px-3 py-2 rounded-xl"
                    style={{ background: "rgba(13,10,26,0.6)" }}
                  >
                    <div
                      className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                      style={{ backgroundColor: pinColor }}
                    >
                      {p.name[0].toUpperCase()}
                    </div>
                    <span className="flex-1 truncate" style={{ color: p.id === myPlayerId ? "#e8d5b0" : "#a08060" }}>
                      {p.name}{isCueGiver ? " 🎨" : ""}
                    </span>
                    {!isCueGiver && dist !== null && (
                      <span className="text-xs px-1 py-0.5 rounded" style={{ background: "rgba(45,27,78,0.6)", color: "#7a6a5a" }}>
                        d={dist}
                      </span>
                    )}
                    <span className="text-xs flex-shrink-0" style={{ color: "#5a4a3a" }}>
                      {totalPts}
                    </span>
                    <span
                      className="font-bold w-12 text-right flex-shrink-0"
                      style={{ color: roundPts > 0 ? "#d4af37" : "#5a4a3a" }}
                    >
                      +{roundPts}
                    </span>
                  </div>
                );
              })}
            </div>

            {(amICueGiver || isHost) && (
              <button
                onClick={nextRound}
                className="btn-gothic-primary w-full py-3 rounded-xl font-bold"
                style={{ fontFamily: "var(--font-gothic)" }}
              >
                {isLastRound ? t.endGame : t.nextRound}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

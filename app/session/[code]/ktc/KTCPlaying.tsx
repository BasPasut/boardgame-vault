"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useSpeechRecognition } from "@/lib/hooks/useSpeechRecognition";
import { findSubWordConflict } from "@/lib/games/ktc";
import type { CommonPlayingProps } from "../gameRegistry";
import type { KTCGameState, KTCWord, KTCEventEntry } from "@/lib/games/ktc/types";
import type { Player } from "@/types/game";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function uid() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

function now() {
  return new Date().toISOString();
}

function playerName(players: Player[], id: string | null | undefined) {
  return players.find((p) => p.id === id)?.name ?? "?";
}

/** ms remaining until ISO timestamp */
function msUntil(iso: string) {
  return new Date(iso).getTime() - Date.now();
}

// ─── iOS Safari warning ───────────────────────────────────────────────────────

function useNeedsSafariWarning() {
  const [warn, setWarn] = useState(false);
  useEffect(() => {
    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua);
    const isSafari = /^((?!chrome|android).)*safari/i.test(ua);
    setWarn(isIOS && !isSafari);
  }, []);
  return warn;
}

// ─── Turn countdown ───────────────────────────────────────────────────────────

function useTurnCountdown(turnStartedAt: string | null, durationS: number) {
  const [secsLeft, setSecsLeft] = useState(durationS);

  useEffect(() => {
    if (!turnStartedAt) { setSecsLeft(durationS); return; }
    const endMs = new Date(turnStartedAt).getTime() + durationS * 1000;

    const tick = () => {
      const rem = Math.ceil((endMs - Date.now()) / 1000);
      setSecsLeft(Math.max(0, rem));
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [turnStartedAt, durationS]);

  return secsLeft;
}

// ─── Challenge countdown ──────────────────────────────────────────────────────

function useChallengeCountdown(endAt: string | null) {
  const [secsLeft, setSecsLeft] = useState(60);
  useEffect(() => {
    if (!endAt) return;
    const tick = () => setSecsLeft(Math.max(0, Math.ceil(msUntil(endAt) / 1000)));
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [endAt]);
  return secsLeft;
}

// ─── Color bar ───────────────────────────────────────────────────────────────

const PLAYER_COLORS = [
  "#d4af37", "#ef4444", "#3b82f6", "#a855f7",
  "#22c55e", "#f97316", "#ec4899", "#14b8a6",
  "#eab308", "#6366f1",
];

function playerColor(allPlayers: string[], id: string) {
  const idx = allPlayers.indexOf(id);
  return PLAYER_COLORS[idx % PLAYER_COLORS.length] ?? "#7a6a5a";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TimerRing({ secsLeft, total }: { secsLeft: number; total: number }) {
  const pct = secsLeft / total;
  const color = pct > 0.5 ? "#22c55e" : pct > 0.25 ? "#f59e0b" : "#ef4444";
  const r = 22;
  const circ = 2 * Math.PI * r;
  return (
    <svg width="60" height="60" viewBox="0 0 60 60">
      <circle cx="30" cy="30" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="4" />
      <circle
        cx="30" cy="30" r={r} fill="none"
        stroke={color} strokeWidth="4"
        strokeDasharray={`${circ * pct} ${circ}`}
        strokeLinecap="round"
        transform="rotate(-90 30 30)"
        style={{ transition: "stroke-dasharray 0.25s linear, stroke 0.5s" }}
      />
      <text x="30" y="35" textAnchor="middle" fontSize="16" fontWeight="bold" fill={color}>
        {secsLeft}
      </text>
    </svg>
  );
}

function EventLog({ entries, players }: { entries: KTCEventEntry[]; players: Player[] }) {
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [entries.length]);

  const evColor = (type: KTCEventEntry["type"]) => {
    if (type === "eliminate") return "#ef4444";
    if (type === "challenge") return "#a855f7";
    if (type === "vote")      return "#f59e0b";
    if (type === "round")     return "#d4af37";
    if (type === "system")    return "#3b82f6";
    return "#7a6a5a";
  };

  return (
    <div
      ref={logRef}
      className="overflow-y-auto space-y-1"
      style={{ maxHeight: "140px" }}
    >
      {entries.slice(-40).map((e) => (
        <div key={e.id} className="text-xs flex gap-2">
          <span style={{ color: "#3a2a2a", flexShrink: 0 }}>
            {new Date(e.timestamp).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </span>
          <span style={{ color: evColor(e.type) }}>{e.message_th}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function KTCPlaying({
  code,
  dbSession,
  players,
  myPlayerId,
  isHost,
}: CommonPlayingProps) {
  const gs = dbSession.game_state as KTCGameState;

  const [wordInput, setWordInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [hasVoted, setHasVoted] = useState(false);
  const timeoutFiredRef = useRef(false);

  const speech = useSpeechRecognition({ lang: "th-TH" });
  const needsSafariWarn = useNeedsSafariWarning();

  // Derived
  const currentTurnId =
    gs.active_players.length > 0
      ? gs.active_players[gs.current_turn_index % gs.active_players.length]
      : null;
  const isMyTurn = myPlayerId !== null && currentTurnId === myPlayerId;
  const isActive = gs.active_players.includes(myPlayerId ?? "");
  const secsLeft = useTurnCountdown(gs.turn_started_at, gs.turn_duration_s);
  const challengeSecsLeft = useChallengeCountdown(gs.challenge?.discussion_end_at ?? null);

  // Sync speech transcript → input
  useEffect(() => {
    if (speech.transcript && isMyTurn && gs.phase === "playing") {
      setWordInput(speech.transcript);
      speech.reset();
    }
  }, [speech.transcript]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset hasVoted when challenge changes
  useEffect(() => {
    if (!gs.challenge) setHasVoted(false);
  }, [gs.challenge?.challenger_id, gs.challenge?.challenged_player_id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-timeout: when timer hits 0 and it's my turn, eliminate myself
  useEffect(() => {
    if (
      gs.phase === "playing" &&
      isMyTurn &&
      secsLeft === 0 &&
      !submitting &&
      !timeoutFiredRef.current
    ) {
      timeoutFiredRef.current = true;
      handleTimeout();
    }
    if (secsLeft > 0) timeoutFiredRef.current = false;
  }, [secsLeft, isMyTurn, gs.phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── DB helpers ──────────────────────────────────────────────────────────────

  async function freshState(): Promise<KTCGameState | null> {
    const { data } = await supabase
      .from("sessions")
      .select("game_state")
      .eq("code", code)
      .single();
    return data ? (data.game_state as KTCGameState) : null;
  }

  async function patchState(patch: Partial<KTCGameState>) {
    const fresh = await freshState();
    if (!fresh) return;
    await supabase
      .from("sessions")
      .update({ game_state: { ...fresh, ...patch } })
      .eq("code", code);
  }

  // After an elimination: remove player, reset words, advance turn
  async function eliminatePlayer(
    fresh: KTCGameState,
    eliminatedId: string,
    reason: "timeout" | "conflict" | "challenge"
  ) {
    const reasonTh =
      reason === "timeout" ? "หมดเวลา" : reason === "conflict" ? "คำซ้ำ" : "challenge";
    const elimName = playerName(players, eliminatedId);

    const newActive = fresh.active_players.filter((id) => id !== eliminatedId);

    const elimLog: KTCEventEntry = {
      id: uid(), timestamp: now(), type: "eliminate", player_id: eliminatedId,
      message_th: `❌ ${elimName} ออกจากรอบนี้ (${reasonTh})`,
      message_en: `❌ ${elimName} eliminated (${reason})`,
    };

    if (newActive.length <= 1) {
      // Round over
      const winnerId = newActive[0] ?? null;
      const newScores = { ...fresh.scores };
      if (winnerId) newScores[winnerId] = (newScores[winnerId] ?? 0) + 1;

      const isLastRound = fresh.current_round >= fresh.total_rounds;
      const roundLog: KTCEventEntry = {
        id: uid(), timestamp: now(), type: "round",
        message_th: winnerId
          ? `🏆 ${playerName(players, winnerId)} ชนะรอบที่ ${fresh.current_round}! (+1 คะแนน)`
          : `รอบที่ ${fresh.current_round} จบลงโดยไม่มีผู้ชนะ`,
        message_en: winnerId
          ? `🏆 ${playerName(players, winnerId)} wins round ${fresh.current_round}! (+1 pt)`
          : `Round ${fresh.current_round} ended with no winner`,
      };

      // Final game winner
      let gameWinner: string | null = null;
      if (isLastRound) {
        const sorted = Object.entries(newScores).sort(([, a], [, b]) => b - a);
        gameWinner = sorted[0]?.[0] ?? null;
      }

      await supabase.from("sessions").update({
        phase: isLastRound ? "ended" : "playing",
        game_state: {
          ...fresh,
          phase: isLastRound ? "ended" : "round_end",
          active_players: newActive,
          scores: newScores,
          round_winner_id: winnerId,
          winner: gameWinner,
          challenge: null,
          event_log: [...fresh.event_log, elimLog, roundLog],
        },
      }).eq("code", code);
    } else {
      // Continue — reset words (new sub-round) and advance turn
      const elimIdx = fresh.active_players.indexOf(eliminatedId);
      const oldTurnMod = fresh.current_turn_index % fresh.active_players.length;
      let newTurnIdx =
        elimIdx <= oldTurnMod
          ? Math.max(0, oldTurnMod - 1) % newActive.length
          : oldTurnMod % newActive.length;
      // Safety clamp
      newTurnIdx = newTurnIdx % newActive.length;

      await supabase.from("sessions").update({
        game_state: {
          ...fresh,
          active_players: newActive,
          words: [], // reset sub-round
          current_turn_index: newTurnIdx,
          turn_started_at: now(),
          challenge: null,
          event_log: [...fresh.event_log, elimLog],
        },
      }).eq("code", code);
    }
  }

  // ── Actions ─────────────────────────────────────────────────────────────────

  const handleSubmitWord = useCallback(async (word: string) => {
    if (!myPlayerId || !word.trim() || submitting) return;
    const trimmed = word.trim();

    // Optimistic client-side validation
    const conflict = findSubWordConflict(trimmed, gs.words.map((w) => w.word));
    if (conflict) {
      setSubmitError(`"${conflict.sub}" ซ้ำกับคำ "${conflict.with}"`);
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    const fresh = await freshState();
    if (!fresh) { setSubmitting(false); return; }

    // Re-check it's still my turn on fresh state
    const freshCurrentId =
      fresh.active_players[fresh.current_turn_index % fresh.active_players.length];
    if (freshCurrentId !== myPlayerId || fresh.phase !== "playing") {
      setSubmitting(false);
      return;
    }

    // Re-validate with fresh word list
    const freshConflict = findSubWordConflict(trimmed, fresh.words.map((w) => w.word));

    if (freshConflict) {
      // Player's word has a conflict — eliminate them
      setSubmitError(`"${freshConflict.sub}" ซ้ำกับคำ "${freshConflict.with}" — คุณออกจากรอบนี้!`);
      await eliminatePlayer(fresh, myPlayerId, "conflict");
      setWordInput("");
      setSubmitting(false);
      return;
    }

    // Valid word — add it and advance turn
    const newWord: KTCWord = {
      word: trimmed,
      player_id: myPlayerId,
      timestamp: now(),
    };

    const wordLog: KTCEventEntry = {
      id: uid(), timestamp: now(), type: "word", player_id: myPlayerId,
      message_th: `💬 ${playerName(players, myPlayerId)}: "${trimmed}"`,
      message_en: `💬 ${playerName(players, myPlayerId)}: "${trimmed}"`,
    };

    const nextIdx = (fresh.current_turn_index + 1) % fresh.active_players.length;

    await supabase.from("sessions").update({
      game_state: {
        ...fresh,
        words: [...fresh.words, newWord],
        current_turn_index: nextIdx,
        turn_started_at: now(),
        event_log: [...fresh.event_log, wordLog],
      },
    }).eq("code", code);

    setWordInput("");
    setSubmitting(false);
  }, [myPlayerId, gs.words, gs.phase, submitting, code, players]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleTimeout = useCallback(async () => {
    if (!myPlayerId) return;
    const fresh = await freshState();
    if (!fresh || fresh.phase !== "playing") return;

    const freshCurrentId =
      fresh.active_players[fresh.current_turn_index % fresh.active_players.length];
    if (freshCurrentId !== myPlayerId) return; // already advanced

    // Verify timer actually expired on fresh state
    if (fresh.turn_started_at) {
      const elapsed = Date.now() - new Date(fresh.turn_started_at).getTime();
      if (elapsed < fresh.turn_duration_s * 1000 - 500) return; // not yet
    }

    await eliminatePlayer(fresh, myPlayerId, "timeout");
  }, [myPlayerId, code]); // eslint-disable-line react-hooks/exhaustive-deps

  // Host: skip current player (timeout override)
  const handleHostSkip = useCallback(async () => {
    const fresh = await freshState();
    if (!fresh || fresh.phase !== "playing") return;
    const currentId = fresh.active_players[fresh.current_turn_index % fresh.active_players.length];
    if (!currentId) return;
    await eliminatePlayer(fresh, currentId, "timeout");
  }, [code]); // eslint-disable-line react-hooks/exhaustive-deps

  // Any player: challenge the last word
  const handleChallenge = useCallback(async () => {
    if (!myPlayerId) return;
    const fresh = await freshState();
    if (!fresh || fresh.phase !== "playing") return;

    const lastWord = fresh.words[fresh.words.length - 1];
    if (!lastWord || lastWord.player_id === myPlayerId) return;

    const challengeLog: KTCEventEntry = {
      id: uid(), timestamp: now(), type: "challenge", player_id: myPlayerId,
      message_th: `🚨 ${playerName(players, myPlayerId)} ท้าทายคำ "${lastWord.word}" ของ ${playerName(players, lastWord.player_id)}`,
      message_en: `🚨 ${playerName(players, myPlayerId)} challenged "${lastWord.word}" by ${playerName(players, lastWord.player_id)}`,
    };

    const discussionEnd = new Date(Date.now() + 60 * 1000).toISOString();

    await supabase.from("sessions").update({
      game_state: {
        ...fresh,
        phase: "challenge",
        challenge: {
          challenger_id: myPlayerId,
          challenged_player_id: lastWord.player_id,
          challenged_word: lastWord.word,
          started_at: now(),
          discussion_end_at: discussionEnd,
          votes: {},
        },
        event_log: [...fresh.event_log, challengeLog],
      },
    }).eq("code", code);
  }, [myPlayerId, code, players]); // eslint-disable-line react-hooks/exhaustive-deps

  // Vote during challenge
  const handleVote = useCallback(async (side: "challenger" | "challenged") => {
    if (!myPlayerId || hasVoted) return;
    setHasVoted(true);

    const fresh = await freshState();
    if (!fresh || fresh.phase !== "challenge" || !fresh.challenge) return;

    const newVotes = { ...fresh.challenge.votes, [myPlayerId]: side };
    const newChallenge = { ...fresh.challenge, votes: newVotes };

    // Check if all active players have voted
    const allVoted = fresh.active_players.every((id) => id in newVotes);
    const timedOut = msUntil(fresh.challenge.discussion_end_at) <= 0;

    if (!allVoted && !timedOut) {
      // Just save the vote
      await patchState({ challenge: newChallenge });
      return;
    }

    // Resolve: tally votes
    let challengerVotes = 0;
    let challengedVotes = 0;
    Object.values(newVotes).forEach((v) => {
      if (v === "challenger") challengerVotes++;
      else challengedVotes++;
    });

    // Fewer votes = eliminated; tie → challenger loses (challenge failed)
    const eliminatedId =
      challengerVotes < challengedVotes
        ? fresh.challenge.challenger_id
        : fresh.challenge.challenged_player_id;
    const survivorId =
      eliminatedId === fresh.challenge.challenger_id
        ? fresh.challenge.challenged_player_id
        : fresh.challenge.challenger_id;

    // Survivor gets +1 bonus
    const newScores = { ...fresh.scores };
    newScores[survivorId] = (newScores[survivorId] ?? 0) + 1;

    const voteLog: KTCEventEntry = {
      id: uid(), timestamp: now(), type: "vote", player_id: eliminatedId,
      message_th: `🗳️ โหวต ${challengerVotes}:${challengedVotes} → ${playerName(players, eliminatedId)} ออก, ${playerName(players, survivorId)} ได้ +1`,
      message_en: `🗳️ Vote ${challengerVotes}:${challengedVotes} → ${playerName(players, eliminatedId)} out, ${playerName(players, survivorId)} +1`,
    };

    // Rebuild fresh state then eliminate
    const patchedFresh = { ...fresh, scores: newScores, challenge: newChallenge };
    await eliminatePlayer(
      { ...patchedFresh, event_log: [...patchedFresh.event_log, voteLog] },
      eliminatedId,
      "challenge"
    );
  }, [myPlayerId, hasVoted, code, players]); // eslint-disable-line react-hooks/exhaustive-deps

  // Host: resolve challenge early
  const handleResolveChallenge = useCallback(async () => {
    const fresh = await freshState();
    if (!fresh || fresh.phase !== "challenge" || !fresh.challenge) return;

    const votes = fresh.challenge.votes;
    let challengerVotes = 0;
    let challengedVotes = 0;
    Object.values(votes).forEach((v) => {
      if (v === "challenger") challengerVotes++;
      else challengedVotes++;
    });

    const eliminatedId =
      challengerVotes < challengedVotes
        ? fresh.challenge.challenger_id
        : fresh.challenge.challenged_player_id;
    const survivorId =
      eliminatedId === fresh.challenge.challenger_id
        ? fresh.challenge.challenged_player_id
        : fresh.challenge.challenger_id;

    const newScores = { ...fresh.scores };
    newScores[survivorId] = (newScores[survivorId] ?? 0) + 1;

    const voteLog: KTCEventEntry = {
      id: uid(), timestamp: now(), type: "vote", player_id: eliminatedId,
      message_th: `🗳️ โหวต ${challengerVotes}:${challengedVotes} → ${playerName(players, eliminatedId)} ออก, ${playerName(players, survivorId)} ได้ +1`,
      message_en: `🗳️ Vote ${challengerVotes}:${challengedVotes} → ${playerName(players, eliminatedId)} out, ${playerName(players, survivorId)} +1`,
    };

    await eliminatePlayer(
      { ...fresh, scores: newScores, event_log: [...fresh.event_log, voteLog] },
      eliminatedId,
      "challenge"
    );
  }, [code, players]); // eslint-disable-line react-hooks/exhaustive-deps

  // Host: start next round
  const handleNextRound = useCallback(async () => {
    const fresh = await freshState();
    if (!fresh || fresh.phase !== "round_end") return;

    const nextRound = fresh.current_round + 1;
    const newActive = [...fresh.all_players].sort(() => Math.random() - 0.5);

    const roundLog: KTCEventEntry = {
      id: uid(), timestamp: now(), type: "round",
      message_th: `🔄 รอบที่ ${nextRound} เริ่มแล้ว!`,
      message_en: `🔄 Round ${nextRound} started!`,
    };

    await supabase.from("sessions").update({
      phase: "playing",
      game_state: {
        ...fresh,
        phase: "playing",
        current_round: nextRound,
        active_players: newActive,
        current_turn_index: 0,
        turn_started_at: now(),
        words: [],
        round_winner_id: null,
        challenge: null,
        event_log: [...fresh.event_log, roundLog],
      },
    }).eq("code", code);
  }, [code]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Renders ──────────────────────────────────────────────────────────────────

  // ── Ended ──
  if (gs.phase === "ended") {
    const sortedScores = Object.entries(gs.scores).sort(([, a], [, b]) => b - a);
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center px-6 py-12"
        style={{ background: "radial-gradient(ellipse at top, #0d2a1a 0%, #0d0a1a 70%)" }}
      >
        <div className="text-6xl mb-4 animate-victory-pulse">🏆</div>
        <h1
          className="text-3xl font-black text-center mb-2"
          style={{ fontFamily: "var(--font-gothic)", color: "#d4af37" }}
        >
          {gs.winner ? `${playerName(players, gs.winner)} ชนะ!` : "เกมจบแล้ว!"}
        </h1>
        <p className="text-sm mb-8" style={{ color: "#7a6a5a" }}>คำต้องเชื่อม · {gs.total_rounds} รอบ</p>

        {/* Scores */}
        <div className="w-full max-w-sm space-y-2 mb-8">
          {sortedScores.map(([pid, score], i) => (
            <div
              key={pid}
              className="flex items-center gap-3 px-4 py-3 rounded-xl"
              style={{
                background: i === 0 ? "rgba(212,175,55,0.15)" : "rgba(45,27,78,0.4)",
                border: `1px solid ${i === 0 ? "rgba(212,175,55,0.5)" : "rgba(212,175,55,0.1)"}`,
              }}
            >
              <span className="text-lg w-6 text-center">
                {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `${i + 1}.`}
              </span>
              <div
                className="w-2 h-6 rounded-full flex-shrink-0"
                style={{ background: playerColor(gs.all_players, pid) }}
              />
              <span className="flex-1 font-semibold" style={{ color: "#e8d5b0" }}>
                {playerName(players, pid)}
              </span>
              <span className="font-bold" style={{ color: i === 0 ? "#d4af37" : "#7a6a5a" }}>
                {score} คะแนน
              </span>
            </div>
          ))}
        </div>

        <Link
          href={`/session/create?game=kam-tong-chuom`}
          className="btn-gothic-primary px-8 py-4 rounded-xl font-bold text-lg no-underline"
          style={{ fontFamily: "var(--font-gothic)" }}
        >
          🔄 เล่นอีกครั้ง
        </Link>
      </div>
    );
  }

  // ── Round end ──
  if (gs.phase === "round_end") {
    const isLastRound = gs.current_round >= gs.total_rounds;
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center px-6 py-12"
        style={{ background: "radial-gradient(ellipse at top, #1a0a2e 0%, #0d0a1a 70%)" }}
      >
        <div className="text-5xl mb-4">🎉</div>
        <h2
          className="text-2xl font-black text-center mb-1"
          style={{ fontFamily: "var(--font-gothic)", color: "#d4af37" }}
        >
          รอบที่ {gs.current_round} จบแล้ว!
        </h2>
        {gs.round_winner_id && (
          <p className="text-lg mb-6" style={{ color: "#e8d5b0" }}>
            🏆 {playerName(players, gs.round_winner_id)} ชนะรอบนี้!
          </p>
        )}

        {/* Current scores */}
        <div className="w-full max-w-sm gothic-card rounded-2xl p-5 mb-6">
          <div className="text-xs tracking-widest uppercase mb-3" style={{ color: "#d4af37", fontFamily: "var(--font-gothic)" }}>
            คะแนนสะสม
          </div>
          {Object.entries(gs.scores).sort(([, a], [, b]) => b - a).map(([pid, score]) => (
            <div key={pid} className="flex items-center gap-2 py-1.5">
              <div className="w-2 h-5 rounded-full" style={{ background: playerColor(gs.all_players, pid) }} />
              <span className="flex-1 text-sm" style={{ color: "#e8d5b0" }}>{playerName(players, pid)}</span>
              <span className="font-bold text-sm" style={{ color: "#d4af37" }}>{score} pt</span>
            </div>
          ))}
        </div>

        {isLastRound ? (
          <p className="text-sm" style={{ color: "#7a6a5a" }}>กำลังคำนวณผู้ชนะ...</p>
        ) : isHost ? (
          <button
            onClick={handleNextRound}
            className="btn-gothic-primary px-8 py-4 rounded-xl text-lg font-bold"
            style={{ fontFamily: "var(--font-gothic)" }}
          >
            ▶ รอบที่ {gs.current_round + 1} →
          </button>
        ) : (
          <p className="text-sm italic" style={{ color: "#5a4a3a" }}>รอ Host เริ่มรอบต่อไป...</p>
        )}
      </div>
    );
  }

  // ── Challenge phase ──
  if (gs.phase === "challenge" && gs.challenge) {
    const ch = gs.challenge;
    const challengerName = playerName(players, ch.challenger_id);
    const challengedName = playerName(players, ch.challenged_player_id);
    const myVote = myPlayerId ? ch.votes[myPlayerId] : undefined;
    const voteCount = { challenger: 0, challenged: 0 };
    Object.values(ch.votes).forEach((v) => voteCount[v]++);
    const totalVoters = gs.active_players.length;

    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center px-6 py-12"
        style={{ background: "radial-gradient(ellipse at top, #1a0a2e 0%, #0d0a1a 70%)" }}
      >
        <div className="text-5xl mb-4">🚨</div>
        <h2
          className="text-2xl font-black text-center mb-2"
          style={{ fontFamily: "var(--font-gothic)", color: "#a855f7" }}
        >
          Challenge!
        </h2>
        <p className="text-center mb-1" style={{ color: "#e8d5b0" }}>
          <span style={{ color: "#d4af37" }}>{challengerName}</span> ท้าทายคำ{" "}
          <span
            className="font-black text-xl"
            style={{ color: "#a855f7", fontFamily: "var(--font-gothic)" }}
          >
            &ldquo;{ch.challenged_word}&rdquo;
          </span>
        </p>
        <p className="text-sm mb-6" style={{ color: "#7a6a5a" }}>
          ของ <span style={{ color: "#e8d5b0" }}>{challengedName}</span>
        </p>

        {/* Timer */}
        <div className="mb-6">
          <TimerRing secsLeft={challengeSecsLeft} total={60} />
          <p className="text-xs text-center mt-1" style={{ color: "#5a4a3a" }}>เวลาถกเถียง</p>
        </div>

        {/* Vote buttons */}
        <div className="w-full max-w-sm space-y-3 mb-6">
          <p className="text-xs text-center mb-3" style={{ color: "#7a6a5a" }}>
            โหวตว่าใครถูก — ผู้ที่ได้คะแนนโหวตน้อยกว่าออก
          </p>
          <button
            onClick={() => handleVote("challenger")}
            disabled={!!myVote || hasVoted}
            className="w-full py-4 rounded-xl font-bold text-lg transition-all disabled:opacity-50"
            style={{
              background: myVote === "challenger" ? "rgba(212,175,55,0.25)" : "rgba(45,27,78,0.5)",
              border: `2px solid ${myVote === "challenger" ? "#d4af37" : "rgba(212,175,55,0.2)"}`,
              color: "#d4af37",
              fontFamily: "var(--font-gothic)",
            }}
          >
            🤝 {challengerName} ถูก (คำไม่ valid)
            <span className="ml-2 text-sm">({voteCount.challenger})</span>
          </button>
          <button
            onClick={() => handleVote("challenged")}
            disabled={!!myVote || hasVoted}
            className="w-full py-4 rounded-xl font-bold text-lg transition-all disabled:opacity-50"
            style={{
              background: myVote === "challenged" ? "rgba(74,111,165,0.25)" : "rgba(45,27,78,0.5)",
              border: `2px solid ${myVote === "challenged" ? "#4a6fa5" : "rgba(74,111,165,0.2)"}`,
              color: "#80b0ff",
              fontFamily: "var(--font-gothic)",
            }}
          >
            🛡️ {challengedName} ถูก (คำ valid)
            <span className="ml-2 text-sm">({voteCount.challenged})</span>
          </button>

          <p className="text-xs text-center" style={{ color: "#5a4a3a" }}>
            โหวตแล้ว {Object.keys(ch.votes).length}/{totalVoters} คน
          </p>
        </div>

        {isHost && (
          <button
            onClick={handleResolveChallenge}
            className="btn-gothic-secondary px-6 py-3 rounded-xl text-sm"
          >
            ⚖️ สรุปผลโหวตทันที (Host)
          </button>
        )}
      </div>
    );
  }

  // ── Playing phase ──
  const currentTurnName = playerName(players, currentTurnId);
  const lastWord = gs.words[gs.words.length - 1] ?? null;
  const canChallenge =
    myPlayerId !== null &&
    gs.words.length > 0 &&
    lastWord?.player_id !== myPlayerId &&
    isActive;

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "radial-gradient(ellipse at top, #071a0e 0%, #0d0a1a 70%)" }}
    >
      {/* ── Header ── */}
      <div
        className="flex items-center justify-between px-4 py-3 flex-shrink-0"
        style={{ background: "rgba(13,10,26,0.9)", borderBottom: "1px solid rgba(212,175,55,0.12)" }}
      >
        <div className="flex items-center gap-3">
          <span className="text-lg font-black" style={{ fontFamily: "var(--font-gothic)", color: "#22c55e" }}>
            คำต้องเชื่อม
          </span>
          <span
            className="text-xs px-2 py-0.5 rounded-full"
            style={{ background: "rgba(34,197,94,0.12)", color: "#22c55e" }}
          >
            รอบ {gs.current_round}/{gs.total_rounds}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowLog((v) => !v)}
            className="btn-gothic-secondary px-3 py-1.5 rounded-lg text-xs"
          >
            📜 Log
          </button>
          <Link
            href={`/guide/kam-tong-chuom?from=${code}`}
            className="btn-gothic-secondary px-3 py-1.5 rounded-lg text-xs no-underline"
          >
            📖
          </Link>
        </div>
      </div>

      {/* ── iOS Safari Warning ── */}
      {needsSafariWarn && (
        <div
          className="mx-4 mt-3 px-4 py-3 rounded-xl text-sm flex items-start gap-2"
          style={{
            background: "rgba(234,179,8,0.12)",
            border: "1px solid rgba(234,179,8,0.4)",
            color: "#eab308",
          }}
        >
          <span className="text-base flex-shrink-0">⚠️</span>
          <p>
            <strong>ใช้ Safari</strong> สำหรับฟีเจอร์ไมโครโฟน — Chrome บน iOS ไม่รองรับ Web Speech API
          </p>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">

        {/* ── Active players strip ── */}
        <div className="gothic-card rounded-xl p-3">
          <div className="text-xs tracking-widest uppercase mb-2" style={{ color: "#d4af37", fontFamily: "var(--font-gothic)" }}>
            ผู้เล่น
          </div>
          <div className="flex flex-wrap gap-2">
            {gs.all_players.map((pid) => {
              const active = gs.active_players.includes(pid);
              const isCurrent = pid === currentTurnId;
              const col = playerColor(gs.all_players, pid);
              return (
                <div
                  key={pid}
                  className="flex items-center gap-1.5 px-2 py-1 rounded-full text-sm transition-all"
                  style={{
                    background: isCurrent
                      ? `${col}22`
                      : active
                      ? "rgba(45,27,78,0.5)"
                      : "rgba(13,10,26,0.4)",
                    border: `1.5px solid ${isCurrent ? col : active ? "rgba(212,175,55,0.15)" : "rgba(90,74,58,0.2)"}`,
                    opacity: active ? 1 : 0.4,
                    boxShadow: isCurrent ? `0 0 10px ${col}55` : undefined,
                  }}
                >
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: active ? col : "#3a2a2a" }} />
                  <span
                    style={{
                      color: isCurrent ? col : active ? "#e8d5b0" : "#3a2a2a",
                      fontWeight: isCurrent ? 700 : 400,
                      textDecoration: active ? undefined : "line-through",
                    }}
                  >
                    {playerName(players, pid)}
                    {pid === myPlayerId && (
                      <span className="ml-1 text-xs" style={{ color: "#5a4a3a" }}>(you)</span>
                    )}
                  </span>
                  {isCurrent && <span className="text-xs">⏱</span>}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Word list ── */}
        <div className="gothic-card rounded-xl p-3">
          <div className="text-xs tracking-widest uppercase mb-2 flex justify-between" style={{ color: "#d4af37", fontFamily: "var(--font-gothic)" }}>
            <span>คำในรอบนี้ ({gs.words.length})</span>
            <span style={{ color: "#5a4a3a" }}>รีเซ็ตทุกครั้งที่มีคนออก</span>
          </div>
          {gs.words.length === 0 ? (
            <p className="text-sm text-center py-2" style={{ color: "#3a2a2a" }}>
              ยังไม่มีคำ — เริ่มกันเลย!
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {gs.words.map((w, i) => {
                const col = playerColor(gs.all_players, w.player_id);
                return (
                  <span
                    key={i}
                    className="px-3 py-1 rounded-full text-sm font-bold"
                    style={{
                      background: `${col}18`,
                      border: `1px solid ${col}44`,
                      color: col,
                    }}
                    title={playerName(players, w.player_id)}
                  >
                    {w.word}
                  </span>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Scores mini ── */}
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(gs.scores).sort(([, a], [, b]) => b - a).map(([pid, score]) => (
            <div
              key={pid}
              className="flex items-center gap-2 px-3 py-2 rounded-xl"
              style={{ background: "rgba(45,27,78,0.3)", border: "1px solid rgba(212,175,55,0.08)" }}
            >
              <div className="w-2 h-4 rounded-full flex-shrink-0" style={{ background: playerColor(gs.all_players, pid) }} />
              <span className="flex-1 text-xs truncate" style={{ color: "#e8d5b0" }}>{playerName(players, pid)}</span>
              <span className="text-xs font-bold" style={{ color: "#d4af37" }}>{score}pt</span>
            </div>
          ))}
        </div>

        {/* ── Event log panel ── */}
        {showLog && (
          <div className="gothic-card rounded-xl p-3">
            <div className="text-xs tracking-widest uppercase mb-2" style={{ color: "#d4af37", fontFamily: "var(--font-gothic)" }}>
              Event Log
            </div>
            <EventLog entries={gs.event_log} players={players} />
          </div>
        )}
      </div>

      {/* ── Turn + Input (sticky bottom) ── */}
      <div
        className="flex-shrink-0 px-4 py-4 space-y-3"
        style={{ background: "rgba(13,10,26,0.95)", borderTop: "1px solid rgba(212,175,55,0.12)" }}
      >
        {/* Turn indicator */}
        {gs.active_players.length > 1 ? (
          <div className="flex items-center justify-between">
            <div>
              {isMyTurn ? (
                <p className="font-black text-lg" style={{ color: "#22c55e", fontFamily: "var(--font-gothic)" }}>
                  ✨ ตาของคุณ!
                </p>
              ) : (
                <p className="text-sm" style={{ color: "#7a6a5a" }}>
                  ตาของ <span style={{ color: "#e8d5b0" }}>{currentTurnName}</span>
                </p>
              )}
            </div>
            <TimerRing secsLeft={secsLeft} total={gs.turn_duration_s} />
          </div>
        ) : (
          <p className="text-sm text-center" style={{ color: "#7a6a5a" }}>
            กำลังรอผล...
          </p>
        )}

        {/* Input area — only for active player on their turn */}
        {isMyTurn && isActive && (
          <div className="space-y-2">
            {submitError && (
              <div
                className="px-3 py-2 rounded-xl text-sm"
                style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", color: "#ef4444" }}
              >
                {submitError}
              </div>
            )}
            {speech.error && !submitError && (
              <div
                className="px-3 py-2 rounded-xl text-sm"
                style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.3)", color: "#ef4444" }}
              >
                {speech.error}
              </div>
            )}

            <div className="flex gap-2">
              {/* Mic button */}
              {!needsSafariWarn && speech.supported && (
                <button
                  onClick={() => speech.isListening ? speech.stop() : speech.start()}
                  disabled={submitting}
                  className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 transition-all"
                  style={{
                    background: speech.isListening
                      ? "rgba(239,68,68,0.25)"
                      : "rgba(34,197,94,0.15)",
                    border: `2px solid ${speech.isListening ? "#ef4444" : "rgba(34,197,94,0.4)"}`,
                    boxShadow: speech.isListening ? "0 0 16px rgba(239,68,68,0.4)" : undefined,
                  }}
                >
                  <span className="text-2xl">{speech.isListening ? "🔴" : "🎙️"}</span>
                </button>
              )}

              {/* Text input */}
              <input
                value={wordInput}
                onChange={(e) => {
                  setWordInput(e.target.value);
                  setSubmitError(null);
                }}
                onKeyDown={(e) => e.key === "Enter" && !submitting && handleSubmitWord(wordInput)}
                placeholder="พิมพ์คำ..."
                disabled={submitting}
                className="flex-1 px-4 py-3 rounded-xl text-lg font-bold focus:outline-none"
                style={{
                  background: "rgba(13,10,26,0.9)",
                  border: "1.5px solid rgba(34,197,94,0.4)",
                  color: "#e8d5b0",
                }}
                autoFocus
              />

              {/* Submit */}
              <button
                onClick={() => handleSubmitWord(wordInput)}
                disabled={submitting || !wordInput.trim()}
                className="px-5 py-3 rounded-xl font-bold text-base flex-shrink-0 disabled:opacity-40 transition-all"
                style={{ background: "rgba(34,197,94,0.2)", border: "1.5px solid rgba(34,197,94,0.5)", color: "#22c55e" }}
              >
                {submitting ? "..." : "ส่ง"}
              </button>
            </div>
          </div>
        )}

        {/* Eliminated message */}
        {!isActive && myPlayerId && gs.all_players.includes(myPlayerId) && (
          <div
            className="px-4 py-3 rounded-xl text-sm text-center"
            style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#ef4444" }}
          >
            คุณออกจากรอบนี้แล้ว ดูเกมต่อไปเลย 👀
          </div>
        )}

        {/* Challenge button */}
        {canChallenge && gs.phase === "playing" && (
          <button
            onClick={handleChallenge}
            className="w-full py-3 rounded-xl font-bold text-sm transition-all"
            style={{
              background: "rgba(168,85,247,0.1)",
              border: "1.5px solid rgba(168,85,247,0.4)",
              color: "#a855f7",
            }}
          >
            🚨 Challenge คำล่าสุด: &ldquo;{lastWord?.word}&rdquo;
          </button>
        )}

        {/* Host override */}
        {isHost && gs.phase === "playing" && gs.active_players.length > 1 && (
          <button
            onClick={handleHostSkip}
            className="w-full py-2 rounded-xl text-xs transition-all"
            style={{ background: "rgba(90,74,58,0.2)", border: "1px solid rgba(90,74,58,0.3)", color: "#5a4a3a" }}
          >
            ⏭ Skip (Host) — ข้ามตาปัจจุบัน
          </button>
        )}
      </div>
    </div>
  );
}

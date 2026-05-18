"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { generateSessionCode, generatePlayerId } from "@/lib/utils/session";
import { getLang, saveLang } from "@/lib/utils/lang";
import { supabase } from "@/lib/supabase";
import { Suspense } from "react";

const GAMES = [
  { id: "shadows-over-thornwick", name: { en: "Shadows Over Thornwick", th: "Shadows Over Thornwick" }, players: "5–15", available: true },
  { id: "hues-and-cues", name: { en: "Hues & Cues", th: "Hues & Cues" }, players: "3–10", available: true },
  { id: "werewolf", name: { en: "Werewolf", th: "หมาป่า" }, players: "6–20", available: false },
  { id: "secret-hitler", name: { en: "Secret Hitler", th: "ซีเคร็ต ฮิตเลอร์" }, players: "5–10", available: false },
];

// Initial game_state shape per game — each game owns its own structure
const INITIAL_GAME_STATE: Record<string, object> = {
  "shadows-over-thornwick": {
    script_id: "the-first-shadows",
    day_number: 1,
    night_index: 0,
    role_assignments: {},
  },
  "hues-and-cues": {
    round: 0,
    total_rounds: 0,
    score_to_win: 25,
    cue_giver_order: [],
    target: { x: 0, y: 0 },
    clues: [],
    sub_phase: "giving-clue",
    guesses: {},
    scores: {},
  },
};

function CreateSessionForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const defaultGame = searchParams.get("game") ?? "shadows-over-thornwick";

  const [lang, setLangState] = useState<"en" | "th">(() => getLang());
  const setLang = (l: "en" | "th") => { setLangState(l); saveLang(l); };
  const [name, setName] = useState("");
  const [selectedGame, setSelectedGame] = useState(defaultGame);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const t = {
    en: {
      back: "← Back",
      title: "Create Session",
      subtitle: "Set up your game room",
      selectGame: "Select Game",
      yourName: selectedGame === "hues-and-cues" ? "Your Name (Host)" : "Your Name (Storyteller)",
      namePlaceholder: "Enter your name...",
      create: "Create Room",
      creating: "Creating...",
      comingSoon: "Coming Soon",
      errorMsg: "Failed to create room. Please try again.",
    },
    th: {
      back: "← กลับ",
      title: "สร้างห้อง",
      subtitle: "ตั้งค่าห้องเกมของคุณ",
      selectGame: "เลือกเกม",
      yourName: selectedGame === "hues-and-cues" ? "ชื่อของคุณ (Host)" : "ชื่อของคุณ (Storyteller)",
      namePlaceholder: "ใส่ชื่อของคุณ...",
      create: "สร้างห้อง",
      creating: "กำลังสร้าง...",
      comingSoon: "เร็วๆ นี้",
      errorMsg: "สร้างห้องไม่สำเร็จ กรุณาลองใหม่",
    },
  }[lang];

  const handleCreate = async () => {
    if (!name.trim() || !selectedGame) return;
    setLoading(true);
    setError("");

    const code = generateSessionCode();
    const playerId = generatePlayerId();

    const { error: sessionErr } = await supabase.from("sessions").insert({
      code,
      game_id: selectedGame,
      phase: "lobby",
      game_state: INITIAL_GAME_STATE[selectedGame] ?? {},
    });

    if (sessionErr) {
      setError(`${t.errorMsg} (${sessionErr.message})`);
      setLoading(false);
      return;
    }

    const { error: playerErr } = await supabase.from("players").insert({
      id: playerId,
      session_code: code,
      name: name.trim(),
      player_state: { is_alive: true, is_storyteller: true },
    });

    if (playerErr) {
      setError(t.errorMsg);
      setLoading(false);
      return;
    }

    localStorage.setItem(`bgv_player_${code}`, playerId);
    router.push(`/session/${code}?host=true`);
  };

  return (
    <div className="min-h-screen relative" style={{ background: "radial-gradient(ellipse at top, #1a0a2e 0%, #0d0a1a 70%)" }}>
      <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "url('/images/platform/bg-create-session.png')", backgroundSize: "cover", backgroundPosition: "center" }} />

      <div className="relative z-10 max-w-2xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-10">
          <Link href="/" className="btn-gothic-secondary px-4 py-2 rounded-lg text-sm no-underline">{t.back}</Link>
          <button onClick={() => setLang(lang === "en" ? "th" : "en")} className="btn-gothic-secondary px-4 py-2 rounded-lg text-sm">
            <span style={{color: lang==="en" ? "#d4af37" : "#5a4a3a"}}>EN</span><span style={{color:"#3a2a1a"}}> / </span><span style={{color: lang==="th" ? "#d4af37" : "#5a4a3a"}}>TH</span>
          </button>
        </div>

        <div className="text-center mb-10">
          <h1 className="text-4xl font-black mb-2" style={{ fontFamily: "var(--font-gothic)", color: "#e8d5b0" }}>{t.title}</h1>
          <p style={{ color: "#7a6a5a" }}>{t.subtitle}</p>
        </div>

        <div className="gothic-card rounded-2xl p-8 space-y-8">
          <div>
            <label className="block text-sm font-medium mb-4 tracking-widest uppercase" style={{ color: "#d4af37", fontFamily: "var(--font-gothic)" }}>
              {t.selectGame}
            </label>
            <div className="space-y-3">
              {GAMES.map((game) => (
                <button
                  key={game.id}
                  onClick={() => game.available && setSelectedGame(game.id)}
                  disabled={!game.available}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border transition-all text-left ${
                    selectedGame === game.id
                      ? "border-yellow-600/80 bg-yellow-900/20"
                      : game.available
                      ? "border-yellow-900/30 hover:border-yellow-700/50"
                      : "border-slate-800/30 opacity-40 cursor-not-allowed"
                  }`}
                >
                  <div>
                    <div className="font-medium" style={{ color: "#e8d5b0", fontFamily: "var(--font-gothic)" }}>{game.name[lang]}</div>
                    <div className="text-xs mt-0.5" style={{ color: "#5a4a3a" }}>{game.players} players</div>
                  </div>
                  {!game.available && (
                    <span className="text-xs px-2 py-1 rounded-full" style={{ background: "rgba(90,74,58,0.4)", color: "#7a6a5a" }}>{t.comingSoon}</span>
                  )}
                  {selectedGame === game.id && <span className="text-yellow-400">✓</span>}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-3 tracking-widest uppercase" style={{ color: "#d4af37", fontFamily: "var(--font-gothic)" }}>
              {t.yourName}
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t.namePlaceholder}
              maxLength={20}
              className="w-full px-4 py-3 rounded-xl focus:outline-none transition-colors"
              style={{ background: "rgba(13,10,26,0.8)", border: "1px solid rgba(212,175,55,0.3)", color: "#e8d5b0" }}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
          </div>

          {error && <p className="text-sm text-center" style={{ color: "#c08080" }}>{error}</p>}

          <button
            onClick={handleCreate}
            disabled={!name.trim() || loading}
            className="btn-gothic-primary w-full py-4 rounded-xl text-lg font-bold disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ fontFamily: "var(--font-gothic)" }}
          >
            {loading ? t.creating : `⚔ ${t.create}`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function CreateSessionPage() {
  return (
    <Suspense>
      <CreateSessionForm />
    </Suspense>
  );
}

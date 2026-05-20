"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { generateSessionCode, generatePlayerId } from "@/lib/utils/session";
import { getLang, saveLang } from "@/lib/utils/lang";
import { supabase } from "@/lib/supabase";
import { ORDERED_GAMES } from "@/lib/games/registry";
import type { Language } from "@/types/game";

// ORDERED_GAMES is sorted: available first, then coming-soon.

function CreateSessionForm() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [lang, setLangState] = useState<Language>(() => getLang());
  const setLang = (l: Language) => { setLangState(l); saveLang(l); };

  const defaultGame = searchParams.get("game") ?? ORDERED_GAMES.find(g => g.available)?.id ?? "";
  const [name, setName] = useState("");
  const [selectedGame, setSelectedGame] = useState(defaultGame);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedConfig = ORDERED_GAMES.find(g => g.id === selectedGame);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const t = {
    en: {
      back: "← Back",
      title: "Create Session",
      subtitle: "Set up your game room",
      selectGame: "Choose Game",
      yourName: `Your Name (${selectedConfig?.lobby.en.hostLabel ?? "Host"})`,
      namePlaceholder: "Enter your name...",
      create: "Create Room",
      creating: "Creating...",
      comingSoon: "Soon",
      errorMsg: "Failed to create room. Please try again.",
    },
    th: {
      back: "← กลับ",
      title: "สร้างห้อง",
      subtitle: "ตั้งค่าห้องเกมของคุณ",
      selectGame: "เลือกเกม",
      yourName: `ชื่อของคุณ (${selectedConfig?.lobby.th.hostLabel ?? "Host"})`,
      namePlaceholder: "ใส่ชื่อของคุณ...",
      create: "สร้างห้อง",
      creating: "กำลังสร้าง...",
      comingSoon: "เร็วๆ นี้",
      errorMsg: "สร้างห้องไม่สำเร็จ กรุณาลองใหม่",
    },
  }[lang];

  const handleCreate = async () => {
    const config = ORDERED_GAMES.find(g => g.id === selectedGame);
    if (!name.trim() || !config?.available) return;

    setLoading(true);
    setError("");

    const code = generateSessionCode();
    const playerId = generatePlayerId();

    const { error: sessionErr } = await supabase.from("sessions").insert({
      code,
      game_id: selectedGame,
      phase: "lobby",
      game_state: config.initialState(),
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

  const categoryIcon: Record<string, string> = {
    deduction: "🔍",
    exploration: "🗺️",
    party: "🎉",
  };

  const availableGames = ORDERED_GAMES.filter(g => g.available);
  const comingSoon = ORDERED_GAMES.filter(g => !g.available);

  return (
    <div className="min-h-screen relative" style={{ background: "radial-gradient(ellipse at top, #1a0a2e 0%, #0d0a1a 70%)" }}>
      {/* BG texture */}
      <div className="fixed inset-0 opacity-10 pointer-events-none" style={{ backgroundImage: "url('/images/platform/bg-create-session.png')", backgroundSize: "cover", backgroundPosition: "center" }} />

      <div className="relative z-10 max-w-lg mx-auto px-5 py-8">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-8">
          <Link href="/" className="btn-gothic-secondary px-4 py-2 rounded-lg text-sm no-underline">{t.back}</Link>
          <button onClick={() => setLang(lang === "en" ? "th" : "en")} className="btn-gothic-secondary px-4 py-2 rounded-lg text-sm">
            <span style={{ color: lang === "en" ? "#d4af37" : "#5a4a3a" }}>EN</span>
            <span style={{ color: "#3a2a1a" }}> / </span>
            <span style={{ color: lang === "th" ? "#d4af37" : "#5a4a3a" }}>TH</span>
          </button>
        </div>

        {/* Title */}
        <div className="mb-6">
          <h1 className="text-3xl font-black mb-1" style={{ fontFamily: "var(--font-gothic)", color: "#e8d5b0" }}>{t.title}</h1>
          <p className="text-sm" style={{ color: "#5a4a3a" }}>{t.subtitle}</p>
        </div>

        <div className="space-y-5">
          {/* ── Game picker dropdown ── */}
          <div>
            <label className="block text-xs font-medium mb-2 tracking-widest uppercase" style={{ color: "#d4af37", fontFamily: "var(--font-gothic)" }}>
              {t.selectGame}
            </label>

            <div ref={dropdownRef} className="relative">
              {/* Trigger */}
              <button
                onClick={() => setDropdownOpen(v => !v)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all"
                style={{
                  background: "rgba(13,10,26,0.85)",
                  border: dropdownOpen ? "1px solid rgba(212,175,55,0.6)" : "1px solid rgba(212,175,55,0.25)",
                  boxShadow: dropdownOpen ? "0 0 20px rgba(212,175,55,0.12)" : undefined,
                }}
              >
                {/* Cover thumbnail */}
                {selectedConfig?.coverImage ? (
                  <div className="relative w-10 h-10 rounded-lg overflow-hidden flex-shrink-0" style={{ border: "1px solid rgba(212,175,55,0.2)" }}>
                    <Image src={selectedConfig.coverImage} alt="" fill sizes="80px" className="object-cover" />
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 text-xl" style={{ background: "rgba(45,27,78,0.6)" }}>
                    {categoryIcon[selectedConfig?.category ?? "party"] ?? "🎮"}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm truncate" style={{ color: "#e8d5b0", fontFamily: "var(--font-gothic)" }}>
                    {selectedConfig?.name[lang] ?? "—"}
                  </p>
                  <p className="text-xs truncate mt-0.5" style={{ color: "#5a4a3a" }}>
                    {selectedConfig ? `${selectedConfig.minPlayers}–${selectedConfig.maxPlayers} players · ${selectedConfig.estimatedTime}` : ""}
                  </p>
                </div>
                <span className="text-sm flex-shrink-0" style={{ color: "#5a4a3a", transition: "transform 0.2s", transform: dropdownOpen ? "rotate(180deg)" : "none" }}>▼</span>
              </button>

              {/* Dropdown panel */}
              {dropdownOpen && (
                <div
                  className="absolute top-full left-0 right-0 mt-2 rounded-xl overflow-hidden z-30"
                  style={{ background: "rgba(13,8,20,0.98)", border: "1px solid rgba(212,175,55,0.2)", boxShadow: "0 8px 32px rgba(0,0,0,0.6)", backdropFilter: "blur(12px)" }}
                >
                  {/* Available games */}
                  {availableGames.map((game) => (
                    <button
                      key={game.id}
                      onClick={() => { setSelectedGame(game.id); setDropdownOpen(false); }}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left transition-all"
                      style={{
                        background: selectedGame === game.id ? "rgba(212,175,55,0.1)" : "transparent",
                        borderBottom: "1px solid rgba(255,255,255,0.04)",
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background = "rgba(212,175,55,0.07)")}
                      onMouseLeave={e => (e.currentTarget.style.background = selectedGame === game.id ? "rgba(212,175,55,0.1)" : "transparent")}
                    >
                      {game.coverImage ? (
                        <div className="relative w-9 h-9 rounded-lg overflow-hidden flex-shrink-0" style={{ border: "1px solid rgba(255,255,255,0.08)" }}>
                          <Image src={game.coverImage} alt="" fill sizes="72px" className="object-cover" />
                        </div>
                      ) : (
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-lg" style={{ background: "rgba(45,27,78,0.5)" }}>
                          {categoryIcon[game.category] ?? "🎮"}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: "#e8d5b0", fontFamily: "var(--font-gothic)" }}>{game.name[lang]}</p>
                        <p className="text-xs truncate" style={{ color: "#5a4a3a" }}>{game.minPlayers}–{game.maxPlayers}p · {game.estimatedTime}</p>
                      </div>
                      {selectedGame === game.id && <span style={{ color: "#d4af37", fontSize: 14 }}>✓</span>}
                    </button>
                  ))}

                  {/* Coming soon — dimmed, not clickable */}
                  {comingSoon.length > 0 && (
                    <div className="px-4 pt-2 pb-1">
                      <p className="text-xs tracking-widest uppercase" style={{ color: "#3a2a1a" }}>{t.comingSoon}</p>
                    </div>
                  )}
                  {comingSoon.map((game) => (
                    <div
                      key={game.id}
                      className="flex items-center gap-3 px-4 py-2.5 opacity-35"
                    >
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-lg" style={{ background: "rgba(30,20,40,0.5)" }}>
                        {categoryIcon[game.category] ?? "🎮"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate" style={{ color: "#7a6a5a" }}>{game.name[lang]}</p>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: "rgba(90,74,58,0.3)", color: "#5a4a3a" }}>
                        {t.comingSoon}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Selected game tagline */}
            {selectedConfig?.tagline[lang] && (
              <p className="text-xs mt-2 px-1" style={{ color: "#5a4a3a", fontStyle: "italic" }}>
                {selectedConfig.tagline[lang]}
              </p>
            )}
          </div>

          {/* ── Host name ── */}
          <div>
            <label className="block text-xs font-medium mb-2 tracking-widest uppercase" style={{ color: "#d4af37", fontFamily: "var(--font-gothic)" }}>
              {t.yourName}
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t.namePlaceholder}
              maxLength={20}
              className="w-full px-4 py-3 rounded-xl focus:outline-none transition-colors"
              style={{ background: "rgba(13,10,26,0.8)", border: "1px solid rgba(212,175,55,0.25)", color: "#e8d5b0" }}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
          </div>

          {error && <p className="text-sm text-center" style={{ color: "#c08080" }}>{error}</p>}

          <button
            onClick={handleCreate}
            disabled={!name.trim() || loading || !selectedConfig?.available}
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

"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { getLang, saveLang } from "@/lib/utils/lang";
import { ORDERED_GAMES } from "@/lib/games/registry";
import type { GameConfig } from "@/lib/games/registry";

// ─── Data ─────────────────────────────────────────────────────────────────────

const CATEGORIES = [
  {
    id: "deduction",
    icon: "🎭",
    name:  { en: "Social Deduction",      th: "สืบสวนสังคม" },
    desc:  { en: "Hidden roles, shifting alliances, pure deception.", th: "บทบาทซ่อนเร้น พันธมิตรที่เปลี่ยนแปลง การหลอกลวง" },
    accent: "#c0403a",
    glow:   "rgba(139,26,26,0.18)",
    border: "rgba(139,26,26,0.35)",
    rule:   "rgba(139,26,26,0.25)",
  },
  {
    id: "exploration",
    icon: "🏚",
    name:  { en: "Horror & Exploration",  th: "สยองขวัญ & สำรวจ" },
    desc:  { en: "Uncover the unknown, room by room, before it's too late.", th: "เปิดเผยสิ่งที่ไม่รู้จัก ทีละห้อง ก่อนที่จะสายเกินไป" },
    accent: "#c07820",
    glow:   "rgba(192,120,32,0.15)",
    border: "rgba(192,120,32,0.35)",
    rule:   "rgba(192,120,32,0.25)",
  },
  {
    id: "party",
    icon: "🎨",
    name:  { en: "Party & Color",         th: "Party & สีสัน" },
    desc:  { en: "Quick to learn, endlessly fun for any crowd.", th: "เรียนรู้ง่าย สนุกไม่มีวันเบื่อ" },
    accent: "#7c6cf0",
    glow:   "rgba(99,102,241,0.14)",
    border: "rgba(99,102,241,0.35)",
    rule:   "rgba(99,102,241,0.25)",
  },
] as const;

type CategoryId = "deduction" | "exploration" | "party";

// ORDERED_GAMES from the registry replaces the local GAMES array.
// To add a new game to the homepage: update lib/games/registry.ts only.
const GAMES = ORDERED_GAMES;

// ─── Icons ────────────────────────────────────────────────────────────────────

function GrimoireIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="2" width="14" height="20" rx="2" stroke="#d4af37" strokeWidth="1.5" />
      <line x1="7" y1="2" x2="7" y2="22" stroke="#d4af37" strokeWidth="1.5" />
      <rect x="17" y="10" width="4" height="4" rx="1" stroke="#d4af37" strokeWidth="1.2" />
      <line x1="17" y1="12" x2="21" y2="12" stroke="#d4af37" strokeWidth="1.2" />
      <path d="M13 9 L15 12 L13 15 L11 12 Z" stroke="#d4af37" strokeWidth="1.2" fill="rgba(212,175,55,0.25)" />
      <line x1="9" y1="5.5" x2="15" y2="5.5" stroke="#d4af37" strokeWidth="1" strokeLinecap="round" />
      <line x1="9" y1="18.5" x2="14" y2="18.5" stroke="#d4af37" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

function VaultIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
      <rect x="2" y="8" width="28" height="22" rx="3" stroke="#d4af37" strokeWidth="1.5" />
      <rect x="6" y="4" width="20" height="6" rx="2" stroke="#d4af37" strokeWidth="1.5" />
      <circle cx="16" cy="19" r="5" stroke="#d4af37" strokeWidth="1.5" />
      <circle cx="16" cy="19" r="2" fill="#d4af37" />
      <line x1="16" y1="14" x2="16" y2="11" stroke="#d4af37" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="21" y1="19" x2="24" y2="19" stroke="#d4af37" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// ─── Game Cards ───────────────────────────────────────────────────────────────

type Lang = "en" | "th";
type Translations = {
  tagline: string; taglineBold: string; desc: string;
  create: string; join: string; placeholder: string; joinBtn: string;
  vaultTitle: string; vaultSub: string; comingSoon: string; available: string;
  playNow: string; players: string; gamesCount: (n: number) => string;
};

function GameCardStandard({ game, lang, t, featured = false }: { game: GameConfig; lang: Lang; t: Translations; featured?: boolean }) {
  const cat = CATEGORIES.find((c) => c.id === game.category)!;
  return (
    <div
      className={`gothic-card rounded-2xl overflow-hidden flex flex-col group transition-all duration-300 ${!game.available ? "opacity-55" : ""}`}
      style={game.available ? { boxShadow: `0 0 0 1px ${cat.border}` } : undefined}
    >
      {/* Image */}
      <div className={`relative ${featured ? "h-56" : "h-44"} bg-gradient-to-br ${game.cardTheme} flex-shrink-0 overflow-hidden`}>
        {game.coverImage ? (
          <Image
            src={game.coverImage}
            alt={game.name[lang]}
            fill
            className="object-cover opacity-60 group-hover:opacity-75 transition-opacity duration-500"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-5xl opacity-15">{cat.icon}</span>
          </div>
        )}
        <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 55%)" }} />
        {/* Availability badge */}
        <div className="absolute top-3 left-3">
          {game.available ? (
            <span className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium"
              style={{ background: `${cat.glow}`, border: `1px solid ${cat.border}`, color: cat.accent, backdropFilter: "blur(4px)" }}>
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: cat.accent }} />
              {t.available}
            </span>
          ) : (
            <span className="text-xs px-2.5 py-1 rounded-full font-medium"
              style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", color: "#5a4a3a" }}>
              {t.comingSoon}
            </span>
          )}
        </div>
        {/* Player count */}
        <div className="absolute bottom-3 right-3 text-xs px-2 py-0.5 rounded-full"
          style={{ background: "rgba(0,0,0,0.55)", color: "#a08060", backdropFilter: "blur(4px)" }}>
          👥 {game.minPlayers}–{game.maxPlayers}
        </div>
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col flex-1 gap-3">
        <div>
          <h3 className="text-base font-bold mb-1 leading-snug" style={{ fontFamily: "var(--font-gothic)", color: "#e8d5b0" }}>
            {game.name[lang]}
          </h3>
          <p className="text-xs leading-relaxed" style={{ color: "#6a5a4a" }}>
            {game.description[lang]}
          </p>
        </div>

        {/* Meta row */}
        <div className="flex items-center gap-3 text-xs mt-auto" style={{ color: "#4a3a2a" }}>
          <span>⏱ {game.estimatedTime}</span>
        </div>

        {/* Actions */}
        {game.available ? (
          <div className="flex gap-2 pt-1">
            <Link
              href={`/guide/${game.id}`}
              className="btn-gothic-secondary px-3 py-2 rounded-lg text-xs font-medium no-underline flex items-center justify-center gap-1.5"
              title={lang === "en" ? "How to Play" : "วิธีเล่น"}
            >
              <GrimoireIcon />
              <span className="hidden sm:inline">{lang === "en" ? "Guide" : "วิธีเล่น"}</span>
            </Link>
            <Link
              href={`/session/create?game=${game.id}`}
              className="btn-gothic-primary flex-1 py-2 rounded-lg text-sm font-semibold no-underline text-center"
            >
              {t.playNow} →
            </Link>
          </div>
        ) : (
          <div className="text-xs italic text-center py-2" style={{ color: "#3a2a1a" }}>
            {t.comingSoon}
          </div>
        )}
      </div>
    </div>
  );
}


// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [lang, setLangState] = useState<Lang>(() => getLang());
  const setLang = (l: Lang) => { setLangState(l); saveLang(l); };
  const [joinCode, setJoinCode] = useState("");

  const t = {
    en: {
      tagline:     "Your Physical Board Games,",
      taglineBold: "Now Online.",
      desc:        "Create a session, share the link, and play with friends anywhere in the world. No expensive sets required.",
      create:      "Create Session",
      join:        "Join Session",
      placeholder: "Room code",
      joinBtn:     "Join",
      vaultTitle:  "The Vault",
      vaultSub:    "Choose your game and enter the room.",
      comingSoon:  "Coming Soon",
      available:   "Live",
      playNow:     "Play Now",
      players:     "players",
      gamesCount:  (n: number) => `${n} game${n !== 1 ? "s" : ""}`,
    },
    th: {
      tagline:     "บอร์ดเกมที่คุณรัก",
      taglineBold: "เล่นได้ทางออนไลน์",
      desc:        "สร้างห้อง แชร์ลิงก์ และเล่นกับเพื่อนได้ทุกที่ทั่วโลก ไม่จำเป็นต้องซื้อกล่องราคาแพง",
      create:      "สร้างห้อง",
      join:        "เข้าร่วมห้อง",
      placeholder: "รหัสห้อง",
      joinBtn:     "เข้าร่วม",
      vaultTitle:  "The Vault",
      vaultSub:    "เลือกเกมและเข้าสู่ห้อง",
      comingSoon:  "เร็วๆ นี้",
      available:   "เล่นได้เลย",
      playNow:     "เล่นเลย",
      players:     "ผู้เล่น",
      gamesCount:  (n: number) => `${n} เกม`,
    },
  }[lang];

  const availableCount = GAMES.filter((g) => g.available).length;

  return (
    <div className="min-h-screen relative overflow-x-hidden" style={{ background: "radial-gradient(ellipse at top, #1a0a2e 0%, #0d0a1a 60%)" }}>
      {/* Background image */}
      <div className="fixed inset-0 bg-cover bg-center bg-no-repeat opacity-20 pointer-events-none"
        style={{ backgroundImage: "url('/images/platform/bg-landing.png')" }} />
      {/* Gradient vignette */}
      <div className="fixed inset-0 pointer-events-none" style={{ background: "linear-gradient(to bottom, transparent, rgba(13,10,26,0.6) 50%, #0d0a1a)" }} />
      {/* Fog */}
      <div className="absolute bottom-0 left-0 right-0 h-64 pointer-events-none">
        <div className="fog-layer-1 absolute bottom-0 left-0 right-0 h-48" style={{ background: "linear-gradient(to top, rgba(74,111,165,0.15), transparent)", filter: "blur(20px)" }} />
        <div className="fog-layer-2 absolute bottom-0 left-0 right-0 h-32" style={{ background: "linear-gradient(to top, rgba(45,27,78,0.2), transparent)", filter: "blur(30px)" }} />
      </div>
      {/* Fireflies */}
      {[...Array(8)].map((_, i) => (
        <div key={i} className="firefly float-animation absolute"
          style={{ left: `${10 + i * 11}%`, top: `${18 + (i % 4) * 15}%`, width: 3, height: 3, borderRadius: "50%", animationDelay: `${i * 0.65}s`, animationDuration: `${3 + i * 0.4}s`, background: "#d4af37", boxShadow: "0 0 8px #d4af37" }} />
      ))}

      {/* ── Nav ────────────────────────────────────────────────────────── */}
      <nav className="relative z-10 flex items-center justify-between px-4 sm:px-8 py-4 sm:py-5 max-w-7xl mx-auto">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="flex-shrink-0 scale-75 sm:scale-100 origin-left">
            <VaultIcon />
          </div>
          <span className="text-sm sm:text-xl font-bold tracking-wide sm:tracking-widest text-shimmer truncate" style={{ fontFamily: "var(--font-gothic)" }}>
            BoardgameVault
          </span>
        </div>
        <button
          onClick={() => setLang(lang === "en" ? "th" : "en")}
          className="btn-gothic-secondary px-3 sm:px-4 py-2 rounded-lg text-sm font-medium cursor-pointer flex-shrink-0"
        >
          <span style={{ color: lang === "en" ? "#d4af37" : "#5a4a3a" }}>EN</span>
          <span style={{ color: "#3a2a1a" }}> / </span>
          <span style={{ color: lang === "th" ? "#d4af37" : "#5a4a3a" }}>TH</span>
        </button>
      </nav>

      {/* ── Hero ───────────────────────────────────────────────────────── */}
      <section className="relative z-10 flex flex-col items-center text-center px-6 pt-10 pb-20 max-w-4xl mx-auto">
        {/* Live pill */}
        <div className="mb-6 inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs tracking-widest uppercase"
          style={{ background: "rgba(212,175,55,0.08)", border: "1px solid rgba(212,175,55,0.25)", color: "#d4af37" }}>
          <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
          {t.gamesCount(availableCount)}&nbsp;{lang === "en" ? "available now" : "พร้อมเล่นแล้ว"}
        </div>

        <h1 className="text-5xl md:text-7xl font-black mb-4 leading-tight" style={{ fontFamily: "var(--font-gothic)" }}>
          <span style={{ color: "#e8d5b0" }}>{t.tagline}</span>
          <br />
          <span className="text-shimmer">{t.taglineBold}</span>
        </h1>

        <p className="text-lg max-w-xl mb-12 leading-relaxed" style={{ color: "#a08060" }}>
          {t.desc}
        </p>

        {/* CTA */}
        <div className="flex flex-col gap-3 w-full max-w-sm">
          <Link
            href="/session/create"
            className="btn-gothic-primary w-full px-6 py-4 rounded-xl text-center font-semibold text-lg no-underline"
            style={{ fontFamily: "var(--font-gothic)" }}
          >
            ⚔ {t.create}
          </Link>
          <div className="flex gap-2">
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder={t.placeholder}
              maxLength={6}
              className="flex-1 min-w-0 rounded-xl px-4 py-4 text-center font-mono text-lg focus:outline-none transition-colors"
              style={{
                background: "rgba(26,10,46,0.8)",
                border: "1px solid rgba(212,175,55,0.3)",
                color: "#e8d5b0",
                letterSpacing: joinCode ? "0.3em" : "normal",
              }}
            />
            <Link
              href={joinCode.length === 6 ? `/session/${joinCode}` : "#"}
              className={`btn-gothic-secondary px-5 py-4 rounded-xl font-semibold no-underline flex items-center whitespace-nowrap ${joinCode.length !== 6 ? "opacity-40 pointer-events-none" : ""}`}
            >
              {t.joinBtn}
            </Link>
          </div>
        </div>
      </section>

      {/* ── Vault / Category Sections ──────────────────────────────────── */}
      <section className="relative z-10 max-w-7xl mx-auto px-4 sm:px-8 pb-28 space-y-20">

        {/* Section title */}
        <div className="text-center">
          <h2 className="text-3xl font-black tracking-widest uppercase" style={{ fontFamily: "var(--font-gothic)", color: "#d4af37" }}>
            {t.vaultTitle}
          </h2>
          <p className="mt-2 text-sm" style={{ color: "#5a4a3a" }}>{t.vaultSub}</p>
        </div>

        {CATEGORIES.map((cat) => {
          const catGames = GAMES.filter((g) => g.category === cat.id);
          const isSingle = catGames.length === 1;

          return (
            <div key={cat.id}>
              {/* ── Category header ── */}
              <div className="flex items-center gap-4 mb-7">
                {/* Icon bubble */}
                <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-xl"
                  style={{ background: cat.glow, border: `1px solid ${cat.border}` }}>
                  {cat.icon}
                </div>
                {/* Name + desc */}
                <div className="min-w-0">
                  <h3 className="text-lg font-black tracking-wide leading-none" style={{ fontFamily: "var(--font-gothic)", color: cat.accent }}>
                    {cat.name[lang]}
                  </h3>
                  <p className="text-xs mt-0.5 truncate" style={{ color: "#5a4a3a" }}>{cat.desc[lang]}</p>
                </div>
                {/* Rule line */}
                <div className="flex-1 h-px hidden sm:block" style={{ background: `linear-gradient(to right, ${cat.rule}, transparent)` }} />
                {/* Game count badge */}
                <div className="flex-shrink-0 text-xs px-2.5 py-1 rounded-full"
                  style={{ background: cat.glow, border: `1px solid ${cat.border}`, color: cat.accent }}>
                  {t.gamesCount(catGames.length)}
                </div>
              </div>

              {/* ── Cards ── */}
              {isSingle ? (
                <div className="max-w-xs sm:max-w-sm md:max-w-md lg:max-w-lg w-full">
                  <GameCardStandard game={catGames[0]} lang={lang} t={t} featured />
                </div>
              ) : (
                <div className={`grid gap-5 grid-cols-1 sm:grid-cols-2 ${catGames.length >= 3 ? "lg:grid-cols-3" : ""}`}>
                  {catGames.map((game) => (
                    <GameCardStandard key={game.id} game={game} lang={lang} t={t} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </section>

      {/* ── Footer ─────────────────────────────────────────────────────── */}
      <footer className="relative z-10 text-center pb-10 px-6 space-y-1">
        <p className="text-sm" style={{ color: "#3a2a1a" }}>BoardgameVault — Bringing physical games to the digital realm</p>
        <p className="text-xs" style={{ color: "#2a1a1a" }}>{availableCount} games live · more coming soon</p>
      </footer>
    </div>
  );
}

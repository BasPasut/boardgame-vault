"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { getLang, saveLang } from "@/lib/utils/lang";

const GAMES = [
  {
    id: "shadows-over-thornwick",
    name: { en: "Shadows Over Thornwick", th: "Shadows Over Thornwick" },
    description: {
      en: "A social deduction game of murder and mystery in the cursed village of Thornwick.",
      th: "เกมสืบสวนสังคมเกี่ยวกับการฆาตกรรมและความลึกลับในหมู่บ้านต้องสาป ธอร์นวิค",
    },
    players: "5–15",
    image: "/images/games/shadows-over-thornwick/cover.png",
    available: true,
    theme: "from-purple-950 to-red-950",
    badge: "bg-red-900/60 text-red-200",
  },
  {
    id: "hues-and-cues",
    name: { en: "Hues & Cues", th: "Hues & Cues" },
    description: {
      en: "Describe a color in one word. Can your friends find the exact hue?",
      th: "อธิบายสีด้วยคำเดียว เพื่อนจะหาสีที่ถูกต้องได้มั้ย?",
    },
    players: "3–10",
    image: "/images/games/hues-and-cues/cover.png",
    available: true,
    theme: "from-pink-900 via-purple-900 to-indigo-900",
    badge: "bg-pink-900/60 text-pink-200",
  },
  {
    id: "werewolf",
    name: { en: "Werewolf", th: "หมาป่า" },
    description: {
      en: "Classic social deduction. Villagers vs Werewolves in a battle of wits and deception.",
      th: "เกมคลาสสิก ชาวบ้าน vs หมาป่า ในการต่อสู้ด้วยปัญญาและการหลอกลวง",
    },
    players: "6–20",
    image: null,
    available: false,
    theme: "from-slate-900 to-stone-900",
    badge: "bg-slate-700/60 text-slate-300",
  },
  {
    id: "secret-hitler",
    name: { en: "Secret Hitler", th: "ซีเคร็ต ฮิตเลอร์" },
    description: {
      en: "Liberals vs Fascists in a political game of hidden roles and power struggles.",
      th: "เสรีนิยม vs ฟาสซิสต์ เกมการเมืองของบทบาทซ่อนเร้นและการแย่งชิงอำนาจ",
    },
    players: "5–10",
    image: null,
    available: false,
    theme: "from-amber-950 to-red-900",
    badge: "bg-amber-900/60 text-amber-200",
  },
];

export default function HomePage() {
  const [lang, setLangState] = useState<"en" | "th">(() => getLang());
  const setLang = (l: "en" | "th") => { setLangState(l); saveLang(l); };
  const [joinCode, setJoinCode] = useState("");

  const t = {
    en: {
      tagline: "Your Physical Board Games,",
      taglineBold: "Now Online.",
      desc: "Create a session, share the link, and play with friends anywhere in the world. No expensive physical sets required.",
      create: "Create Session",
      join: "Join Session",
      placeholder: "Room code",
      joinBtn: "Join",
      gamesTitle: "Games in the Vault",
      comingSoon: "Coming Soon",
      playNow: "Play Now",
      players: "players",
    },
    th: {
      tagline: "บอร์ดเกมที่คุณรัก",
      taglineBold: "เล่นได้ทางออนไลน์",
      desc: "สร้างห้อง แชร์ลิงก์ และเล่นกับเพื่อนได้ทุกที่ทั่วโลก ไม่จำเป็นต้องซื้อกล่องราคาแพง",
      create: "สร้างห้อง",
      join: "เข้าร่วมห้อง",
      placeholder: "รหัสห้อง",
      joinBtn: "เข้าร่วม",
      gamesTitle: "เกมใน Vault",
      comingSoon: "เร็วๆ นี้",
      playNow: "เล่นเลย",
      players: "ผู้เล่น",
    },
  }[lang];

  return (
    <div className="min-h-screen relative overflow-x-hidden" style={{ background: "radial-gradient(ellipse at top, #1a0a2e 0%, #0d0a1a 60%)" }}>
      {/* Background village image */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-20"
        style={{ backgroundImage: "url('/images/platform/bg-landing.png')" }}
      />

      {/* Gradient overlay */}
      <div className="absolute inset-0" style={{ background: "linear-gradient(to bottom, transparent, rgba(13,10,26,0.6) 50%, #0d0a1a)" }} />

      {/* Fog layers */}
      <div className="absolute bottom-0 left-0 right-0 h-64 pointer-events-none">
        <div className="fog-layer-1 absolute bottom-0 left-0 right-0 h-48" style={{ background: "linear-gradient(to top, rgba(74,111,165,0.15) 0%, transparent 100%)", filter: "blur(20px)" }} />
        <div className="fog-layer-2 absolute bottom-0 left-0 right-0 h-32" style={{ background: "linear-gradient(to top, rgba(45,27,78,0.2) 0%, transparent 100%)", filter: "blur(30px)" }} />
      </div>

      {/* Firefly particles */}
      {[...Array(8)].map((_, i) => (
        <div key={i} className="firefly float-animation absolute w-1 h-1 rounded-full" style={{ left: `${10 + i * 12}%`, top: `${20 + (i % 3) * 20}%`, animationDelay: `${i * 0.7}s`, animationDuration: `${3 + i * 0.5}s`, background: "#d4af37", boxShadow: "0 0 8px #d4af37" }} />
      ))}

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-4 sm:px-6 py-4 sm:py-5 max-w-7xl mx-auto">
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
          <span style={{color: lang==="en" ? "#d4af37" : "#5a4a3a"}}>EN</span><span style={{color:"#3a2a1a"}}> / </span><span style={{color: lang==="th" ? "#d4af37" : "#5a4a3a"}}>TH</span>
        </button>
      </nav>

      {/* Hero */}
      <section className="relative z-10 flex flex-col items-center text-center px-6 pt-10 pb-16 max-w-4xl mx-auto">
        <div className="mb-6 inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-yellow-700/40 bg-yellow-900/20 text-yellow-400 text-xs tracking-widest uppercase">
          <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
          Shadows Over Thornwick — Now Available
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
            className="btn-gothic-primary w-full px-6 py-4 rounded-xl text-center font-semibold text-lg no-underline whitespace-nowrap"
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
              className="flex-1 min-w-0 rounded-xl px-4 py-4 text-center font-mono text-lg focus:outline-none transition-colors placeholder:tracking-normal placeholder:text-sm"
              style={{ background: "rgba(26,10,46,0.8)", border: "1px solid rgba(212,175,55,0.3)", color: "#e8d5b0", letterSpacing: joinCode ? "0.3em" : "normal" }}
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

      {/* Games grid */}
      <section className="relative z-10 max-w-7xl mx-auto px-6 pb-24">
        <div className="gothic-divider mb-12">
          <h2 className="text-2xl font-bold tracking-widest uppercase text-center px-4" style={{ fontFamily: "var(--font-gothic)", color: "#d4af37" }}>
            {t.gamesTitle}
          </h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {GAMES.map((game) => (
            <GameCard key={game.id} game={game} lang={lang} t={t} />
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 text-center pb-8 text-sm" style={{ color: "#4a3a2a" }}>
        BoardgameVault — Bringing physical games to the digital realm
      </footer>
    </div>
  );
}

function GameCard({ game, lang, t }: { game: typeof GAMES[0]; lang: "en" | "th"; t: Record<string, string> }) {
  const gameName = game.name[lang];
  return (
    <div className={`gothic-card rounded-2xl overflow-hidden group flex flex-col ${!game.available ? "opacity-60" : ""}`}>
      <div className={`relative h-48 bg-gradient-to-br ${game.theme} flex items-center justify-center overflow-hidden`}>
        {game.image ? (
          <Image src={game.image} alt={gameName} fill className="object-cover opacity-60 group-hover:opacity-80 transition-opacity" />
        ) : (
          <div className="text-6xl opacity-20">🎭</div>
        )}
        <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.6), transparent)" }} />
        <div className="absolute bottom-3 left-3">
          <span className={`text-xs px-2 py-1 rounded-full font-medium ${game.badge}`}>
            {game.available ? t.playNow : t.comingSoon}
          </span>
        </div>
      </div>

      <div className="p-5 flex flex-col flex-1">
        <h3 className="text-lg font-bold mb-2" style={{ fontFamily: "var(--font-gothic)", color: "#e8d5b0" }}>
          {gameName}
        </h3>
        <p className="text-sm leading-relaxed flex-1 mb-4" style={{ color: "#7a6a5a" }}>
          {game.description[lang]}
        </p>
        <div className="flex items-center justify-between mt-auto">
          <span className="text-xs" style={{ color: "#5a4a3a" }}>
            {game.players} {t.players}
          </span>
          {game.available ? (
            <div className="flex items-center gap-2">
              <Link href={`/guide/${game.id}`} className="btn-gothic-secondary px-3 py-2 rounded-lg text-xs font-medium no-underline flex items-center justify-center" title={lang === "en" ? "How to Play" : "วิธีเล่น"}>
                <GrimoireIcon />
              </Link>
              <Link href={`/session/create?game=${game.id}`} className="btn-gothic-primary px-4 py-2 rounded-lg text-sm font-medium no-underline">
                {t.playNow} →
              </Link>
            </div>
          ) : (
            <span className="text-xs italic" style={{ color: "#4a3a2a" }}>{t.comingSoon}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function GrimoireIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
      {/* Cover */}
      <rect x="3" y="2" width="14" height="20" rx="2" stroke="#d4af37" strokeWidth="1.5" />
      {/* Spine */}
      <line x1="7" y1="2" x2="7" y2="22" stroke="#d4af37" strokeWidth="1.5" />
      {/* Clasp band */}
      <rect x="17" y="10" width="4" height="4" rx="1" stroke="#d4af37" strokeWidth="1.2" />
      <line x1="17" y1="12" x2="21" y2="12" stroke="#d4af37" strokeWidth="1.2" />
      {/* Ornament — diamond rune */}
      <path d="M13 9 L15 12 L13 15 L11 12 Z" stroke="#d4af37" strokeWidth="1.2" fill="rgba(212,175,55,0.25)" />
      {/* Text lines */}
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

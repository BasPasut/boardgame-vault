"use client";

import { useState, useEffect } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { generatePlayerId } from "@/lib/utils/session";
import { FIRST_SHADOWS_ROLES, getRoleById } from "@/lib/games/shadows-over-thornwick/roles";
import { assignRoles, getRoleCounts } from "@/lib/games/shadows-over-thornwick/scripts";
import type { Player, GamePhase, Role } from "@/types/game";
import { Suspense } from "react";

// Demo: local state only (no backend yet — single device storyteller mode)
function SessionRoom() {
  const params = useParams();
  const searchParams = useSearchParams();
  const code = params.code as string;
  const isHost = searchParams.get("host") === "true";

  const [lang, setLang] = useState<"en" | "th">("en");
  const [phase, setPhase] = useState<GamePhase>("lobby");
  const [players, setPlayers] = useState<Player[]>([]);
  const [myName, setMyName] = useState("");
  const [joinName, setJoinName] = useState("");
  const [joined, setJoined] = useState(false);
  const [roleAssignments, setRoleAssignments] = useState<Record<string, string>>({});
  const [revealedRole, setRevealedRole] = useState<Role | null>(null);
  const [showRoleCard, setShowRoleCard] = useState(false);
  const [day, setDay] = useState(1);
  const [copied, setCopied] = useState(false);
  const [nightIndex, setNightIndex] = useState(0);

  const t = {
    en: {
      lobby: "The Village Awaits",
      lobbySubtitle: "Share the code with your friends to join",
      yourName: "Your Name",
      namePlaceholder: "Enter your name...",
      join: "Join Room",
      players: "Players",
      startGame: "Start Game",
      needMore: "Need at least 5 players to start",
      copy: "Copy Code",
      copied: "Copied!",
      shareCode: "Room Code",
      roleRevealTitle: "Your Role",
      tapReveal: "Tap the card to reveal your role",
      keepSecret: "Keep this secret!",
      ability: "Ability",
      team: "Team",
      understood: "I Understand My Role",
      day: "Day",
      night: "Night",
      discuss: "Discuss who might be the Demon...",
      endDay: "End Day → Night Falls",
      endNight: "End Night → Dawn Breaks",
      wakeOrder: "Wake Order Tonight",
      markDead: "Mark Dead",
      alive: "Alive",
      dead: "Dead",
      good: "Good",
      evil: "Evil",
      storytellerView: "Storyteller View",
      back: "← Home",
    },
    th: {
      lobby: "หมู่บ้านรอคอย",
      lobbySubtitle: "แชร์รหัสให้เพื่อนเพื่อเข้าร่วม",
      yourName: "ชื่อของคุณ",
      namePlaceholder: "ใส่ชื่อของคุณ...",
      join: "เข้าร่วม",
      players: "ผู้เล่น",
      startGame: "เริ่มเกม",
      needMore: "ต้องการผู้เล่นอย่างน้อย 5 คน",
      copy: "คัดลอกรหัส",
      copied: "คัดลอกแล้ว!",
      shareCode: "รหัสห้อง",
      roleRevealTitle: "บทบาทของคุณ",
      tapReveal: "แตะการ์ดเพื่อเปิดเผยบทบาท",
      keepSecret: "เก็บเป็นความลับ!",
      ability: "ความสามารถ",
      team: "ทีม",
      understood: "เข้าใจบทบาทของตัวเองแล้ว",
      day: "วันที่",
      night: "คืนที่",
      discuss: "ถกเถียงกันว่าใครคือปีศาจ...",
      endDay: "สิ้นสุดวัน → กลางคืนมาถึง",
      endNight: "สิ้นสุดคืน → รุ่งเช้ามาถึง",
      wakeOrder: "ลำดับการปลุกคืนนี้",
      markDead: "ทำเครื่องหมายว่าตาย",
      alive: "มีชีวิต",
      dead: "ตาย",
      good: "ฝ่ายดี",
      evil: "ฝ่ายชั่ว",
      storytellerView: "มุมมอง Storyteller",
      back: "← หน้าแรก",
    },
  }[lang];

  useEffect(() => {
    const stored = localStorage.getItem(`bgv_player_${code}`);
    if (stored) {
      const data = JSON.parse(stored);
      setMyName(data.name);
      setJoined(true);
      setPlayers([{ id: data.id, name: data.name, isAlive: true, isStoryteller: isHost }]);
    }
  }, [code, isHost]);

  const handleJoin = () => {
    if (!joinName.trim()) return;
    const id = generatePlayerId();
    const player: Player = { id, name: joinName.trim(), isAlive: true, isStoryteller: false };
    localStorage.setItem(`bgv_player_${code}`, JSON.stringify({ id, name: joinName.trim(), isStoryteller: false }));
    setMyName(joinName.trim());
    setPlayers((prev) => [...prev, player]);
    setJoined(true);
  };

  const handleAddDemoPlayers = () => {
    const names = ["Aria", "Ben", "Cora", "Dex", "Eve", "Flynn", "Grace"];
    const existing = players.length;
    const toAdd = names.slice(0, Math.max(0, 7 - existing));
    setPlayers((prev) => [
      ...prev,
      ...toAdd.map((name) => ({ id: generatePlayerId(), name, isAlive: true, isStoryteller: false })),
    ]);
  };

  const handleStartGame = () => {
    const nonStorytellers = players.filter((p) => !p.isStoryteller);
    if (nonStorytellers.length < 5) return;
    const assignments = assignRoles(nonStorytellers.map((p) => p.id), "the-first-shadows");
    setRoleAssignments(assignments);
    setPhase("role-reveal");
  };

  const handleRevealRole = () => {
    const stored = localStorage.getItem(`bgv_player_${code}`);
    if (!stored) return;
    const { id } = JSON.parse(stored);
    const roleId = roleAssignments[id];
    if (roleId) {
      setRevealedRole(getRoleById(roleId) ?? null);
      setShowRoleCard(true);
    }
  };

  const copyCode = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const togglePlayerDead = (playerId: string) => {
    setPlayers((prev) => prev.map((p) => p.id === playerId ? { ...p, isAlive: !p.isAlive } : p));
  };

  const nightWakeOrder = FIRST_SHADOWS_ROLES
    .filter((r) => r.firstNight !== undefined || r.otherNights !== undefined)
    .sort((a, b) => {
      const aN = day === 1 ? (a.firstNight ?? 99) : (a.otherNights ?? 99);
      const bN = day === 1 ? (b.firstNight ?? 99) : (b.otherNights ?? 99);
      return aN - bN;
    });

  // LOBBY
  if (phase === "lobby") {
    return (
      <div className="min-h-screen relative" style={{ background: "radial-gradient(ellipse at top, #1a0a2e 0%, #0d0a1a 70%)" }}>
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "url('/images/platform/bg-vault-door.png')", backgroundSize: "cover", backgroundPosition: "center" }} />
        <div className="relative z-10 max-w-2xl mx-auto px-6 py-10">
          <div className="flex items-center justify-between mb-8">
            <Link href="/" className="btn-gothic-secondary px-4 py-2 rounded-lg text-sm no-underline">{t.back}</Link>
            <button onClick={() => setLang(lang === "en" ? "th" : "en")} className="btn-gothic-secondary px-4 py-2 rounded-lg text-sm">{lang === "en" ? "🇹🇭 TH" : "🇬🇧 EN"}</button>
          </div>

          <div className="text-center mb-8">
            <h1 className="text-4xl font-black mb-2" style={{ fontFamily: "var(--font-gothic)", color: "#e8d5b0" }}>{t.lobby}</h1>
            <p style={{ color: "#7a6a5a" }}>{t.lobbySubtitle}</p>
          </div>

          {/* Room code */}
          <div className="gothic-card rounded-2xl p-6 mb-6 text-center">
            <div className="text-xs tracking-widest uppercase mb-3" style={{ color: "#d4af37", fontFamily: "var(--font-gothic)" }}>{t.shareCode}</div>
            <div className="text-5xl font-black tracking-[0.4em] mb-4 font-mono" style={{ color: "#e8d5b0" }}>{code}</div>
            <button onClick={copyCode} className="btn-gothic-secondary px-6 py-2 rounded-lg text-sm">
              {copied ? `✓ ${t.copied}` : t.copy}
            </button>
          </div>

          {/* Join form (if not yet joined) */}
          {!joined && (
            <div className="gothic-card rounded-2xl p-6 mb-6">
              <label className="block text-sm mb-3 tracking-widest uppercase" style={{ color: "#d4af37", fontFamily: "var(--font-gothic)" }}>{t.yourName}</label>
              <div className="flex gap-3">
                <input
                  value={joinName}
                  onChange={(e) => setJoinName(e.target.value)}
                  placeholder={t.namePlaceholder}
                  className="flex-1 px-4 py-3 rounded-xl focus:outline-none"
                  style={{ background: "rgba(13,10,26,0.8)", border: "1px solid rgba(212,175,55,0.3)", color: "#e8d5b0" }}
                  onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                />
                <button onClick={handleJoin} className="btn-gothic-primary px-5 py-3 rounded-xl font-semibold">{t.join}</button>
              </div>
            </div>
          )}

          {/* Players list */}
          <div className="gothic-card rounded-2xl p-6 mb-6">
            <div className="text-sm mb-4 tracking-widest uppercase" style={{ color: "#d4af37", fontFamily: "var(--font-gothic)" }}>
              {t.players} ({players.length})
            </div>
            <div className="space-y-2">
              {players.map((p) => (
                <div key={p.id} className="flex items-center gap-3 py-2 px-3 rounded-lg" style={{ background: "rgba(45,27,78,0.4)" }}>
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: p.isStoryteller ? "rgba(212,175,55,0.2)" : "rgba(139,26,26,0.2)", color: p.isStoryteller ? "#d4af37" : "#e8d5b0" }}>
                    {p.name[0].toUpperCase()}
                  </div>
                  <span style={{ color: "#e8d5b0" }}>{p.name}</span>
                  {p.isStoryteller && <span className="text-xs px-2 py-0.5 rounded-full ml-auto" style={{ background: "rgba(212,175,55,0.15)", color: "#d4af37" }}>Storyteller</span>}
                </div>
              ))}
            </div>
          </div>

          {/* Host controls */}
          {isHost && (
            <div className="space-y-3">
              <button onClick={handleAddDemoPlayers} className="btn-gothic-secondary w-full py-3 rounded-xl text-sm">
                + Add Demo Players (for testing)
              </button>
              <button
                onClick={handleStartGame}
                disabled={players.filter((p) => !p.isStoryteller).length < 5}
                className="btn-gothic-primary w-full py-4 rounded-xl text-lg font-bold disabled:opacity-40"
                style={{ fontFamily: "var(--font-gothic)" }}
              >
                {players.filter((p) => !p.isStoryteller).length < 5 ? t.needMore : `⚔ ${t.startGame}`}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ROLE REVEAL
  if (phase === "role-reveal") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6" style={{ background: "radial-gradient(ellipse at top, #1a0a2e 0%, #0d0a1a 70%)" }}>
        <div className="flex items-center justify-between w-full max-w-md mb-8">
          <div style={{ color: "#5a4a3a" }}>{lang === "en" ? "Shadows Over Thornwick" : "เงามืดเหนือธอร์นวิค"}</div>
          <button onClick={() => setLang(lang === "en" ? "th" : "en")} className="btn-gothic-secondary px-3 py-1.5 rounded-lg text-xs">{lang === "en" ? "🇹🇭 TH" : "🇬🇧 EN"}</button>
        </div>

        <h2 className="text-3xl font-black mb-2 text-center" style={{ fontFamily: "var(--font-gothic)", color: "#e8d5b0" }}>{t.roleRevealTitle}</h2>
        <p className="mb-8 text-center" style={{ color: "#7a6a5a" }}>{t.tapReveal}</p>

        {/* Role card */}
        <div className="role-card-container w-64 h-96 cursor-pointer mb-8" onClick={handleRevealRole}>
          <div className={`role-card-inner relative w-full h-full ${showRoleCard ? "flipped" : ""}`}>
            {/* Card back */}
            <div className="role-card-front absolute inset-0 rounded-2xl flex flex-col items-center justify-center" style={{ background: "linear-gradient(135deg, #1a0a2e, #0d0a1a)", border: "2px solid rgba(212,175,55,0.4)" }}>
              <div className="text-6xl mb-4">🕯️</div>
              <div className="text-sm tracking-widest" style={{ color: "#d4af37", fontFamily: "var(--font-gothic)" }}>BLOOD ON THE</div>
              <div className="text-sm tracking-widest" style={{ color: "#d4af37", fontFamily: "var(--font-gothic)" }}>CLOCKTOWER</div>
              <div className="mt-6 text-xs" style={{ color: "#5a4a3a" }}>Tap to reveal</div>
            </div>

            {/* Card front (role) */}
            <div className="role-card-back absolute inset-0 rounded-2xl overflow-hidden flex flex-col" style={{ background: "linear-gradient(135deg, #2d1b4e, #0d0a1a)", border: `2px solid ${revealedRole?.team === "evil" ? "rgba(139,26,26,0.8)" : "rgba(212,175,55,0.8)"}` }}>
              <div className="flex-1 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.3)" }}>
                <div className="text-7xl">
                  {revealedRole?.type === "demon" ? "😈" : revealedRole?.type === "minion" ? "👁️" : revealedRole?.type === "outsider" ? "🃏" : "👤"}
                </div>
              </div>
              <div className="p-4 text-center">
                <div className="text-xl font-bold mb-1" style={{ fontFamily: "var(--font-gothic)", color: "#e8d5b0" }}>
                  {revealedRole?.name[lang]}
                </div>
                <div className="text-xs mb-3 px-1 leading-relaxed" style={{ color: "#a08060" }}>
                  {revealedRole?.ability[lang]}
                </div>
                <div className={`text-xs px-3 py-1 rounded-full inline-block font-medium`} style={{ background: revealedRole?.team === "evil" ? "rgba(139,26,26,0.4)" : "rgba(74,111,165,0.4)", color: revealedRole?.team === "evil" ? "#ff8080" : "#80b0ff" }}>
                  {revealedRole?.team === "evil" ? t.evil : t.good}
                </div>
              </div>
            </div>
          </div>
        </div>

        {showRoleCard && (
          <button onClick={() => setPhase("day")} className="btn-gothic-primary px-8 py-4 rounded-xl font-bold" style={{ fontFamily: "var(--font-gothic)" }}>
            {t.understood}
          </button>
        )}

        {isHost && (
          <div className="mt-6 text-center">
            <p className="text-xs mb-3" style={{ color: "#5a4a3a" }}>Storyteller: All role assignments</p>
            <div className="space-y-1 max-h-40 overflow-y-auto">
              {players.filter((p) => !p.isStoryteller).map((p) => {
                const roleId = roleAssignments[p.id];
                const role = getRoleById(roleId);
                return (
                  <div key={p.id} className="text-xs flex justify-between gap-4 px-3 py-1 rounded" style={{ background: "rgba(45,27,78,0.3)", color: "#7a6a5a" }}>
                    <span>{p.name}</span>
                    <span style={{ color: role?.team === "evil" ? "#ff8080" : "#80b0ff" }}>{role?.name[lang]}</span>
                  </div>
                );
              })}
            </div>
            <button onClick={() => setPhase("day")} className="btn-gothic-secondary px-6 py-2 rounded-lg text-sm mt-4">
              Begin Day 1 →
            </button>
          </div>
        )}
      </div>
    );
  }

  // DAY PHASE
  if (phase === "day") {
    return (
      <div className="min-h-screen" style={{ background: "linear-gradient(180deg, #1a0f00 0%, #0d0a1a 100%)" }}>
        <div className="max-w-2xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="text-xs tracking-widest mb-1" style={{ color: "#d4af37", fontFamily: "var(--font-gothic)" }}>BLOOD ON THE CLOCKTOWER</div>
              <h2 className="text-2xl font-black" style={{ fontFamily: "var(--font-gothic)", color: "#e8d5b0" }}>☀️ {t.day} {day}</h2>
            </div>
            <button onClick={() => setLang(lang === "en" ? "th" : "en")} className="btn-gothic-secondary px-3 py-1.5 rounded-lg text-xs">{lang === "en" ? "🇹🇭 TH" : "🇬🇧 EN"}</button>
          </div>

          <p className="mb-6 italic" style={{ color: "#7a6a5a" }}>{t.discuss}</p>

          {/* Player grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
            {players.filter((p) => !p.isStoryteller).map((p) => {
              const roleId = roleAssignments[p.id];
              const role = isHost ? getRoleById(roleId) : null;
              return (
                <div key={p.id} className={`gothic-card rounded-xl p-3 text-center ${!p.isAlive ? "opacity-40" : ""}`}>
                  <div className="w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-2" style={{ background: !p.isAlive ? "rgba(90,74,58,0.3)" : role?.team === "evil" ? "rgba(139,26,26,0.3)" : "rgba(74,111,165,0.3)", color: "#e8d5b0" }}>
                    {!p.isAlive ? "💀" : p.name[0].toUpperCase()}
                  </div>
                  <div className="text-sm font-medium" style={{ color: p.isAlive ? "#e8d5b0" : "#5a4a3a" }}>{p.name}</div>
                  {isHost && role && (
                    <div className="text-xs mt-1" style={{ color: role.team === "evil" ? "#ff8080" : "#80b0ff" }}>{role.name[lang]}</div>
                  )}
                  <div className="text-xs mt-1" style={{ color: p.isAlive ? "#5a9a5a" : "#9a5a5a" }}>
                    {p.isAlive ? t.alive : t.dead}
                  </div>
                  {isHost && (
                    <button onClick={() => togglePlayerDead(p.id)} className="text-xs mt-2 px-2 py-1 rounded" style={{ background: "rgba(139,26,26,0.2)", color: "#c08080" }}>
                      {t.markDead}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {isHost && (
            <button onClick={() => { setPhase("night"); setNightIndex(0); }} className="btn-gothic-primary w-full py-4 rounded-xl font-bold" style={{ fontFamily: "var(--font-gothic)" }}>
              🌙 {t.endDay}
            </button>
          )}
        </div>
      </div>
    );
  }

  // NIGHT PHASE
  if (phase === "night") {
    const currentWake = nightWakeOrder[nightIndex];
    return (
      <div className="min-h-screen flex flex-col" style={{ background: "linear-gradient(180deg, #000510 0%, #0d0a1a 100%)" }}>
        <div className="max-w-2xl mx-auto px-6 py-8 w-full">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-black" style={{ fontFamily: "var(--font-gothic)", color: "#e8d5b0" }}>🌙 {t.night} {day}</h2>
            <button onClick={() => setLang(lang === "en" ? "th" : "en")} className="btn-gothic-secondary px-3 py-1.5 rounded-lg text-xs">{lang === "en" ? "🇹🇭 TH" : "🇬🇧 EN"}</button>
          </div>

          <div className="text-center py-8 mb-6 gothic-card rounded-2xl">
            <div className="text-5xl mb-3">🌕</div>
            <p className="text-lg italic" style={{ color: "#7a6a5a" }}>The village sleeps...</p>
          </div>

          {isHost && (
            <>
              <div className="text-sm mb-4 tracking-widest uppercase" style={{ color: "#d4af37", fontFamily: "var(--font-gothic)" }}>{t.wakeOrder}</div>
              <div className="space-y-2 mb-6">
                {nightWakeOrder.map((role, idx) => (
                  <div key={role.id} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${idx === nightIndex ? "border" : "opacity-50"}`} style={{ background: idx === nightIndex ? "rgba(212,175,55,0.1)" : "rgba(45,27,78,0.3)", borderColor: idx < nightIndex ? "rgba(90,74,58,0.3)" : idx === nightIndex ? "rgba(212,175,55,0.6)" : "transparent" }}>
                    <span className="text-sm font-mono w-5" style={{ color: "#5a4a3a" }}>{idx + 1}</span>
                    <span className="font-medium" style={{ color: idx === nightIndex ? "#e8d5b0" : "#7a6a5a", fontFamily: "var(--font-gothic)" }}>{role.name[lang]}</span>
                    <span className="text-xs ml-auto" style={{ color: role.team === "evil" ? "#c08080" : "#8090c0" }}>{role.type}</span>
                    {idx < nightIndex && <span className="text-green-600">✓</span>}
                  </div>
                ))}
              </div>

              <div className="flex gap-3">
                {nightIndex < nightWakeOrder.length - 1 ? (
                  <button onClick={() => setNightIndex((i) => i + 1)} className="btn-gothic-primary flex-1 py-3 rounded-xl font-semibold">
                    Next → {nightWakeOrder[nightIndex + 1]?.name[lang]}
                  </button>
                ) : (
                  <button onClick={() => { setDay((d) => d + 1); setPhase("day"); }} className="btn-gothic-primary flex-1 py-4 rounded-xl font-bold" style={{ fontFamily: "var(--font-gothic)" }}>
                    ☀️ {t.endNight}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return null;
}

export default function SessionPage() {
  return (
    <Suspense>
      <SessionRoom />
    </Suspense>
  );
}

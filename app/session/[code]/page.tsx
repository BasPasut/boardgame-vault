"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { generatePlayerId } from "@/lib/utils/session";
import { getLang, saveLang } from "@/lib/utils/lang";
import Image from "next/image";
import QRCode from "react-qr-code";
import { FIRST_SHADOWS_ROLES, getRoleById, getRolesByType } from "@/lib/games/shadows-over-thornwick/roles";
import { assignRoles, getRoleCounts } from "@/lib/games/shadows-over-thornwick/scripts";
import { supabase } from "@/lib/supabase";
import { useAmbientAudio } from "@/lib/hooks/useAmbientAudio";
import { HnCPlaying, type HnCGameState } from "./HnCPlaying";
import BetrayalPlaying from "./BetrayalPlaying";
import { GRID_COLS, GRID_ROWS } from "@/lib/games/hues-and-cues/colors";
import { CHARACTERS, getCharacter } from "@/lib/games/betrayal/data/characters";
import { ITEM_CARDS, OMEN_CARDS, EVENT_CARDS, shuffle } from "@/lib/games/betrayal/data/cards";
import { buildStartingTiles } from "@/lib/games/betrayal/logic/mapEngine";
import { buildTilePools } from "@/lib/games/betrayal/data/tiles";
import type { Player, GamePhase, Role } from "@/types/game";
import { Suspense } from "react";

// ---------- Icons ----------
function AudioOnIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
      {/* Horn body */}
      <path d="M3 9h5l7-5v16l-7-5H3z" stroke="#d4af37" strokeWidth="1.5" strokeLinejoin="round" fill="rgba(212,175,55,0.1)" />
      {/* Diamond rune on horn face — same motif as GrimoireIcon */}
      <path d="M7.5 10.5 L9 12 L7.5 13.5 L6 12 Z" stroke="#d4af37" strokeWidth="1" fill="rgba(212,175,55,0.25)" />
      {/* Sound arc inner */}
      <path d="M17 9.5a4 4 0 0 1 0 5" stroke="#d4af37" strokeWidth="1.4" strokeLinecap="round" />
      {/* Sound arc outer — faint */}
      <path d="M19.5 7a7.5 7.5 0 0 1 0 10" stroke="#d4af37" strokeWidth="1" strokeLinecap="round" strokeOpacity="0.45" />
      {/* Decorative top line — like grimoire text lines */}
      <line x1="3" y1="9" x2="8" y2="9" stroke="#d4af37" strokeWidth="0.8" strokeLinecap="round" strokeOpacity="0.4" />
    </svg>
  );
}

function AudioOffIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
      {/* Horn body — dimmed */}
      <path d="M3 9h5l7-5v16l-7-5H3z" stroke="#d4af37" strokeWidth="1.5" strokeLinejoin="round" fill="rgba(212,175,55,0.05)" strokeOpacity="0.5" />
      {/* Diamond rune — faded */}
      <path d="M7.5 10.5 L9 12 L7.5 13.5 L6 12 Z" stroke="#d4af37" strokeWidth="1" fill="none" strokeOpacity="0.35" />
      {/* Gothic cross-slash silencing the horn */}
      <line x1="17" y1="9" x2="22" y2="15" stroke="#d4af37" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="22" y1="9" x2="17" y2="15" stroke="#d4af37" strokeWidth="1.5" strokeLinecap="round" />
      {/* Small corner diamonds at slash ends */}
      <circle cx="17" cy="9" r="0.8" fill="#d4af37" fillOpacity="0.6" />
      <circle cx="22" cy="15" r="0.8" fill="#d4af37" fillOpacity="0.6" />
    </svg>
  );
}

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

// ---------- DB types ----------
interface SoTGameState {
  script_id: string;
  day_number: number;
  night_index: number;
  role_assignments: Record<string, string>;
  bluff_assignments?: Record<string, string>;
  winner?: "good" | "evil";
}

interface SoTPlayerState {
  is_alive: boolean;
  is_storyteller: boolean;
}

interface DbSession {
  code: string;
  game_id: string;
  phase: GamePhase;
  game_state: SoTGameState;
}

interface ChatMessage {
  id: string;
  session_code: string;
  from_id: string;
  to_id: string;
  body: string;
  created_at: string;
}

interface DbPlayer {
  id: string;
  session_code: string;
  name: string;
  player_state: SoTPlayerState;
}

function toPlayer(p: DbPlayer): Player {
  return {
    id: p.id,
    name: p.name,
    isAlive: p.player_state.is_alive,
    isStoryteller: p.player_state.is_storyteller,
  };
}

function getSuggestedRoleIds(playerCount: number): string[] {
  const c = getRoleCounts(playerCount);
  return [
    ...getRolesByType("townsfolk").slice(0, c.townsfolk).map(r => r.id),
    ...getRolesByType("outsider").slice(0, c.outsiders).map(r => r.id),
    ...getRolesByType("minion").slice(0, c.minions).map(r => r.id),
    ...getRolesByType("demon").slice(0, c.demons).map(r => r.id),
  ];
}

// ---------- Chat Panel ----------
interface ChatPanelProps {
  myPlayerId: string | null;
  isHost: boolean;
  players: Player[];
  allMessages: ChatMessage[];
  chatOpen: boolean;
  setChatOpen: (v: boolean) => void;
  chatTarget: string | null;
  setChatTarget: (v: string | null) => void;
  chatInput: string;
  setChatInput: (v: string) => void;
  unreadCount: number;
  setUnreadCount: (v: number) => void;
  visibleMessages: ChatMessage[];
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  lang: "en" | "th";
  onSend: () => void;
}

function ChatPanel({
  myPlayerId, isHost, players, allMessages, chatOpen, setChatOpen,
  chatTarget, setChatTarget, chatInput, setChatInput,
  unreadCount, setUnreadCount, visibleMessages,
  messagesEndRef, lang, onSend,
}: ChatPanelProps) {
  const [lastReadMap, setLastReadMap] = useState<Record<string, string>>({});

  if (!myPlayerId) return null;

  const storyteller = players.find(p => p.isStoryteller);
  const nonST = players.filter(p => !p.isStoryteller);
  const threadPartner = isHost
    ? (chatTarget ? players.find(p => p.id === chatTarget) : null)
    : storyteller;

  const openThread = (playerId: string) => {
    setChatTarget(playerId);
    setLastReadMap(prev => ({ ...prev, [playerId]: new Date().toISOString() }));
  };

  const openChat = () => {
    setChatOpen(true);
    setUnreadCount(0);
    if (!isHost && storyteller) openThread(storyteller.id);
  };

  const unreadFrom = (playerId: string) => {
    const lastRead = lastReadMap[playerId];
    return allMessages.filter(m =>
      m.from_id === playerId && m.to_id === myPlayerId &&
      (!lastRead || m.created_at > lastRead)
    ).length;
  };

  const totalUnread = nonST.reduce((sum, p) => sum + unreadFrom(p.id), 0);

  return (
    <>
      {!chatOpen && (
        <button
          onClick={openChat}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full flex items-center justify-center shadow-lg transition-transform hover:scale-105"
          style={{ background: "linear-gradient(135deg, #2d1b4e, #1a0a2e)", border: "1px solid rgba(212,175,55,0.4)" }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="#d4af37" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {(unreadCount > 0 || totalUnread > 0) && (
            <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full text-xs flex items-center justify-center font-bold" style={{ background: "#8b1a1a", color: "#e8d5b0" }}>
              {(unreadCount + totalUnread) > 9 ? "9+" : unreadCount + totalUnread}
            </span>
          )}
        </button>
      )}

      {chatOpen && (
        <div
          className="fixed bottom-0 right-0 z-50 sm:bottom-6 sm:right-6 w-full sm:w-80 flex flex-col rounded-t-2xl sm:rounded-2xl overflow-hidden"
          style={{ height: "420px", background: "linear-gradient(160deg, #1a0a2e 0%, #0d0a1a 100%)", border: "1px solid rgba(212,175,55,0.25)" }}
        >
          {/* Header */}
          <div className="flex items-center gap-2 px-4 py-3 flex-shrink-0" style={{ borderBottom: "1px solid rgba(212,175,55,0.15)" }}>
            {isHost && chatTarget && (
              <button onClick={() => setChatTarget(null)} className="w-9 h-9 flex items-center justify-center rounded-lg text-base flex-shrink-0" style={{ color: "#d4af37", background: "rgba(212,175,55,0.12)", border: "1px solid rgba(212,175,55,0.3)" }}>←</button>
            )}
            <span className="flex-1 text-sm font-medium truncate" style={{ color: threadPartner ? "#e8d5b0" : "#d4af37", fontFamily: "var(--font-gothic)" }}>
              {threadPartner ? threadPartner.name : (lang === "en" ? "Private Chat" : "แชทส่วนตัว")}
            </span>
            <button onClick={() => setChatOpen(false)} className="text-base leading-none" style={{ color: "#5a4a3a" }}>✕</button>
          </div>

          {/* Storyteller: player list */}
          {isHost && !chatTarget ? (
            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              {nonST.length === 0 ? (
                <p className="text-center text-sm mt-10" style={{ color: "#5a4a3a" }}>
                  {lang === "en" ? "No players yet" : "ยังไม่มีผู้เล่น"}
                </p>
              ) : nonST.map(p => {
                const badge = unreadFrom(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => openThread(p.id)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all hover:opacity-80"
                    style={{ background: badge > 0 ? "rgba(139,26,26,0.2)" : "rgba(45,27,78,0.5)" }}
                  >
                    <div className="relative w-8 h-8 flex-shrink-0">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: "rgba(139,26,26,0.25)", color: "#e8d5b0" }}>
                        {p.name[0].toUpperCase()}
                      </div>
                      {badge > 0 && (
                        <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full text-xs flex items-center justify-center font-bold" style={{ background: "#8b1a1a", color: "#e8d5b0", fontSize: "10px" }}>
                          {badge > 9 ? "9+" : badge}
                        </span>
                      )}
                    </div>
                    <span className="flex-1 text-sm" style={{ color: badge > 0 ? "#e8d5b0" : "#a08060" }}>{p.name}</span>
                    {badge > 0 && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: "#8b1a1a" }} />}
                  </button>
                );
              })}
            </div>
          ) : (
            <>
              {/* Thread */}
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {visibleMessages.length === 0 && (
                  <p className="text-center text-sm mt-10" style={{ color: "#5a4a3a" }}>
                    {lang === "en" ? "No messages yet..." : "ยังไม่มีข้อความ..."}
                  </p>
                )}
                {visibleMessages.map(m => {
                  const isMine = m.from_id === myPlayerId;
                  return (
                    <div key={m.id} className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
                      <div
                        className="max-w-[75%] px-3 py-2 text-sm leading-snug"
                        style={{
                          background: isMine ? "rgba(212,175,55,0.18)" : "rgba(45,27,78,0.7)",
                          color: "#e8d5b0",
                          borderRadius: isMine ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                        }}
                      >
                        {m.body}
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>
              {/* Input */}
              <div className="flex-shrink-0 p-3" style={{ borderTop: "1px solid rgba(212,175,55,0.1)" }}>
                <div className="flex gap-2">
                  <input
                    value={chatInput}
                    onChange={e => setChatInput(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && onSend()}
                    placeholder={lang === "en" ? "Type a message..." : "พิมพ์ข้อความ..."}
                    className="flex-1 px-3 py-2 rounded-xl text-sm focus:outline-none"
                    style={{ background: "rgba(13,10,26,0.8)", border: "1px solid rgba(212,175,55,0.2)", color: "#e8d5b0" }}
                  />
                  <button
                    onClick={onSend}
                    disabled={!chatInput.trim()}
                    className="px-3 py-2 rounded-xl font-bold disabled:opacity-40 transition-opacity"
                    style={{ background: "rgba(212,175,55,0.2)", color: "#d4af37" }}
                  >→</button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}

// ---------- My Role Overlay ----------
function MyRoleOverlay({ role, lang, onClose }: { role: Role; lang: "en" | "th"; onClose: () => void }) {
  const typeColors: Record<string, string> = { townsfolk: "#80b0ff", outsider: "#c0a0ff", minion: "#ffb080", demon: "#ff6060" };
  const color = typeColors[role.type] ?? "#e8d5b0";
  const isEvil = role.team === "evil";
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }} onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl overflow-hidden" style={{ background: "linear-gradient(160deg, #1a0a2e, #0d0a1a)", border: `2px solid ${isEvil ? "rgba(139,26,26,0.8)" : "rgba(212,175,55,0.6)"}` }} onClick={e => e.stopPropagation()}>
        {/* Image */}
        <div className="relative h-48 w-full" style={{ background: "rgba(0,0,0,0.4)" }}>
          <Image src={role.image} alt={role.name[lang]} fill className="object-cover object-top" />
          <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.7), transparent 50%)" }} />
          <button onClick={onClose} className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center text-sm" style={{ background: "rgba(0,0,0,0.5)", color: "#a08060" }}>✕</button>
          <div className="absolute bottom-3 left-4">
            <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: `rgba(${isEvil ? "139,26,26" : "74,111,165"},0.5)`, color: isEvil ? "#ff8080" : "#80b0ff" }}>
              {role.type}
            </span>
          </div>
        </div>
        {/* Info */}
        <div className="p-5">
          <h2 className="text-2xl font-black mb-3" style={{ fontFamily: "var(--font-gothic)", color: "#e8d5b0" }}>{role.name[lang]}</h2>
          <p className="text-sm leading-relaxed mb-4" style={{ color }}>{role.ability[lang]}</p>
          <div className="flex items-center justify-between">
            <span className="text-xs px-3 py-1 rounded-full font-medium" style={{ background: isEvil ? "rgba(139,26,26,0.3)" : "rgba(74,111,165,0.3)", color: isEvil ? "#ff8080" : "#80b0ff" }}>
              {isEvil ? (lang === "en" ? "Evil" : "ฝ่ายชั่ว") : (lang === "en" ? "Good" : "ฝ่ายดี")}
            </span>
            <p className="text-xs" style={{ color: "#5a4a3a" }}>{lang === "en" ? "Tap outside to close" : "แตะด้านนอกเพื่อปิด"}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Component ----------
function SessionRoom() {
  const params = useParams();
  const searchParams = useSearchParams();
  const code = (params.code as string).toUpperCase();
  const isHostParam = searchParams.get("host") === "true";

  const [lang, setLangState] = useState<"en" | "th">(() => getLang());
  const setLang = (l: "en" | "th") => { setLangState(l); saveLang(l); };
  const [dbSession, setDbSession] = useState<DbSession | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [myPlayerId, setMyPlayerId] = useState<string | null>(null);
  const [joinName, setJoinName] = useState("");
  const [revealedRole, setRevealedRole] = useState<Role | null>(null);
  const [showRoleCard, setShowRoleCard] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [joining, setJoining] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatTarget, setChatTarget] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [unreadCount, setUnreadCount] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [customRoleIds, setCustomRoleIds] = useState<string[] | null>(null);
  const [showRolePicker, setShowRolePicker] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [showMyRole, setShowMyRole] = useState(false);
  const [hncScoreToWin, setHncScoreToWin] = useState(25);

  // Betrayal character selections (stored in game_state.character_selections)
  const betrayalCharSelections: Record<string, string> =
    dbSession?.game_id === "betrayal-at-house-on-the-hill"
      ? ((dbSession.game_state as unknown as Record<string, unknown>)?.character_selections as Record<string, string> ?? {})
      : {};
  const myBetrayalCharId = myPlayerId ? betrayalCharSelections[myPlayerId] ?? null : null;

  // Derived
  const myPlayer = players.find((p) => p.id === myPlayerId) ?? null;
  const isHost = myPlayer?.isStoryteller ?? isHostParam;
  const phase = dbSession?.phase ?? "lobby";
  const gs = dbSession?.game_state;
  const day = gs?.day_number ?? 1;
  const nightIndex = gs?.night_index ?? 0;
  const roleAssignments = gs?.role_assignments ?? {};
  const joined = myPlayer !== null;
  const myRoleId = myPlayerId
    ? (gs?.bluff_assignments?.[myPlayerId] ?? roleAssignments[myPlayerId] ?? null)
    : null;
  const myRole = myRoleId ? getRoleById(myRoleId) ?? null : null;
  const storytellerId = players.find(p => p.isStoryteller)?.id ?? null;
  const effectiveChatTarget = isHost ? chatTarget : storytellerId;
  const visibleMessages = myPlayerId && effectiveChatTarget
    ? messages.filter(m =>
        (m.from_id === myPlayerId && m.to_id === effectiveChatTarget) ||
        (m.from_id === effectiveChatTarget && m.to_id === myPlayerId)
      )
    : [];

  // Per-game audio source — BetrayalPlaying handles its own in-game tracks,
  // so page.tsx only plays Betrayal audio during the lobby phase.
  const GAMES_WITH_AUDIO = ["shadows-over-thornwick", "betrayal-at-house-on-the-hill"];
  const hasAudio = GAMES_WITH_AUDIO.includes(dbSession?.game_id ?? "shadows-over-thornwick");
  const audioSrc = (() => {
    if (!hasAudio) return null;
    if (dbSession?.game_id === "betrayal-at-house-on-the-hill") {
      // Only play lobby track here; exploring/haunt handled inside BetrayalPlaying
      return phase === "lobby" ? "/audio/betrayal/lobby.mp3" : null;
    }
    if (phase === "night") return "/audio/ambient-night.mp3";
    if (phase === "day")   return "/audio/ambient-day.mp3";
    return "/audio/ambient-lobby.mp3";
  })();
  const { muted, toggleMute } = useAmbientAudio(audioSrc);

  const assignedRoleIds = new Set(Object.values(roleAssignments));
  const deadRoleIds = new Set(
    players.filter(p => !p.isAlive && !p.isStoryteller).map(p => roleAssignments[p.id]).filter(Boolean)
  );
  const nightWakeOrder = FIRST_SHADOWS_ROLES
    .filter((r) => {
      const wakesThisNight = day === 1 ? r.firstNight !== undefined : r.otherNights !== undefined;
      return wakesThisNight && assignedRoleIds.has(r.id) && !deadRoleIds.has(r.id);
    })
    .sort((a, b) => {
      const aN = day === 1 ? (a.firstNight ?? 99) : (a.otherNights ?? 99);
      const bN = day === 1 ? (b.firstNight ?? 99) : (b.otherNights ?? 99);
      return aN - bN;
    });

  // Per-game lobby strings — add new games here
  const GAME_LOBBY_META: Record<string, { en: { lobby: string; lobbySubtitle: string; hostLabel: string; waitingForHost: string; loadingText: string }; th: { lobby: string; lobbySubtitle: string; hostLabel: string; waitingForHost: string; loadingText: string } }> = {
    "shadows-over-thornwick": {
      en: { lobby: "The Village Awaits", lobbySubtitle: "Share the code with your friends to join", hostLabel: "Storyteller", waitingForHost: "Waiting for the Storyteller...", loadingText: "Entering Thornwick..." },
      th: { lobby: "หมู่บ้านรอคอย", lobbySubtitle: "แชร์รหัสให้เพื่อนเพื่อเข้าร่วม", hostLabel: "Storyteller", waitingForHost: "รอ Storyteller...", loadingText: "กำลังเข้าสู่ธอร์นวิค..." },
    },
    "hues-and-cues": {
      en: { lobby: "Color Room Ready", lobbySubtitle: "Share the code with your friends to join", hostLabel: "Host", waitingForHost: "Waiting for the Host to start...", loadingText: "Loading room..." },
      th: { lobby: "ห้องสีพร้อมแล้ว", lobbySubtitle: "แชร์รหัสให้เพื่อนเพื่อเข้าร่วม", hostLabel: "Host", waitingForHost: "รอ Host เริ่มเกม...", loadingText: "กำลังโหลดห้อง..." },
    },
    "betrayal-at-house-on-the-hill": {
      en: { lobby: "The Mansion Awaits", lobbySubtitle: "Choose your character and enter the house", hostLabel: "Host", waitingForHost: "Waiting for the Host to start...", loadingText: "Entering the mansion..." },
      th: { lobby: "คฤหาสน์รอคอย", lobbySubtitle: "เลือกตัวละครและเข้าสู่คฤหาสน์", hostLabel: "Host", waitingForHost: "รอ Host เริ่มเกม...", loadingText: "กำลังเข้าสู่คฤหาสน์..." },
    },
  };
  const gameId = dbSession?.game_id ?? "shadows-over-thornwick";
  const gameMeta = (GAME_LOBBY_META[gameId] ?? GAME_LOBBY_META["shadows-over-thornwick"])[lang];

  const t = {
    en: {
      lobby: gameMeta.lobby,
      lobbySubtitle: gameMeta.lobbySubtitle,
      hostLabel: gameMeta.hostLabel,
      waitingForHost: gameMeta.waitingForHost,
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
      understood: "I Understand My Role",
      beginDay: "Begin Day 1 →",
      day: "Day",
      night: "Night",
      discuss: "Discuss who might be the Demon...",
      endDay: "End Day → Night Falls",
      endNight: "End Night → Dawn Breaks",
      wakeOrder: "Wake Order Tonight",
      markDead: "Mark Dead",
      markAlive: "Mark Alive",
      alive: "Alive",
      dead: "Dead",
      good: "Good",
      evil: "Evil",
      back: "← Home",
      roomNotFound: "Room not found",
      roomNotFoundDesc: "This room code doesn't exist or has expired.",
      declareWinner: "Declare Winner",
      goodWins: "Good Wins",
      evilWins: "Evil Wins",
      victoryGood: "The Village Survives!",
      victoryEvil: "Darkness Consumes Thornwick",
      victoryGoodSub: "The forces of good have triumphed. Thornwick is safe... for now.",
      victoryEvilSub: "The Demon feasts. Shadows swallow the village whole.",
      rolesRevealed: "Roles Revealed",
      playAgain: "Play Again",
    },
    th: {
      lobby: gameMeta.lobby,
      lobbySubtitle: gameMeta.lobbySubtitle,
      hostLabel: gameMeta.hostLabel,
      waitingForHost: gameMeta.waitingForHost,
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
      understood: "เข้าใจบทบาทของตัวเองแล้ว",
      beginDay: "เริ่มวันที่ 1 →",
      day: "วันที่",
      night: "คืนที่",
      discuss: "ถกเถียงกันว่าใครคือปีศาจ...",
      endDay: "สิ้นสุดวัน → กลางคืนมาถึง",
      endNight: "สิ้นสุดคืน → รุ่งเช้ามาถึง",
      wakeOrder: "ลำดับการปลุกคืนนี้",
      markDead: "ทำเครื่องหมายว่าตาย",
      markAlive: "ทำเครื่องหมายว่ามีชีวิต",
      alive: "มีชีวิต",
      dead: "ตาย",
      good: "ฝ่ายดี",
      evil: "ฝ่ายชั่ว",
      back: "← หน้าแรก",
      roomNotFound: "ไม่พบห้อง",
      roomNotFoundDesc: "รหัสห้องนี้ไม่มีอยู่หรือหมดอายุแล้ว",
      declareWinner: "ประกาศผู้ชนะ",
      goodWins: "ฝ่ายดีชนะ",
      evilWins: "ฝ่ายชั่วชนะ",
      victoryGood: "หมู่บ้านรอดพ้น!",
      victoryEvil: "ความมืดครอบงำธอร์นวิค",
      victoryGoodSub: "พลังแห่งความดีได้ชัยชนะ ธอร์นวิคปลอดภัย... ในตอนนี้",
      victoryEvilSub: "ปีศาจได้รับชัยชนะ เงามืดกลืนกินหมู่บ้านทั้งหมด",
      rolesRevealed: "เปิดเผยบทบาท",
      playAgain: "เล่นอีกครั้ง",
    },
  }[lang];

  // ---------- Load initial data ----------
  useEffect(() => {
    const storedId = localStorage.getItem(`bgv_player_${code}`);
    if (storedId) setMyPlayerId(storedId);

    async function load() {
      const [{ data: sessionData }, { data: playersData }, { data: messagesData }] = await Promise.all([
        supabase.from("sessions").select("*").eq("code", code).single(),
        supabase.from("players").select("*").eq("session_code", code).order("joined_at"),
        supabase.from("messages").select("*").eq("session_code", code).order("created_at"),
      ]);
      if (!sessionData) { setNotFound(true); setLoading(false); return; }
      setDbSession(sessionData as DbSession);
      setPlayers((playersData ?? []).map(toPlayer));
      setMessages((messagesData ?? []) as ChatMessage[]);
      setLoading(false);
    }
    load();
  }, [code]);

  // ---------- Real-time ----------
  useEffect(() => {
    const channel = supabase
      .channel(`room:${code}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "sessions", filter: `code=eq.${code}` }, (payload) => {
        const updated = payload.new as DbSession;
        setDbSession(updated);
        if (updated.phase === "role-reveal") { setShowRoleCard(false); setRevealedRole(null); }
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "players", filter: `session_code=eq.${code}` }, (payload) => {
        const p = toPlayer(payload.new as DbPlayer);
        setPlayers((prev) => prev.some((x) => x.id === p.id) ? prev : [...prev, p]);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "players", filter: `session_code=eq.${code}` }, (payload) => {
        setPlayers((prev) => prev.map((x) => x.id === (payload.new as DbPlayer).id ? toPlayer(payload.new as DbPlayer) : x));
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `session_code=eq.${code}` }, (payload) => {
        const msg = payload.new as ChatMessage;
        setMessages(prev => [...prev, msg]);
        const storedId = localStorage.getItem(`bgv_player_${code}`);
        if (msg.to_id === storedId) setUnreadCount(c => c + 1);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [code]);

  // ---------- Actions ----------
  const handleJoin = async () => {
    if (!joinName.trim() || joining) return;
    setJoining(true);
    const id = generatePlayerId();
    const { error } = await supabase.from("players").insert({
      id, session_code: code, name: joinName.trim(),
      player_state: { is_alive: true, is_storyteller: false },
    });
    if (!error) { localStorage.setItem(`bgv_player_${code}`, id); setMyPlayerId(id); }
    setJoining(false);
  };

  const handleAddDemoPlayers = async () => {
    const names = ["Aria", "Ben", "Cora", "Dex", "Eve", "Flynn", "Grace"];
    const existing = players.filter((p) => !p.isStoryteller).length;
    const toAdd = names.slice(existing, 7);
    if (!toAdd.length) return;
    await supabase.from("players").insert(
      toAdd.map((name) => ({
        id: generatePlayerId(), session_code: code, name,
        player_state: { is_alive: true, is_storyteller: false },
      }))
    );
  };

  const handleStartGame = async () => {
    const nonST = players.filter((p) => !p.isStoryteller);
    if (nonST.length < 5 || !gs) return;
    if (customRoleIds && customRoleIds.length !== nonST.length) return;
    let assignments: Record<string, string>;
    if (customRoleIds) {
      const shuffledRoles = [...customRoleIds].sort(() => Math.random() - 0.5);
      const shuffledPlayers = [...nonST.map(p => p.id)].sort(() => Math.random() - 0.5);
      assignments = {};
      shuffledPlayers.forEach((pid, i) => { assignments[pid] = shuffledRoles[i]; });
    } else {
      assignments = assignRoles(nonST.map((p) => p.id), gs.script_id);
    }
    // Auto-assign a random Townsfolk bluff for the Fool (if present)
    const bluff_assignments: Record<string, string> = {};
    const foolPlayerId = Object.entries(assignments).find(([, rid]) => rid === "fool")?.[0];
    if (foolPlayerId) {
      const assignedSet = new Set(Object.values(assignments));
      const available = getRolesByType("townsfolk").filter(r => !assignedSet.has(r.id));
      if (available.length > 0) {
        bluff_assignments[foolPlayerId] = available[Math.floor(Math.random() * available.length)].id;
      }
    }
    await supabase.from("sessions").update({
      phase: "role-reveal",
      game_state: { ...gs, role_assignments: assignments, bluff_assignments },
    }).eq("code", code);
  };

  const handleStartHnC = async () => {
    if (players.length < 3) return;
    const shuffled = [...players].sort(() => Math.random() - 0.5).map((p) => p.id);
    const initialScores: Record<string, number> = {};
    players.forEach((p) => { initialScores[p.id] = 0; });
    const state: HnCGameState = {
      round: 1,
      total_rounds: 0,
      score_to_win: hncScoreToWin,
      cue_giver_order: shuffled,
      target: { x: Math.floor(Math.random() * GRID_COLS), y: Math.floor(Math.random() * GRID_ROWS) },
      clues: [],
      sub_phase: "giving-clue",
      guesses: {},
      scores: initialScores,
    };
    await supabase.from("sessions").update({ phase: "playing", game_state: state }).eq("code", code);
  };

  const handleSelectBetrayalCharacter = async (charId: string) => {
    if (!myPlayerId || !dbSession) return;
    const current = dbSession.game_state as unknown as Record<string, unknown>;
    const character_selections = { ...(current.character_selections as Record<string, string> ?? {}), [myPlayerId]: charId };
    await supabase.from("sessions").update({
      game_state: { ...current, character_selections },
    }).eq("code", code);
  };

  const handleStartBetrayal = async () => {
    if (!dbSession) return;
    const nonST = players.filter(p => !p.isStoryteller);
    if (nonST.length < 3) return;

    const itemDeck = shuffle(ITEM_CARDS.map(c => c.id));
    const omenDeck = shuffle(OMEN_CARDS.map(c => c.id));
    const eventDeck = shuffle(EVENT_CARDS.map(c => c.id));
    const startingTiles = buildStartingTiles();
    const pools = buildTilePools();

    const turnOrder = [...nonST.map(p => p.id)].sort(() => Math.random() - 0.5);

    // Assign characters — respect player selections, fill gaps with random
    const usedCharIds = new Set<string>();
    const playerStates: Record<string, object> = {};
    nonST.forEach(p => {
      let charId = betrayalCharSelections[p.id];
      if (!charId || usedCharIds.has(charId)) {
        const available = CHARACTERS.filter(c => !usedCharIds.has(c.id));
        charId = available.length > 0 ? available[Math.floor(Math.random() * available.length)].id : CHARACTERS[0].id;
      }
      usedCharIds.add(charId);
      const char = getCharacter(charId) ?? CHARACTERS[0];
      playerStates[p.id] = {
        character_id: char.id,
        floor: 1, x: 0, y: 0,
        speed: char.speed, might: char.might,
        sanity: char.sanity, knowledge: char.knowledge,
        items: [],
        is_alive: true,
      };
    });

    await supabase.from("sessions").update({
      phase: "playing",
      game_state: {
        phase: "explore",
        haunt_number: null,
        traitor_id: null,
        winner: null,
        placed_tiles: startingTiles,
        remaining_tiles: { 0: shuffle(pools[0]), 1: shuffle(pools[1]), 2: shuffle(pools[2]) },
        item_deck: itemDeck,
        omen_deck: omenDeck,
        event_deck: eventDeck,
        item_discard: [],
        omen_discard: [],
        event_discard: [],
        omen_count: 0,
        turn_order: turnOrder,
        current_turn_index: 0,
        turn_phase: "move",
        moves_used: 0,
        player_states: playerStates,
        event_log: [],
        haunt_objectives: null,
        pending_card: null,
      },
    }).eq("code", code);
  };

  const handleRevealRole = () => {
    if (!myPlayerId) return;
    const bluffRoleId = gs?.bluff_assignments?.[myPlayerId];
    const roleId = bluffRoleId ?? roleAssignments[myPlayerId];
    if (roleId) { setRevealedRole(getRoleById(roleId) ?? null); setShowRoleCard(true); }
  };

  const handleBeginDay = async () => {
    await supabase.from("sessions").update({ phase: "day" }).eq("code", code);
  };

  const copyCode = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const togglePlayerDead = async (playerId: string) => {
    const p = players.find((x) => x.id === playerId);
    if (!p) return;
    await supabase.from("players").update({
      player_state: { is_alive: !p.isAlive, is_storyteller: p.isStoryteller },
    }).eq("id", playerId);
  };

  const endDay = async () => {
    if (!gs) return;
    await supabase.from("sessions").update({
      phase: "night",
      game_state: { ...gs, night_index: 0 },
    }).eq("code", code);
  };

  const nextNightRole = async () => {
    if (!gs) return;
    await supabase.from("sessions").update({
      game_state: { ...gs, night_index: nightIndex + 1 },
    }).eq("code", code);
  };

  const endNight = async () => {
    if (!gs) return;
    await supabase.from("sessions").update({
      phase: "day",
      game_state: { ...gs, day_number: day + 1 },
    }).eq("code", code);
  };

  const declareWinner = async (winner: "good" | "evil") => {
    if (!gs) return;
    await supabase.from("sessions").update({
      phase: "ended",
      game_state: { ...gs, winner },
    }).eq("code", code);
  };

  const sendMessage = async () => {
    const target = isHost ? chatTarget : players.find(p => p.isStoryteller)?.id ?? null;
    if (!myPlayerId || !target || !chatInput.trim()) return;
    const body = chatInput.trim();
    setChatInput("");
    await supabase.from("messages").insert({ session_code: code, from_id: myPlayerId, to_id: target, body });
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, chatTarget]);

  // ---------- Loading ----------
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "radial-gradient(ellipse at top, #1a0a2e 0%, #0d0a1a 70%)" }}>
        <div className="text-center">
          <div className="text-4xl mb-4 animate-pulse">🕯️</div>
          <p style={{ color: "#7a6a5a" }}>{lang === "en" ? "Loading room..." : "กำลังโหลดห้อง..."}</p>
        </div>
      </div>
    );
  }

  // ---------- Not found ----------
  if (notFound) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6" style={{ background: "radial-gradient(ellipse at top, #1a0a2e 0%, #0d0a1a 70%)" }}>
        <div className="text-center gothic-card rounded-2xl p-10 max-w-sm">
          <div className="text-5xl mb-4">🗝️</div>
          <h2 className="text-2xl font-black mb-3" style={{ fontFamily: "var(--font-gothic)", color: "#e8d5b0" }}>{t.roomNotFound}</h2>
          <p className="mb-6" style={{ color: "#7a6a5a" }}>{t.roomNotFoundDesc}</p>
          <Link href="/" className="btn-gothic-primary px-6 py-3 rounded-xl font-semibold no-underline">{t.back}</Link>
        </div>
      </div>
    );
  }

  // ---------- BETRAYAL PLAYING / ENDED ----------
  if (dbSession?.game_id === "betrayal-at-house-on-the-hill" && (phase === "playing" || phase === "ended")) {
    return (
      <BetrayalPlaying
        code={code}
        dbSession={dbSession as unknown as Parameters<typeof BetrayalPlaying>[0]["dbSession"]}
        players={players}
        myPlayerId={myPlayerId}
        isHost={isHost}
      />
    );
  }

  // ---------- HnC PLAYING / ENDED ----------
  if (dbSession?.game_id === "hues-and-cues" && (phase === "playing" || phase === "ended")) {
    return (
      <HnCPlaying
        code={code}
        dbSession={dbSession as unknown as Parameters<typeof HnCPlaying>[0]["dbSession"]}
        players={players}
        myPlayerId={myPlayerId}
      />
    );
  }

  // ---------- LOBBY ----------
  if (phase === "lobby") {
    return (
      <div className="min-h-screen relative" style={{ background: "radial-gradient(ellipse at top, #1a0a2e 0%, #0d0a1a 70%)" }}>
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "url('/images/platform/bg-vault-door.png')", backgroundSize: "cover", backgroundPosition: "center" }} />
        <div className="relative z-10 max-w-2xl mx-auto px-6 py-10">
          <div className="flex items-center justify-between mb-8">
            <Link href="/" className="btn-gothic-secondary px-4 py-2 rounded-lg text-sm no-underline">{t.back}</Link>
            <div className="flex gap-2">
              <Link href={`/guide/${dbSession?.game_id ?? "shadows-over-thornwick"}?from=${code}`} className="btn-gothic-secondary px-4 py-2 rounded-lg text-sm no-underline flex items-center gap-1.5">
                <GrimoireIcon />
                {lang === "en" ? "Guide" : "วิธีเล่น"}
              </Link>
              {hasAudio && <button onClick={toggleMute} className="btn-gothic-secondary px-3 py-2 rounded-lg flex items-center justify-center" style={{ opacity: muted ? 0.5 : 1 }}>{muted ? <AudioOffIcon /> : <AudioOnIcon />}</button>}
              <button onClick={() => setLang(lang === "en" ? "th" : "en")} className="btn-gothic-secondary px-4 py-2 rounded-lg text-sm"><span style={{color: lang==="en" ? "#d4af37" : "#5a4a3a"}}>EN</span><span style={{color:"#3a2a1a"}}> / </span><span style={{color: lang==="th" ? "#d4af37" : "#5a4a3a"}}>TH</span></button>
            </div>
          </div>

          <div className="text-center mb-8">
            <h1 className="text-4xl font-black mb-2" style={{ fontFamily: "var(--font-gothic)", color: "#e8d5b0" }}>{t.lobby}</h1>
            <p style={{ color: "#7a6a5a" }}>{t.lobbySubtitle}</p>
          </div>

          <div className="gothic-card rounded-2xl p-6 mb-6 text-center">
            <div className="text-xs tracking-widest uppercase mb-3" style={{ color: "#d4af37", fontFamily: "var(--font-gothic)" }}>{t.shareCode}</div>
            <div className="text-5xl font-black tracking-[0.4em] mb-4 font-mono" style={{ color: "#e8d5b0" }}>{code}</div>
            <div className="flex items-center justify-center gap-2">
              <button onClick={copyCode} className="btn-gothic-secondary px-5 py-2 rounded-lg text-sm">
                {copied ? `✓ ${t.copied}` : t.copy}
              </button>
              <button onClick={() => setShowQR(v => !v)} className="btn-gothic-secondary px-5 py-2 rounded-lg text-sm">
                {showQR ? (lang === "en" ? "Hide QR" : "ซ่อน QR") : "QR"}
              </button>
            </div>
            {showQR && (
              <div className="mt-5 flex flex-col items-center gap-3">
                <div className="p-3 rounded-xl" style={{ background: "#fff" }}>
                  <QRCode
                    value={typeof window !== "undefined" ? `${window.location.origin}/session/${code}` : `/session/${code}`}
                    size={160}
                    bgColor="#ffffff"
                    fgColor="#0d0a1a"
                  />
                </div>
                <p className="text-xs" style={{ color: "#5a4a3a" }}>
                  {lang === "en" ? "Scan to join" : "สแกนเพื่อเข้าร่วม"}
                </p>
              </div>
            )}
          </div>

          {!joined && (
            <div className="gothic-card rounded-2xl p-6 mb-6">
              <label className="block text-sm mb-3 tracking-widest uppercase" style={{ color: "#d4af37", fontFamily: "var(--font-gothic)" }}>{t.yourName}</label>
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  value={joinName}
                  onChange={(e) => setJoinName(e.target.value)}
                  placeholder={t.namePlaceholder}
                  maxLength={20}
                  className="w-full px-4 py-3 rounded-xl focus:outline-none"
                  style={{ background: "rgba(13,10,26,0.8)", border: "1px solid rgba(212,175,55,0.3)", color: "#e8d5b0" }}
                  onKeyDown={(e) => e.key === "Enter" && handleJoin()}
                />
                <button onClick={handleJoin} disabled={joining || !joinName.trim()} className="btn-gothic-primary px-5 py-3 rounded-xl font-semibold disabled:opacity-40 whitespace-nowrap">
                  {joining ? "..." : t.join}
                </button>
              </div>
            </div>
          )}

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
                  {p.isStoryteller && <span className="text-xs px-2 py-0.5 rounded-full ml-auto" style={{ background: "rgba(212,175,55,0.15)", color: "#d4af37" }}>{t.hostLabel}</span>}
                  {p.id === myPlayerId && !p.isStoryteller && <span className="text-xs ml-auto" style={{ color: "#5a4a3a" }}>you</span>}
                </div>
              ))}
            </div>
          </div>

          {/* ─── BETRAYAL CHARACTER SELECTION ─── */}
          {dbSession?.game_id === "betrayal-at-house-on-the-hill" && joined && (
            <div className="gothic-card rounded-2xl p-6 mb-6">
              <div className="text-xs tracking-widest uppercase mb-4" style={{ color: "#d4af37", fontFamily: "var(--font-gothic)" }}>
                {lang === "en" ? "Choose Your Character" : "เลือกตัวละคร"}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {CHARACTERS.map(char => {
                  const selectedBy = Object.entries(betrayalCharSelections).find(([, cid]) => cid === char.id)?.[0];
                  const isSelectedByMe = myBetrayalCharId === char.id;
                  const isSelectedByOther = selectedBy && selectedBy !== myPlayerId;
                  const otherName = isSelectedByOther ? players.find(p => p.id === selectedBy)?.name ?? "?" : null;
                  return (
                    <button
                      key={char.id}
                      onClick={() => !isSelectedByOther && handleSelectBetrayalCharacter(char.id)}
                      disabled={!!isSelectedByOther}
                      className="relative flex flex-col rounded-xl p-3 text-left transition-all"
                      style={{
                        background: isSelectedByMe
                          ? "rgba(212,175,55,0.18)"
                          : isSelectedByOther
                          ? "rgba(90,74,58,0.15)"
                          : "rgba(45,27,78,0.4)",
                        border: `1px solid ${isSelectedByMe ? "rgba(212,175,55,0.7)" : isSelectedByOther ? "rgba(90,74,58,0.3)" : "rgba(212,175,55,0.15)"}`,
                        opacity: isSelectedByOther ? 0.5 : 1,
                        cursor: isSelectedByOther ? "not-allowed" : "pointer",
                      }}
                    >
                      {/* Character image placeholder */}
                      <div className="w-full aspect-square rounded-lg mb-2 overflow-hidden flex items-center justify-center"
                        style={{ background: "rgba(13,10,26,0.6)" }}>
                        <span className="text-3xl">
                          {char.id === "father-karras" ? "✝️" :
                           char.id === "professor-ashwood" ? "📚" :
                           char.id === "lady-blackwood" ? "🌹" :
                           char.id === "sergeant-cole" ? "🎖️" :
                           char.id === "mrs-holloway" ? "🗝️" : "🔮"}
                        </span>
                      </div>
                      <div className="text-xs font-bold leading-tight mb-1" style={{ color: isSelectedByMe ? "#d4af37" : "#e8d5b0", fontFamily: "var(--font-gothic)" }}>
                        {char.name}
                      </div>
                      <div className="text-xs leading-tight" style={{ color: "#7a6a5a" }}>
                        SPD {char.speed} · MGT {char.might}
                      </div>
                      <div className="text-xs leading-tight" style={{ color: "#7a6a5a" }}>
                        SAN {char.sanity} · KNW {char.knowledge}
                      </div>
                      {isSelectedByMe && (
                        <div className="absolute top-1.5 right-1.5 text-xs px-1.5 py-0.5 rounded-full font-bold" style={{ background: "rgba(212,175,55,0.25)", color: "#d4af37" }}>✓</div>
                      )}
                      {isSelectedByOther && (
                        <div className="absolute top-1.5 right-1.5 text-xs px-1.5 py-0.5 rounded-full truncate max-w-[70%]" style={{ background: "rgba(90,74,58,0.4)", color: "#7a6a5a" }}>
                          {otherName}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
              {myBetrayalCharId && (
                <p className="text-xs mt-3 text-center" style={{ color: "#5a9a5a" }}>
                  {lang === "en"
                    ? `You chose ${CHARACTERS.find(c => c.id === myBetrayalCharId)?.name} — waiting for host to start`
                    : `คุณเลือก ${CHARACTERS.find(c => c.id === myBetrayalCharId)?.name} — รอ Host เริ่มเกม`}
                </p>
              )}
            </div>
          )}

          {/* ─── BETRAYAL HOST START ─── */}
          {isHost && dbSession?.game_id === "betrayal-at-house-on-the-hill" && (
            <div className="space-y-3">
              <button onClick={handleAddDemoPlayers} className="btn-gothic-secondary w-full py-3 rounded-xl text-sm">
                + Add Demo Players (for testing)
              </button>
              <div className="gothic-card rounded-xl p-4">
                <div className="text-xs tracking-widest uppercase mb-2" style={{ color: "#d4af37", fontFamily: "var(--font-gothic)" }}>
                  {lang === "en" ? "Character Selections" : "การเลือกตัวละคร"}
                </div>
                {players.filter(p => !p.isStoryteller).map(p => {
                  const charId = betrayalCharSelections[p.id];
                  const char = charId ? CHARACTERS.find(c => c.id === charId) : null;
                  return (
                    <div key={p.id} className="flex items-center justify-between py-1.5 text-sm" style={{ borderBottom: "1px solid rgba(212,175,55,0.07)" }}>
                      <span style={{ color: "#e8d5b0" }}>{p.name}</span>
                      <span style={{ color: char ? "#d4af37" : "#5a4a3a" }}>
                        {char ? char.name : (lang === "en" ? "Not chosen" : "ยังไม่เลือก")}
                      </span>
                    </div>
                  );
                })}
              </div>
              <button
                onClick={handleStartBetrayal}
                disabled={players.filter(p => !p.isStoryteller).length < 3}
                className="btn-gothic-primary w-full py-4 rounded-xl text-lg font-bold disabled:opacity-40"
                style={{ fontFamily: "var(--font-gothic)" }}
              >
                {players.filter(p => !p.isStoryteller).length < 3
                  ? (lang === "en" ? "Need at least 3 players" : "ต้องการผู้เล่นอย่างน้อย 3 คน")
                  : `🏚 ${lang === "en" ? "Enter the Mansion" : "เข้าสู่คฤหาสน์"}`}
              </button>
            </div>
          )}

          {isHost && dbSession?.game_id === "hues-and-cues" && (
            <div className="space-y-3">
              <div className="gothic-card rounded-2xl p-5">
                <div className="text-xs tracking-widest uppercase mb-3" style={{ color: "#d4af37", fontFamily: "var(--font-gothic)" }}>
                  {lang === "en" ? "Score to Win" : "คะแนนเพื่อชนะ"}
                </div>
                <div className="flex gap-2 flex-wrap">
                  {[10, 15, 25, 30].map((s) => (
                    <button
                      key={s}
                      onClick={() => setHncScoreToWin(s)}
                      className="px-4 py-2 rounded-xl text-sm font-bold transition-all"
                      style={{
                        background: hncScoreToWin === s ? "rgba(212,175,55,0.2)" : "rgba(45,27,78,0.4)",
                        border: `1px solid ${hncScoreToWin === s ? "rgba(212,175,55,0.6)" : "rgba(212,175,55,0.15)"}`,
                        color: hncScoreToWin === s ? "#d4af37" : "#7a6a5a",
                      }}
                    >
                      {s} pts
                    </button>
                  ))}
                </div>
                <p className="text-xs mt-2" style={{ color: "#5a4a3a" }}>
                  {lang === "en" ? "First player to reach this score wins" : "ผู้เล่นที่ได้คะแนนถึงเป้าหมายก่อนชนะ"}
                </p>
              </div>
              <button onClick={handleAddDemoPlayers} className="btn-gothic-secondary w-full py-3 rounded-xl text-sm">
                + Add Demo Players (for testing)
              </button>
              <button
                onClick={handleStartHnC}
                disabled={players.length < 3}
                className="btn-gothic-primary w-full py-4 rounded-xl text-lg font-bold disabled:opacity-40"
                style={{ fontFamily: "var(--font-gothic)" }}
              >
                {players.length < 3
                  ? (lang === "en" ? "Need at least 3 players" : "ต้องการผู้เล่นอย่างน้อย 3 คน")
                  : `🎨 ${lang === "en" ? "Start Game" : "เริ่มเกม"}`}
              </button>
            </div>
          )}

          {isHost && dbSession?.game_id !== "hues-and-cues" && dbSession?.game_id !== "betrayal-at-house-on-the-hill" && (() => {
            const nonSTCount = players.filter(p => !p.isStoryteller).length;
            const rolesValid = !customRoleIds || customRoleIds.length === nonSTCount;
            const typeColors: Record<string, string> = { townsfolk: "#80b0ff", outsider: "#c0a0ff", minion: "#ffb080", demon: "#ff6060" };
            const typeLabels: Record<string, { en: string; th: string }> = {
              townsfolk: { en: "Townsfolk", th: "ทาวน์สโฟล์ค" },
              outsider: { en: "Outsider", th: "เอาท์ไซเดอร์" },
              minion: { en: "Minion", th: "มิเนียน" },
              demon: { en: "Demon", th: "เดมอน" },
            };
            const activeRoleIds = customRoleIds ?? (nonSTCount >= 5 ? getSuggestedRoleIds(nonSTCount) : []);
            return (
              <div className="space-y-3">
                <button onClick={handleAddDemoPlayers} className="btn-gothic-secondary w-full py-3 rounded-xl text-sm">
                  + Add Demo Players (for testing)
                </button>

                {nonSTCount >= 5 && (
                  <div className="gothic-card rounded-2xl p-5">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs tracking-widest uppercase" style={{ color: "#d4af37", fontFamily: "var(--font-gothic)" }}>
                        {lang === "en" ? "Roles" : "บทบาท"}
                      </span>
                      <div className="flex items-center gap-2">
                        {customRoleIds && (
                          <button onClick={() => { setCustomRoleIds(null); setShowRolePicker(false); }} className="text-xs" style={{ color: "#5a4a3a" }}>
                            {lang === "en" ? "Reset" : "รีเซ็ต"}
                          </button>
                        )}
                        <button
                          onClick={() => {
                            if (!showRolePicker && !customRoleIds) setCustomRoleIds(getSuggestedRoleIds(nonSTCount));
                            setShowRolePicker(v => !v);
                          }}
                          className="text-xs btn-gothic-secondary px-3 py-1.5 rounded-lg"
                        >
                          {showRolePicker ? "▲" : (lang === "en" ? "Customize ▼" : "ปรับแต่ง ▼")}
                        </button>
                      </div>
                    </div>

                    {!showRolePicker && (
                      <div className="flex flex-wrap gap-1.5">
                        {activeRoleIds.map(id => {
                          const role = getRoleById(id);
                          return role ? (
                            <span key={id} className="text-xs px-2 py-0.5 rounded-full" style={{ background: "rgba(45,27,78,0.5)", color: typeColors[role.type] ?? "#e8d5b0" }}>
                              {role.name[lang]}
                            </span>
                          ) : null;
                        })}
                      </div>
                    )}

                    {showRolePicker && customRoleIds && (
                      <div className="space-y-4">
                        {(["townsfolk", "outsider", "minion", "demon"] as const).map(type => (
                          <div key={type}>
                            <div className="text-xs font-medium mb-2" style={{ color: typeColors[type] }}>{typeLabels[type][lang]}</div>
                            <div className="flex flex-wrap gap-1.5">
                              {getRolesByType(type).map(role => {
                                const selected = customRoleIds.includes(role.id);
                                return (
                                  <button
                                    key={role.id}
                                    onClick={() => setCustomRoleIds(prev => prev
                                      ? selected ? prev.filter(id => id !== role.id) : [...prev, role.id]
                                      : prev
                                    )}
                                    className="text-xs px-2 py-1 rounded-full transition-all"
                                    style={{
                                      background: selected ? "rgba(45,27,78,0.6)" : "rgba(13,10,26,0.5)",
                                      border: `1px solid ${selected ? typeColors[type] : "rgba(90,74,58,0.3)"}`,
                                      color: selected ? typeColors[type] : "#5a4a3a",
                                    }}
                                  >
                                    {role.name[lang]}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                        <div className="pt-2 text-xs" style={{ borderTop: "1px solid rgba(212,175,55,0.1)", color: rolesValid ? "#5a9a5a" : "#c08080" }}>
                          {customRoleIds.length} / {nonSTCount} {lang === "en" ? "roles selected" : "บทบาทที่เลือก"}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <button
                  onClick={handleStartGame}
                  disabled={nonSTCount < 5 || !rolesValid}
                  className="btn-gothic-primary w-full py-4 rounded-xl text-lg font-bold disabled:opacity-40"
                  style={{ fontFamily: "var(--font-gothic)" }}
                >
                  {nonSTCount < 5
                    ? t.needMore
                    : !rolesValid
                    ? (lang === "en" ? `Select ${nonSTCount} roles (${customRoleIds?.length ?? 0} chosen)` : `เลือก ${nonSTCount} บทบาท`)
                    : `⚔ ${t.startGame}`}
                </button>
              </div>
            );
          })()}
          {!isHost && joined && (
            <p className="text-center text-sm italic" style={{ color: "#5a4a3a" }}>{t.waitingForHost}</p>
          )}
        </div>
        <ChatPanel myPlayerId={myPlayerId} isHost={isHost} players={players} allMessages={messages} chatOpen={chatOpen} setChatOpen={setChatOpen} chatTarget={chatTarget} setChatTarget={setChatTarget} chatInput={chatInput} setChatInput={setChatInput} unreadCount={unreadCount} setUnreadCount={setUnreadCount} visibleMessages={visibleMessages} messagesEndRef={messagesEndRef} lang={lang} onSend={sendMessage} />
      </div>
    );
  }

  // ---------- ROLE REVEAL ----------
  if (phase === "role-reveal") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6" style={{ background: "radial-gradient(ellipse at top, #1a0a2e 0%, #0d0a1a 70%)" }}>
        <div className="flex items-center justify-between w-full max-w-md mb-8">
          <div style={{ color: "#5a4a3a" }}>Shadows Over Thornwick</div>
          <button onClick={() => setLang(lang === "en" ? "th" : "en")} className="btn-gothic-secondary px-3 py-1.5 rounded-lg text-xs"><span style={{color: lang==="en" ? "#d4af37" : "#5a4a3a"}}>EN</span><span style={{color:"#3a2a1a"}}> / </span><span style={{color: lang==="th" ? "#d4af37" : "#5a4a3a"}}>TH</span></button>
        </div>

        <h2 className="text-3xl font-black mb-2 text-center" style={{ fontFamily: "var(--font-gothic)", color: "#e8d5b0" }}>{t.roleRevealTitle}</h2>
        <p className="mb-8 text-center" style={{ color: "#7a6a5a" }}>
          {isHost ? (lang === "en" ? "All role assignments" : "รายการบทบาทของผู้เล่น") : t.tapReveal}
        </p>

        {!isHost && (
          <div className="role-card-container w-64 h-96 cursor-pointer mb-8" onClick={handleRevealRole}>
            <div className={`role-card-inner relative w-full h-full ${showRoleCard ? "flipped" : ""}`}>
              <div className="role-card-front absolute inset-0 rounded-2xl flex flex-col items-center justify-center" style={{ background: "linear-gradient(135deg, #1a0a2e, #0d0a1a)", border: "2px solid rgba(212,175,55,0.4)" }}>
                <div className="text-6xl mb-4">🕯️</div>
                <div className="text-sm tracking-widest" style={{ color: "#d4af37", fontFamily: "var(--font-gothic)" }}>SHADOWS OVER</div>
                <div className="text-sm tracking-widest" style={{ color: "#d4af37", fontFamily: "var(--font-gothic)" }}>THORNWICK</div>
                <div className="mt-6 text-xs" style={{ color: "#5a4a3a" }}>Tap to reveal</div>
              </div>
              <div className="role-card-back absolute inset-0 rounded-2xl overflow-hidden flex flex-col" style={{ background: "linear-gradient(135deg, #2d1b4e, #0d0a1a)", border: `2px solid ${revealedRole?.team === "evil" ? "rgba(139,26,26,0.8)" : "rgba(212,175,55,0.8)"}` }}>
                <div className="flex-1 relative overflow-hidden" style={{ background: "rgba(0,0,0,0.3)" }}>
                  {revealedRole?.image && (
                    <Image src={revealedRole.image} alt={revealedRole.name[lang]} fill className="object-cover object-top" />
                  )}
                  <div className="absolute inset-0" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.6), transparent 55%)" }} />
                </div>
                <div className="p-4 text-center">
                  <div className="text-xl font-bold mb-1" style={{ fontFamily: "var(--font-gothic)", color: "#e8d5b0" }}>{revealedRole?.name[lang]}</div>
                  <div className="text-xs mb-3 px-1 leading-relaxed font-medium" style={{ color: "#d4af37" }}>{revealedRole?.ability[lang]}</div>
                  <div className="text-xs px-3 py-1 rounded-full inline-block font-medium" style={{ background: revealedRole?.team === "evil" ? "rgba(139,26,26,0.4)" : "rgba(74,111,165,0.4)", color: revealedRole?.team === "evil" ? "#ff8080" : "#80b0ff" }}>
                    {revealedRole?.team === "evil" ? t.evil : t.good}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {showRoleCard && !isHost && (
          <p className="text-sm italic" style={{ color: "#5a4a3a" }}>{t.waitingForHost}</p>
        )}

        {isHost && (
          <div className="w-full max-w-md">
            <div className="space-y-1 max-h-64 overflow-y-auto mb-6">
              {players.filter((p) => !p.isStoryteller).map((p) => {
                const role = getRoleById(roleAssignments[p.id]);
                return (
                  <div key={p.id} className="text-sm flex justify-between gap-4 px-4 py-2 rounded-lg" style={{ background: "rgba(45,27,78,0.4)" }}>
                    <span style={{ color: "#e8d5b0" }}>{p.name}</span>
                    <span style={{ color: role?.team === "evil" ? "#ff8080" : "#80b0ff" }}>{role?.name[lang]}</span>
                  </div>
                );
              })}
            </div>
            {(() => {
              const foolEntry = Object.entries(roleAssignments).find(([, rid]) => rid === "fool");
              if (!foolEntry) return null;
              const [foolPid] = foolEntry;
              const foolPlayer = players.find(p => p.id === foolPid);
              const bluffId = gs?.bluff_assignments?.[foolPid];
              const bluffRole = bluffId ? getRoleById(bluffId) : null;
              return (
                <div className="mb-4 rounded-xl p-4" style={{ background: "rgba(120,80,200,0.15)", border: "1px solid rgba(120,80,200,0.4)" }}>
                  <div className="text-xs tracking-widest uppercase mb-2" style={{ color: "#c0a0ff", fontFamily: "var(--font-gothic)" }}>
                    {lang === "en" ? "Fool's Bluff Role" : "บทบาทปลอมของ Fool"}
                  </div>
                  <div className="text-sm mb-2" style={{ color: "#a08060" }}>
                    {foolPlayer?.name} {lang === "en" ? "will see:" : "จะเห็น:"}
                    <span className="ml-1 font-medium" style={{ color: "#80b0ff" }}>{bluffRole?.name[lang] ?? "—"}</span>
                  </div>
                  <select
                    value={bluffId ?? ""}
                    onChange={async (e) => {
                      if (!gs || !e.target.value) return;
                      await supabase.from("sessions").update({
                        game_state: { ...gs, bluff_assignments: { ...(gs.bluff_assignments ?? {}), [foolPid]: e.target.value } },
                      }).eq("code", code);
                    }}
                    className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                    style={{ background: "rgba(13,10,26,0.8)", border: "1px solid rgba(120,80,200,0.4)", color: "#e8d5b0" }}
                  >
                    <option value="">{lang === "en" ? "— pick a bluff —" : "— เลือกบทบาทปลอม —"}</option>
                    {getRolesByType("townsfolk").map(r => (
                      <option key={r.id} value={r.id}>{r.name[lang]}</option>
                    ))}
                  </select>
                </div>
              );
            })()}
            <button onClick={handleBeginDay} className="btn-gothic-primary w-full py-4 rounded-xl font-bold" style={{ fontFamily: "var(--font-gothic)" }}>
              ☀️ {t.beginDay}
            </button>
          </div>
        )}
      </div>
    );
  }

  // ---------- DAY ----------
  if (phase === "day") {
    return (
      <div className="min-h-screen" style={{ background: "linear-gradient(180deg, #1a0f00 0%, #0d0a1a 100%)" }}>
        <div className="sticky top-0 z-20" style={{ background: "rgba(26,15,0,0.95)", backdropFilter: "blur(8px)", borderBottom: "1px solid rgba(212,175,55,0.1)" }}>
          <div className="max-w-2xl mx-auto px-6 py-4 flex items-center justify-between">
            <div>
              <div className="text-xs tracking-widest mb-0.5" style={{ color: "#d4af37", fontFamily: "var(--font-gothic)" }}>
                SHADOWS OVER THORNWICK
              </div>
              <h2 className="text-2xl font-black" style={{ fontFamily: "var(--font-gothic)", color: "#e8d5b0" }}>☀️ {t.day} {day}</h2>
            </div>
            <div className="flex items-center gap-2">
              {myRole && !isHost && (
                <button onClick={() => setShowMyRole(true)} className="btn-gothic-secondary px-3 py-1.5 rounded-lg text-xs flex-shrink-0">
                  🎴 {lang === "en" ? "My Role" : "บทบาท"}
                </button>
              )}
              <button onClick={toggleMute} className="btn-gothic-secondary px-3 py-1.5 rounded-lg flex items-center justify-center flex-shrink-0" style={{ opacity: muted ? 0.5 : 1 }}>{muted ? <AudioOffIcon /> : <AudioOnIcon />}</button>
              <button onClick={() => setLang(lang === "en" ? "th" : "en")} className="btn-gothic-secondary px-3 py-1.5 rounded-lg text-xs flex-shrink-0"><span style={{color: lang==="en" ? "#d4af37" : "#5a4a3a"}}>EN</span><span style={{color:"#3a2a1a"}}> / </span><span style={{color: lang==="th" ? "#d4af37" : "#5a4a3a"}}>TH</span></button>
            </div>
          </div>
        </div>
        <div className="max-w-2xl mx-auto px-6 py-6">
          <p className="mb-6 italic" style={{ color: "#7a6a5a" }}>{t.discuss}</p>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
            {players.filter((p) => !p.isStoryteller).map((p) => {
              const role = isHost ? getRoleById(roleAssignments[p.id]) : null;
              const isMe = p.id === myPlayerId;
              return (
                <div key={p.id} className={`gothic-card rounded-xl p-3 text-center ${!p.isAlive ? "opacity-40" : ""} ${isMe ? "ring-1 ring-yellow-600/50" : ""}`}>
                  <div className="w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-2" style={{ background: !p.isAlive ? "rgba(90,74,58,0.3)" : role?.team === "evil" ? "rgba(139,26,26,0.3)" : "rgba(74,111,165,0.3)", color: "#e8d5b0" }}>
                    {!p.isAlive ? "💀" : p.name[0].toUpperCase()}
                  </div>
                  <div className="text-sm font-medium" style={{ color: p.isAlive ? "#e8d5b0" : "#5a4a3a" }}>{p.name}{isMe ? " ★" : ""}</div>
                  {isHost && role && <div className="text-xs mt-1" style={{ color: role.team === "evil" ? "#ff8080" : "#80b0ff" }}>{role.name[lang]}</div>}
                  <div className="text-xs mt-1" style={{ color: p.isAlive ? "#5a9a5a" : "#9a5a5a" }}>{p.isAlive ? t.alive : t.dead}</div>
                  {isHost && (
                    <button onClick={() => togglePlayerDead(p.id)} className="text-xs mt-2 px-2 py-1 rounded" style={{ background: "rgba(139,26,26,0.2)", color: "#c08080" }}>
                      {p.isAlive ? t.markDead : t.markAlive}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {isHost ? (
            <div className="space-y-3">
              <button onClick={endDay} className="btn-gothic-primary w-full py-4 rounded-xl font-bold" style={{ fontFamily: "var(--font-gothic)" }}>
                🌙 {t.endDay}
              </button>
              <div className="gothic-card rounded-xl p-4">
                <p className="text-xs tracking-widest uppercase text-center mb-3" style={{ color: "#5a4a3a", fontFamily: "var(--font-gothic)" }}>{t.declareWinner}</p>
                <div className="flex gap-2">
                  <button onClick={() => declareWinner("good")} className="flex-1 py-2 rounded-lg font-semibold text-sm transition-all hover:opacity-90" style={{ background: "rgba(74,111,165,0.3)", border: "1px solid rgba(74,111,165,0.5)", color: "#80b0ff" }}>
                    ☀️ {t.goodWins}
                  </button>
                  <button onClick={() => declareWinner("evil")} className="flex-1 py-2 rounded-lg font-semibold text-sm transition-all hover:opacity-90" style={{ background: "rgba(139,26,26,0.3)", border: "1px solid rgba(139,26,26,0.5)", color: "#ff8080" }}>
                    😈 {t.evilWins}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <p className="text-center text-sm italic" style={{ color: "#5a4a3a" }}>{t.waitingForHost}</p>
          )}
        </div>
        {showMyRole && myRole && <MyRoleOverlay role={myRole} lang={lang} onClose={() => setShowMyRole(false)} />}
        <ChatPanel myPlayerId={myPlayerId} isHost={isHost} players={players} allMessages={messages} chatOpen={chatOpen} setChatOpen={setChatOpen} chatTarget={chatTarget} setChatTarget={setChatTarget} chatInput={chatInput} setChatInput={setChatInput} unreadCount={unreadCount} setUnreadCount={setUnreadCount} visibleMessages={visibleMessages} messagesEndRef={messagesEndRef} lang={lang} onSend={sendMessage} />
      </div>
    );
  }

  // ---------- NIGHT ----------
  if (phase === "night") {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: "linear-gradient(180deg, #000510 0%, #0d0a1a 100%)" }}>
        <div className="sticky top-0 z-20" style={{ background: "rgba(0,5,16,0.95)", backdropFilter: "blur(8px)", borderBottom: "1px solid rgba(212,175,55,0.1)" }}>
          <div className="max-w-2xl mx-auto px-6 py-4 flex items-center justify-between">
            <h2 className="text-2xl font-black" style={{ fontFamily: "var(--font-gothic)", color: "#e8d5b0" }}>🌙 {t.night} {day}</h2>
            <div className="flex items-center gap-2">
              {myRole && !isHost && (
                <button onClick={() => setShowMyRole(true)} className="btn-gothic-secondary px-3 py-1.5 rounded-lg text-xs flex-shrink-0">
                  🎴 {lang === "en" ? "My Role" : "บทบาท"}
                </button>
              )}
              <button onClick={toggleMute} className="btn-gothic-secondary px-3 py-1.5 rounded-lg flex items-center justify-center flex-shrink-0" style={{ opacity: muted ? 0.5 : 1 }}>{muted ? <AudioOffIcon /> : <AudioOnIcon />}</button>
              <button onClick={() => setLang(lang === "en" ? "th" : "en")} className="btn-gothic-secondary px-3 py-1.5 rounded-lg text-xs flex-shrink-0"><span style={{color: lang==="en" ? "#d4af37" : "#5a4a3a"}}>EN</span><span style={{color:"#3a2a1a"}}> / </span><span style={{color: lang==="th" ? "#d4af37" : "#5a4a3a"}}>TH</span></button>
            </div>
          </div>
        </div>
        <div className="max-w-2xl mx-auto px-6 py-6 w-full">
          <div className="text-center py-8 mb-6 gothic-card rounded-2xl">
            <div className="text-5xl mb-3">🌕</div>
            <p className="text-lg italic" style={{ color: "#7a6a5a" }}>
              {lang === "en" ? "The village sleeps..." : "หมู่บ้านหลับใหล..."}
            </p>
          </div>

          {isHost ? (
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
              {nightIndex < nightWakeOrder.length - 1 ? (
                <button onClick={nextNightRole} className="btn-gothic-primary w-full py-3 rounded-xl font-semibold">
                  Next → {nightWakeOrder[nightIndex + 1]?.name[lang]}
                </button>
              ) : (
                <button onClick={endNight} className="btn-gothic-primary w-full py-4 rounded-xl font-bold" style={{ fontFamily: "var(--font-gothic)" }}>
                  ☀️ {t.endNight}
                </button>
              )}
              <div className="gothic-card rounded-xl p-4 mt-3">
                <p className="text-xs tracking-widest uppercase text-center mb-3" style={{ color: "#5a4a3a", fontFamily: "var(--font-gothic)" }}>{t.declareWinner}</p>
                <div className="flex gap-2">
                  <button onClick={() => declareWinner("good")} className="flex-1 py-2 rounded-lg font-semibold text-sm transition-all hover:opacity-90" style={{ background: "rgba(74,111,165,0.3)", border: "1px solid rgba(74,111,165,0.5)", color: "#80b0ff" }}>
                    ☀️ {t.goodWins}
                  </button>
                  <button onClick={() => declareWinner("evil")} className="flex-1 py-2 rounded-lg font-semibold text-sm transition-all hover:opacity-90" style={{ background: "rgba(139,26,26,0.3)", border: "1px solid rgba(139,26,26,0.5)", color: "#ff8080" }}>
                    😈 {t.evilWins}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <p className="text-center text-sm italic" style={{ color: "#5a4a3a" }}>{t.waitingForHost}</p>
          )}
        </div>
        {showMyRole && myRole && <MyRoleOverlay role={myRole} lang={lang} onClose={() => setShowMyRole(false)} />}
        <ChatPanel myPlayerId={myPlayerId} isHost={isHost} players={players} allMessages={messages} chatOpen={chatOpen} setChatOpen={setChatOpen} chatTarget={chatTarget} setChatTarget={setChatTarget} chatInput={chatInput} setChatInput={setChatInput} unreadCount={unreadCount} setUnreadCount={setUnreadCount} visibleMessages={visibleMessages} messagesEndRef={messagesEndRef} lang={lang} onSend={sendMessage} />
      </div>
    );
  }

  // ---------- ENDED ----------
  if (phase === "ended") {
    const winner = gs?.winner;
    const isGood = winner === "good";
    const nonStorytellers = players.filter((p) => !p.isStoryteller);

    return (
      <div
        className="min-h-screen flex flex-col items-center px-6 pt-10 pb-16 relative overflow-y-auto"
        style={{ background: isGood
          ? "radial-gradient(ellipse at top, #0a1a2e 0%, #0d0a1a 70%)"
          : "radial-gradient(ellipse at top, #2e0a0a 0%, #0d0a1a 70%)" }}
      >
        {/* Ambient glow */}
        <div className="absolute inset-0 pointer-events-none" style={{ background: isGood
          ? "radial-gradient(ellipse at 50% 30%, rgba(74,111,165,0.15) 0%, transparent 60%)"
          : "radial-gradient(ellipse at 50% 30%, rgba(139,26,26,0.2) 0%, transparent 60%)" }}
        />

        <div className="relative z-10 w-full max-w-lg">
          {/* Lang toggle */}
          <div className="flex justify-end mb-6">
            <button onClick={() => setLang(lang === "en" ? "th" : "en")} className="btn-gothic-secondary px-3 py-1.5 rounded-lg text-xs">
              <span style={{color: lang==="en" ? "#d4af37" : "#5a4a3a"}}>EN</span><span style={{color:"#3a2a1a"}}> / </span><span style={{color: lang==="th" ? "#d4af37" : "#5a4a3a"}}>TH</span>
            </button>
          </div>

          {/* Victory banner */}
          <div className="text-center mb-10">
            <div className="text-7xl mb-4">{isGood ? "☀️" : "😈"}</div>
            <h1
              className="text-4xl md:text-5xl font-black mb-3 leading-tight"
              style={{ fontFamily: "var(--font-gothic)", color: isGood ? "#80b0ff" : "#ff6060" }}
            >
              {isGood ? t.victoryGood : t.victoryEvil}
            </h1>
            <p style={{ color: "#7a6a5a" }}>{isGood ? t.victoryGoodSub : t.victoryEvilSub}</p>
          </div>

          {/* Role reveal — everyone sees all roles */}
          <div className="gothic-card rounded-2xl p-6 mb-8">
            <p className="text-xs tracking-widest uppercase mb-4" style={{ color: "#d4af37", fontFamily: "var(--font-gothic)" }}>
              {t.rolesRevealed}
            </p>
            <div className="space-y-2">
              {nonStorytellers
                .sort((a, b) => {
                  const ra = getRoleById(roleAssignments[a.id]);
                  const rb = getRoleById(roleAssignments[b.id]);
                  if (ra?.team === rb?.team) return 0;
                  return ra?.team === "evil" ? 1 : -1;
                })
                .map((p) => {
                  const role = getRoleById(roleAssignments[p.id]);
                  const isEvil = role?.team === "evil";
                  return (
                    <div
                      key={p.id}
                      className="flex items-center justify-between px-4 py-3 rounded-xl"
                      style={{ background: isEvil ? "rgba(139,26,26,0.2)" : "rgba(74,111,165,0.15)" }}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold"
                          style={{ background: isEvil ? "rgba(139,26,26,0.4)" : "rgba(74,111,165,0.3)", color: "#e8d5b0" }}
                        >
                          {!p.isAlive ? "💀" : p.name[0].toUpperCase()}
                        </div>
                        <div>
                          <span style={{ color: p.isAlive ? "#e8d5b0" : "#5a4a3a" }}>{p.name}</span>
                          {!p.isAlive && <span className="text-xs ml-2" style={{ color: "#5a4a3a" }}>({t.dead})</span>}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium" style={{ color: isEvil ? "#ff8080" : "#80b0ff", fontFamily: "var(--font-gothic)" }}>
                          {role?.name[lang] ?? "—"}
                        </div>
                        <div className="text-xs" style={{ color: "#5a4a3a" }}>{role?.type}</div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>

          <Link href="/" className="btn-gothic-primary w-full py-4 rounded-xl font-bold text-lg text-center no-underline block" style={{ fontFamily: "var(--font-gothic)" }}>
            ⚔ {t.playAgain}
          </Link>
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

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
import type { Player, GamePhase, Role } from "@/types/game";
import { Suspense } from "react";

// ---------- Icons ----------
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
              <button onClick={() => setChatTarget(null)} className="text-sm" style={{ color: "#d4af37" }}>←</button>
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

  // Derived
  const myPlayer = players.find((p) => p.id === myPlayerId) ?? null;
  const isHost = myPlayer?.isStoryteller ?? isHostParam;
  const phase = dbSession?.phase ?? "lobby";
  const gs = dbSession?.game_state;
  const day = gs?.day_number ?? 1;
  const nightIndex = gs?.night_index ?? 0;
  const roleAssignments = gs?.role_assignments ?? {};
  const joined = myPlayer !== null;
  const storytellerId = players.find(p => p.isStoryteller)?.id ?? null;
  const effectiveChatTarget = isHost ? chatTarget : storytellerId;
  const visibleMessages = myPlayerId && effectiveChatTarget
    ? messages.filter(m =>
        (m.from_id === myPlayerId && m.to_id === effectiveChatTarget) ||
        (m.from_id === effectiveChatTarget && m.to_id === myPlayerId)
      )
    : [];

  const nightWakeOrder = FIRST_SHADOWS_ROLES
    .filter((r) => r.firstNight !== undefined || r.otherNights !== undefined)
    .sort((a, b) => {
      const aN = day === 1 ? (a.firstNight ?? 99) : (a.otherNights ?? 99);
      const bN = day === 1 ? (b.firstNight ?? 99) : (b.otherNights ?? 99);
      return aN - bN;
    });

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
      waitingForHost: "Waiting for the Storyteller...",
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
      waitingForHost: "รอ Storyteller...",
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
    await supabase.from("sessions").update({
      phase: "role-reveal",
      game_state: { ...gs, role_assignments: assignments },
    }).eq("code", code);
  };

  const handleRevealRole = () => {
    if (!myPlayerId) return;
    const roleId = roleAssignments[myPlayerId];
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
          <p style={{ color: "#7a6a5a" }}>Entering Thornwick...</p>
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
                  {p.isStoryteller && <span className="text-xs px-2 py-0.5 rounded-full ml-auto" style={{ background: "rgba(212,175,55,0.15)", color: "#d4af37" }}>Storyteller</span>}
                  {p.id === myPlayerId && !p.isStoryteller && <span className="text-xs ml-auto" style={{ color: "#5a4a3a" }}>you</span>}
                </div>
              ))}
            </div>
          </div>

          {isHost && (() => {
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
          <div style={{ color: "#5a4a3a" }}>{lang === "en" ? "Shadows Over Thornwick" : "เงามืดเหนือธอร์นวิค"}</div>
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
                  <div className="text-xs mb-2 px-1 leading-relaxed font-medium" style={{ color: "#d4af37" }}>{revealedRole?.ability[lang]}</div>
                  <div className="text-xs mb-3 px-1 leading-relaxed" style={{ color: "#7a6a5a" }}>{revealedRole?.description[lang]}</div>
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
        <div className="max-w-2xl mx-auto px-6 py-8">
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="text-xs tracking-widest mb-1" style={{ color: "#d4af37", fontFamily: "var(--font-gothic)" }}>
                {lang === "en" ? "SHADOWS OVER THORNWICK" : "เงามืดเหนือธอร์นวิค"}
              </div>
              <h2 className="text-2xl font-black" style={{ fontFamily: "var(--font-gothic)", color: "#e8d5b0" }}>☀️ {t.day} {day}</h2>
            </div>
            <button onClick={() => setLang(lang === "en" ? "th" : "en")} className="btn-gothic-secondary px-3 py-1.5 rounded-lg text-xs"><span style={{color: lang==="en" ? "#d4af37" : "#5a4a3a"}}>EN</span><span style={{color:"#3a2a1a"}}> / </span><span style={{color: lang==="th" ? "#d4af37" : "#5a4a3a"}}>TH</span></button>
          </div>

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
        <ChatPanel myPlayerId={myPlayerId} isHost={isHost} players={players} allMessages={messages} chatOpen={chatOpen} setChatOpen={setChatOpen} chatTarget={chatTarget} setChatTarget={setChatTarget} chatInput={chatInput} setChatInput={setChatInput} unreadCount={unreadCount} setUnreadCount={setUnreadCount} visibleMessages={visibleMessages} messagesEndRef={messagesEndRef} lang={lang} onSend={sendMessage} />
      </div>
    );
  }

  // ---------- NIGHT ----------
  if (phase === "night") {
    return (
      <div className="min-h-screen flex flex-col" style={{ background: "linear-gradient(180deg, #000510 0%, #0d0a1a 100%)" }}>
        <div className="max-w-2xl mx-auto px-6 py-8 w-full">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-black" style={{ fontFamily: "var(--font-gothic)", color: "#e8d5b0" }}>🌙 {t.night} {day}</h2>
            <button onClick={() => setLang(lang === "en" ? "th" : "en")} className="btn-gothic-secondary px-3 py-1.5 rounded-lg text-xs"><span style={{color: lang==="en" ? "#d4af37" : "#5a4a3a"}}>EN</span><span style={{color:"#3a2a1a"}}> / </span><span style={{color: lang==="th" ? "#d4af37" : "#5a4a3a"}}>TH</span></button>
          </div>

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

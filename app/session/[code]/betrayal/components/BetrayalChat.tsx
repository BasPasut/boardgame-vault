"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "@/lib/supabase";
import type { BetrayalGameState, PlayerGameState } from "@/lib/games/betrayal/types";
import type { Player } from "@/types/game";
import { playerColor } from "./MansionMap";

interface BetrayalMessage {
  id: string;
  session_code: string;
  from_id: string;
  to_id: string;
  body: string;
  created_at: string;
}

interface BetrayalChatProps {
  code: string;
  myPlayerId: string | null;
  players: Player[];
  gs: BetrayalGameState;
  myState: PlayerGameState | null;
}

export function BetrayalChat({ code, myPlayerId, players, gs, myState }: BetrayalChatProps) {
  const [open, setOpen]   = useState(false);
  const [msgs, setMsgs]   = useState<BetrayalMessage[]>([]);
  const [input, setInput] = useState("");
  const [unread, setUnread] = useState(0);
  const endRef = useRef<HTMLDivElement>(null);

  const channel = gs.phase === "haunt"
    ? (myState?.is_traitor ? "betrayal:traitor" : "betrayal:heroes")
    : "betrayal:all";

  const visible = msgs.filter((m) => {
    if (gs.phase !== "haunt") return m.to_id === "betrayal:all";
    return myState?.is_traitor
      ? m.to_id === "betrayal:traitor"
      : m.to_id === "betrayal:heroes";
  });

  useEffect(() => {
    supabase
      .from("messages")
      .select("*")
      .eq("session_code", code)
      .in("to_id", ["betrayal:all", "betrayal:heroes", "betrayal:traitor"])
      .order("created_at")
      .then(({ data }) => { if (data) setMsgs(data as BetrayalMessage[]); });

    const sub = supabase
      .channel(`betrayal-chat-${code}`)
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `session_code=eq.${code}` },
        (payload) => {
          const msg = payload.new as BetrayalMessage;
          if (!["betrayal:all", "betrayal:heroes", "betrayal:traitor"].includes(msg.to_id)) return;
          setMsgs((prev) => [...prev, msg]);
          if (msg.from_id !== myPlayerId) setUnread((n) => n + 1);
        })
      .subscribe();

    return () => { supabase.removeChannel(sub); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  useEffect(() => {
    if (open) {
      setUnread(0);
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 60);
    }
  }, [open, visible.length]);

  const send = async () => {
    if (!input.trim() || !myPlayerId) return;
    const body = input.trim();
    setInput("");
    await supabase.from("messages").insert({ session_code: code, from_id: myPlayerId, to_id: channel, body });
  };

  const isHaunt   = gs.phase === "haunt";
  const isTraitor = !!myState?.is_traitor;
  const accent    = isHaunt ? (isTraitor ? "#ef4444" : "#22c55e") : "#d4af37";
  const panelBg   = isHaunt ? (isTraitor ? "rgba(30,6,6,0.97)" : "rgba(6,20,10,0.97)") : "rgba(8,5,12,0.97)";
  const label     = isHaunt ? (isTraitor ? "💀 Traitor's Den" : "⚔ Heroes' Council") : "🏚 Manor Chat";
  const badge     = isHaunt ? (isTraitor ? "Private" : "Heroes only") : "All players";
  const placeholder = isHaunt
    ? (isTraitor ? "Scheme in secret…" : "Coordinate with your allies…")
    : "Speak to your companions…";
  const empty = isHaunt
    ? (isTraitor ? "Plan your betrayal…" : "Rally the heroes…")
    : "The mansion is silent…";

  const senderName = (id: string) => players.find((p) => p.id === id)?.name ?? "?";
  const senderIdx  = (id: string) => players.findIndex((p) => p.id === id);

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => { setOpen(true); setUnread(0); }}
          className="fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full flex items-center justify-center shadow-xl transition-transform hover:scale-105"
          style={{ background: panelBg, border: `1.5px solid ${accent}44`, backdropFilter: "blur(10px)" }}
          title={label}
        >
          <span style={{ fontSize: 22 }}>
            {isHaunt ? (isTraitor ? "💀" : "⚔") : "💬"}
          </span>
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full text-xs flex items-center justify-center font-bold"
              style={{ background: "#8b1a1a", color: "#e8d5b0" }}>
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      )}

      {/* Chat panel */}
      {open && (
        <div
          className="fixed bottom-0 right-0 z-50 sm:bottom-6 sm:right-6 w-full sm:w-80 flex flex-col rounded-t-2xl sm:rounded-2xl overflow-hidden shadow-2xl"
          style={{ height: 400, background: panelBg, border: `1px solid ${accent}28`, backdropFilter: "blur(14px)" }}
        >
          <div className="flex items-center gap-2 px-4 py-3 flex-shrink-0"
            style={{ borderBottom: `1px solid ${accent}18` }}>
            <span className="flex-1 text-sm font-bold truncate"
              style={{ color: accent, fontFamily: "var(--font-gothic)" }}>
              {label}
            </span>
            <span className="flex-shrink-0 text-xs px-2 py-0.5 rounded-full"
              style={{ background: `${accent}14`, border: `1px solid ${accent}28`, color: accent }}>
              {badge}
            </span>
            <button onClick={() => setOpen(false)} className="text-sm ml-1 leading-none flex-shrink-0"
              style={{ color: "#5a4a3a" }}>✕</button>
          </div>

          {isHaunt && (
            <div className="flex-shrink-0 px-3 py-1.5 text-center text-xs"
              style={{ background: `${accent}08`, borderBottom: `1px solid ${accent}14`, color: `${accent}99` }}>
              {isTraitor
                ? "⚔ The haunt has begun. Your plans are hidden from the heroes."
                : "🕯 The haunt has begun. Heroes only — the traitor cannot see this."}
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {visible.length === 0 && (
              <p className="text-center text-xs mt-10" style={{ color: "#3a2a1a", fontFamily: "var(--font-gothic)" }}>
                {empty}
              </p>
            )}
            {visible.map((m) => {
              const mine = m.from_id === myPlayerId;
              const idx  = senderIdx(m.from_id);
              return (
                <div key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
                  {!mine && (
                    <span className="text-xs mb-0.5 px-1 font-medium" style={{ color: playerColor(idx) }}>
                      {senderName(m.from_id)}
                    </span>
                  )}
                  <div className="max-w-[82%] px-3 py-2 text-sm leading-snug"
                    style={{
                      background: mine ? `${accent}1c` : "rgba(255,255,255,0.04)",
                      color: "#e8d5b0",
                      borderRadius: mine ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                      border: mine ? `1px solid ${accent}2e` : "1px solid rgba(255,255,255,0.06)",
                    }}>
                    {m.body}
                  </div>
                </div>
              );
            })}
            <div ref={endRef} />
          </div>

          <div className="flex-shrink-0 p-3" style={{ borderTop: `1px solid ${accent}14` }}>
            <div className="flex gap-2">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
                placeholder={placeholder}
                className="flex-1 px-3 py-2 rounded-xl text-sm focus:outline-none"
                style={{ background: "rgba(13,10,26,0.8)", border: `1px solid ${accent}22`, color: "#e8d5b0" }}
              />
              <button onClick={send} disabled={!input.trim()}
                className="px-3 py-2 rounded-xl font-bold disabled:opacity-30 transition-opacity"
                style={{ background: `${accent}1c`, color: accent }}>
                →
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

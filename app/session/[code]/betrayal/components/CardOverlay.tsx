"use client";

import { useState } from "react";
import NextImage from "next/image";
import { getCard } from "@/lib/games/betrayal/data/cards";

const CARD_BACK: Record<string, string> = {
  item:  "/images/games/betrayal/cards/card-back-item.png",
  omen:  "/images/games/betrayal/cards/card-back-omen.png",
  event: "/images/games/betrayal/cards/card-back-event.png",
};

const CONSUMABLE_IDS = new Set(["healing-salve", "smelling-salts"]);

interface CardOverlayProps {
  cardId: string;
  onDismiss: () => void;
  lang?: "en" | "th";
  startRevealed?: boolean;
}

export function CardOverlay({ cardId, onDismiss, lang = "en", startRevealed = false }: CardOverlayProps) {
  const card = getCard(cardId);
  const [imgErr, setImgErr]     = useState(false);
  const [backErr, setBackErr]   = useState(false);
  const [revealed, setRevealed] = useState(startRevealed);

  if (!card) return null;

  const typeColor = { item: "#f59e0b", omen: "#ef4444", event: "#6366f1" }[card.type] ?? "#d4af37";
  const typeLabel = lang === "th"
    ? ({ item: "ไอเทม", omen: "ลางร้าย", event: "เหตุการณ์" }[card.type] ?? card.type)
    : ({ item: "Item",  omen: "Omen",    event: "Event" }[card.type]  ?? card.type);
  const revealLabel  = lang === "th" ? "เปิดไพ่" : "Reveal Card";
  const isConsumable = CONSUMABLE_IDS.has(card.id);
  const dismissLabel = isConsumable
    ? (lang === "th" ? "ใช้งาน" : "Use")
    : (lang === "th" ? "รับทราบ" : "Understood");
  const displayDescription = (lang === "th" && card.descriptionTh) ? card.descriptionTh : card.description;
  const displayName        = (lang === "th" && card.nameTh)        ? card.nameTh        : card.name;
  const typeEmoji = { item: "📦", omen: "☠️", event: "👁️" }[card.type] ?? "🃏";

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center p-4"
      style={{ background: "rgba(0,0,0,0.80)" }}
      onClick={revealed ? onDismiss : undefined}>

      <div className="max-w-sm w-full rounded-2xl overflow-hidden"
        style={{ background: "rgba(8,5,12,0.98)", border: `1px solid ${typeColor}60` }}
        onClick={(e) => e.stopPropagation()}>

        {/* Card image / back */}
        <div className="relative h-52 w-full flex items-center justify-center"
          style={{ background: "rgba(13,10,26,0.9)" }}>
          {/* Front art */}
          {card.image && !imgErr && revealed && (
            <NextImage src={card.image} alt={card.name}
              fill priority
              sizes="(max-width: 640px) 100vw, 384px"
              className="object-contain"
              style={{ opacity: 0.85 }}
              onError={() => setImgErr(true)} />
          )}
          {/* Card back (shown before reveal) */}
          {!revealed && !backErr && (
            <NextImage src={CARD_BACK[card.type]}
              alt="card back"
              fill priority
              sizes="(max-width: 640px) 100vw, 384px"
              className="object-contain"
              onError={() => setBackErr(true)} />
          )}
          {/* Fallback if no back image */}
          {!revealed && backErr && (
            <div className="flex flex-col items-center gap-2">
              <span className="text-5xl opacity-40">{typeEmoji}</span>
              <p className="text-xs tracking-widest uppercase" style={{ color: `${typeColor}80` }}>
                {typeLabel}
              </p>
            </div>
          )}
          {/* Gradient overlay on front */}
          {revealed && (
            <div className="absolute inset-0"
              style={{ background: "linear-gradient(to top, rgba(8,5,12,0.85) 0%, transparent 55%)" }} />
          )}
          {/* Type badge */}
          <div className="absolute top-3 left-3 px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-widest"
            style={{ background: `${typeColor}22`, border: `1px solid ${typeColor}55`, color: typeColor }}>
            {typeLabel}
          </div>
        </div>

        {/* Content */}
        <div className="p-5 space-y-3">
          {revealed ? (
            <>
              <h2 className="text-xl font-black" style={{ color: "#e8d5b0", fontFamily: "var(--font-gothic)" }}>
                {displayName}
              </h2>
              <p className="text-sm leading-relaxed" style={{ color: "#c8b89a" }}>{displayDescription}</p>
              {card.flavour && (
                <p className="text-xs italic border-t pt-3"
                  style={{ color: "#5a4a3a", borderColor: "rgba(212,175,55,0.1)" }}>
                  &ldquo;{card.flavour}&rdquo;
                </p>
              )}
              <button onClick={onDismiss} className="w-full py-2.5 rounded-xl text-sm font-bold mt-1"
                style={{ background: `${typeColor}22`, border: `1px solid ${typeColor}55`, color: typeColor }}>
                {dismissLabel}
              </button>
            </>
          ) : (
            <button onClick={() => setRevealed(true)}
              className="w-full py-3 rounded-xl text-sm font-bold"
              style={{ background: `${typeColor}18`, border: `1px solid ${typeColor}40`, color: typeColor, fontFamily: "var(--font-gothic)" }}>
              {revealLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

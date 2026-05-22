"use client";

import { useState } from "react";
import NextImage from "next/image";

const HAUNT_SPLASH_TRAITOR = "/images/games/betrayal/haunt-splash-traitor.png";
const HAUNT_SPLASH_HEROES  = "/images/games/betrayal/haunt-splash-heroes.png";

interface HauntRevealProps {
  hauntName: string;
  isTraitor: boolean;
  objective: string;
  onDismiss: () => void;
}

export function HauntReveal({ hauntName, isTraitor, objective, onDismiss }: HauntRevealProps) {
  const [splashErr, setSplashErr] = useState(false);
  const splashSrc    = isTraitor ? HAUNT_SPLASH_TRAITOR : HAUNT_SPLASH_HEROES;
  const accent       = isTraitor ? "#ef4444" : "#d4af37";
  const accentBg     = isTraitor ? "rgba(239,68,68,0.12)" : "rgba(212,175,55,0.10)";
  const accentBorder = isTraitor ? "rgba(239,68,68,0.35)" : "rgba(212,175,55,0.25)";

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: "rgba(0,0,0,0.94)" }}>
      {/* Full-bleed splash image behind content */}
      {!splashErr && (
        <NextImage
          src={splashSrc}
          alt=""
          aria-hidden
          fill
          priority
          sizes="100vw"
          className="object-cover pointer-events-none"
          style={{ opacity: 0.18, objectPosition: "center top" }}
          onError={() => setSplashErr(true)}
        />
      )}
      {/* Radial vignette over splash */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: `radial-gradient(ellipse at 50% 40%, transparent 20%, rgba(0,0,0,0.85) 75%)` }} />

      <div className="relative z-10 max-w-md w-full mx-4 mb-8 sm:mb-0 text-center space-y-5 rounded-2xl p-8"
        style={{ background: "rgba(8,5,12,0.82)", border: `1px solid ${accentBorder}`, backdropFilter: "blur(10px)" }}>
        {splashErr && <div style={{ fontSize: 64 }}>{isTraitor ? "🗡️" : "🕯️"}</div>}

        <div>
          <p className="text-xs tracking-widest uppercase mb-1"
            style={{ color: accentBorder, fontFamily: "var(--font-gothic)" }}>
            {isTraitor ? "The Darkness Claims You" : "Betrayal at House on the Hill"}
          </p>
          <h1 className="text-3xl font-black" style={{ color: accent, fontFamily: "var(--font-gothic)" }}>
            {isTraitor ? "You are the Traitor" : "The Haunt Begins"}
          </h1>
          <h2 className="text-lg mt-1" style={{ color: "#e8d5b0", fontFamily: "var(--font-gothic)" }}>{hauntName}</h2>
        </div>

        <div className="rounded-xl p-4 text-left" style={{ background: accentBg, border: `1px solid ${accentBorder}` }}>
          <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: accent }}>
            {isTraitor ? "Your Objective" : "Heroes' Objective"}
          </p>
          <p className="text-sm leading-relaxed" style={{ color: "#c8b89a" }}>{objective}</p>
        </div>

        <button onClick={onDismiss} className="btn-gothic-primary w-full py-3 rounded-xl font-bold"
          style={{ fontFamily: "var(--font-gothic)" }}>
          {isTraitor ? "⚔ Embrace the Dark" : "🕯 Begin the Haunt"}
        </button>
      </div>
    </div>
  );
}

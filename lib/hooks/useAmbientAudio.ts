"use client";
import { useEffect, useRef, useState, useCallback } from "react";

const MUTE_KEY = "bgv_audio_muted";
const FADE_MS = 1800;

// ─── Per-track target volumes ──────────────────────────────────────────────────
// Pixabay tracks vary wildly in recorded loudness. Set each track's target
// volume here so they all feel balanced regardless of their source level.
// Range: 0.0–1.0. Tweak these to taste once you hear the actual files.
const AUDIO_VOLUME_MAP: Record<string, number> = {
  // Lobby / platform
  "/audio/ambient-lobby.mp3":              0.28,
  "/audio/ambient-day.mp3":               0.24,
  "/audio/ambient-night.mp3":             0.20,
  // Betrayal ambient
  "/audio/betrayal/lobby.mp3":            0.26,
  "/audio/betrayal/exploring.mp3":        0.22,
  "/audio/betrayal/haunt-phase.mp3":      0.18,
  "/audio/betrayal/heroes-win.mp3":       0.30,
  "/audio/betrayal/traitor-wins.mp3":     0.26,
  // Betrayal SFX (played one-shot via useSfx — same map for convenience)
  "/audio/betrayal/sfx/tile-reveal.mp3":  0.45,
  "/audio/betrayal/sfx/door-open.mp3":    0.38,
  "/audio/betrayal/sfx/door-locked.mp3":  0.40,
  "/audio/betrayal/sfx/footstep.mp3":     0.30,
  "/audio/betrayal/sfx/omen-draw.mp3":    0.42,
  "/audio/betrayal/sfx/item-pickup.mp3":  0.40,
  "/audio/betrayal/sfx/haunt-begin.mp3":  0.55,
  "/audio/betrayal/sfx/dice-roll.mp3":    0.50,
  "/audio/betrayal/sfx/stat-drop.mp3":    0.38,
  "/audio/betrayal/sfx/scream.mp3":       0.38,
  "/audio/betrayal/sfx/heartbeat.mp3":    0.28,
  "/audio/betrayal/sfx/ghost-ambient.mp3":0.22,
  "/audio/betrayal/sfx/candles-out.mp3":  0.48,
};

const DEFAULT_AMBIENT_VOL = 0.25;
const DEFAULT_SFX_VOL    = 0.40;

function targetVol(src: string): number {
  return AUDIO_VOLUME_MAP[src] ?? DEFAULT_AMBIENT_VOL;
}

// ─── Smooth fade helper ────────────────────────────────────────────────────────
function fadeVolume(
  audio: HTMLAudioElement,
  target: number,
  ms: number,
  done?: () => void,
): ReturnType<typeof setInterval> {
  const start = audio.volume;
  const steps = Math.max(1, Math.round(ms / 50));
  let step = 0;
  const timer = setInterval(() => {
    step++;
    const t = step / steps;
    // Ease-in-out for a more natural fade
    const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    audio.volume = Math.min(1, Math.max(0, start + (target - start) * ease));
    if (step >= steps) {
      clearInterval(timer);
      audio.volume = Math.max(0, target);
      done?.();
    }
  }, 50);
  return timer;
}

// ─── Ambient track hook ────────────────────────────────────────────────────────
export function useAmbientAudio(src: string | null) {
  const currentRef    = useRef<HTMLAudioElement | null>(null);
  const muteFadeRef   = useRef<ReturnType<typeof setInterval> | null>(null);
  const [muted, setMuted] = useState<boolean>(() =>
    typeof window !== "undefined" ? localStorage.getItem(MUTE_KEY) === "true" : false,
  );
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  useEffect(() => {
    if (!src) {
      // No source — fade out and stop whatever is playing
      const prev = currentRef.current;
      if (prev) {
        fadeVolume(prev, 0, FADE_MS, () => { prev.pause(); prev.src = ""; });
        currentRef.current = null;
      }
      return;
    }

    const prev = currentRef.current;
    const next = new Audio(src);
    next.loop    = true;
    next.volume  = 0;
    next.preload = "auto";
    currentRef.current = next;

    // Crossfade: fade out old track, fade in new track simultaneously
    if (prev) {
      fadeVolume(prev, 0, FADE_MS, () => {
        prev.pause();
        prev.src = "";
      });
    }

    const vol = targetVol(src);
    const startNext = () => {
      if (!mutedRef.current) fadeVolume(next, vol, FADE_MS);
    };

    next.play().then(startNext).catch(() => {
      const onInteract = () => {
        next.play().then(startNext).catch(() => {});
      };
      document.addEventListener("pointerdown", onInteract, { once: true });
      document.addEventListener("keydown",     onInteract, { once: true });
    });

    return () => {
      next.pause();
      next.src = "";
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      mutedRef.current = next;
      localStorage.setItem(MUTE_KEY, String(next));
      // Notify useSfx instances on the same page without polling
      window.dispatchEvent(new Event("bgv:mute"));
      const audio = currentRef.current;
      if (audio && src) {
        if (muteFadeRef.current) clearInterval(muteFadeRef.current);
        if (next) {
          muteFadeRef.current = fadeVolume(audio, 0, 600, () => { audio.pause(); });
        } else {
          audio.play().catch(() => {});
          muteFadeRef.current = fadeVolume(audio, targetVol(src), 600);
        }
      }
      return next;
    });
  }, [src]);

  useEffect(() => {
    return () => {
      if (muteFadeRef.current) clearInterval(muteFadeRef.current);
      currentRef.current?.pause();
    };
  }, []);

  return { muted, toggleMute };
}

// ─── One-shot SFX hook ────────────────────────────────────────────────────────
// Returns a `playSfx(path)` function. Honours the global mute state.
// Concurrent calls each get their own Audio instance so they don't cut each other.
export function useSfx() {
  const mutedRef = useRef<boolean>(
    typeof window !== "undefined" ? localStorage.getItem(MUTE_KEY) === "true" : false,
  );

  // Keep mutedRef in sync with storage changes (cross-tab via "storage" event,
  // same-tab via the custom "bgv:mute" event dispatched by toggleMute below).
  useEffect(() => {
    const sync = () => {
      mutedRef.current = localStorage.getItem(MUTE_KEY) === "true";
    };
    window.addEventListener("storage", sync);
    window.addEventListener("bgv:mute", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("bgv:mute", sync);
    };
  }, []);

  const playSfx = useCallback((path: string) => {
    if (mutedRef.current) return;
    const audio = new Audio(path);
    audio.volume = AUDIO_VOLUME_MAP[path] ?? DEFAULT_SFX_VOL;
    audio.play().catch(() => {}); // Ignore autoplay policy failures gracefully
  }, []);

  return playSfx;
}

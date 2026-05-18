"use client";
import { useEffect, useRef, useState, useCallback } from "react";

const MUTE_KEY = "bgv_audio_muted";
const FADE_MS = 1500;
const MAX_VOL = 0.3;

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
    audio.volume = Math.min(1, Math.max(0, start + (target - start) * (step / steps)));
    if (step >= steps) {
      clearInterval(timer);
      audio.volume = target;
      done?.();
    }
  }, 50);
  return timer;
}

export function useAmbientAudio(src: string | null) {
  const currentRef = useRef<HTMLAudioElement | null>(null);
  const muteFadeRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [muted, setMuted] = useState<boolean>(() =>
    typeof window !== "undefined" ? localStorage.getItem(MUTE_KEY) === "true" : false,
  );
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  useEffect(() => {
    if (!src) return;

    const prev = currentRef.current;
    const next = new Audio(src);
    next.loop = true;
    next.volume = 0;
    currentRef.current = next;

    // Fade out previous track independently
    if (prev) {
      fadeVolume(prev, 0, FADE_MS, () => {
        prev.pause();
        prev.src = "";
      });
    }

    const startNext = () => {
      if (!mutedRef.current) fadeVolume(next, MAX_VOL, FADE_MS);
    };

    next.play().then(startNext).catch(() => {
      // Autoplay blocked — resume on first touch/click
      const onInteract = () => {
        next.play().then(startNext).catch(() => {});
      };
      document.addEventListener("pointerdown", onInteract, { once: true });
      document.addEventListener("keydown", onInteract, { once: true });
    });

    return () => {
      next.pause();
      next.src = "";
    };
  }, [src]);

  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      mutedRef.current = next;
      localStorage.setItem(MUTE_KEY, String(next));
      const audio = currentRef.current;
      if (audio) {
        if (muteFadeRef.current) clearInterval(muteFadeRef.current);
        if (next) {
          // Fade out then actually pause — volume=0 alone doesn't stop iOS audio
          muteFadeRef.current = fadeVolume(audio, 0, 500, () => {
            audio.pause();
          });
        } else {
          audio.play().catch(() => {});
          muteFadeRef.current = fadeVolume(audio, MAX_VOL, 500);
        }
      }
      return next;
    });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (muteFadeRef.current) clearInterval(muteFadeRef.current);
      currentRef.current?.pause();
    };
  }, []);

  return { muted, toggleMute };
}

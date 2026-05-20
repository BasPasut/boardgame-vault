"use client";

import { useState, useRef, useCallback, useEffect } from "react";

export interface SpeechRecognitionResult {
  isListening: boolean;
  transcript: string;
  error: string | null;
  supported: boolean;
  start: () => void;
  stop: () => void;
  reset: () => void;
}

/**
 * Thin wrapper around the Web Speech API (SpeechRecognition).
 *
 * Browser support:
 *   ✅ Chrome desktop/Android
 *   ✅ Safari iOS (webkitSpeechRecognition)
 *   ❌ Chrome iOS  (WebKit restriction — show a warning)
 *   ❌ Firefox     (no support)
 *
 * @param lang  BCP-47 language tag.  Defaults to "th-TH" for Thai.
 */
export function useSpeechRecognition({
  lang = "th-TH",
}: { lang?: string } = {}): SpeechRecognitionResult {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recRef = useRef<any | null>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = typeof window !== "undefined" ? (window as any) : null;
  const supported = !!(w?.SpeechRecognition || w?.webkitSpeechRecognition);

  const stop = useCallback(() => {
    recRef.current?.stop();
    setIsListening(false);
  }, []);

  const start = useCallback(() => {
    if (!supported || !w) {
      setError("เบราว์เซอร์นี้ไม่รองรับการรับเสียง กรุณาใช้ Safari (iOS) หรือ Chrome (desktop)");
      return;
    }

    const SpeechRec = w.SpeechRecognition || w.webkitSpeechRecognition;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rec: any = new SpeechRec();
    rec.lang = lang;
    rec.continuous = false;
    rec.interimResults = false;
    rec.maxAlternatives = 3;

    rec.onstart = () => {
      setIsListening(true);
      setError(null);
    };
    rec.onend = () => {
      setIsListening(false);
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onerror = (e: any) => {
      setIsListening(false);
      if (e.error === "aborted") return;
      if (e.error === "no-speech") {
        setError("ไม่ได้ยินเสียง กรุณาลองใหม่");
      } else if (e.error === "not-allowed") {
        setError("ไม่ได้รับสิทธิ์ไมโครโฟน กรุณาอนุญาตในการตั้งค่าเบราว์เซอร์");
      } else {
        setError(`เกิดข้อผิดพลาด: ${e.error}`);
      }
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      const result = e.results[0];
      let best = "";
      let bestConf = -1;
      for (let i = 0; i < result.length; i++) {
        if (result[i].confidence > bestConf) {
          bestConf = result[i].confidence;
          best = (result[i].transcript as string).trim();
        }
      }
      setTranscript(best);
      setIsListening(false);
    };

    recRef.current = rec;
    try {
      rec.start();
    } catch {
      setError("ไม่สามารถเริ่มรับเสียงได้ กรุณาลองใหม่");
    }
  }, [lang, supported, w]);

  const reset = useCallback(() => {
    setTranscript("");
    setError(null);
  }, []);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      recRef.current?.abort();
    };
  }, []);

  return { isListening, transcript, error, supported, start, stop, reset };
}

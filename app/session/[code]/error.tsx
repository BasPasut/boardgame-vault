"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function SessionError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to an error reporting service in production
    console.error("[SessionError]", error);
  }, [error]);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-6 p-6 text-center"
      style={{ background: "radial-gradient(ellipse at top, #1a0808 0%, #0a0708 70%)" }}
    >
      <div className="text-6xl">🕯️</div>

      <div className="space-y-2">
        <h1
          className="text-3xl font-black"
          style={{ color: "#ef4444", fontFamily: "var(--font-gothic)" }}
        >
          The Mansion Stirred…
        </h1>
        <p className="text-sm max-w-xs" style={{ color: "#7a6a5a" }}>
          Something went wrong in this session. The spirits may have interfered.
        </p>
        {error.digest && (
          <p className="text-xs font-mono mt-1" style={{ color: "#3a2a1a" }}>
            #{error.digest}
          </p>
        )}
      </div>

      <div className="flex gap-3">
        <button
          onClick={reset}
          className="btn-gothic-primary px-6 py-3 rounded-xl font-bold text-sm"
          style={{ fontFamily: "var(--font-gothic)" }}
        >
          Try Again
        </button>
        <Link
          href="/"
          className="btn-gothic-secondary px-6 py-3 rounded-xl font-bold text-sm no-underline"
          style={{ fontFamily: "var(--font-gothic)" }}
        >
          ← Return to Vault
        </Link>
      </div>
    </div>
  );
}

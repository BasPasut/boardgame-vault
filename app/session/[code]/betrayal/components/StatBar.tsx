"use client";

interface StatBarProps {
  label: string;
  value: number;
  max: number;
  color: string;
  flash?: { delta: number };
}

export function StatBar({ label, value, max, color, flash }: StatBarProps) {
  return (
    <div className="flex items-center gap-1.5 relative">
      <span className="text-xs w-16 flex-shrink-0" style={{ color: "#7a6a5a" }}>{label}</span>
      <div className="flex gap-0.5">
        {Array.from({ length: max }, (_, i) => (
          <div key={i} className="w-3 h-3 rounded-sm" style={{
            background: i < value ? color : "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.08)",
            transition: "background 0.3s ease",
          }} />
        ))}
      </div>
      <span className="text-xs" style={{ color }}>{value}</span>
      {flash && (
        <span
          key={flash.delta}
          className="absolute right-0 text-xs font-black pointer-events-none"
          style={{
            color: flash.delta > 0 ? "#4ade80" : "#f87171",
            animation: "statFloat 1.6s ease-out forwards",
            whiteSpace: "nowrap",
          }}
        >
          {flash.delta > 0 ? `+${flash.delta}` : flash.delta}
        </span>
      )}
    </div>
  );
}

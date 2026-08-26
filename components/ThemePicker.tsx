"use client";

import { useState } from "react";
import { THEMES, type ThemeDefinition, type ThemeId } from "@/lib/themes";

type Props = {
  initialTheme: ThemeId;
};

export function ThemePicker({ initialTheme }: Props) {
  const [theme, setTheme] = useState<ThemeId>(initialTheme);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function assign(next: ThemeId) {
    if (next === theme || busy) return;
    const previous = theme;
    setTheme(next);
    document.documentElement.setAttribute("data-theme", next);
    setBusy(true);
    setError(null);
    const res = await fetch("/api/settings/theme", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme: next }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setTheme(previous);
      document.documentElement.setAttribute("data-theme", previous);
      setError(data.error || "Could not save theme");
    }
  }

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {THEMES.map((item) => (
          <ThemeCard
            key={item.id}
            theme={item}
            selected={theme === item.id}
            disabled={busy}
            onSelect={() => void assign(item.id)}
          />
        ))}
      </div>
      {error ? <p className="mt-3 text-[13px] text-accent">{error}</p> : null}
    </div>
  );
}

function ThemeCard({
  theme,
  selected,
  disabled,
  onSelect,
}: {
  theme: ThemeDefinition;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  const { swatches } = theme;
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      className={`rounded-xl border p-3 text-left disabled:opacity-60 ${
        selected
          ? "border-accent bg-overlay"
          : "border-line bg-raised hover:border-accent/50"
      }`}
    >
      <div
        className="overflow-hidden rounded-md border"
        style={{
          backgroundColor: swatches.canvas,
          backgroundImage: `linear-gradient(color-mix(in srgb, ${swatches.canvas} 55%, transparent), color-mix(in srgb, ${swatches.canvas} 70%, transparent)), url(${theme.wallpaper})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          borderColor: swatches.line,
        }}
      >
        <div className="flex h-16">
          <div
            className="w-[28%] border-r"
            style={{
              background: swatches.raised,
              borderColor: swatches.line,
            }}
          >
            <div
              className="m-1.5 h-4 w-4 rounded-sm"
              style={{
                background: `linear-gradient(135deg, ${swatches.accent} 0 42%, ${swatches.raised} 42%)`,
              }}
            />
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            <div
              className="h-4 border-b"
              style={{
                background: swatches.raised,
                borderColor: swatches.line,
              }}
            />
            <div className="flex flex-1 items-end justify-end p-1.5">
              <span
                className="h-3 w-8 rounded-sm"
                style={{ background: swatches.accent }}
              />
            </div>
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-2">
        <div className="text-[13px] font-medium">{theme.name}</div>
        {selected ? (
          <span className="text-[11px] uppercase tracking-wider text-accent">
            Active
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-[12px] text-muted">{theme.description}</p>
      <div className="mt-2.5 flex gap-1">
        {[swatches.canvas, swatches.raised, swatches.accent, swatches.ink].map(
          (color) => (
            <span
              key={color}
              className="h-2.5 w-2.5 rounded-full border border-line"
              style={{ background: color }}
            />
          ),
        )}
      </div>
    </button>
  );
}

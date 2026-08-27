"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "Sign-in failed");
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <span className="fold h-11 w-11 rounded-lg" />
          <div>
            <div className="text-[13px] tracking-[0.22em] text-ink">ORIGAMI</div>
            <div className="text-[13px] text-muted">Sign in to your vault</div>
          </div>
        </div>
        <form
          onSubmit={submit}
          className="rounded-xl border border-line bg-raised p-5"
        >
          <label className="mb-3 block">
            <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted">
              Username
            </span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-md border border-line bg-canvas px-3 py-2 outline-none focus:border-accent"
              autoComplete="username"
            />
          </label>
          <label className="mb-4 block">
            <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted">
              Password
            </span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-line bg-canvas px-3 py-2 outline-none focus:border-accent"
              autoComplete="current-password"
            />
          </label>
          {error ? <p className="mb-3 text-[13px] text-accent">{error}</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-accent py-2 text-[14px] font-medium text-canvas disabled:opacity-60"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </main>
  );
}

"use client";

import { useState } from "react";

export function CreateUserSettings() {
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdUsername, setCreatedUsername] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreatedUsername(null);

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setBusy(true);
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username,
        password,
        displayName: displayName.trim() || null,
      }),
    });
    const data = await res.json();
    setBusy(false);

    if (!res.ok) {
      setError(data.error || "Could not create user");
      return;
    }

    setCreatedUsername(data.user.username);
    setUsername("");
    setDisplayName("");
    setPassword("");
    setConfirmPassword("");
  }

  return (
    <div className="mt-6 max-w-2xl">
      <section className="flex flex-col rounded-xl border border-line bg-raised p-4">
        <h2 className="text-[13px] font-medium">New account</h2>
        <p className="mt-1 text-[13px] text-muted">
          Create a username and password for someone who will sign in to Origami.
          Add them to a team from the Team settings page so they can access shared
          projects.
        </p>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted">
              Username
            </span>
            <input
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-md border border-line bg-canvas px-3 py-2 font-mono text-[13px] outline-none focus:border-accent"
              autoComplete="off"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted">
              Display name <span className="normal-case tracking-normal">(optional)</span>
            </span>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full rounded-md border border-line bg-canvas px-3 py-2 text-[13px] outline-none focus:border-accent"
              autoComplete="off"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted">
              Password
            </span>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-line bg-canvas px-3 py-2 text-[13px] outline-none focus:border-accent"
              autoComplete="new-password"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted">
              Confirm password
            </span>
            <input
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-md border border-line bg-canvas px-3 py-2 text-[13px] outline-none focus:border-accent"
              autoComplete="new-password"
            />
          </label>
          {error ? <p className="text-[13px] text-accent">{error}</p> : null}
          {createdUsername ? (
            <p className="text-[13px] text-muted">
              Created user{" "}
              <span className="font-mono text-ink">{createdUsername}</span>. They
              can sign in with these credentials.
            </p>
          ) : null}
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-accent px-3 py-2 text-[13px] font-medium text-canvas disabled:opacity-60"
          >
            {busy ? "Creating…" : "Create user"}
          </button>
        </form>
      </section>
    </div>
  );
}

"use client";

import { useState } from "react";

type Props = {
  username: string;
  displayName: string | null;
};

export function AccountSettings({ username, displayName }: Props) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);

    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match");
      return;
    }

    setBusy(true);
    const res = await fetch("/api/auth/password", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const data = await res.json();
    setBusy(false);

    if (!res.ok) {
      setError(data.error || "Could not change password");
      return;
    }

    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setSaved(true);
  }

  return (
    <div className="mt-6 max-w-2xl space-y-4">
      <section className="flex flex-col rounded-xl border border-line bg-raised p-4">
        <h2 className="text-[13px] font-medium">Signed in as</h2>
        <p className="mt-2 font-mono text-[13px]">{username}</p>
        {displayName ? (
          <p className="mt-1 text-[13px] text-muted">{displayName}</p>
        ) : null}
      </section>

      <section className="flex flex-col rounded-xl border border-line bg-raised p-4">
        <h2 className="text-[13px] font-medium">Change password</h2>
        <form onSubmit={changePassword} className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted">
              Current password
            </span>
            <input
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full rounded-md border border-line bg-canvas px-3 py-2 text-[13px] outline-none focus:border-accent"
              autoComplete="current-password"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted">
              New password
            </span>
            <input
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full rounded-md border border-line bg-canvas px-3 py-2 text-[13px] outline-none focus:border-accent"
              autoComplete="new-password"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted">
              Confirm new password
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
          {saved ? (
            <p className="text-[13px] text-muted">Password updated.</p>
          ) : null}
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-accent px-3 py-2 text-[13px] font-medium text-canvas disabled:opacity-60"
          >
            {busy ? "Saving…" : "Update password"}
          </button>
        </form>
      </section>
    </div>
  );
}

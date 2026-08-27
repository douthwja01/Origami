"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { PendingInviteDTO } from "@/lib/teams/team-types";

export default function AcceptInviteClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";

  const [invite, setInvite] = useState<PendingInviteDTO | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setError("Missing invite token");
      setLoading(false);
      return;
    }

    void (async () => {
      const res = await fetch(`/api/teams/invites/${encodeURIComponent(token)}`);
      const data = await res.json();
      setLoading(false);
      if (!res.ok) {
        setError(data.error || "Invite not found");
        return;
      }
      setInvite(data.invite);
    })();
  }, [token]);

  async function accept(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;

    if (!invite?.userExists) {
      if (password.length < 8) {
        setError("Password must be at least 8 characters");
        return;
      }
      if (password !== confirmPassword) {
        setError("Passwords do not match");
        return;
      }
    }

    setBusy(true);
    setError(null);

    const res = await fetch("/api/teams/invites/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        ...(invite?.userExists ? {} : { password }),
      }),
    });
    const data = await res.json();
    setBusy(false);

    if (!res.ok) {
      setError(data.error || "Could not accept invite");
      return;
    }

    router.replace("/");
    router.refresh();
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <p className="text-[13px] text-muted">Loading invite…</p>
      </main>
    );
  }

  if (!invite) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-sm rounded-xl border border-line bg-raised p-5">
          <p className="text-[13px] text-accent">{error || "Invite not found"}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-3">
          <span className="fold h-11 w-11 rounded-lg" />
          <div>
            <div className="text-[13px] tracking-[0.22em] text-ink">ORIGAMI</div>
            <div className="text-[13px] text-muted">Team invite</div>
          </div>
        </div>
        <form
          onSubmit={accept}
          className="rounded-xl border border-line bg-raised p-5"
        >
          <p className="mb-4 text-[13px] text-muted">
            You have been invited to join{" "}
            <span className="font-medium text-ink">{invite.teamName}</span> as{" "}
            <span className="font-mono">{invite.username}</span>.
          </p>

          {!invite.userExists ? (
            <>
              <p className="mb-3 text-[13px] text-muted">
                Create a password for your new account.
              </p>
              <label className="mb-3 block">
                <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted">
                  Password
                </span>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-md border border-line bg-canvas px-3 py-2 outline-none focus:border-accent"
                  autoComplete="new-password"
                />
              </label>
              <label className="mb-4 block">
                <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted">
                  Confirm password
                </span>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full rounded-md border border-line bg-canvas px-3 py-2 outline-none focus:border-accent"
                  autoComplete="new-password"
                />
              </label>
            </>
          ) : (
            <p className="mb-4 text-[13px] text-muted">
              Accepting will add this team to your account. You will be signed
              in automatically.
            </p>
          )}

          {error ? <p className="mb-3 text-[13px] text-accent">{error}</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-md bg-accent py-2 text-[14px] font-medium text-canvas disabled:opacity-60"
          >
            {busy ? "Joining…" : "Accept invite"}
          </button>
        </form>
      </div>
    </main>
  );
}

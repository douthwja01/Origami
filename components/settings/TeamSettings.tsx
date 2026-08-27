"use client";

import { useCallback, useEffect, useState } from "react";
import type { TeamDTO, TeamInviteDTO, TeamMemberDTO, TeamRole } from "@/lib/teams/team-types";

type TeamDetail = {
  members: TeamMemberDTO[];
  invites: TeamInviteDTO[];
  role: TeamRole;
};

export function TeamSettings() {
  const [teams, setTeams] = useState<TeamDTO[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [detail, setDetail] = useState<TeamDetail | null>(null);
  const [inviteUsername, setInviteUsername] = useState("");
  const [inviteRole, setInviteRole] = useState<TeamRole>("member");
  const [lastInviteLink, setLastInviteLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadTeams = useCallback(async () => {
    const res = await fetch("/api/teams");
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Could not load teams");
      setLoading(false);
      return;
    }
    setTeams(data.teams);
    if (data.teams.length > 0) {
      setSelectedTeamId((current) => current || data.teams[0].id);
    }
    setLoading(false);
  }, []);

  const loadDetail = useCallback(async (teamId: string) => {
    if (!teamId) return;
    const res = await fetch(`/api/teams/${teamId}/members`);
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Could not load team members");
      return;
    }
    setDetail({
      members: data.members,
      invites: data.invites,
      role: data.role,
    });
  }, []);

  useEffect(() => {
    void loadTeams();
  }, [loadTeams]);

  useEffect(() => {
    if (selectedTeamId) {
      void loadDetail(selectedTeamId);
    }
  }, [selectedTeamId, loadDetail]);

  const canManage = detail?.role === "owner" || detail?.role === "admin";

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedTeamId) return;
    setBusy(true);
    setError(null);
    setLastInviteLink(null);

    const res = await fetch(`/api/teams/${selectedTeamId}/invites`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: inviteUsername, role: inviteRole }),
    });
    const data = await res.json();
    setBusy(false);

    if (!res.ok) {
      setError(data.error || "Could not send invite");
      return;
    }

    if (data.inviteLink) {
      setLastInviteLink(`${window.location.origin}${data.inviteLink}`);
    } else {
      setLastInviteLink(null);
    }

    setInviteUsername("");
    await loadDetail(selectedTeamId);
  }

  async function revokeInvite(inviteId: string) {
    if (!selectedTeamId) return;
    setBusy(true);
    setError(null);
    const res = await fetch(
      `/api/teams/${selectedTeamId}/invites/${inviteId}`,
      { method: "DELETE" },
    );
    setBusy(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Could not revoke invite");
      return;
    }
    await loadDetail(selectedTeamId);
  }

  async function removeMember(userId: string) {
    if (!selectedTeamId) return;
    setBusy(true);
    setError(null);
    const res = await fetch(
      `/api/teams/${selectedTeamId}/members/${userId}`,
      { method: "DELETE" },
    );
    setBusy(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Could not remove member");
      return;
    }
    await loadDetail(selectedTeamId);
  }

  if (loading) {
    return <p className="mt-6 text-[13px] text-muted">Loading teams…</p>;
  }

  if (teams.length === 0) {
    return (
      <p className="mt-6 text-[13px] text-muted">
        You are not on any teams yet.
      </p>
    );
  }

  const selectedTeam = teams.find((team) => team.id === selectedTeamId);

  return (
    <div className="mt-6 max-w-2xl space-y-4">
      <section className="flex flex-col rounded-xl border border-line bg-raised p-4">
        <h2 className="text-[13px] font-medium">Your teams</h2>
        <label className="mt-3 block">
          <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted">
            Team
          </span>
          <select
            value={selectedTeamId}
            onChange={(e) => setSelectedTeamId(e.target.value)}
            className="w-full rounded-md border border-line bg-canvas px-3 py-2 text-[13px] outline-none focus:border-accent"
          >
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name} ({team.memberCount} members)
              </option>
            ))}
          </select>
        </label>
        {selectedTeam ? (
          <p className="mt-2 text-[13px] text-muted">
            Your role: <span className="font-mono text-ink">{selectedTeam.role}</span>
          </p>
        ) : null}
      </section>

      {detail ? (
        <section className="flex flex-col rounded-xl border border-line bg-raised p-4">
          <h2 className="text-[13px] font-medium">Members</h2>
          <ul className="mt-3 divide-y divide-line">
            {detail.members.map((member) => (
              <li
                key={member.userId}
                className="flex items-center justify-between gap-3 py-2 text-[13px]"
              >
                <div>
                  <span className="font-mono">{member.username}</span>
                  {member.displayName ? (
                    <span className="ml-2 text-muted">{member.displayName}</span>
                  ) : null}
                  <span className="ml-2 text-[11px] uppercase tracking-wider text-muted">
                    {member.role}
                  </span>
                </div>
                {canManage && member.role !== "owner" ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void removeMember(member.userId)}
                    className="text-[12px] text-muted hover:text-accent disabled:opacity-60"
                  >
                    Remove
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {canManage ? (
        <section className="flex flex-col rounded-xl border border-line bg-raised p-4">
          <h2 className="text-[13px] font-medium">Invite someone</h2>
          <p className="mt-1 text-[13px] text-muted">
            Enter a username. If they already have an account they join immediately;
            otherwise share the invite link after sending.
          </p>
          <form onSubmit={sendInvite} className="mt-4 space-y-3">
            <label className="block">
              <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted">
                Username
              </span>
              <input
                required
                value={inviteUsername}
                onChange={(e) => setInviteUsername(e.target.value)}
                className="w-full rounded-md border border-line bg-canvas px-3 py-2 text-[13px] outline-none focus:border-accent"
                autoComplete="off"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted">
                Role
              </span>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as TeamRole)}
                className="w-full rounded-md border border-line bg-canvas px-3 py-2 text-[13px] outline-none focus:border-accent"
              >
                <option value="member">Member</option>
                {detail?.role === "owner" ? (
                  <option value="admin">Admin</option>
                ) : null}
              </select>
            </label>
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-accent px-3 py-2 text-[13px] font-medium text-canvas disabled:opacity-60"
            >
              {busy ? "Sending…" : "Send invite"}
            </button>
          </form>
          {lastInviteLink ? (
            <p className="mt-3 break-all font-mono text-[12px] text-muted">
              Invite link: {lastInviteLink}
            </p>
          ) : null}
        </section>
      ) : null}

      {detail && detail.invites.length > 0 ? (
        <section className="flex flex-col rounded-xl border border-line bg-raised p-4">
          <h2 className="text-[13px] font-medium">Pending invites</h2>
          <ul className="mt-3 divide-y divide-line">
            {detail.invites.map((invite) => (
              <li
                key={invite.id}
                className="flex items-center justify-between gap-3 py-2 text-[13px]"
              >
                <div>
                  <span className="font-mono">{invite.username}</span>
                  <span className="ml-2 text-[11px] uppercase tracking-wider text-muted">
                    {invite.role}
                  </span>
                </div>
                {canManage ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void revokeInvite(invite.id)}
                    className="text-[12px] text-muted hover:text-accent disabled:opacity-60"
                  >
                    Revoke
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {error ? <p className="text-[13px] text-accent">{error}</p> : null}
    </div>
  );
}

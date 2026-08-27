"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { descendantIdSet, useProjects } from "@/components/projects/ProjectsContext";
import { todayIso, statusLabel } from "@/lib/shared/format";
import { nextChildCode } from "@/lib/projects/project-code";
import type { TeamDTO } from "@/lib/teams/team-types";
import {
  STATUSES,
  type ProjectDTO,
  type ProjectStatus,
  type ProjectVisibility,
} from "@/lib/shared/types";

type Props = {
  title: string;
  project?: ProjectDTO;
  defaultParentId?: string | null;
  onClose: () => void;
  onSaved?: (project: ProjectDTO) => void;
};

function fieldClass(invalid: boolean) {
  return `w-full rounded-md border bg-canvas px-3 py-2 outline-none ${
    invalid
      ? "border-accent focus:border-accent"
      : "border-line focus:border-accent"
  }`;
}

export function ProjectForm({
  title,
  project,
  defaultParentId,
  onClose,
  onSaved,
}: Props) {
  const router = useRouter();
  const { projects, refresh } = useProjects();
  const [code, setCode] = useState(project?.code ?? "");
  const [name, setName] = useState(project?.title ?? "");
  const [startDate, setStartDate] = useState(project?.startDate ?? todayIso());
  const [status, setStatus] = useState<ProjectStatus>(project?.status ?? "planned");
  const [parentId, setParentId] = useState(
    project?.parentId ?? defaultParentId ?? "",
  );
  const [githubUrl, setGithubUrl] = useState(project?.githubUrl ?? "");
  const [websiteUrl, setWebsiteUrl] = useState(project?.websiteUrl ?? "");
  const [visibility, setVisibility] = useState<ProjectVisibility>(
    project?.visibility ?? "team",
  );
  const [teamId, setTeamId] = useState(project?.teamId ?? "");
  const [teams, setTeams] = useState<TeamDTO[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [attempted, setAttempted] = useState(false);

  const blocked = project ? descendantIdSet(projects, project.id) : new Set<string>();
  const parentOptions = projects.filter((p) => !blocked.has(p.id));
  const selectedParent = parentId
    ? projects.find((p) => p.id === parentId)
    : undefined;
  const autoCodeHint = selectedParent
    ? nextChildCode(
        selectedParent.code,
        projects
          .filter((p) => p.parentId === selectedParent.id && p.id !== project?.id)
          .map((p) => p.code),
      )
    : "PROJ-001";

  const others = useMemo(
    () => projects.filter((p) => p.id !== project?.id),
    [projects, project?.id],
  );

  const nameClash = useMemo(() => {
    const normalized = name.trim().toLowerCase();
    if (!normalized) return null;
    return (
      others.find((p) => p.title.trim().toLowerCase() === normalized) ?? null
    );
  }, [name, others]);

  const effectiveCode = code.trim() || (selectedParent ? autoCodeHint : "");
  const codeClash = useMemo(() => {
    if (!effectiveCode) return null;
    return others.find((p) => p.code === effectiveCode) ?? null;
  }, [effectiveCode, others]);

  const nameError = nameClash
    ? "A project with this name already exists — choose a different title."
    : null;
  const codeError = codeClash
    ? "A project with this ID already exists — choose a different project ID."
    : null;
  const hasClash = Boolean(nameError || codeError);

  useEffect(() => {
    if (project || parentId) return;
    void (async () => {
      const res = await fetch("/api/teams");
      const data = await res.json();
      if (res.ok && data.teams?.length) {
        setTeams(data.teams);
        setTeamId((current) => current || data.teams[0].id);
      }
    })();
  }, [project, parentId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setAttempted(true);
    setError(null);
    if (hasClash) {
      setError("Change the conflicting name or project ID before submitting.");
      return;
    }
    setSaving(true);
    const payload = {
      title: name,
      startDate,
      status,
      parentId: parentId || null,
      githubUrl: githubUrl.trim(),
      websiteUrl: websiteUrl.trim(),
      ...(code.trim() ? { code: code.trim() } : {}),
      ...(!project && !parentId
        ? {
            visibility,
            teamId: visibility === "team" ? teamId || null : null,
          }
        : {}),
    };
    const res = await fetch(
      project ? `/api/projects/${project.id}` : "/api/projects",
      {
        method: project ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error || "Could not save project");
      return;
    }
    await refresh();
    onSaved?.(data.project);
    onClose();
    if (!project) {
      router.push(`/projects/${data.project.id}`);
    }
  }

  const showNameError = Boolean(nameError && (attempted || name.trim()));
  const showCodeError = Boolean(codeError && (attempted || code.trim()));

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/55 p-4 pt-[12vh]">
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-xl border border-line bg-raised p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-[16px] font-medium">{title}</h2>
          <button type="button" onClick={onClose} className="text-muted hover:text-ink">
            Close
          </button>
        </div>
        <label className="mb-3 block">
          <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted">
            Title
          </span>
          <input
            required
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            aria-invalid={showNameError}
            className={`${fieldClass(showNameError)} text-[14px]`}
            autoFocus
          />
          {showNameError ? (
            <p className="mt-1 text-[12px] text-accent">{nameError}</p>
          ) : null}
        </label>
        <div className="mb-3 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted">
              Project ID
            </span>
            <input
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setError(null);
              }}
              placeholder={`Auto ${autoCodeHint}`}
              aria-invalid={showCodeError}
              className={`${fieldClass(showCodeError)} font-mono text-[13px]`}
            />
            {showCodeError ? (
              <p className="mt-1 text-[12px] text-accent">{codeError}</p>
            ) : null}
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted">
              Start date
            </span>
            <input
              type="date"
              required
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={`${fieldClass(false)} text-[13px]`}
            />
          </label>
        </div>
        <div className="mb-4 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted">
              Status
            </span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as ProjectStatus)}
              className={`${fieldClass(false)} text-[13px]`}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {statusLabel(s)}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted">
              Fold under
            </span>
            <select
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className={`${fieldClass(false)} text-[13px]`}
            >
              <option value="">Top level</option>
              {parentOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.title}
                </option>
              ))}
            </select>
          </label>
        </div>
        {!project && !parentId ? (
          <div className="mb-4 grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted">
                Visibility
              </span>
              <select
                value={visibility}
                onChange={(e) =>
                  setVisibility(e.target.value as ProjectVisibility)
                }
                className={`${fieldClass(false)} text-[13px]`}
              >
                <option value="team">Team — shared with your team</option>
                <option value="personal">Personal — only you</option>
              </select>
            </label>
            {visibility === "team" ? (
              <label className="block">
                <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted">
                  Team
                </span>
                <select
                  required
                  value={teamId}
                  onChange={(e) => setTeamId(e.target.value)}
                  className={`${fieldClass(false)} text-[13px]`}
                >
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <div />
            )}
          </div>
        ) : null}
        <label className="mb-3 block">
          <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted">
            GitHub URL
          </span>
          <input
            type="text"
            inputMode="url"
            autoComplete="url"
            value={githubUrl}
            onChange={(e) => setGithubUrl(e.target.value)}
            placeholder="https://github.com/org/repo"
            className={`${fieldClass(false)} text-[13px]`}
          />
        </label>
        <label className="mb-4 block">
          <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted">
            Website URL
          </span>
          <input
            type="text"
            inputMode="url"
            autoComplete="url"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            placeholder="https://"
            className={`${fieldClass(false)} text-[13px]`}
          />
        </label>
        {error ? <p className="mb-3 text-[13px] text-accent">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-2 text-[13px] text-muted hover:text-ink"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || hasClash}
            className="rounded-md bg-accent px-3 py-2 text-[13px] font-medium text-canvas disabled:opacity-60"
          >
            {saving ? "Saving…" : project ? "Save" : "Create"}
          </button>
        </div>
      </form>
    </div>
  );
}

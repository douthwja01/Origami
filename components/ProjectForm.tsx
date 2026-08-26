"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { descendantIdSet, useProjects } from "@/components/ProjectsContext";
import { todayIso, statusLabel } from "@/lib/format";
import { nextChildCode } from "@/lib/project-code";
import { STATUSES, type ProjectDTO, type ProjectStatus } from "@/lib/types";

type Props = {
  title: string;
  project?: ProjectDTO;
  defaultParentId?: string | null;
  onClose: () => void;
  onSaved?: (project: ProjectDTO) => void;
};

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
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const payload = {
      title: name,
      startDate,
      status,
      parentId: parentId || null,
      githubUrl: githubUrl.trim(),
      websiteUrl: websiteUrl.trim(),
      ...(code.trim() ? { code: code.trim() } : {}),
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
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-line bg-canvas px-3 py-2 text-[14px] outline-none focus:border-accent"
            autoFocus
          />
        </label>
        <div className="mb-3 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted">
              Project ID
            </span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder={`Auto ${autoCodeHint}`}
              className="w-full rounded-md border border-line bg-canvas px-3 py-2 font-mono text-[13px] outline-none focus:border-accent"
            />
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
              className="w-full rounded-md border border-line bg-canvas px-3 py-2 text-[13px] outline-none focus:border-accent"
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
              className="w-full rounded-md border border-line bg-canvas px-3 py-2 text-[13px] outline-none focus:border-accent"
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
              Nested under
            </span>
            <select
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
              className="w-full rounded-md border border-line bg-canvas px-3 py-2 text-[13px] outline-none focus:border-accent"
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
            className="w-full rounded-md border border-line bg-canvas px-3 py-2 text-[13px] outline-none focus:border-accent"
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
            className="w-full rounded-md border border-line bg-canvas px-3 py-2 text-[13px] outline-none focus:border-accent"
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
            disabled={saving}
            className="rounded-md bg-accent px-3 py-2 text-[13px] font-medium text-canvas disabled:opacity-60"
          >
            {saving ? "Saving…" : project ? "Save" : "Create"}
          </button>
        </div>
      </form>
    </div>
  );
}

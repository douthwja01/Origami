"use client";

import { useCallback, useEffect, useState, type ReactNode, Suspense } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ProjectForm } from "@/components/ProjectForm";
import { ProjectMediaBackground } from "@/components/ProjectMediaBackground";
import { ProjectPageSettings } from "@/components/ProjectPageSettings";
import { VaultExplorer } from "@/components/VaultExplorer";
import { useProjects } from "@/components/ProjectsContext";
import { useProjectDisplay } from "@/components/ProjectDisplayContext";
import { formatDate, statusLabel } from "@/lib/format";
import { PROJECT_BACKGROUND_FOLDER } from "@/lib/project-background";
import type { ProjectDetail } from "@/lib/types";

export function ProjectWorkspace({ id }: { id: string }) {
  const router = useRouter();
  const { refresh } = useProjects();
  const { settings } = useProjectDisplay();
  const [data, setData] = useState<ProjectDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [creatingChild, setCreatingChild] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/projects/${id}`);
    const json = await res.json();
    if (!res.ok) {
      setError(json.error || "Project not found");
      setData(null);
      return;
    }
    setError(null);
    setData(json);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const project = data?.project;
  const backgroundAsset =
    data?.assets.find(
      (asset) =>
        asset.folderPath === PROJECT_BACKGROUND_FOLDER &&
        asset.id === project?.mediaBackgroundAssetId,
    ) ?? null;
  const parent = data?.ancestors.at(-1);
  const backHref = parent ? `/projects/${parent.id}` : "/";
  const backLabel = parent ? parent.code : settings.vaultName;

  async function archive() {
    if (!project) return;
    setBusy(true);
    await fetch(`/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: project.status === "archived" ? "active" : "archived",
      }),
    });
    await Promise.all([load(), refresh()]);
    setBusy(false);
  }

  async function remove(cascade: boolean) {
    if (!project) return;
    setBusy(true);
    const res = await fetch(
      `/api/projects/${project.id}${cascade ? "?cascade=1" : ""}`,
      { method: "DELETE" },
    );
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(json.error);
      setConfirmDelete(true);
      return;
    }
    await refresh();
    router.push("/");
  }

  return (
    <>
      <main className="relative flex h-full min-h-0 flex-col overflow-hidden px-5 py-4 lg:px-8">
        {project ? (
          <ProjectMediaBackground
            project={project}
            assets={data?.assets ?? []}
          />
        ) : null}
        <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden">
          {error && !data ? <p className="text-accent">{error}</p> : null}
          {project ? (
            <>
              <header className="mb-4 flex flex-wrap items-start justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex shrink-0 flex-col overflow-hidden rounded-md border border-line">
                  <Link
                    href="/"
                    title="Index"
                    className="inline-flex h-8 items-center gap-1.5 border-b border-line px-2.5 text-[12px] text-muted hover:bg-overlay hover:text-ink"
                  >
                    <IconIndex />
                    Index
                  </Link>
                  <Link
                    href={backHref}
                    title={`Back to ${backLabel}`}
                    aria-label={`Back to ${backLabel}`}
                    className="inline-flex h-8 items-center gap-1.5 px-2.5 text-[12px] text-muted hover:bg-overlay hover:text-ink"
                  >
                    <IconBack />
                    Back
                  </Link>
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[12px] text-muted">
                      {project.code}
                    </span>
                    <span className={`status-dot ${project.status}`} />
                    <span className="text-[12px] text-muted">
                      {statusLabel(project.status)}
                    </span>
                  </div>
                  <h1 className="mt-1 text-[22px] font-medium tracking-tight">
                    {project.title}
                  </h1>
                  <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted">
                    <span>Started {formatDate(project.startDate)}</span>
                    {project.githubUrl ? (
                      <a
                        href={project.githubUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-ink hover:underline"
                      >
                        GitHub
                      </a>
                    ) : null}
                    {project.websiteUrl ? (
                      <a
                        href={project.websiteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:text-ink hover:underline"
                      >
                        Website
                      </a>
                    ) : null}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <IconButton label="Edit" onClick={() => setEditing(true)}>
                  <IconPencil />
                </IconButton>
                <IconButton
                  label="New child"
                  onClick={() => setCreatingChild(true)}
                >
                  <IconNewChild />
                </IconButton>
                <IconButton
                  label={project.status === "archived" ? "Unarchive" : "Archive"}
                  onClick={archive}
                  disabled={busy}
                >
                  {project.status === "archived" ? (
                    <IconUnarchive />
                  ) : (
                    <IconArchive />
                  )}
                </IconButton>
                <IconButton
                  label="Settings"
                  active={settingsOpen}
                  onClick={() => setSettingsOpen((open) => !open)}
                >
                  <IconSettings />
                </IconButton>
                <IconButton
                  label="Delete"
                  onClick={() => setConfirmDelete(true)}
                  danger
                >
                  <IconTrash />
                </IconButton>
              </div>
            </header>

            <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
              {settingsOpen ? (
                <ProjectPageSettings
                  project={project}
                  backgroundAsset={backgroundAsset}
                  onSaved={async () => {
                    await Promise.all([load(), refresh()]);
                  }}
                />
              ) : (
                <Suspense
                  fallback={
                    <p className="px-3 py-6 text-[13px] text-muted">Loading vault…</p>
                  }
                >
                  <VaultExplorer
                    projectId={project.id}
                    assets={data?.assets ?? []}
                    folders={data?.folders ?? []}
                    nested={data?.children ?? []}
                    tags={data?.tags ?? []}
                    onChanged={async () => {
                      await Promise.all([load(), refresh()]);
                    }}
                    onNewChild={() => setCreatingChild(true)}
                  />
                </Suspense>
              )}
            </div>
          </>
        ) : !error ? (
          <p className="text-muted">Loading…</p>
        ) : null}
        </div>
      </main>

      {editing && project ? (
        <ProjectForm
          title="Edit project"
          project={project}
          onClose={() => setEditing(false)}
          onSaved={() => {
            load();
          }}
        />
      ) : null}
      {creatingChild && project ? (
        <ProjectForm
          title="New nested project"
          defaultParentId={project.id}
          onClose={() => setCreatingChild(false)}
          onSaved={() => {
            load();
          }}
        />
      ) : null}
      {confirmDelete && project ? (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/55 p-4 pt-[18vh]">
          <div className="w-full max-w-md rounded-xl border border-line bg-raised p-5">
            <h2 className="text-[16px] font-medium">Delete {project.code}?</h2>
            <p className="mt-2 text-[13px] text-muted">
              Nested projects and vault files are kept unless you delete them
              too.
            </p>
            {error ? <p className="mt-2 text-[13px] text-accent">{error}</p> : null}
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="px-3 py-2 text-[13px] text-muted"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => remove(false)}
                className="rounded-md border border-line px-3 py-2 text-[13px]"
              >
                Delete project
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => remove(true)}
                className="rounded-md bg-accent px-3 py-2 text-[13px] text-canvas"
              >
                Delete with nested + files
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  danger,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={`inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] hover:border-accent disabled:opacity-50 ${
        active
          ? "border-accent bg-overlay text-ink"
          : danger
            ? "border-line text-accent"
            : "border-line text-muted hover:text-ink"
      }`}
    >
      {children}
      {label}
    </button>
  );
}

function IconSettings() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M6.4 2.4h3.2l.4 1.5a4.8 4.8 0 0 1 1.3.7l1.5-.5 1.6 2.8-1.2 1.1c.1.4.1.8 0 1.2l1.2 1.1-1.6 2.8-1.5-.5a4.8 4.8 0 0 1-1.3.7l-.4 1.5H6.4l-.4-1.5a4.8 4.8 0 0 1-1.3-.7l-1.5.5-1.6-2.8 1.2-1.1a4.8 4.8 0 0 1 0-1.2L1.6 6.9l1.6-2.8 1.5.5a4.8 4.8 0 0 1 1.3-.7l.4-1.5Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="8" r="1.8" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function IconIndex() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="2.5" y="2.5" width="4.5" height="4.5" rx="0.8" stroke="currentColor" strokeWidth="1.2" />
      <rect x="9" y="2.5" width="4.5" height="4.5" rx="0.8" stroke="currentColor" strokeWidth="1.2" />
      <rect x="2.5" y="9" width="4.5" height="4.5" rx="0.8" stroke="currentColor" strokeWidth="1.2" />
      <rect x="9" y="9" width="4.5" height="4.5" rx="0.8" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function IconBack() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M10 3.2 5.2 8 10 12.8"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconPencil() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M11.2 2.8 13.2 4.8 5.6 12.4 3 13l.6-2.6 7.6-7.6Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path d="m10.1 3.9 2 2" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function IconNewChild() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect
        x="2.5"
        y="2.5"
        width="5.5"
        height="5.5"
        rx="0.8"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      <path
        d="M5.2 8v2.2H8"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="M11.2 8.2v5.2M8.6 10.8h5.2"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconArchive() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M2.5 3.8h11v2.4h-11V3.8Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="M3.6 6.2v6.2h8.8V6.2"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path d="M6.5 8.8h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function IconUnarchive() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M2.5 3.8h11v2.4h-11V3.8Z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="M3.6 6.2v6.2h8.8V6.2"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="M8 11.4V7.8M6.4 9.2 8 7.6l1.6 1.6"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3.2 4.4h9.6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      <path
        d="M6.2 4.4V3.2h3.6v1.2"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="m4.4 4.4.7 8.2h5.8l.7-8.2"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="M6.8 6.8v3.4M9.2 6.8v3.4"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

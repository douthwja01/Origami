"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ProjectForm } from "@/components/ProjectForm";
import { AssetPanel } from "@/components/AssetPanel";
import { useProjects } from "@/components/ProjectsContext";
import { formatDate, kindLabel, statusLabel } from "@/lib/format";
import type { AssetKind, ProjectDetail, ProjectDTO } from "@/lib/types";
import { ASSET_KINDS } from "@/lib/types";

type Tab = "overview" | AssetKind | "subprojects";

export function ProjectWorkspace({ id }: { id: string }) {
  const router = useRouter();
  const { refresh } = useProjects();
  const [data, setData] = useState<ProjectDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [editing, setEditing] = useState(false);
  const [creatingChild, setCreatingChild] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
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

  const tabs = useMemo(() => {
    if (!project) return [];
    return [
      { id: "overview" as const, label: "Overview" },
      ...ASSET_KINDS.map((kind) => ({
        id: kind,
        label: `${kindLabel(kind)} (${project.assetsByKind[kind]})`,
      })),
      {
        id: "subprojects" as const,
        label: `Subprojects (${project.childCount})`,
      },
    ];
  }, [project]);

  return (
    <>
      <main className="px-5 py-6 lg:px-8">
        {error && !data ? <p className="text-accent">{error}</p> : null}
        {project ? (
          <>
            <nav className="mb-3 flex flex-wrap items-center gap-2 text-[12px] text-muted">
              <Link href="/" className="hover:text-ink">
                Workshop
              </Link>
              {data?.ancestors.map((a) => (
                <span key={a.id} className="flex items-center gap-2">
                  <span>/</span>
                  <Link href={`/projects/${a.id}`} className="hover:text-ink">
                    {a.code}
                  </Link>
                </span>
              ))}
              <span>/</span>
              <span className="text-ink">{project.code}</span>
            </nav>

            <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-[12px] text-muted">
                    {project.code}
                  </span>
                  <span className={`status-dot ${project.status}`} />
                  <span className="text-[12px] text-muted">
                    {statusLabel(project.status)}
                  </span>
                </div>
                <h1 className="mt-1 text-[26px] font-medium tracking-tight">
                  {project.title}
                </h1>
                <p className="text-[13px] text-muted">
                  Started {formatDate(project.startDate)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="rounded-md border border-line px-3 py-1.5 text-[13px] hover:border-accent"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setCreatingChild(true)}
                  className="rounded-md border border-line px-3 py-1.5 text-[13px] hover:border-accent"
                >
                  New child
                </button>
                <button
                  type="button"
                  onClick={archive}
                  disabled={busy}
                  className="rounded-md border border-line px-3 py-1.5 text-[13px] hover:border-accent"
                >
                  {project.status === "archived" ? "Unarchive" : "Archive"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="rounded-md border border-line px-3 py-1.5 text-[13px] text-accent hover:border-accent"
                >
                  Delete
                </button>
              </div>
            </header>

            <div className="mb-5 flex gap-1 overflow-auto border-b border-line">
              {tabs.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`whitespace-nowrap px-3 py-2 text-[13px] ${
                    tab === item.id
                      ? "border-b-2 border-accent text-ink"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {tab === "overview" ? (
              <Overview data={data!} onOpenTab={setTab} />
            ) : null}
            {ASSET_KINDS.includes(tab as AssetKind) ? (
              <AssetPanel
                projectId={project.id}
                kind={tab as AssetKind}
                assets={(data?.assets ?? []).filter((a) => a.kind === tab)}
                onChanged={async () => {
                  await Promise.all([load(), refresh()]);
                }}
              />
            ) : null}
        {tab === "subprojects" ? (
              <Subprojects
                items={data?.children ?? []}
                onNew={() => setCreatingChild(true)}
              />
            ) : null}
          </>
        ) : !error ? (
          <p className="text-muted">Loading…</p>
        ) : null}
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

function Overview({
  data,
  onOpenTab,
}: {
  data: ProjectDetail;
  onOpenTab: (tab: Tab) => void;
}) {
  const recent = [...data.assets]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 8);

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <section className="rounded-xl border border-line bg-raised p-4 lg:col-span-2">
        <h2 className="mb-3 text-[12px] uppercase tracking-wider text-muted">
          Vault
        </h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {ASSET_KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              onClick={() => onOpenTab(kind)}
              className="rounded-lg border border-line bg-canvas px-3 py-3 text-left hover:border-accent/50"
            >
              <div className="text-[11px] uppercase tracking-wider text-muted">
                {kindLabel(kind)}
              </div>
              <div className="mt-1 text-[22px] font-medium">
                {data.project.assetsByKind[kind]}
              </div>
            </button>
          ))}
        </div>
        <h3 className="mt-5 mb-2 text-[12px] uppercase tracking-wider text-muted">
          Recent files
        </h3>
        {recent.length === 0 ? (
          <p className="text-[13px] text-muted">Nothing in the vault yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {recent.map((asset) => (
              <li key={asset.id} className="flex justify-between py-2 text-[13px]">
                <span className="truncate">{asset.filename}</span>
                <span className="ml-3 shrink-0 text-muted">
                  {kindLabel(asset.kind)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="rounded-xl border border-line bg-raised p-4">
        <h2 className="mb-3 text-[12px] uppercase tracking-wider text-muted">
          Nested
        </h2>
        {data.children.length === 0 ? (
          <p className="text-[13px] text-muted">No child projects.</p>
        ) : (
          <ul className="space-y-2">
            {data.children.map((child) => (
              <li key={child.id}>
                <Link
                  href={`/projects/${child.id}`}
                  className="block rounded-md border border-line px-3 py-2 hover:border-accent/50"
                >
                  <div className="font-mono text-[11px] text-muted">{child.code}</div>
                  <div className="text-[14px]">{child.title}</div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Subprojects({
  items,
  onNew,
}: {
  items: ProjectDTO[];
  onNew: () => void;
}) {
  return (
    <div>
      <div className="mb-3 flex justify-end">
        <button
          type="button"
          onClick={onNew}
          className="rounded-md bg-accent px-3 py-1.5 text-[13px] text-canvas"
        >
          New child
        </button>
      </div>
      {items.length === 0 ? (
        <p className="text-[13px] text-muted">No nested projects yet.</p>
      ) : (
        <div className="grid gap-2 md:grid-cols-2">
          {items.map((child) => (
            <Link
              key={child.id}
              href={`/projects/${child.id}`}
              className="rounded-xl border border-line bg-raised px-4 py-3 hover:border-accent/50"
            >
              <div className="flex items-center gap-2">
                <span className={`status-dot ${child.status}`} />
                <span className="font-mono text-[11px] text-muted">{child.code}</span>
              </div>
              <div className="mt-1 text-[16px]">{child.title}</div>
              <div className="mt-1 text-[12px] text-muted">
                {formatDate(child.startDate)} · {child.assetCount} files
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

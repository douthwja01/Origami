"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ProjectsProvider } from "@/components/ProjectsContext";
import { ProjectBreadcrumbs } from "@/components/ProjectBreadcrumbs";
import { SettingsMenu } from "@/components/SettingsMenu";
import { SettingsSidebar } from "@/components/SettingsNav";
import { ProjectTree } from "@/components/ProjectTree";
import { ProjectSidebar } from "@/components/ProjectSidebar";
import { ProjectForm } from "@/components/ProjectForm";
import { projectIdFromPath } from "@/lib/project-view";

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [creating, setCreating] = useState(false);
  const projectId = projectIdFromPath(pathname);
  const onSettings = pathname.startsWith("/settings");

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  return (
    <ProjectsProvider>
      <div className="app-frame">
        <aside className="hidden h-dvh min-h-0 flex-col overflow-hidden border-r border-line bg-raised md:flex">
          <div className="flex items-center gap-2.5 border-b border-line px-4 py-4">
            <Link href="/" className="flex items-center gap-2.5">
              <span className="fold h-8 w-8 rounded-md" />
              <div>
                <div className="text-[13px] font-medium tracking-[0.18em] text-ink">
                  ORIGAMI
                </div>
                <div className="text-[11px] text-muted">
                  {projectId
                    ? "This project"
                    : onSettings
                      ? "Settings"
                      : "Project vault"}
                </div>
              </div>
            </Link>
          </div>
          {onSettings ? null : (
            <div className="border-b border-line px-3 py-3">
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="w-full rounded-md bg-accent px-3 py-2 text-left text-[13px] font-medium text-canvas hover:bg-accent-dim"
              >
                {projectId ? "New nested project" : "New project"}
              </button>
            </div>
          )}
          {projectId ? (
            <Suspense
              fallback={
                <p className="px-3 py-3 text-[13px] text-muted">Loading…</p>
              }
            >
              <ProjectSidebar projectId={projectId} />
            </Suspense>
          ) : onSettings ? (
            <SettingsSidebar />
          ) : (
            <ProjectTree />
          )}
        </aside>
        <div className="flex h-dvh min-h-0 min-w-0 flex-col overflow-hidden bg-canvas">
          <div className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-2.5">
            <div className="flex shrink-0 items-center gap-2 md:hidden">
              <Link href="/" className="flex items-center gap-2">
                <span className="fold h-7 w-7 rounded-md" />
                <span className="text-[13px] tracking-[0.16em]">ORIGAMI</span>
              </Link>
              {onSettings ? null : (
                <button
                  type="button"
                  onClick={() => setCreating(true)}
                  className="rounded-md bg-accent px-2.5 py-1.5 text-[12px] text-canvas"
                >
                  New
                </button>
              )}
            </div>
            <ProjectBreadcrumbs />
            <div className="ml-auto flex shrink-0 items-center gap-1">
              <SettingsMenu />
              <button
                type="button"
                onClick={logout}
                className="px-1.5 text-[12px] text-muted hover:text-ink"
              >
                Sign out
              </button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">{children}</div>
        </div>
      </div>
      {creating ? (
        <ProjectForm
          title={projectId ? "New nested project" : "New project"}
          defaultParentId={projectId}
          onClose={() => setCreating(false)}
        />
      ) : null}
    </ProjectsProvider>
  );
}

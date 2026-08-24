"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ProjectsProvider } from "@/components/ProjectsContext";
import { ProjectTree } from "@/components/ProjectTree";
import { ProjectForm } from "@/components/ProjectForm";

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);

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
            <span className="fold h-8 w-8 rounded-md" />
            <div>
              <div className="text-[13px] font-medium tracking-[0.18em] text-ink">
                ORIGAMI
              </div>
              <div className="text-[11px] text-muted">Project vault</div>
            </div>
          </div>
          <div className="border-b border-line px-3 py-3">
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="w-full rounded-md bg-accent px-3 py-2 text-left text-[13px] font-medium text-canvas hover:bg-accent-dim"
            >
              New project
            </button>
          </div>
          <ProjectTree />
        </aside>
        <div className="flex h-dvh min-h-0 min-w-0 flex-col overflow-hidden bg-canvas">
          <div className="flex shrink-0 items-center gap-3 border-b border-line px-4 py-2.5">
            <div className="flex items-center gap-2 md:hidden">
              <span className="fold h-7 w-7 rounded-md" />
              <span className="text-[13px] tracking-[0.16em]">ORIGAMI</span>
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="rounded-md bg-accent px-2.5 py-1.5 text-[12px] text-canvas"
              >
                New
              </button>
            </div>
            <button
              type="button"
              onClick={logout}
              className="ml-auto text-[12px] text-muted hover:text-ink"
            >
              Sign out
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">{children}</div>
        </div>
      </div>
      {creating ? (
        <ProjectForm
          title="New project"
          onClose={() => setCreating(false)}
        />
      ) : null}
    </ProjectsProvider>
  );
}

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
        <aside className="hidden min-h-screen flex-col border-r border-line bg-raised md:flex">
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-4">
            <div className="flex items-center gap-2.5">
              <span className="fold h-8 w-8 rounded-md" />
              <div>
                <div className="text-[13px] font-medium tracking-[0.18em] text-ink">
                  ORIGAMI
                </div>
                <div className="text-[11px] text-muted">Project vault</div>
              </div>
            </div>
            <button
              type="button"
              onClick={logout}
              className="text-[11px] text-muted hover:text-ink"
            >
              Sign out
            </button>
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
        <div className="min-w-0 bg-canvas">
          <div className="flex items-center justify-between border-b border-line px-4 py-3 md:hidden">
            <div className="flex items-center gap-2">
              <span className="fold h-7 w-7 rounded-md" />
              <span className="text-[13px] tracking-[0.16em]">ORIGAMI</span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="rounded-md bg-accent px-2.5 py-1.5 text-[12px] text-canvas"
              >
                New
              </button>
              <button
                type="button"
                onClick={logout}
                className="text-[12px] text-muted"
              >
                Sign out
              </button>
            </div>
          </div>
          {children}
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

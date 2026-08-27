"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_PROJECT_DISPLAY_SETTINGS,
  type ProjectDisplaySettings,
} from "@/lib/project-settings-types";

type Patch = {
  vaultName?: string;
};

type ProjectDisplayContextValue = {
  settings: ProjectDisplaySettings;
  save: (patch: Patch) => Promise<ProjectDisplaySettings>;
  applySettings: (next: ProjectDisplaySettings) => void;
};

const ProjectDisplayContext = createContext<ProjectDisplayContextValue | null>(
  null,
);

export function ProjectDisplayProvider({
  children,
  initialSettings,
}: {
  children: ReactNode;
  initialSettings?: ProjectDisplaySettings;
}) {
  const [settings, setSettings] = useState(
    initialSettings ?? DEFAULT_PROJECT_DISPLAY_SETTINGS,
  );

  const save = useCallback(async (patch: Patch) => {
    const res = await fetch("/api/settings/projects", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Could not save project settings");
    }
    setSettings(data.settings);
    return data.settings as ProjectDisplaySettings;
  }, []);

  const applySettings = useCallback((next: ProjectDisplaySettings) => {
    setSettings(next);
  }, []);

  return (
    <ProjectDisplayContext.Provider value={{ settings, save, applySettings }}>
      {children}
    </ProjectDisplayContext.Provider>
  );
}

export function useProjectDisplay() {
  const ctx = useContext(ProjectDisplayContext);
  if (!ctx) {
    throw new Error(
      "useProjectDisplay must be used within ProjectDisplayProvider",
    );
  }
  return ctx;
}

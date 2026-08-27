"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ProjectDTO, ProjectTreeNode } from "@/lib/shared/types";

type ProjectsContextValue = {
  projects: ProjectDTO[];
  tree: ProjectTreeNode[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const ProjectsContext = createContext<ProjectsContextValue | null>(null);

export function buildTree(projects: ProjectDTO[]): ProjectTreeNode[] {
  const map = new Map<string, ProjectTreeNode>();
  for (const project of projects) {
    map.set(project.id, { ...project, children: [] });
  }
  const roots: ProjectTreeNode[] = [];
  for (const project of projects) {
    const node = map.get(project.id)!;
    if (project.parentId && map.has(project.parentId)) {
      map.get(project.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortNodes = (nodes: ProjectTreeNode[]) => {
    nodes.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
    nodes.forEach((n) => sortNodes(n.children));
  };
  sortNodes(roots);
  return roots;
}

export function findTreeNode(
  nodes: ProjectTreeNode[],
  id: string,
): ProjectTreeNode | undefined {
  for (const node of nodes) {
    if (node.id === id) return node;
    const nested = findTreeNode(node.children, id);
    if (nested) return nested;
  }
  return undefined;
}

export function descendantIdSet(projects: ProjectDTO[], rootId: string): Set<string> {
  const children = new Map<string, string[]>();
  for (const project of projects) {
    if (project.parentId) {
      const list = children.get(project.parentId) ?? [];
      list.push(project.id);
      children.set(project.parentId, list);
    }
  }
  const out = new Set<string>([rootId]);
  const stack = [...(children.get(rootId) ?? [])];
  while (stack.length) {
    const id = stack.pop()!;
    out.add(id);
    stack.push(...(children.get(id) ?? []));
  }
  return out;
}

export function ProjectsProvider({ children }: { children: React.ReactNode }) {
  const [projects, setProjects] = useState<ProjectDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/projects");
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed to load projects");
      return;
    }
    setError(null);
    setProjects(data.projects);
  }, []);

  useEffect(() => {
    void refresh().finally(() => setLoading(false));
  }, [refresh]);

  const tree = useMemo(() => buildTree(projects), [projects]);

  return (
    <ProjectsContext.Provider value={{ projects, tree, loading, error, refresh }}>
      {children}
    </ProjectsContext.Provider>
  );
}

export function useProjects() {
  const ctx = useContext(ProjectsContext);
  if (!ctx) {
    throw new Error("useProjects must be used within ProjectsProvider");
  }
  return ctx;
}

import { and, eq, inArray, or } from "drizzle-orm";
import { json } from "@/lib/shared/api";
import { getDb } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import type { AuthUser } from "@/lib/auth/user-types";
import { getTeamMembership, userTeamIds } from "@/lib/teams/teams";
import type { ProjectVisibility } from "@/lib/shared/types";

export type ProjectAccess = {
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

export async function userCanAccessProject(
  userId: string,
  project: {
    visibility: ProjectVisibility;
    ownerUserId: string | null;
    teamId: string | null;
  },
): Promise<boolean> {
  if (project.visibility === "personal") {
    return project.ownerUserId === userId;
  }
  if (project.visibility === "team" && project.teamId) {
    const role = await getTeamMembership(project.teamId, userId);
    return role !== null;
  }
  return false;
}

export async function projectAccessForUser(
  user: AuthUser,
  project: {
    visibility: ProjectVisibility;
    ownerUserId: string | null;
    teamId: string | null;
  },
): Promise<ProjectAccess> {
  if (project.visibility === "personal") {
    const isOwner = project.ownerUserId === user.id;
    return {
      canView: isOwner,
      canEdit: isOwner,
      canDelete: isOwner,
    };
  }

  if (project.visibility === "team" && project.teamId) {
    const role = await getTeamMembership(project.teamId, user.id);
    if (!role) {
      return { canView: false, canEdit: false, canDelete: false };
    }
    return {
      canView: true,
      canEdit: true,
      canDelete: role === "owner" || role === "admin",
    };
  }

  return { canView: false, canEdit: false, canDelete: false };
}

export async function accessibleProjectIds(userId: string): Promise<string[]> {
  const db = getDb();
  const teamIds = await userTeamIds(userId);
  const rows = await db
    .select({ id: projects.id })
    .from(projects)
    .where(
      or(
        and(eq(projects.visibility, "personal"), eq(projects.ownerUserId, userId)),
        teamIds.length > 0
          ? and(
              eq(projects.visibility, "team"),
              inArray(projects.teamId, teamIds),
            )
          : undefined,
      ),
    );

  return rows.map((row) => row.id);
}

type ProjectRow = typeof projects.$inferSelect;

export async function requireAccessibleProject(
  user: AuthUser,
  projectId: string,
  level: "view" | "edit" | "delete" = "view",
): Promise<ProjectRow | Response> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(projects)
    .where(eq(projects.id, projectId))
    .limit(1);
  if (!row) {
    return json({ error: "Project not found" }, 404);
  }

  const access = await projectAccessForUser(user, row);
  const allowed =
    level === "view"
      ? access.canView
      : level === "edit"
        ? access.canEdit
        : access.canDelete;

  if (!allowed) {
    return json({ error: "Forbidden" }, 403);
  }

  return row;
}

export async function requireAccessibleAssetProject(
  user: AuthUser,
  assetProjectId: string,
  level: "view" | "edit" | "delete" = "view",
): Promise<ProjectRow | Response> {
  return requireAccessibleProject(user, assetProjectId, level);
}

import { randomBytes } from "node:crypto";
import { and, asc, eq, gt, isNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { teamInvites, teamMembers, teams, users } from "@/lib/db/schema";
import { createUser, getUserByUsername } from "@/lib/auth/users";
import type {
  PendingInviteDTO,
  TeamDTO,
  TeamInviteDTO,
  TeamMemberDTO,
  TeamRole,
} from "@/lib/teams/team-types";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function slugify(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "team";
}

async function uniqueSlug(base: string): Promise<string> {
  const db = getDb();
  let slug = slugify(base);
  let n = 0;
  while (true) {
    const candidate = n === 0 ? slug : `${slug}-${n}`;
    const [existing] = await db
      .select({ id: teams.id })
      .from(teams)
      .where(eq(teams.slug, candidate))
      .limit(1);
    if (!existing) return candidate;
    n += 1;
  }
}

export async function getTeamMembership(
  teamId: string,
  userId: string,
): Promise<TeamRole | null> {
  const db = getDb();
  const [row] = await db
    .select({ role: teamMembers.role })
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
    .limit(1);
  return row?.role ?? null;
}

export async function userTeamIds(userId: string): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({ teamId: teamMembers.teamId })
    .from(teamMembers)
    .where(eq(teamMembers.userId, userId));
  return rows.map((row) => row.teamId);
}

export async function listTeamsForUser(userId: string): Promise<TeamDTO[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: teams.id,
      name: teams.name,
      slug: teams.slug,
      createdAt: teams.createdAt,
      updatedAt: teams.updatedAt,
      role: teamMembers.role,
      memberCount: sql<number>`(
        select count(*)::int from ${teamMembers}
        where ${teamMembers.teamId} = ${teams.id}
      )`,
    })
    .from(teamMembers)
    .innerJoin(teams, eq(teamMembers.teamId, teams.id))
    .where(eq(teamMembers.userId, userId))
    .orderBy(asc(teams.name));

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    role: row.role,
    memberCount: Number(row.memberCount),
  }));
}

export async function userCanManageUsers(userId: string): Promise<boolean> {
  const teams = await listTeamsForUser(userId);
  return teams.some((team) => team.role === "owner" || team.role === "admin");
}

export async function createTeam(input: {
  name: string;
  ownerUserId: string;
}): Promise<TeamDTO> {
  const name = input.name.trim();
  if (!name) {
    throw Object.assign(new Error("Team name is required"), { status: 400 });
  }

  const db = getDb();
  const slug = await uniqueSlug(name);
  const [team] = await db
    .insert(teams)
    .values({ name, slug })
    .returning();

  await db.insert(teamMembers).values({
    teamId: team.id,
    userId: input.ownerUserId,
    role: "owner",
  });

  return {
    id: team.id,
    name: team.name,
    slug: team.slug,
    createdAt: team.createdAt.toISOString(),
    updatedAt: team.updatedAt.toISOString(),
    role: "owner",
    memberCount: 1,
  };
}

export async function listTeamMembers(teamId: string): Promise<TeamMemberDTO[]> {
  const db = getDb();
  const rows = await db
    .select({
      userId: users.id,
      username: users.username,
      displayName: users.displayName,
      role: teamMembers.role,
      joinedAt: teamMembers.joinedAt,
    })
    .from(teamMembers)
    .innerJoin(users, eq(teamMembers.userId, users.id))
    .where(eq(teamMembers.teamId, teamId))
    .orderBy(asc(users.username));

  return rows.map((row) => ({
    userId: row.userId,
    username: row.username,
    displayName: row.displayName,
    role: row.role,
    joinedAt: row.joinedAt.toISOString(),
  }));
}

export async function listTeamInvites(teamId: string): Promise<TeamInviteDTO[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: teamInvites.id,
      teamId: teamInvites.teamId,
      teamName: teams.name,
      username: teamInvites.username,
      role: teamInvites.role,
      expiresAt: teamInvites.expiresAt,
      acceptedAt: teamInvites.acceptedAt,
      createdAt: teamInvites.createdAt,
    })
    .from(teamInvites)
    .innerJoin(teams, eq(teamInvites.teamId, teams.id))
    .where(and(eq(teamInvites.teamId, teamId), isNull(teamInvites.acceptedAt)))
    .orderBy(asc(teamInvites.createdAt));

  return rows.map((row) => ({
    id: row.id,
    teamId: row.teamId,
    teamName: row.teamName,
    username: row.username,
    role: row.role,
    expiresAt: row.expiresAt.toISOString(),
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  }));
}

function canManageTeam(role: TeamRole | null): boolean {
  return role === "owner" || role === "admin";
}

export async function inviteToTeam(input: {
  teamId: string;
  invitedByUserId: string;
  username: string;
  role?: TeamRole;
}): Promise<{
  added: boolean;
  invite?: TeamInviteDTO;
  member?: TeamMemberDTO;
  inviteToken?: string;
}> {
  const username = input.username.trim();
  if (!username) {
    throw Object.assign(new Error("Username is required"), { status: 400 });
  }

  const actorRole = await getTeamMembership(input.teamId, input.invitedByUserId);
  if (!canManageTeam(actorRole)) {
    throw Object.assign(new Error("You cannot invite members to this team"), {
      status: 403,
    });
  }

  const role = input.role ?? "member";
  if (role === "owner") {
    throw Object.assign(new Error("Cannot invite someone as owner"), { status: 400 });
  }
  if (role === "admin" && actorRole !== "owner") {
    throw Object.assign(new Error("Only the team owner can invite admins"), {
      status: 403,
    });
  }

  const existingUser = await getUserByUsername(username);
  const db = getDb();

  if (existingUser) {
    const existingMember = await getTeamMembership(input.teamId, existingUser.id);
    if (existingMember) {
      throw Object.assign(new Error("User is already on this team"), { status: 409 });
    }

    await db.insert(teamMembers).values({
      teamId: input.teamId,
      userId: existingUser.id,
      role,
    });

    return {
      added: true,
      member: {
        userId: existingUser.id,
        username: existingUser.username,
        displayName: existingUser.displayName,
        role,
        joinedAt: new Date().toISOString(),
      },
    };
  }

  const token = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
  const [invite] = await db
    .insert(teamInvites)
    .values({
      teamId: input.teamId,
      username,
      token,
      role,
      invitedByUserId: input.invitedByUserId,
      expiresAt,
    })
    .returning();

  const [team] = await db
    .select({ name: teams.name })
    .from(teams)
    .where(eq(teams.id, input.teamId))
    .limit(1);

  return {
    added: false,
    invite: {
      id: invite.id,
      teamId: invite.teamId,
      teamName: team?.name ?? "Team",
      username: invite.username,
      role: invite.role,
      expiresAt: invite.expiresAt.toISOString(),
      acceptedAt: null,
      createdAt: invite.createdAt.toISOString(),
    },
    inviteToken: token,
  };
}

export async function getInviteByToken(token: string): Promise<PendingInviteDTO | null> {
  const db = getDb();
  const [row] = await db
    .select({
      token: teamInvites.token,
      teamName: teams.name,
      username: teamInvites.username,
      role: teamInvites.role,
      expiresAt: teamInvites.expiresAt,
      acceptedAt: teamInvites.acceptedAt,
    })
    .from(teamInvites)
    .innerJoin(teams, eq(teamInvites.teamId, teams.id))
    .where(eq(teamInvites.token, token))
    .limit(1);

  if (!row || row.acceptedAt || row.expiresAt.getTime() < Date.now()) {
    return null;
  }

  const existingUser = await getUserByUsername(row.username);
  return {
    token: row.token,
    teamName: row.teamName,
    username: row.username,
    role: row.role,
    expiresAt: row.expiresAt.toISOString(),
    userExists: Boolean(existingUser),
  };
}

export async function acceptInvite(input: {
  token: string;
  password?: string;
}): Promise<{ userId: string; username: string; teamId: string }> {
  const db = getDb();
  const [invite] = await db
    .select()
    .from(teamInvites)
    .where(
      and(
        eq(teamInvites.token, input.token),
        isNull(teamInvites.acceptedAt),
        gt(teamInvites.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!invite) {
    throw Object.assign(new Error("Invite is invalid or expired"), { status: 400 });
  }

  let user = await getUserByUsername(invite.username);
  if (!user) {
    if (!input.password || input.password.length < 8) {
      throw Object.assign(
        new Error("Password is required to create your account (min 8 characters)"),
        { status: 400 },
      );
    }
    const created = await createUser({
      username: invite.username,
      password: input.password,
    });
    user = {
      id: created.id,
      username: created.username,
      passwordHash: "",
      displayName: created.displayName,
      createdAt: new Date(created.createdAt),
      updatedAt: new Date(created.createdAt),
    };
  }

  const existingMember = await getTeamMembership(invite.teamId, user.id);
  if (!existingMember) {
    await db.insert(teamMembers).values({
      teamId: invite.teamId,
      userId: user.id,
      role: invite.role,
    });
  }

  await db
    .update(teamInvites)
    .set({ acceptedAt: new Date() })
    .where(eq(teamInvites.id, invite.id));

  return {
    userId: user.id,
    username: user.username,
    teamId: invite.teamId,
  };
}

export async function removeTeamMember(input: {
  teamId: string;
  actorUserId: string;
  targetUserId: string;
}): Promise<void> {
  const actorRole = await getTeamMembership(input.teamId, input.actorUserId);
  if (!canManageTeam(actorRole)) {
    throw Object.assign(new Error("You cannot remove members from this team"), {
      status: 403,
    });
  }

  const targetRole = await getTeamMembership(input.teamId, input.targetUserId);
  if (!targetRole) {
    throw Object.assign(new Error("Member not found"), { status: 404 });
  }
  if (targetRole === "owner") {
    throw Object.assign(new Error("Cannot remove the team owner"), { status: 400 });
  }
  if (targetRole === "admin" && actorRole !== "owner") {
    throw Object.assign(new Error("Only the team owner can remove admins"), {
      status: 403,
    });
  }

  const db = getDb();
  await db
    .delete(teamMembers)
    .where(
      and(
        eq(teamMembers.teamId, input.teamId),
        eq(teamMembers.userId, input.targetUserId),
      ),
    );
}

export async function revokeInvite(input: {
  teamId: string;
  actorUserId: string;
  inviteId: string;
}): Promise<void> {
  const actorRole = await getTeamMembership(input.teamId, input.actorUserId);
  if (!canManageTeam(actorRole)) {
    throw Object.assign(new Error("You cannot revoke invites for this team"), {
      status: 403,
    });
  }

  const db = getDb();
  await db
    .delete(teamInvites)
    .where(and(eq(teamInvites.id, input.inviteId), eq(teamInvites.teamId, input.teamId)));
}

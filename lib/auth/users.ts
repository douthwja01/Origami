import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import type { AuthUser, UserDTO } from "@/lib/auth/user-types";
import { logOrigami } from "@/lib/settings/log";

const BCRYPT_ROUNDS = 12;

export function hashPassword(password: string): string {
  return bcrypt.hashSync(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

function toAuthUser(row: typeof users.$inferSelect): AuthUser {
  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
  };
}

export async function getUserByUsername(
  username: string,
): Promise<(typeof users.$inferSelect) | null> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(users)
    .where(eq(users.username, username.trim()))
    .limit(1);
  return row ?? null;
}

export async function getUserById(id: string): Promise<AuthUser | null> {
  const db = getDb();
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return row ? toAuthUser(row) : null;
}

export async function authenticateUser(
  username: string,
  password: string,
): Promise<AuthUser | null> {
  const row = await getUserByUsername(username);
  if (!row) return null;
  const ok = await verifyPassword(password, row.passwordHash);
  return ok ? toAuthUser(row) : null;
}

export async function createUser(input: {
  username: string;
  password: string;
  displayName?: string | null;
  createdByUserId?: string;
}): Promise<UserDTO> {
  const username = input.username.trim();
  if (!username) {
    throw Object.assign(new Error("Username is required"), { status: 400 });
  }
  if (!input.password) {
    throw Object.assign(new Error("Password is required"), { status: 400 });
  }
  if (input.password.length < 8) {
    throw Object.assign(new Error("Password must be at least 8 characters"), {
      status: 400,
    });
  }

  const existing = await getUserByUsername(username);
  if (existing) {
    throw Object.assign(new Error("Username already taken"), { status: 409 });
  }

  const db = getDb();
  const [row] = await db
    .insert(users)
    .values({
      username,
      passwordHash: hashPassword(input.password),
      displayName: input.displayName?.trim() || null,
    })
    .returning();

  if (input.createdByUserId) {
    const creator = await getUserById(input.createdByUserId);
    logOrigami(
      "info",
      `user created (${row.username}) by ${creator?.username ?? input.createdByUserId}`,
    );
  } else {
    logOrigami("info", `user created (${row.username})`);
  }

  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  if (!newPassword || newPassword.length < 8) {
    throw Object.assign(new Error("New password must be at least 8 characters"), {
      status: 400,
    });
  }

  const db = getDb();
  const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!row) {
    throw Object.assign(new Error("User not found"), { status: 404 });
  }

  const ok = await verifyPassword(currentPassword, row.passwordHash);
  if (!ok) {
    throw Object.assign(new Error("Current password is incorrect"), { status: 401 });
  }

  await db
    .update(users)
    .set({
      passwordHash: hashPassword(newPassword),
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));
}

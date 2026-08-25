import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { appSettings } from "@/lib/db/schema";
import {
  DEFAULT_THEME_ID,
  THEME_COOKIE,
  parseThemeId,
  type ThemeId,
} from "@/lib/themes";

function themeCookieOptions() {
  return {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
}

async function ensureSettingsRow() {
  const db = getDb();
  let [row] = await db
    .select({ theme: appSettings.theme })
    .from(appSettings)
    .where(eq(appSettings.id, 1))
    .limit(1);
  if (!row) {
    [row] = await db
      .insert(appSettings)
      .values({ id: 1 })
      .returning({ theme: appSettings.theme });
  }
  return row;
}

export async function getStoredTheme(): Promise<ThemeId> {
  const row = await ensureSettingsRow();
  return parseThemeId(row.theme);
}

export async function updateStoredTheme(theme: ThemeId): Promise<ThemeId> {
  await ensureSettingsRow();
  const db = getDb();
  await db
    .update(appSettings)
    .set({ theme })
    .where(eq(appSettings.id, 1));
  const jar = await cookies();
  jar.set(THEME_COOKIE, theme, themeCookieOptions());
  return theme;
}

export async function resolveTheme(): Promise<ThemeId> {
  try {
    return await getStoredTheme();
  } catch {
    try {
      const jar = await cookies();
      return parseThemeId(jar.get(THEME_COOKIE)?.value);
    } catch {
      return DEFAULT_THEME_ID;
    }
  }
}

import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";

export type SessionData = {
  user?: string;
};

export function getSessionOptions(): SessionOptions {
  const password = process.env.ORIGAMI_SESSION_SECRET;
  if (!password || password.length < 32) {
    throw new Error(
      "ORIGAMI_SESSION_SECRET must be set to at least 32 characters",
    );
  }
  return {
    password,
    cookieName: "origami_session",
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    },
  };
}

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), getSessionOptions());
}

import { NextResponse, type NextRequest } from "next/server";
import { getIronSession } from "iron-session";
import { getSessionOptions, type SessionData } from "@/lib/session";

export async function proxy(request: NextRequest) {
  const response = NextResponse.next();
  let session: SessionData = {};
  try {
    session = await getIronSession<SessionData>(
      request,
      response,
      getSessionOptions(),
    );
  } catch {
    session = {};
  }

  const path = request.nextUrl.pathname;
  const isLogin = path === "/login" || path === "/api/auth/login";
  const isPublicAsset =
    path.startsWith("/_next") ||
    path === "/favicon.ico" ||
    path === "/icon.svg";

  if (isPublicAsset) return response;

  if (!session.user && !isLogin) {
    if (path.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (session.user && path === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};

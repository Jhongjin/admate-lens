import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { createClient, type Session, type User } from "@supabase/supabase-js";
import { createServerClient } from "@/lib/supabase/client";

export const LENS_ACCESS_TOKEN_COOKIE = "admate_lens_access_token";
export const LENS_REFRESH_TOKEN_COOKIE = "admate_lens_refresh_token";
export const LENS_LOCAL_AUTH_COOKIE = "admate_lens_local_auth";

const DEFAULT_LOGIN_REDIRECT = "/";
const SESSION_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 8;
const LOCAL_DEV_USER_ID = "lens-local-dev-user";

function isLocalLensAuthBypassEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.IS_LOCAL === "true" &&
    process.env.LENS_LOCAL_AUTH_BYPASS === "true"
  );
}

function getSupabaseUrl(): string {
  const value = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!value) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must be set");
  }
  return value;
}

function getSupabaseAnonKey(): string {
  const value = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  if (!value) {
    throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY must be set");
  }
  return value;
}

function createAuthClient() {
  return createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export function sanitizeLensNextPath(raw: string | null | undefined): string {
  if (!raw) return DEFAULT_LOGIN_REDIRECT;
  const value = raw.trim();
  if (!value.startsWith("/")) return DEFAULT_LOGIN_REDIRECT;
  if (value.startsWith("//")) return DEFAULT_LOGIN_REDIRECT;
  if (value.startsWith("/api")) return DEFAULT_LOGIN_REDIRECT;
  if (value.toLowerCase().includes("javascript:")) return DEFAULT_LOGIN_REDIRECT;

  try {
    const parsed = new URL(value, "https://lens.admate.ai.kr");
    if (parsed.origin !== "https://lens.admate.ai.kr") {
      return DEFAULT_LOGIN_REDIRECT;
    }
    if (!parsed.pathname.startsWith("/")) {
      return DEFAULT_LOGIN_REDIRECT;
    }
    if (parsed.pathname.startsWith("/api")) {
      return DEFAULT_LOGIN_REDIRECT;
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return DEFAULT_LOGIN_REDIRECT;
  }
}

function getCookieMaxAge(session: Session): number {
  if (typeof session.expires_in === "number" && Number.isFinite(session.expires_in)) {
    return Math.max(60, session.expires_in);
  }
  return SESSION_COOKIE_MAX_AGE_SECONDS;
}

function makeLocalLensUser(email?: string): User {
  const resolvedEmail = email?.trim() || "local-lens@admate.dev";
  return {
    id: LOCAL_DEV_USER_ID,
    aud: "authenticated",
    role: "authenticated",
    email: resolvedEmail,
    app_metadata: {
      provider: "local-dev",
      providers: ["local-dev"],
    },
    user_metadata: {
      email: resolvedEmail,
      name: "Local Lens Operator",
    },
    created_at: "1970-01-01T00:00:00.000Z",
  } as User;
}

function getLocalLensUserFromCookie(cookieValue: string | undefined): User | null {
  if (!isLocalLensAuthBypassEnabled() || !cookieValue) return null;
  try {
    return makeLocalLensUser(decodeURIComponent(cookieValue));
  } catch {
    return makeLocalLensUser();
  }
}

export function applyLensSessionCookies(response: NextResponse, session: Session) {
  const maxAge = getCookieMaxAge(session);
  const secure = process.env.NODE_ENV === "production";

  response.cookies.set({
    name: LENS_ACCESS_TOKEN_COOKIE,
    value: session.access_token,
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge,
  });

  response.cookies.set({
    name: LENS_REFRESH_TOKEN_COOKIE,
    value: session.refresh_token,
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge,
  });
}

export function applyLocalLensSessionCookie(response: NextResponse, email: string) {
  if (!isLocalLensAuthBypassEnabled()) return;

  response.cookies.set({
    name: LENS_LOCAL_AUTH_COOKIE,
    value: encodeURIComponent(email.trim() || "local-lens@admate.dev"),
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
  });
}

export function clearLensSessionCookies(response: NextResponse) {
  const secure = process.env.NODE_ENV === "production";

  response.cookies.set({
    name: LENS_ACCESS_TOKEN_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 0,
  });

  response.cookies.set({
    name: LENS_REFRESH_TOKEN_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 0,
  });

  response.cookies.set({
    name: LENS_LOCAL_AUTH_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    path: "/",
    maxAge: 0,
  });
}

async function getLensUserFromAccessToken(accessToken: string | undefined): Promise<User | null> {
  if (!accessToken) return null;
  try {
    const supabase = createServerClient();
    const { data, error } = await supabase.auth.getUser(accessToken);
    if (error) return null;
    return data.user ?? null;
  } catch {
    return null;
  }
}

export async function getCurrentLensUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const localUser = getLocalLensUserFromCookie(cookieStore.get(LENS_LOCAL_AUTH_COOKIE)?.value);
  if (localUser) return localUser;
  return getLensUserFromAccessToken(cookieStore.get(LENS_ACCESS_TOKEN_COOKIE)?.value);
}

export async function getLensUserFromRequest(request: NextRequest): Promise<User | null> {
  const localUser = getLocalLensUserFromCookie(request.cookies.get(LENS_LOCAL_AUTH_COOKIE)?.value);
  if (localUser) return localUser;
  return getLensUserFromAccessToken(request.cookies.get(LENS_ACCESS_TOKEN_COOKIE)?.value);
}

export async function requireLensSession(
  request: NextRequest
): Promise<{ user: User } | { response: NextResponse }> {
  const user = await getLensUserFromRequest(request);
  if (!user) {
    return {
      response: NextResponse.json(
        {
          error: "로그인이 필요합니다.",
          code: "auth_required",
        },
        { status: 401 }
      ),
    };
  }

  return { user };
}

export async function signInLensUser(email: string, password: string) {
  const authClient = createAuthClient();
  return authClient.auth.signInWithPassword({ email, password });
}

export function canUseLocalLensAuthBypass(): boolean {
  return isLocalLensAuthBypassEnabled();
}

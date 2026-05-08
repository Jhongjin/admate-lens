"use client";

export const LENS_AUTH_EXPIRED_MESSAGE =
  "로그인이 만료되었습니다. 다시 로그인해 주세요.";

type LensAuthPayload = {
  code?: string;
  error?: string;
};

export class LensAuthExpiredError extends Error {
  constructor(message = LENS_AUTH_EXPIRED_MESSAGE) {
    super(message);
    this.name = "LensAuthExpiredError";
  }
}

export function isLensAuthRequiredResponse(
  response: Response,
  payload?: LensAuthPayload | null,
): boolean {
  return response.status === 401 || payload?.code === "auth_required";
}

export function createLensAuthExpiredError(
  payload?: LensAuthPayload | null,
): LensAuthExpiredError {
  const message =
    payload?.error?.trim() || LENS_AUTH_EXPIRED_MESSAGE;
  return new LensAuthExpiredError(message);
}

export function isLensAuthExpiredError(error: unknown): error is LensAuthExpiredError {
  return error instanceof LensAuthExpiredError;
}

export function buildLensLoginPath(nextPath: string): string {
  return `/login?next=${encodeURIComponent(nextPath)}`;
}

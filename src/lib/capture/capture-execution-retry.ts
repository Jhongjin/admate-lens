import { CaptureAbortError } from "./abort-registry";

export interface CaptureRetryOptions {
  maxAttempts: number;
  timeoutMs: number;
  onRetry?: (attempt: number, error: unknown) => void;
  onTimeout?: () => void;
  shouldRetry?: (error: unknown) => boolean;
}

export async function executeCaptureWithRetry<T>(
  fn: () => Promise<T>,
  options: CaptureRetryOptions,
): Promise<T> {
  let lastErr: unknown;
  const shouldRetry = options.shouldRetry ?? isRetryableCaptureTimeout;

  for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
    try {
      return await withCaptureTimeout(fn(), options.timeoutMs, options.onTimeout);
    } catch (err) {
      lastErr = err;

      if (err instanceof CaptureAbortError || !shouldRetry(err)) {
        break;
      }

      if (attempt >= options.maxAttempts) {
        break;
      }

      options.onRetry?.(attempt, err);
    }
  }

  throw lastErr instanceof Error
    ? lastErr
    : new Error(String(lastErr ?? "retry failed"));
}

export async function withCaptureTimeout<T>(
  promise: Promise<T>,
  ms: number,
  onTimeout?: () => void,
): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(
          () => {
            onTimeout?.();
            reject(new Error(`Capture timeout (${ms}ms)`));
          },
          ms,
        );
      }),
    ]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

export function isRetryableCaptureTimeout(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return (
    message.includes("capture timeout") ||
    message.includes("timeout") ||
    message.includes("timed out")
  );
}

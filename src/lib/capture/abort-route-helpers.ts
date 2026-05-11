import {
  CaptureAbortError,
  createCaptureAbortRegistry,
  type CaptureAbortHandle,
  type CaptureAbortRegistry,
} from "./abort-registry";

export const USER_CANCELLED_CAPTURE_MESSAGE = "사용자가 캡처를 중단했습니다.";

export const captureRouteAbortRegistry = createCaptureAbortRegistry();

export type CancellableCaptureStatus = "pending" | "processing";

export interface CaptureAbortCandidate {
  id: string;
  status: string;
}

export interface RuntimeAbortResult {
  id: string;
  registryHit: boolean;
}

export interface CaptureAbortPlanResult {
  cancelledIds: string[];
  runtimeAbortResults: RuntimeAbortResult[];
}

export interface CaptureUploadResult {
  path: string;
  publicUrl: string;
}

export interface CapturePersistResult {
  placementScreenshot: Buffer;
  landingScreenshot?: Buffer;
  capturedAt: string;
  landingUrl?: string;
}

export interface CapturePersistOperations {
  uploadPlacement(screenshot: Buffer): Promise<CaptureUploadResult>;
  uploadLanding?(screenshot: Buffer): Promise<CaptureUploadResult>;
  markCompleted(input: {
    placementUpload: CaptureUploadResult;
    landingUpload?: CaptureUploadResult;
    capturedAt: string;
    landingUrl?: string;
  }): Promise<void>;
}

export interface CapturePersistOutcome {
  completed: boolean;
  placementUpload?: CaptureUploadResult;
  landingUpload?: CaptureUploadResult;
  skippedReason?: "aborted-before-upload" | "aborted-after-upload";
}

export interface AbortAwareBatchItem<T> {
  id: string;
  run(): Promise<T>;
}

export type AbortAwareBatchResult<T> =
  | { id: string; success: true; value: T }
  | { id: string; success: false; aborted: true; error: CaptureAbortError }
  | { id: string; success: false; aborted: false; error: unknown };

export function normalizeCaptureAbortIds(ids: readonly unknown[]): string[] {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const id of ids) {
    if (typeof id !== "string") continue;
    const trimmed = id.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    normalized.push(trimmed);
  }

  return normalized;
}

export function isCancellableCaptureStatus(
  status: string,
): status is CancellableCaptureStatus {
  return status === "pending" || status === "processing";
}

export async function cancelCaptureCandidates(options: {
  candidates: readonly CaptureAbortCandidate[];
  registry: CaptureAbortRegistry;
  markDurableCancelled(ids: string[], message: string): Promise<string[]>;
  reason?: string;
}): Promise<CaptureAbortPlanResult> {
  const cancellableIds = normalizeCaptureAbortIds(
    options.candidates
      .filter((candidate) => isCancellableCaptureStatus(candidate.status))
      .map((candidate) => candidate.id),
  );
  const cancelledIds = await options.markDurableCancelled(
    cancellableIds,
    USER_CANCELLED_CAPTURE_MESSAGE,
  );
  const cancelledSet = new Set(cancelledIds);
  const runtimeAbortResults: RuntimeAbortResult[] = [];

  for (const candidate of options.candidates) {
    const id = candidate.id.trim();
    if (
      !id ||
      candidate.status !== "processing" ||
      !cancelledSet.has(id)
    ) {
      continue;
    }

    runtimeAbortResults.push({
      id,
      registryHit: options.registry.requestAbort(
        id,
        options.reason ?? "capture-abort-requested",
      ),
    });
  }

  return { cancelledIds, runtimeAbortResults };
}

export async function runWithCaptureAbortRegistration<T>(
  registry: CaptureAbortRegistry,
  id: string,
  run: (handle: CaptureAbortHandle) => Promise<T>,
): Promise<T> {
  const handle = registry.register(id);
  try {
    return await run(handle);
  } finally {
    handle.unregister();
  }
}

export async function persistCaptureResultWithAbortGuard(
  handle: CaptureAbortHandle,
  result: CapturePersistResult,
  operations: CapturePersistOperations,
): Promise<CapturePersistOutcome> {
  if (!handle.canWrite()) {
    return { completed: false, skippedReason: "aborted-before-upload" };
  }

  handle.setPhase("writing");
  const placementUpload = await operations.uploadPlacement(
    result.placementScreenshot,
  );

  if (!handle.canWrite()) {
    return {
      completed: false,
      placementUpload,
      skippedReason: "aborted-after-upload",
    };
  }

  const landingUpload =
    result.landingScreenshot && operations.uploadLanding
      ? await operations.uploadLanding(result.landingScreenshot)
      : undefined;

  if (!handle.canWrite()) {
    return {
      completed: false,
      placementUpload,
      landingUpload,
      skippedReason: "aborted-after-upload",
    };
  }

  await operations.markCompleted({
    placementUpload,
    landingUpload,
    capturedAt: result.capturedAt,
    landingUrl: result.landingUrl,
  });
  handle.setPhase("completed");

  return { completed: true, placementUpload, landingUpload };
}

export async function runAbortAwareBatch<T>(
  items: readonly AbortAwareBatchItem<T>[],
): Promise<AbortAwareBatchResult<T>[]> {
  const results: AbortAwareBatchResult<T>[] = [];

  for (const item of items) {
    try {
      results.push({ id: item.id, success: true, value: await item.run() });
    } catch (error) {
      if (error instanceof CaptureAbortError) {
        results.push({ id: item.id, success: false, aborted: true, error });
      } else {
        results.push({ id: item.id, success: false, aborted: false, error });
      }
    }
  }

  return results;
}

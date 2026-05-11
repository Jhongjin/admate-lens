import assert from "node:assert/strict";
import {
  CaptureAbortError,
  CaptureAbortRegistry,
} from "../../src/lib/capture/abort-registry";
import {
  cancelCaptureCandidates,
  persistCaptureResultWithAbortGuard,
  runAbortAwareBatch,
  runWithCaptureAbortRegistration,
  USER_CANCELLED_CAPTURE_MESSAGE,
  type CaptureAbortCandidate,
  type CaptureUploadResult,
} from "../../src/lib/capture/abort-route-helpers";
import {
  executeCaptureWithRetry,
  isRetryableCaptureTimeout,
} from "../../src/lib/capture/capture-execution-retry";

async function assertDurableCancelAndRegistryHitMiss(): Promise<void> {
  const registry = new CaptureAbortRegistry();
  registry.register("processing-hit");
  const candidates: CaptureAbortCandidate[] = [
    { id: "processing-hit", status: "processing" },
    { id: "processing-miss", status: "processing" },
    { id: "pending-only", status: "pending" },
    { id: "completed-skip", status: "completed" },
  ];
  const durableCalls: Array<{ ids: string[]; message: string }> = [];

  const result = await cancelCaptureCandidates({
    candidates,
    registry,
    reason: "operator-cancel",
    markDurableCancelled: async (ids, message) => {
      durableCalls.push({ ids, message });
      return ids;
    },
  });

  assert.deepEqual(result.cancelledIds, [
    "processing-hit",
    "processing-miss",
    "pending-only",
  ]);
  assert.deepEqual(durableCalls, [
    {
      ids: ["processing-hit", "processing-miss", "pending-only"],
      message: USER_CANCELLED_CAPTURE_MESSAGE,
    },
  ]);
  assert.deepEqual(result.runtimeAbortResults, [
    { id: "processing-hit", registryHit: true },
    { id: "processing-miss", registryHit: false },
  ]);
  assert.equal(registry.get("processing-hit")?.aborted, true);
  assert.equal(registry.get("pending-only"), undefined);
}

async function assertUnregisterInFinally(): Promise<void> {
  const registry = new CaptureAbortRegistry();

  await assert.rejects(
    () =>
      runWithCaptureAbortRegistration(registry, "capture-a", async () => {
        throw new Error("capture failed");
      }),
    /capture failed/,
  );

  assert.equal(registry.get("capture-a"), undefined);
}

async function assertAbortErrorDoesNotRetry(): Promise<void> {
  let attempts = 0;

  await assert.rejects(
    () =>
      executeCaptureWithRetry(
        async () => {
          attempts += 1;
          throw new CaptureAbortError("Capture aborted", "operator-cancel");
        },
        {
          maxAttempts: 3,
          timeoutMs: 1000,
          shouldRetry: isRetryableCaptureTimeout,
        },
      ),
    CaptureAbortError,
  );

  assert.equal(attempts, 1);
}

async function assertAbortBeforeUploadPreventsFakeUpload(): Promise<void> {
  const registry = new CaptureAbortRegistry();
  const handle = registry.register("capture-a");
  let uploadCount = 0;

  registry.requestAbort("capture-a", "before-upload");

  const outcome = await persistCaptureResultWithAbortGuard(
    handle,
    {
      placementScreenshot: Buffer.from("placement"),
      capturedAt: "2026-05-12T00:00:00.000Z",
    },
    {
      uploadPlacement: async () => {
        uploadCount += 1;
        return { path: "captures/a/placement.png", publicUrl: "https://cdn/a.png" };
      },
      markCompleted: async () => {
        throw new Error("must not complete");
      },
    },
  );

  assert.equal(outcome.completed, false);
  assert.equal(outcome.skippedReason, "aborted-before-upload");
  assert.equal(uploadCount, 0);
}

async function assertAbortAfterUploadSuppressesCompletedWrite(): Promise<void> {
  const registry = new CaptureAbortRegistry();
  const handle = registry.register("capture-a");
  let uploadCount = 0;
  let completedCount = 0;
  const uploads: CaptureUploadResult[] = [];

  const outcome = await persistCaptureResultWithAbortGuard(
    handle,
    {
      placementScreenshot: Buffer.from("placement"),
      capturedAt: "2026-05-12T00:00:00.000Z",
    },
    {
      uploadPlacement: async () => {
        uploadCount += 1;
        registry.requestAbort("capture-a", "after-upload");
        const upload = {
          path: "captures/a/placement.png",
          publicUrl: "https://cdn/a.png",
        };
        uploads.push(upload);
        return upload;
      },
      markCompleted: async () => {
        completedCount += 1;
      },
    },
  );

  assert.equal(outcome.completed, false);
  assert.equal(outcome.skippedReason, "aborted-after-upload");
  assert.equal(uploadCount, 1);
  assert.deepEqual(outcome.placementUpload, uploads[0]);
  assert.equal(completedCount, 0);
}

async function assertBatchContinuesAfterAbort(): Promise<void> {
  const results = await runAbortAwareBatch([
    {
      id: "aborted",
      run: async () => {
        throw new CaptureAbortError("Capture aborted", "operator-cancel");
      },
    },
    {
      id: "next",
      run: async () => "completed",
    },
  ]);

  assert.equal(results.length, 2);
  assert.deepEqual(
    results.map((result) => ({
      id: result.id,
      success: result.success,
      aborted: result.success ? false : result.aborted,
    })),
    [
      { id: "aborted", success: false, aborted: true },
      { id: "next", success: true, aborted: false },
    ],
  );
}

async function run(): Promise<void> {
  await assertDurableCancelAndRegistryHitMiss();
  await assertUnregisterInFinally();
  await assertAbortErrorDoesNotRetry();
  await assertAbortBeforeUploadPreventsFakeUpload();
  await assertAbortAfterUploadSuppressesCompletedWrite();
  await assertBatchContinuesAfterAbort();
}

run()
  .then(() => {
    console.log("[fake-route-abort] ok");
  })
  .catch((error) => {
    console.error("[fake-route-abort] failed");
    console.error(error);
    process.exitCode = 1;
  });

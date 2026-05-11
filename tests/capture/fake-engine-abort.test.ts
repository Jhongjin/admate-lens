import assert from "node:assert/strict";
import {
  abortableDelay,
  CaptureAbortError,
  CaptureAbortRegistry,
  DuplicateCaptureAbortIdError,
  type AbortablePageHandle,
  type CaptureAbortHandle,
  createCaptureAbortRegistry,
  createCaptureExecutionContext,
} from "../../src/lib/capture/abort-registry";

class FakePage implements AbortablePageHandle {
  closeCount = 0;

  async close(): Promise<void> {
    this.closeCount += 1;
  }
}

class FakeEngine {
  readonly writes: string[] = [];

  constructor(private readonly handle: CaptureAbortHandle) {}

  async runWrite(value: string): Promise<boolean> {
    this.handle.setPhase("writing");
    await abortableDelay(1, this.handle.signal);
    if (!this.handle.canWrite()) return false;
    this.writes.push(value);
    return true;
  }
}

async function assertRegisterUnregister(): Promise<void> {
  const registry = createCaptureAbortRegistry();
  const handle = createCaptureExecutionContext(registry, "capture-a");

  assert.equal(handle.id, "capture-a");
  assert.equal(handle.getPhase(), "registered");
  assert.equal(registry.listActive().length, 1);
  assert.equal(handle.unregister(), true);
  assert.equal(registry.get("capture-a"), undefined);
}

async function assertDuplicateActiveIdBehavior(): Promise<void> {
  const registry = new CaptureAbortRegistry();
  registry.register("capture-a");

  assert.throws(
    () => registry.register("capture-a"),
    DuplicateCaptureAbortIdError,
  );

  assert.equal(registry.requestAbort("capture-a", "replace-after-abort"), true);
  const replacement = registry.register("capture-a");
  assert.equal(replacement.signal.aborted, false);
  assert.equal(replacement.getPhase(), "registered");
}

async function assertRequestAbortAndPageClose(): Promise<void> {
  const registry = new CaptureAbortRegistry();
  const handle = registry.register("capture-a");
  const page = new FakePage();
  handle.attachPage(page);

  assert.equal(registry.requestAbort("capture-a", "user-request"), true);
  await Promise.resolve();

  const snapshot = handle.snapshot();
  assert.equal(handle.signal.aborted, true);
  assert.equal(snapshot.phase, "aborted");
  assert.equal(snapshot.abortReason, "user-request");
  assert.equal(snapshot.pageAttached, true);
  assert.equal(snapshot.pageCloseRequested, true);
  assert.equal(page.closeCount, 1);
  assert.equal(registry.requestAbort("missing"), false);
}

async function assertAbortableDelay(): Promise<void> {
  const registry = new CaptureAbortRegistry();
  const handle = registry.register("capture-a");
  const delay = abortableDelay(50, handle.signal);

  registry.requestAbort("capture-a", "timeout-budget");

  await assert.rejects(delay, (error) => {
    assert.equal(error instanceof CaptureAbortError, true);
    assert.equal((error as CaptureAbortError).reason, "timeout-budget");
    return true;
  });
}

async function assertPhaseTracking(): Promise<void> {
  const registry = new CaptureAbortRegistry();
  const handle = registry.register("capture-a");

  handle.setPhase("launching");
  assert.equal(registry.get("capture-a")?.phase, "launching");

  handle.setPhase("rendering");
  assert.equal(handle.snapshot().phase, "rendering");
}

async function assertFakeWriteSuppressionAfterAbort(): Promise<void> {
  const registry = new CaptureAbortRegistry();
  const handle = registry.register("capture-a");
  const engine = new FakeEngine(handle);

  registry.requestAbort("capture-a", "operator-cancel");

  await assert.rejects(
    () => engine.runWrite("should-not-write"),
    CaptureAbortError,
  );
  assert.deepEqual(engine.writes, []);
}

async function run(): Promise<void> {
  await assertRegisterUnregister();
  await assertDuplicateActiveIdBehavior();
  await assertRequestAbortAndPageClose();
  await assertAbortableDelay();
  await assertPhaseTracking();
  await assertFakeWriteSuppressionAfterAbort();
}

run()
  .then(() => {
    console.log("[fake-engine-abort] ok");
  })
  .catch((error) => {
    console.error("[fake-engine-abort] failed");
    console.error(error);
    process.exitCode = 1;
  });

import assert from "node:assert/strict";
import {
  BaseChannel,
  type CaptureRequest,
} from "../../src/lib/capture/channels/base-channel";
import type {
  IBrowserEngine,
  IPageHandle,
  IScreenshotOptions,
  IViewport,
} from "../../src/lib/capture/engine/browser-engine";
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

class FakePage implements AbortablePageHandle, IPageHandle {
  closeCount = 0;
  gotoCount = 0;
  screenshotCount = 0;
  evaluateCount = 0;
  currentUrl = "about:blank";

  constructor(private readonly afterGoto?: () => void) {}

  async goto(url: string): Promise<void> {
    this.gotoCount += 1;
    this.currentUrl = url;
    this.afterGoto?.();
  }

  async screenshot(_options?: IScreenshotOptions): Promise<Buffer> {
    this.screenshotCount += 1;
    return Buffer.from("fake-screenshot");
  }

  async screenshotElement(): Promise<Buffer> {
    return Buffer.from("fake-element-screenshot");
  }

  async evaluate<T>(): Promise<T> {
    this.evaluateCount += 1;
    return undefined as T;
  }

  async evaluateOnNewDocument(): Promise<void> {}

  async click(): Promise<void> {}

  async waitForSelector(): Promise<void> {}

  async waitForNavigation(): Promise<void> {}

  async setViewport(_viewport: IViewport): Promise<void> {}

  async setUserAgent(): Promise<void> {}

  async setCookie(): Promise<void> {}

  url(): string {
    return this.currentUrl;
  }

  async close(): Promise<void> {
    this.closeCount += 1;
  }
}

class FakeBrowserEngine implements IBrowserEngine {
  launchCount = 0;
  closeCount = 0;

  constructor(readonly page: FakePage) {}

  async launch(): Promise<void> {
    this.launchCount += 1;
  }

  async newPage(): Promise<IPageHandle> {
    return this.page;
  }

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

class FakeBaseChannel extends BaseChannel {
  placementCount = 0;

  async captureAdPlacement(
    _page: IPageHandle,
    _request: CaptureRequest,
  ): Promise<Buffer> {
    this.placementCount += 1;
    return Buffer.from("fake-placement");
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

async function assertBaseChannelAttachesPageAndCompletes(): Promise<void> {
  const registry = new CaptureAbortRegistry();
  const handle = registry.register("capture-a");
  const page = new FakePage();
  const engine = new FakeBrowserEngine(page);
  const channel = new FakeBaseChannel(engine);

  const result = await channel.execute(
    {
      publisherUrl: "https://publisher.example",
      creativeUrl: "https://creative.example/ad.png",
    },
    handle,
  );

  assert.equal(engine.launchCount, 0);
  assert.equal(engine.closeCount, 0);
  assert.equal(channel.placementCount, 1);
  assert.equal(result.placementScreenshot.toString(), "fake-placement");
  assert.equal(handle.snapshot().pageAttached, true);
  assert.equal(handle.snapshot().phase, "completed");
  assert.equal(page.closeCount, 1);
}

async function assertBaseChannelAbortDuringLandingDelay(): Promise<void> {
  const registry = new CaptureAbortRegistry();
  const handle = registry.register("capture-a");
  const page = new FakePage(() => {
    setTimeout(() => {
      registry.requestAbort("capture-a", "landing-cancel");
    }, 0);
  });
  const engine = new FakeBrowserEngine(page);
  const channel = new FakeBaseChannel(engine);

  await assert.rejects(
    () =>
      channel.execute(
        {
          publisherUrl: "https://publisher.example",
          creativeUrl: "https://creative.example/ad.png",
          captureLanding: true,
          clickUrl: "https://landing.example",
          options: { gdnViewportMode: "mobile" },
        },
        handle,
      ),
    (error) => {
      assert.equal(error instanceof CaptureAbortError, true);
      assert.equal((error as CaptureAbortError).reason, "landing-cancel");
      return true;
    },
  );

  const snapshot = handle.snapshot();
  assert.equal(snapshot.phase, "aborted");
  assert.equal(snapshot.pageAttached, true);
  assert.equal(snapshot.pageCloseRequested, true);
  assert.equal(page.gotoCount, 1);
  assert.equal(page.screenshotCount, 0);
  assert.equal(page.closeCount >= 1, true);
}

async function run(): Promise<void> {
  await assertRegisterUnregister();
  await assertDuplicateActiveIdBehavior();
  await assertRequestAbortAndPageClose();
  await assertAbortableDelay();
  await assertPhaseTracking();
  await assertFakeWriteSuppressionAfterAbort();
  await assertBaseChannelAttachesPageAndCompletes();
  await assertBaseChannelAbortDuringLandingDelay();
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

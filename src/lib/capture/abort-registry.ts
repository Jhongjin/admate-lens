export type CaptureAbortPhase =
  | "registered"
  | "launching"
  | "navigating"
  | "rendering"
  | "writing"
  | "completed"
  | "aborted"
  | "failed";

export interface AbortablePageHandle {
  close(): Promise<void>;
}

export interface CaptureAbortSnapshot {
  id: string;
  phase: CaptureAbortPhase;
  registeredAt: number;
  aborted: boolean;
  abortReason?: string;
  abortRequestedAt?: number;
  pageAttached: boolean;
  pageCloseRequested: boolean;
}

export interface CaptureAbortHandle {
  readonly id: string;
  readonly signal: AbortSignal;
  getPhase(): CaptureAbortPhase;
  setPhase(phase: CaptureAbortPhase): void;
  attachPage(page: AbortablePageHandle): void;
  snapshot(): CaptureAbortSnapshot;
  canWrite(): boolean;
  throwIfAborted(): void;
  unregister(): boolean;
}

interface CaptureAbortRecord {
  id: string;
  controller: AbortController;
  phase: CaptureAbortPhase;
  registeredAt: number;
  abortReason?: string;
  abortRequestedAt?: number;
  page?: AbortablePageHandle;
  pageClosePromise?: Promise<void>;
}

export class DuplicateCaptureAbortIdError extends Error {
  constructor(id: string) {
    super(`Capture abort id is already active: ${id}`);
    this.name = "DuplicateCaptureAbortIdError";
  }
}

export class CaptureAbortError extends Error {
  constructor(
    message: string,
    readonly reason?: string,
  ) {
    super(message);
    this.name = "CaptureAbortError";
  }
}

export class CaptureAbortRegistry {
  private readonly records = new Map<string, CaptureAbortRecord>();

  register(id: string): CaptureAbortHandle {
    const normalizedId = id.trim();
    if (!normalizedId) {
      throw new Error("Capture abort id must be a non-empty string");
    }

    const existing = this.records.get(normalizedId);
    if (existing && !existing.controller.signal.aborted) {
      throw new DuplicateCaptureAbortIdError(normalizedId);
    }

    const record: CaptureAbortRecord = {
      id: normalizedId,
      controller: new AbortController(),
      phase: "registered",
      registeredAt: Date.now(),
    };
    this.records.set(normalizedId, record);

    return this.createHandle(record);
  }

  unregister(id: string): boolean {
    return this.records.delete(id);
  }

  requestAbort(id: string, reason = "capture-abort-requested"): boolean {
    const record = this.records.get(id);
    if (!record) return false;

    record.abortReason = reason;
    record.abortRequestedAt = Date.now();
    record.phase = "aborted";

    if (!record.controller.signal.aborted) {
      record.controller.abort(reason);
    }

    if (record.page && !record.pageClosePromise) {
      record.pageClosePromise = closeAbortablePage(record.page);
    }

    return true;
  }

  get(id: string): CaptureAbortSnapshot | undefined {
    const record = this.records.get(id);
    return record ? this.snapshot(record) : undefined;
  }

  listActive(): CaptureAbortSnapshot[] {
    return Array.from(this.records.values(), (record) => this.snapshot(record));
  }

  private createHandle(record: CaptureAbortRecord): CaptureAbortHandle {
    return {
      id: record.id,
      signal: record.controller.signal,
      getPhase: () => record.phase,
      setPhase: (phase) => {
        record.phase = phase;
      },
      attachPage: (page) => {
        record.page = page;
        if (record.controller.signal.aborted && !record.pageClosePromise) {
          record.pageClosePromise = closeAbortablePage(page);
        }
      },
      snapshot: () => this.snapshot(record),
      canWrite: () => !record.controller.signal.aborted,
      throwIfAborted: () => throwIfCaptureAborted(record.controller.signal),
      unregister: () => this.unregister(record.id),
    };
  }

  private snapshot(record: CaptureAbortRecord): CaptureAbortSnapshot {
    return {
      id: record.id,
      phase: record.phase,
      registeredAt: record.registeredAt,
      aborted: record.controller.signal.aborted,
      abortReason: record.abortReason,
      abortRequestedAt: record.abortRequestedAt,
      pageAttached: Boolean(record.page),
      pageCloseRequested: Boolean(record.pageClosePromise),
    };
  }
}

export function createCaptureAbortRegistry(): CaptureAbortRegistry {
  return new CaptureAbortRegistry();
}

export function createCaptureExecutionContext(
  registry: CaptureAbortRegistry,
  id: string,
): CaptureAbortHandle {
  return registry.register(id);
}

export function throwIfCaptureAborted(signal: AbortSignal): void {
  if (!signal.aborted) return;
  const reason = typeof signal.reason === "string" ? signal.reason : undefined;
  throw new CaptureAbortError("Capture aborted", reason);
}

export function abortableDelay(
  ms: number,
  signal: AbortSignal,
): Promise<void> {
  throwIfCaptureAborted(signal);

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    const onAbort = () => {
      clearTimeout(timeout);
      reject(
        new CaptureAbortError(
          "Capture delay aborted",
          typeof signal.reason === "string" ? signal.reason : undefined,
        ),
      );
    };

    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function closeAbortablePage(page: AbortablePageHandle): Promise<void> {
  return page.close().catch(() => undefined);
}

import { getGdnGotoTimeoutMs } from "@/lib/capture/channels/gdn/host-strategies";

export const DUPLICATE_CAPTURE_SOURCE_MESSAGE =
  "중복 요청으로 이번 배치에서 캡처를 건너뛰었습니다.";

export const SLOW_GDN_BATCH_SKIP_MESSAGE =
  "느린 GDN 사이트는 남은 배치 시간이 부족해 캡처를 시작하지 않았습니다. 사이트를 나눠 다시 실행해 주세요.";

const SLOW_GDN_BATCH_HOSTS = new Set(["donga.com", "www.donga.com", "m.donga.com"]);
const SLOW_GDN_BATCH_MIN_CAPTURE_MS = 45_000;

export function normalizeCaptureSourceUrlKey(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  const maybeHttpUrl = /^https?:\/\//i.test(raw) ? raw : `https://${raw.replace(/^\/+/, "")}`;

  try {
    const url = new URL(maybeHttpUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return raw.replace(/\/+$/, "").toLowerCase();
    }
    const pathname = (url.pathname || "/").replace(/\/+$/, "") || "/";
    const host = `${url.hostname.toLowerCase()}${url.port ? `:${url.port}` : ""}`;
    return `${url.protocol.toLowerCase()}//${host}${pathname}${url.search}`;
  } catch {
    return raw.replace(/\/+$/, "").toLowerCase();
  }
}

export function isSlowGdnBatchHost(host: string | null | undefined): boolean {
  return Boolean(host && SLOW_GDN_BATCH_HOSTS.has(host.toLowerCase()));
}

export function shouldSkipSlowGdnBatchCapture(args: {
  channel: string;
  host: string | null;
  multiBatch: boolean;
  perCaptureTimeoutMs: number;
  mobileViewport?: boolean;
}): boolean {
  if (!args.multiBatch || args.channel !== "gdn" || !isSlowGdnBatchHost(args.host)) {
    return false;
  }

  const gotoTimeoutMs = getGdnGotoTimeoutMs(args.host!, {
    relaxed: true,
    batchFastMode: true,
    mobileViewport: args.mobileViewport,
  });
  const minimumCaptureMs = Math.max(SLOW_GDN_BATCH_MIN_CAPTURE_MS, gotoTimeoutMs + 10_000);

  return args.perCaptureTimeoutMs < minimumCaptureMs;
}

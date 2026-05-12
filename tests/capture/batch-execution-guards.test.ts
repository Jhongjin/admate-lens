import assert from "node:assert/strict";
import {
  DUPLICATE_CAPTURE_SOURCE_MESSAGE,
  SLOW_GDN_BATCH_SKIP_MESSAGE,
  isSlowGdnBatchHost,
  normalizeCaptureSourceUrlKey,
  shouldSkipSlowGdnBatchCapture,
} from "../../src/lib/capture/batch-execution-guards";

function assertCanonicalPublisherUrlKeys(): void {
  assert.equal(
    normalizeCaptureSourceUrlKey("www.yna.co.kr"),
    "https://www.yna.co.kr/",
  );
  assert.equal(
    normalizeCaptureSourceUrlKey("https://www.yna.co.kr/"),
    "https://www.yna.co.kr/",
  );
  assert.equal(
    normalizeCaptureSourceUrlKey("HTTPS://WWW.YNA.CO.KR"),
    "https://www.yna.co.kr/",
  );
  assert.equal(
    normalizeCaptureSourceUrlKey("https://www.yna.co.kr/news/"),
    "https://www.yna.co.kr/news",
  );
  assert.equal(
    normalizeCaptureSourceUrlKey("https://www.yna.co.kr:443/"),
    "https://www.yna.co.kr/",
  );
  assert.notEqual(
    normalizeCaptureSourceUrlKey("https://m.yna.co.kr/"),
    normalizeCaptureSourceUrlKey("https://www.yna.co.kr/"),
  );
}

function assertSlowGdnBatchBudgetGuard(): void {
  for (const host of ["donga.com", "www.donga.com", "m.donga.com"]) {
    assert.equal(isSlowGdnBatchHost(host), true);
  }
  assert.equal(isSlowGdnBatchHost("www.yna.co.kr"), false);

  assert.equal(
    shouldSkipSlowGdnBatchCapture({
      channel: "gdn",
      host: "www.donga.com",
      multiBatch: true,
      perCaptureTimeoutMs: 44_999,
    }),
    true,
  );
  assert.equal(
    shouldSkipSlowGdnBatchCapture({
      channel: "gdn",
      host: "www.donga.com",
      multiBatch: true,
      perCaptureTimeoutMs: 45_000,
    }),
    false,
  );
  assert.equal(
    shouldSkipSlowGdnBatchCapture({
      channel: "gdn",
      host: "www.donga.com",
      multiBatch: false,
      perCaptureTimeoutMs: 44_999,
    }),
    false,
  );
  assert.equal(
    shouldSkipSlowGdnBatchCapture({
      channel: "gdn",
      host: "www.yna.co.kr",
      multiBatch: true,
      perCaptureTimeoutMs: 24_000,
    }),
    false,
  );
  assert.equal(
    shouldSkipSlowGdnBatchCapture({
      channel: "gdn",
      host: "m.donga.com",
      multiBatch: true,
      perCaptureTimeoutMs: 44_999,
      mobileViewport: true,
    }),
    true,
  );
  assert.equal(
    shouldSkipSlowGdnBatchCapture({
      channel: "gdn",
      host: "m.donga.com",
      multiBatch: true,
      perCaptureTimeoutMs: 45_000,
      mobileViewport: true,
    }),
    false,
  );
  assert.equal(
    shouldSkipSlowGdnBatchCapture({
      channel: "meta",
      host: "www.donga.com",
      multiBatch: true,
      perCaptureTimeoutMs: 10_000,
    }),
    false,
  );
}

function assertBatchGuardOperatorCopy(): void {
  assert.match(DUPLICATE_CAPTURE_SOURCE_MESSAGE, /중복 요청/);
  assert.match(SLOW_GDN_BATCH_SKIP_MESSAGE, /캡처를 시작하지 않았습니다/);
  assert.match(SLOW_GDN_BATCH_SKIP_MESSAGE, /사이트를 나눠 다시 실행/);
  assert.doesNotMatch(SLOW_GDN_BATCH_SKIP_MESSAGE, /중단|cancel|abort/i);
}

assertCanonicalPublisherUrlKeys();
assertSlowGdnBatchBudgetGuard();
assertBatchGuardOperatorCopy();
console.log("[batch-execution-guards] ok");

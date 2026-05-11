import assert from "node:assert/strict";
import {
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
}

assertCanonicalPublisherUrlKeys();
assertSlowGdnBatchBudgetGuard();
console.log("[batch-execution-guards] ok");

/**
 * Vercel 등 서버리스에서 배치 캡처 시 함수 전체 시간(maxDuration) 안에 맞추기 위한 예산·타임아웃 계산
 */

/** maxDuration(예: 300s) 대비 업로드·DB·Chromium 종료 여유 */
export const SERVERLESS_BATCH_BUDGET_MS = 280_000;

/** 이보다 적게 남으면 새 캡처(Chromium 기동)를 시작하지 않음 */
export const MIN_REMAINING_FOR_CAPTURE_MS = 24_000;

/**
 * @returns null 이면 남은 시간으로는 캡처를 시작하지 말 것(건너뛰기)
 */
export function resolveBatchPerCaptureTimeoutMs(
  multiBatch: boolean,
  batchStartMs: number
): number | null {
  if (!multiBatch) return 120_000;
  const remaining = SERVERLESS_BATCH_BUDGET_MS - (Date.now() - batchStartMs);
  if (remaining < MIN_REMAINING_FOR_CAPTURE_MS) return null;
  return Math.min(150_000, Math.max(38_000, remaining - 16_000));
}

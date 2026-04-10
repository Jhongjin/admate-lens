/**
 * POST /api/captures/execute — 캡처 실행 엔드포인트
 *
 * ⭐ Vercel Function 설정: maxDuration=300s, memory=3009MB (vercel.json)
 * table: vision_da_captures
 *
 * v2: 배치 실행 지원 — 여러 captureId를 하나의 브라우저로 순차 처리
 *     (spawn ETXTBSY 방지: Chromium 동시 실행 문제 해결)
 */

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@/lib/supabase/client";
import { createChannel } from "@/lib/capture";
import type { VisionDaCaptureRow, ChannelType } from "@/lib/supabase/types";
import { PuppeteerEngine } from "@/lib/capture/engine/puppeteer-engine";

export const maxDuration = 300; // 5분
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await request.json();

    // 배치 지원: captureIds 배열 또는 단일 captureId
    const captureIds: string[] = body.captureIds
      ? body.captureIds
      : body.captureId
        ? [body.captureId]
        : [];

    if (captureIds.length === 0) {
      return NextResponse.json({ error: "captureId(s)는 필수입니다." }, { status: 400 });
    }

    const supabase = createServerClient();
    const results: Array<{ captureId: string; success: boolean; error?: string; durationMs?: number }> = [];
    const isolatedHosts = new Map<string, string>();
    const hostFailureCounts = new Map<string, number>();

    // 🔑 핵심: 하나의 브라우저 엔진을 공유하여 순차 실행
    const sharedEngine = new PuppeteerEngine();
    let engineLaunched = false;

    try {
      for (const captureId of captureIds) {
        const captureStart = Date.now();
        let captureMetadata: Record<string, unknown> = {};
        let sourceUrlForFailure: string | null = null;

        try {
          // 1) 캡처 요청 조회
          const { data, error: fetchError } = await supabase
            .from("vision_da_captures")
            .select("*")
            .eq("id", captureId)
            .single();

          if (fetchError || !data) {
            results.push({ captureId, success: false, error: `캡처 요청을 찾을 수 없습니다: ${captureId}` });
            continue;
          }

          const capture = data as unknown as VisionDaCaptureRow;
          sourceUrlForFailure = capture.source_url ?? null;
          captureMetadata = ((capture as any).metadata ?? {}) as Record<string, unknown>;
          const host = getHostname(capture.source_url ?? null);

          // 이미 처리 중이거나 완료된 경우 건너뛰기
          if (capture.status !== "pending") {
            results.push({ captureId, success: false, error: `이미 처리된 요청입니다 (status: ${capture.status})` });
            continue;
          }

          // 사이트 격리 큐: 동일 도메인 연쇄 실패를 막기 위해 즉시 스킵
          if (host && isolatedHosts.has(host)) {
            const isolateReason = isolatedHosts.get(host) ?? "isolated-host";
            await supabase
              .from("vision_da_captures")
              .update({
                status: "failed",
                error_message: `사이트 격리 큐로 스킵됨 (${isolateReason})`,
                metadata: {
                  ...captureMetadata,
                  failureCategory: "isolation",
                  failureCode: "site_isolated_in_batch",
                  isolatedHost: host,
                  isolatedReason: isolateReason,
                  failedAt: new Date().toISOString(),
                },
                updated_at: new Date().toISOString(),
              })
              .eq("id", captureId);
            results.push({ captureId, success: false, error: `격리 사이트 스킵: ${host}` });
            continue;
          }

          // 2) 상태 업데이트 → processing
          await supabase
            .from("vision_da_captures")
            .update({ status: "processing", updated_at: new Date().toISOString() })
            .eq("id", captureId);

          // 3) 브라우저 엔진 초기화 (최초 1회만)
          if (!engineLaunched) {
            await sharedEngine.launch();
            engineLaunched = true;
            console.log(`[Execute] 🚀 공유 브라우저 엔진 시작 (배치: ${captureIds.length}건)`);
          }

          // 4) 매체별 캡처 채널 생성 (공유 엔진 전달)
          //    🔑 YouTube URL 자동 감지: channel이 "gdn"이어도 URL이 YouTube이면 자동 전환
          let resolvedChannel = capture.channel as ChannelType;
          const sourceUrl = capture.source_url ?? "";
          if (
            resolvedChannel !== "youtube" &&
            (sourceUrl.includes("youtube.com") || sourceUrl.includes("youtu.be"))
          ) {
            console.log(`[Execute] 🔄 YouTube URL 감지 → 채널 자동 전환: ${resolvedChannel} → youtube`);
            resolvedChannel = "youtube";
          }
          const channel = createChannel(resolvedChannel, sharedEngine);

          // 5) 캡처 실행
          const result = await executeWithRetry(
            () =>
              channel.execute({
                publisherUrl: capture.source_url ?? "",
                creativeUrl: capture.creative_url,
                captureLanding: capture.capture_landing,
                clickUrl: capture.click_url ?? undefined,
                options: {
                  injectionMode: captureMetadata.injectionMode ?? "single",
                  slotCount: captureMetadata.slotCount ?? 1,
                  creativeDimensions: captureMetadata.creativeDimensions ?? undefined,
                  adSizeMode: captureMetadata.adSizeMode ?? "auto",
                  targetAdSizes: captureMetadata.targetAdSizes ?? [],
                  youtubeAdType: captureMetadata.youtubeAdType ?? "preroll",
                  instreamOpts: captureMetadata.instreamOpts,
                },
              }),
            2,
            90000
          );

          // 6) Supabase Storage에 업로드
          const timestamp = Date.now();
          const basePath = `captures/${captureId}`;

          // 게재면 스크린샷 업로드
          const placementPath = `${basePath}/placement_${timestamp}.png`;
          const { error: uploadError } = await supabase.storage
            .from("capture-images")
            .upload(placementPath, result.placementScreenshot, {
              contentType: "image/png",
              upsert: true,
            });

          if (uploadError) {
            throw new Error(`게재면 이미지 업로드 실패: ${uploadError.message}`);
          }

          const { data: placementUrlData } = supabase.storage
            .from("capture-images")
            .getPublicUrl(placementPath);

          // 랜딩 스크린샷 업로드 (있는 경우)
          let landingPublicUrl: string | null = null;
          if (result.landingScreenshot) {
            const landingPath = `${basePath}/landing_${timestamp}.png`;
            await supabase.storage
              .from("capture-images")
              .upload(landingPath, result.landingScreenshot, {
                contentType: "image/png",
                upsert: true,
              });

            const { data: landingUrlData } = supabase.storage
              .from("capture-images")
              .getPublicUrl(landingPath);

            landingPublicUrl = landingUrlData.publicUrl;
          }

          // 7) DB 업데이트 → completed
          const durationMs = Date.now() - captureStart;

          // 진단 정보 수집 (GdnCapture인 경우)
          const diagnostics = (channel as any).getDiagnostics?.() ?? null;
          const successCategory = classifySuccessCategory(diagnostics);

          await supabase
            .from("vision_da_captures")
            .update({
              status: "completed",
              placement_image_url: placementUrlData.publicUrl,
              screenshot_storage_path: placementPath,
              landing_image_url: landingPublicUrl,
              landing_final_url: result.landingUrl ?? null,
              metadata: {
                ...captureMetadata,
                capturedAt: result.capturedAt,
                durationMs,
                resultCategory: successCategory,
                diagnostics,
                runtime: {
                  capturedAt: result.capturedAt,
                  durationMs,
                  diagnostics,
                },
              },
              updated_at: new Date().toISOString(),
            })
            .eq("id", captureId);

          console.log(`[Execute] ✅ 캡처 완료: ${captureId} (${durationMs}ms)`);
          results.push({ captureId, success: true, durationMs });

        } catch (captureError) {
          // 개별 캡처 실패 → DB 상태 업데이트 후 다음 캡처 계속
          const errorMessage = captureError instanceof Error ? captureError.message : "알 수 없는 오류";
          const failureInfo = classifyFailureReason(captureError);
          const host = getHostname(sourceUrlForFailure);

          await supabase
            .from("vision_da_captures")
            .update({
              status: "failed",
              error_message: errorMessage,
              metadata: {
                ...captureMetadata,
                failureCategory: failureInfo.category,
                failureCode: failureInfo.code,
                shouldRemoveFromPresetList: failureInfo.hardBlocked,
                failedAt: new Date().toISOString(),
              },
              updated_at: new Date().toISOString(),
            })
            .eq("id", captureId);

          console.error(`[Execute] ❌ 캡처 실패: ${captureId}`, captureError);
          results.push({ captureId, success: false, error: errorMessage });

          if (host) {
            const nextCount = (hostFailureCounts.get(host) ?? 0) + 1;
            hostFailureCounts.set(host, nextCount);
            const isolate =
              failureInfo.hardBlocked ||
              (nextCount >= 2 && isHostIsolatableRuntimeError(captureError));
            if (isolate && !isolatedHosts.has(host)) {
              const reason = failureInfo.code || "host-failure";
              isolatedHosts.set(host, reason);
              console.warn(`[Execute] 🚧 사이트 격리 등록: ${host} (reason=${reason}, fails=${nextCount})`);
            }
          }

          // 브라우저 세션 종료 에러면 엔진 재시작 후 다음 캡처 계속
          if (isBrowserSessionClosedError(captureError)) {
            console.warn("[Execute] ♻️ 브라우저 세션 종료 감지 — 엔진 재시작");
            try {
              if (engineLaunched) {
                await sharedEngine.close();
              }
            } catch {
              // 이미 닫힌 경우 무시
            }
            engineLaunched = false;
            try {
              await sharedEngine.launch();
              engineLaunched = true;
              console.log("[Execute] ♻️ Chromium 재시작 완료");
            } catch (relaunchErr) {
              console.error("[Execute] ❌ Chromium 재시작 실패", relaunchErr);
            }
          }
        }
      }
    } finally {
      // 🔑 모든 캡처 완료 후 브라우저 종료
      if (engineLaunched) {
        await sharedEngine.close();
        console.log(`[Execute] 🛑 공유 브라우저 엔진 종료`);
      }
    }

    const totalDuration = Date.now() - startTime;
    const successCount = results.filter(r => r.success).length;

    console.log(`[Execute] 📊 배치 완료: ${successCount}/${results.length}건 성공 (${totalDuration}ms)`);

    return NextResponse.json({
      success: successCount > 0,
      results,
      totalDuration,
      batch: captureIds.length > 1,
    });

  } catch (err) {
    console.error("[Execute] 요청 처리 오류:", err);
    return NextResponse.json(
      { error: "서버 내부 오류" },
      { status: 500 }
    );
  }
}

function isBrowserSessionClosedError(err: unknown): boolean {
  const message = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    message.includes("connection closed") ||
    message.includes("target closed") ||
    message.includes("session closed") ||
    message.includes("most likely the page has been closed") ||
    message.includes("protocol error (page.capturescreenshot)")
  );
}

function getHostname(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function isHostIsolatableRuntimeError(err: unknown): boolean {
  const message = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    message.includes("connection closed") ||
    message.includes("target closed") ||
    message.includes("session closed") ||
    message.includes("detached frame") ||
    message.includes("execution context was destroyed") ||
    message.includes("unable to capture screenshot") ||
    message.includes("capture timeout") ||
    message.includes("timeout")
  );
}

function classifySuccessCategory(diagnostics: any): "ad_capture_ok" | "ad_area_not_found" | "ad_out_of_viewport" {
  const slotsDetected = Number(diagnostics?.slotsDetected ?? 0);
  const slotsInjected = Number(diagnostics?.slotsInjected ?? 0);
  const screenshotMode = diagnostics?.screenshotMode;
  const injectedInViewport = diagnostics?.injectedInViewport;
  const fallbackCenteredOnInjected = diagnostics?.fallbackCenteredOnInjected === true;

  if (slotsDetected <= 0 || slotsInjected <= 0) {
    return "ad_area_not_found";
  }

  if (
    screenshotMode === "viewportFallback" &&
    injectedInViewport === false &&
    !fallbackCenteredOnInjected
  ) {
    return "ad_out_of_viewport";
  }

  return "ad_capture_ok";
}

function classifyFailureReason(err: unknown): { category: string; code: string; hardBlocked: boolean } {
  const message = (err instanceof Error ? err.message : String(err)).toLowerCase();

  if (
    message.includes("access denied") ||
    message.includes("forbidden") ||
    message.includes("cloudflare") ||
    message.includes("captcha") ||
    message.includes("request blocked")
  ) {
    return { category: "blocked", code: "hard_blocked_by_site", hardBlocked: true };
  }

  if (isBrowserSessionClosedError(err)) {
    return { category: "runtime", code: "browser_session_closed", hardBlocked: false };
  }

  if (message.includes("timeout")) {
    return { category: "timeout", code: "capture_timeout", hardBlocked: false };
  }

  return { category: "runtime", code: "unknown_capture_error", hardBlocked: false };
}

async function executeWithRetry<T>(fn: () => Promise<T>, maxAttempts: number, timeoutMs: number): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await withTimeout(fn(), timeoutMs);
    } catch (err) {
      lastErr = err;
      // 세션 종료/연결 종료는 외부 엔진 재시작 로직에 맡김
      if (isBrowserSessionClosedError(err)) {
        break;
      }

      // 타임아웃 계열만 재시도
      const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
      const retryableTimeout =
        msg.includes("capture timeout") ||
        msg.includes("timeout") ||
        msg.includes("timed out");
      if (!retryableTimeout) {
        break;
      }

      if (attempt >= maxAttempts) break;
      console.warn(`[Execute] 시도 ${attempt}/${maxAttempts} 실패 — 다음 시도 진행`);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr ?? "retry failed"));
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error(`Capture timeout (${ms}ms)`)), ms);
      }),
    ]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
}

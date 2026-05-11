/**
 * POST /api/captures/execute — 캡처 실행 엔드포인트
 *
 * ⭐ Vercel Function 설정: maxDuration=300s, memory=3009MB (vercel.json)
 * table: vision_da_captures
 *
 * v2: 배치 실행 지원 — 여러 captureId를 하나의 브라우저로 순차 처리
 *     (페이지는 매 건 닫고, Chromium은 성공 건 사이에서 재사용)
 */

import { NextResponse, type NextRequest } from "next/server";
import { requireLensSession } from "@/lib/auth/lens-session";
import { createServerClient } from "@/lib/supabase/client";
import { createChannel } from "@/lib/capture";
import { resolveBatchPerCaptureTimeoutMs } from "@/lib/capture/batch-serverless";
import { CaptureAbortError } from "@/lib/capture/abort-registry";
import {
  captureRouteAbortRegistry,
  persistCaptureResultWithAbortGuard,
  runWithCaptureAbortRegistration,
  USER_CANCELLED_CAPTURE_MESSAGE,
} from "@/lib/capture/abort-route-helpers";
import { executeCaptureWithRetry } from "@/lib/capture/capture-execution-retry";
import type { VisionDaCaptureRow, ChannelType } from "@/lib/supabase/types";
import { PuppeteerEngine } from "@/lib/capture/engine/puppeteer-engine";
import {
  DUPLICATE_CAPTURE_SOURCE_MESSAGE,
  SLOW_GDN_BATCH_SKIP_MESSAGE,
  normalizeCaptureSourceUrlKey,
  shouldSkipSlowGdnBatchCapture,
} from "@/lib/capture/batch-execution-guards";
import { isGdnExcludedHost } from "@/lib/capture/channels/gdn/host-strategies";
import {
  makeCaptureStoragePath,
  uploadStorageObject,
} from "@/lib/storage/capture-storage";

export const maxDuration = 300; // 5분
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await requireLensSession(request);
  if ("response" in auth) {
    return auth.response;
  }

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
    const seenPendingSourceKeys = new Set<string>();
    const multiBatch = captureIds.length > 1;

    // 🔑 핵심: 순차 실행. 다건도 성공 건 사이에서는 Chromium을 재사용
    const sharedEngine = new PuppeteerEngine();
    let engineLaunched = false;

    try {
      for (let captureIndex = 0; captureIndex < captureIds.length; captureIndex++) {
        const captureId = captureIds[captureIndex]!;
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

          const sourceKey = normalizeCaptureSourceUrlKey(capture.source_url);
          if (sourceKey && seenPendingSourceKeys.has(sourceKey)) {
            await supabase
              .from("vision_da_captures")
              .update({
                status: "failed",
                error_message: DUPLICATE_CAPTURE_SOURCE_MESSAGE,
                metadata: {
                  ...captureMetadata,
                  failureCategory: "validation",
                  failureCode: "duplicate_source_url_in_batch",
                  duplicateSourceSkipped: true,
                  failedAt: new Date().toISOString(),
                },
                updated_at: new Date().toISOString(),
              })
              .eq("id", captureId)
              .eq("status", "pending");
            results.push({ captureId, success: false, error: DUPLICATE_CAPTURE_SOURCE_MESSAGE });
            console.warn(`[Execute] ⏭️ 중복 요청 스킵: ${capture.source_url} (${captureId})`);
            continue;
          }
          if (sourceKey) {
            seenPendingSourceKeys.add(sourceKey);
          }

          // 운영 제외 호스트: 캡처 시도하지 않고 즉시 실패 처리 + 프리셋 제거 플래그
          if (capture.channel === "gdn" && host && isGdnExcludedHost(host)) {
            await supabase
              .from("vision_da_captures")
              .update({
                status: "failed",
                error_message: `운영 제외 사이트로 캡처를 건너뜀 (${host})`,
                metadata: {
                  ...captureMetadata,
                  failureCategory: "policy",
                  failureCode: "site_excluded_policy",
                  shouldRemoveFromPresetList: true,
                  excludedHost: host,
                  failedAt: new Date().toISOString(),
                },
                updated_at: new Date().toISOString(),
              })
              .eq("id", captureId);
            results.push({ captureId, success: false, error: `운영 제외 사이트 스킵: ${host}` });
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

          const perCaptureTimeoutMs = resolveBatchPerCaptureTimeoutMs(multiBatch, startTime);
          if (perCaptureTimeoutMs === null) {
            const remainingIds = captureIds.slice(captureIndex);
            await markRemainingPendingAsBudgetSkipped(supabase, remainingIds);
            for (const skippedId of remainingIds) {
              results.push({
                captureId: skippedId,
                success: false,
                error: "배치 서버 시간 한도(남은 시간 부족)",
              });
            }
            console.warn(
              `[Execute] ⏭️ 서버 시간 예산 부족 — 남은 ${remainingIds.length}건 실패 처리 후 배치 종료`
            );
            break;
          }

          if (
            shouldSkipSlowGdnBatchCapture({
              channel: capture.channel,
              host,
              multiBatch,
              perCaptureTimeoutMs,
              mobileViewport: captureMetadata.gdnViewportMode === "mobile",
            })
          ) {
            await supabase
              .from("vision_da_captures")
              .update({
                status: "failed",
                error_message: host
                  ? `${SLOW_GDN_BATCH_SKIP_MESSAGE} (${host})`
                  : SLOW_GDN_BATCH_SKIP_MESSAGE,
                metadata: {
                  ...captureMetadata,
                  failureCategory: "timeout",
                  failureCode: "slow_gdn_host_batch_time_guard",
                  slowHost: host,
                  failedAt: new Date().toISOString(),
                },
                updated_at: new Date().toISOString(),
              })
              .eq("id", captureId)
              .eq("status", "pending");
            results.push({ captureId, success: false, error: SLOW_GDN_BATCH_SKIP_MESSAGE });
            console.warn(`[Execute] ⏭️ 느린 GDN 사이트 시간 가드 스킵: ${host} (${captureId})`);
            continue;
          }

          // 2) 상태 업데이트 → processing
          const { data: processingRows, error: processingError } = await supabase
            .from("vision_da_captures")
            .update({ status: "processing", updated_at: new Date().toISOString() })
            .eq("id", captureId)
            .eq("status", "pending")
            .select("id");

          if (processingError) {
            throw new Error(`processing 상태 업데이트 실패: ${processingError.message}`);
          }
          if (!processingRows?.length) {
            console.log(`[Execute] ⏭️ processing 전환 스킵 (상태 변경): ${captureId}`);
            results.push({
              captureId,
              success: false,
              error: "캡처가 중단되었거나 상태가 변경되었습니다.",
            });
            continue;
          }

          const executionOutcome = await runWithCaptureAbortRegistration(
            captureRouteAbortRegistry,
            captureId,
            async (abortHandle) => {
              // 3) 브라우저 엔진 초기화 (최초 1회만)
              abortHandle.throwIfAborted();
              if (!engineLaunched) {
                abortHandle.setPhase("launching");
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
              let result: Awaited<ReturnType<typeof channel.execute>>;
              try {
                result = await executeCaptureWithRetry(
                  () =>
                    channel.execute(
                      {
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
                          creativeObjectFit:
                            captureMetadata.creativeObjectFit === "cover" ? "cover" : "contain",
                          youtubeAdType: captureMetadata.youtubeAdType ?? "preroll",
                          instreamOpts: captureMetadata.instreamOpts,
                          infeedOpts: captureMetadata.infeedOpts,
                          mobileNativeOpts: captureMetadata.mobileNativeOpts,
                          publisherGotoRelaxed: multiBatch && resolvedChannel === "gdn",
                          gdnBatchFastMode: multiBatch && resolvedChannel === "gdn",
                          gdnViewportMode:
                            resolvedChannel === "gdn"
                              ? captureMetadata.gdnViewportMode === "mobile"
                                ? "mobile"
                                : "pc"
                              : undefined,
                        },
                      },
                      abortHandle
                    ),
                  {
                    maxAttempts: 1,
                    timeoutMs: perCaptureTimeoutMs,
                    shouldRetry: isCaptureTimeoutError,
                  }
                );
              } catch (error) {
                if (abortHandle.signal.aborted) {
                  throw new CaptureAbortError(
                    "Capture aborted",
                    typeof abortHandle.signal.reason === "string"
                      ? abortHandle.signal.reason
                      : undefined
                  );
                }
                throw error;
              }

              abortHandle.throwIfAborted();

              if (!(await isCaptureStillProcessing(supabase, captureId))) {
                console.log(`[Execute] ⏹️ 결과 저장 스킵 (중단/상태 변경): ${captureId}`);
                return { completed: false, durationMs: Date.now() - captureStart };
              }

              // 6) Supabase Storage에 업로드 + 7) DB 업데이트 → completed
              const timestamp = Date.now();
              const durationMs = Date.now() - captureStart;
              const diagnostics = (channel as any).getDiagnostics?.() ?? null;
              const successCategory = classifySuccessCategory(diagnostics);
              const persistOutcome = await persistCaptureResultWithAbortGuard(
                abortHandle,
                result,
                {
                  uploadPlacement: (screenshot) =>
                    uploadStorageObject(
                      supabase,
                      makeCaptureStoragePath(captureId, "placement", timestamp),
                      screenshot,
                      {
                        contentType: "image/png",
                        label: "게재면 이미지",
                      }
                    ),
                  uploadLanding: (screenshot) =>
                    uploadStorageObject(
                      supabase,
                      makeCaptureStoragePath(captureId, "landing", timestamp),
                      screenshot,
                      {
                        contentType: "image/png",
                        label: "랜딩 이미지",
                      }
                    ),
                  markCompleted: async ({ placementUpload, landingUpload, capturedAt, landingUrl }) => {
                    const { data: completedRows, error: completedError } = await supabase
                      .from("vision_da_captures")
                      .update({
                        status: "completed",
                        placement_image_url: placementUpload.publicUrl,
                        screenshot_storage_path: placementUpload.path,
                        landing_image_url: landingUpload?.publicUrl ?? null,
                        landing_final_url: landingUrl ?? null,
                        metadata: {
                          ...captureMetadata,
                          capturedAt,
                          durationMs,
                          resultCategory: successCategory,
                          diagnostics,
                          runtime: {
                            capturedAt,
                            durationMs,
                            diagnostics,
                          },
                        },
                        updated_at: new Date().toISOString(),
                      })
                      .eq("id", captureId)
                      .eq("status", "processing")
                      .select("id");

                    if (completedError) {
                      throw new Error(`completed 상태 업데이트 실패: ${completedError.message}`);
                    }
                    if (!completedRows?.length) {
                      if (abortHandle.signal.aborted) {
                        throw new CaptureAbortError(
                          "Capture aborted",
                          typeof abortHandle.signal.reason === "string"
                            ? abortHandle.signal.reason
                            : undefined
                        );
                      }
                      throw new Error("캡처가 중단되었거나 상태가 변경되었습니다.");
                    }
                  },
                }
              );

              if (!persistOutcome.completed) {
                console.log(
                  `[Execute] ⏹️ 완료 업데이트 스킵 (${persistOutcome.skippedReason}): ${captureId}`
                );
                return { completed: false, durationMs };
              }

              return { completed: true, durationMs };
            }
          );

          if (!executionOutcome.completed) {
            results.push({
              captureId,
              success: false,
              error: "캡처가 중단되었거나 상태가 변경되었습니다.",
            });
            continue;
          }

          console.log(`[Execute] ✅ 캡처 완료: ${captureId} (${executionOutcome.durationMs}ms)`);
          results.push({ captureId, success: true, durationMs: executionOutcome.durationMs });

        } catch (captureError) {
          if (captureError instanceof CaptureAbortError) {
            await markCaptureAbortedIfStillActive(supabase, captureId);
            console.log(`[Execute] ⏹️ 사용자 중단 처리: ${captureId}`);
            results.push({ captureId, success: false, error: USER_CANCELLED_CAPTURE_MESSAGE });
            continue;
          }

          // 개별 캡처 실패 → DB 상태 업데이트 후 다음 캡처 계속
          const errorMessage = captureError instanceof Error ? captureError.message : "알 수 없는 오류";
          const failureInfo = classifyFailureReason(captureError);
          const host = getHostname(sourceUrlForFailure);

          if (!(await isCapturePendingOrProcessing(supabase, captureId))) {
            console.log(`[Execute] ⏹️ 실패 업데이트 스킵 (중단/상태 변경): ${captureId}`);
            results.push({
              captureId,
              success: false,
              error: "캡처가 중단되었거나 상태가 변경되었습니다.",
            });
            continue;
          }

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

          // 세션 이상/타임아웃: 단건 배치는 즉시 재기동, 다건은 다음 사이트에서 새 Chromium
          if (isRecoverableEngineError(captureError)) {
            console.warn("[Execute] ♻️ 세션 이상/타임아웃 감지 — 엔진 정리");
            try {
              if (engineLaunched) {
                await sharedEngine.close();
              }
            } catch {
              // 이미 닫힌 경우 무시
            }
            engineLaunched = false;
            if (!multiBatch) {
              try {
                await sharedEngine.launch();
                engineLaunched = true;
                console.log("[Execute] ♻️ Chromium 재시작 완료");
              } catch (relaunchErr) {
                console.error("[Execute] ❌ Chromium 재시작 실패", relaunchErr);
              }
            } else {
              console.log("[Execute] (다건) 다음 사이트에서 Chromium을 새로 시작합니다.");
            }
          } else if (multiBatch && engineLaunched) {
            try {
              await sharedEngine.close();
              console.log("[Execute] 🔄 Chromium 종료 (다건·오류 후 세션 분리)");
            } catch {
              /* ignore */
            }
            engineLaunched = false;
          }
        }
      }
    } finally {
      // 배치 중단/예외로 남은 processing 정리 (고착 방지)
      try {
        await supabase
          .from("vision_da_captures")
          .update({
            status: "failed",
            error_message: "배치 실행이 중단되어 자동 종료되었습니다.",
            updated_at: new Date().toISOString(),
          })
          .in("id", captureIds)
          .eq("status", "processing");
      } catch (cleanupErr) {
        console.warn("[Execute] processing 정리 실패:", cleanupErr);
      }
      try {
        await supabase
          .from("vision_da_captures")
          .update({
            status: "failed",
            error_message: "배치 실행 시간이 부족해 처리되지 못했습니다. 사이트를 나눠 다시 실행해 주세요.",
            updated_at: new Date().toISOString(),
          })
          .in("id", captureIds)
          .eq("status", "pending");
      } catch (cleanupErr) {
        console.warn("[Execute] pending 정리 실패:", cleanupErr);
      }

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

async function markRemainingPendingAsBudgetSkipped(
  supabase: ReturnType<typeof createServerClient>,
  captureIds: string[]
): Promise<void> {
  if (captureIds.length === 0) return;
  await supabase
    .from("vision_da_captures")
    .update({
      status: "failed",
      error_message:
        "배치 서버 시간 한도에 가까워 캡처를 시작하지 않았습니다. 사이트를 나눠 다시 실행해 주세요.",
      updated_at: new Date().toISOString(),
    })
    .in("id", captureIds)
    .eq("status", "pending");
}

async function markCaptureAbortedIfStillActive(
  supabase: ReturnType<typeof createServerClient>,
  captureId: string
): Promise<void> {
  await supabase
    .from("vision_da_captures")
    .update({
      status: "failed",
      error_message: USER_CANCELLED_CAPTURE_MESSAGE,
      updated_at: new Date().toISOString(),
    })
    .eq("id", captureId)
    .in("status", ["pending", "processing"]);
}

async function isCaptureStillProcessing(
  supabase: ReturnType<typeof createServerClient>,
  captureId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("vision_da_captures")
    .select("status")
    .eq("id", captureId)
    .single();

  if (error || !data) {
    console.warn(`[Execute] 상태 재확인 실패: ${captureId}`, error);
    return false;
  }

  return (data as { status?: string }).status === "processing";
}

async function isCapturePendingOrProcessing(
  supabase: ReturnType<typeof createServerClient>,
  captureId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("vision_da_captures")
    .select("status")
    .eq("id", captureId)
    .single();

  if (error || !data) {
    console.warn(`[Execute] 상태 재확인 실패: ${captureId}`, error);
    return false;
  }

  const status = (data as { status?: string }).status;
  return status === "pending" || status === "processing";
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

function isCaptureTimeoutError(err: unknown): boolean {
  const message = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return message.includes("capture timeout") || message.includes("timed out") || message.includes("timeout");
}

function isDetachedFrameError(err: unknown): boolean {
  const message = (err instanceof Error ? err.message : String(err)).toLowerCase();
  return (
    message.includes("detached frame") ||
    message.includes("navigating frame was detached") ||
    message.includes("execution context was destroyed")
  );
}

function isRecoverableEngineError(err: unknown): boolean {
  return isBrowserSessionClosedError(err) || isCaptureTimeoutError(err) || isDetachedFrameError(err);
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

function classifySuccessCategory(
  diagnostics: any
): "ad_capture_ok" | "ad_area_not_found" | "ad_out_of_viewport" | "ad_capture_review_needed" {
  if (typeof diagnostics?.adType === "string") {
    const ui = diagnostics?.instreamUiChecks;
    const expectedSkipButton = ui?.expectedSkipButton === true;
    const uiLooksComplete =
      !ui ||
      (ui.overlay === true &&
        ui.sponsorCard === true &&
        ui.sponsorText === true &&
        ui.blockingCover !== true &&
        (!expectedSkipButton || ui.skipButton === true));

    if (diagnostics.injectionSuccess === true && uiLooksComplete) {
      return "ad_capture_ok";
    }
    if (diagnostics.injectionSuccess === true) {
      return "ad_capture_review_needed";
    }
    return "ad_area_not_found";
  }

  const slotsDetected = Number(diagnostics?.slotsDetected ?? 0);
  const slotsInjected = Number(diagnostics?.slotsInjected ?? 0);
  const screenshotMode = diagnostics?.screenshotMode;
  const injectedInViewport = diagnostics?.injectedInViewport;
  const fallbackCenteredOnInjected = diagnostics?.fallbackCenteredOnInjected === true;
  const needsReview = diagnostics?.captureQuality?.needsReview === true;

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

  if (needsReview) {
    return "ad_capture_review_needed";
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

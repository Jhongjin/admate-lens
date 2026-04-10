/**
 * POST /api/captures — 캡처 요청 생성 + 배치 실행
 * GET  /api/captures — 캡처 목록 조회
 *
 * v3: Next.js `after()` 사용 — 응답 반환 후 백그라운드에서 배치 캡처 실행
 *     (fire-and-forget fetch 대신 after()로 Vercel 컨테이너 유지 보장)
 */

import { NextResponse, type NextRequest } from "next/server";
import { after } from "next/server";
import { createServerClient } from "@/lib/supabase/client";
import { createChannel } from "@/lib/capture";
import { PuppeteerEngine } from "@/lib/capture/engine/puppeteer-engine";
import type { ChannelType, VisionDaCaptureRow } from "@/lib/supabase/types";

export const maxDuration = 300; // 5분
export const dynamic = "force-dynamic";

function isValidHttpUrl(value?: string | null): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** POST: 새 캡처 요청 생성 (멀티 사이트 지원) */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // 입력 검증
    const {
      channel,
      publisherUrl,      // 단일 (하위 호환)
      publisherUrls,     // 멀티 사이트 (배열)
      creativeUrl,
      clickUrl,
      captureLanding,
      injectionMode = "single",  // "single" | "all" | "custom"
      slotCount = 1,             // custom 모드일 때 슬롯 수
      creativeDimensions,        // 📐 배너 사이즈 {width, height}
      adSizeMode = "auto",       // 📐 "auto" | "manual"
      targetAdSizes = [],        // 📐 수동 선택한 사이즈 배열
      youtubeAdType,             // 🎬 YouTube 광고 유형
      instreamOpts,              // 🎬 인스트림 광고 옵션
    } = body as {
      channel: ChannelType;
      publisherUrl?: string;
      publisherUrls?: string[];
      creativeUrl: string;
      clickUrl?: string;
      captureLanding?: boolean;
      injectionMode?: "single" | "all" | "custom";
      slotCount?: number;
      creativeDimensions?: { width: number; height: number };
      adSizeMode?: "auto" | "manual";
      targetAdSizes?: string[];
      youtubeAdType?: "preroll" | "display" | "overlay" | "mobile-preroll-aos" | "mobile-preroll-ios";
      instreamOpts?: {
        videoUrl?: string;
        skipSeconds?: number;
        adTitle?: string;
        enableCtaText?: boolean;
        ctaText?: string;
        landingUrl?: string;
        displayUrl?: string;
        displayPath1?: string;
        displayPath2?: string;
        companionImageUrl?: string;
        companionChannelUrl?: string;
        companionUseChannelBanner?: boolean;
        enableCompanionBanner?: boolean;
        avatarImageUrl?: string;
      };
    };

    // URL 배열 통합
    const urls: string[] = publisherUrls?.length
      ? publisherUrls
      : publisherUrl
        ? [publisherUrl]
        : [];

    // 인스트림 광고는 creativeUrl 대신 videoUrl 사용 (PC/모바일 공통)
    const normalizedUrls = urls.filter((url) => isValidHttpUrl(url));
    const isPreroll =
      channel === "youtube" &&
      (youtubeAdType === "preroll" ||
        youtubeAdType === "mobile-preroll-aos" ||
        youtubeAdType === "mobile-preroll-ios");
    const hasValidVideoSource = isPreroll && isValidHttpUrl(instreamOpts?.videoUrl);
    const hasValidCreativeSource = !isPreroll && isValidHttpUrl(creativeUrl);
    const hasSource = hasValidVideoSource || hasValidCreativeSource;

    if (!channel || normalizedUrls.length === 0 || !hasSource) {
      return NextResponse.json(
        { error: "channel, publisherUrl(s), creativeUrl/videoUrl 형식을 확인해주세요." },
        { status: 400 }
      );
    }

    const supabase = createServerClient();
    const createdCaptures: any[] = [];

    // 각 URL마다 캡처 요청 생성
    for (const url of normalizedUrls) {
      const requestMetadata = {
        injectionMode,
        slotCount,
        creativeDimensions,
        adSizeMode,
        targetAdSizes,
        youtubeAdType,
        instreamOpts,
      };
      const { data, error } = await supabase
        .from("vision_da_captures")
        .insert({
          channel,
          source_url: url,
          creative_url: creativeUrl,
          click_url: clickUrl ?? null,
          capture_landing: captureLanding ?? false,
          status: "pending",
          metadata: requestMetadata,
        })
        .select()
        .single();

      if (error) {
        console.error("[API] captures insert error:", error);
        continue;
      }

      createdCaptures.push(data);
    }

    if (createdCaptures.length === 0) {
      return NextResponse.json({ error: "캡처 요청 생성에 실패했습니다." }, { status: 500 });
    }

    // 🔑 after() — 응답 반환 후 백그라운드에서 배치 캡처 실행
    // Vercel이 이 콜백 완료까지 컨테이너를 유지합니다
    const captureIds = createdCaptures.map((c: any) => c.id);
    after(async () => {
      await executeBatchCaptures(captureIds);
    });

    return NextResponse.json(
      {
        data: createdCaptures[0],
        captures: createdCaptures,
        count: createdCaptures.length,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("[API] POST /captures error:", err);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

/**
 * 배치 캡처 실행 — 하나의 Chromium 브라우저에서 순차 처리
 * (after() 콜백 또는 /api/captures/execute에서 호출)
 */
async function executeBatchCaptures(captureIds: string[]): Promise<void> {
  const startTime = Date.now();
  const supabase = createServerClient();
  const sharedEngine = new PuppeteerEngine();
  let engineLaunched = false;

  console.log(`[BatchCapture] 🎬 배치 시작: ${captureIds.length}건`);

  try {
    for (const captureId of captureIds) {
      const captureStart = Date.now();
      let captureMetadata: Record<string, unknown> = {};

      try {
        // 1) 캡처 요청 조회
        const { data, error: fetchError } = await supabase
          .from("vision_da_captures")
          .select("*")
          .eq("id", captureId)
          .single();

        if (fetchError || !data) {
          console.error(`[BatchCapture] ❌ 요청 조회 실패: ${captureId}`);
          continue;
        }

        const capture = data as unknown as VisionDaCaptureRow;

        if (capture.status !== "pending") {
          console.log(`[BatchCapture] ⏭️ 건너뜀 (status: ${capture.status}): ${captureId}`);
          continue;
        }

        // 2) 상태 → processing
        await supabase
          .from("vision_da_captures")
          .update({ status: "processing", updated_at: new Date().toISOString() })
          .eq("id", captureId);

        // 3) 브라우저 엔진 초기화 (최초 1회만)
        if (!engineLaunched) {
          await sharedEngine.launch();
          engineLaunched = true;
          console.log(`[BatchCapture] 🚀 Chromium 시작 (배치: ${captureIds.length}건)`);
        }

        // 4) 채널 생성 (공유 엔진)
        const channel = createChannel(capture.channel as ChannelType, sharedEngine);

        // 5) 캡처 실행
        captureMetadata = ((capture as any).metadata ?? {}) as Record<string, unknown>;
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
          120000
        );

        // 6) Storage 업로드
        const timestamp = Date.now();
        const basePath = `captures/${captureId}`;

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

        // 7) DB → completed
        const durationMs = Date.now() - captureStart;
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

        console.log(`[BatchCapture] ✅ 완료: ${captureId} (${durationMs}ms)`);

      } catch (captureError) {
        const errorMessage = captureError instanceof Error ? captureError.message : "알 수 없는 오류";
        const failureInfo = classifyFailureReason(captureError);

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

        console.error(`[BatchCapture] ❌ 실패: ${captureId}`, captureError);

        // 브라우저 세션이 죽은 경우(타겟/연결 종료) 다음 건을 위해 엔진 재시작
        if (isBrowserSessionClosedError(captureError)) {
          console.warn("[BatchCapture] ♻️ 브라우저 세션 종료 감지 — 엔진 재시작");
          try {
            if (engineLaunched) {
              await sharedEngine.close();
            }
          } catch {
            // 이미 닫혔으면 무시
          }
          engineLaunched = false;
          try {
            await sharedEngine.launch();
            engineLaunched = true;
            console.log("[BatchCapture] ♻️ Chromium 재시작 완료");
          } catch (relaunchErr) {
            console.error("[BatchCapture] ❌ Chromium 재시작 실패", relaunchErr);
          }
        }
      }
    }
  } finally {
    if (engineLaunched) {
      await sharedEngine.close();
      console.log(`[BatchCapture] 🛑 Chromium 종료`);
    }
  }

  const totalMs = Date.now() - startTime;
  console.log(`[BatchCapture] 📊 배치 완료 (${totalMs}ms)`);
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

async function executeWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  timeoutMs: number
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await withTimeout(fn(), timeoutMs);
    } catch (err) {
      lastErr = err;
      if (attempt >= maxRetries) break;
      console.warn(`[BatchCapture] 재시도 ${attempt + 1}/${maxRetries} 실패 — 재시도 진행`);
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

/** GET: 캡처 목록 조회 */
export async function GET(request: NextRequest) {
  try {
    const supabase = createServerClient();
    const { searchParams } = new URL(request.url);

    const status = searchParams.get("status");
    const limit = parseInt(searchParams.get("limit") ?? "20", 10);
    const offset = parseInt(searchParams.get("offset") ?? "0", 10);

    let query = supabase
      .from("vision_da_captures")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error, count } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ data, total: count });
  } catch (err) {
    console.error("[API] GET /captures error:", err);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

/** DELETE: 캡처 이력 삭제 (단일/다중/전체) */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ids, all } = body as {
      id?: string;       // 단일 삭제
      ids?: string[];    // 다중 삭제
      all?: boolean;     // 전체 삭제
    };

    const supabase = createServerClient();

    // 삭제 대상 ID 목록 확정
    let targetIds: string[] = [];

    if (all) {
      // 전체 삭제 — 모든 캡처 ID 조회
      const { data } = await supabase
        .from("vision_da_captures")
        .select("id");
      targetIds = (data ?? []).map((d: any) => d.id);
    } else if (ids && ids.length > 0) {
      targetIds = ids;
    } else if (id) {
      targetIds = [id];
    } else {
      return NextResponse.json({ error: "삭제할 대상(id, ids, 또는 all)을 지정하세요." }, { status: 400 });
    }

    if (targetIds.length === 0) {
      return NextResponse.json({ deleted: 0 });
    }

    // 1) Storage 이미지 삭제
    for (const captureId of targetIds) {
      try {
        const { data: files } = await supabase.storage
          .from("capture-images")
          .list(`captures/${captureId}`);

        if (files && files.length > 0) {
          const paths = files.map((f: any) => `captures/${captureId}/${f.name}`);
          await supabase.storage
            .from("capture-images")
            .remove(paths);
        }
      } catch (storageErr) {
        // Storage 삭제 실패해도 DB 삭제는 진행
        console.warn(`[API] Storage 삭제 실패 (${captureId}):`, storageErr);
      }
    }

    // 2) DB 레코드 삭제
    const { error, count } = await supabase
      .from("vision_da_captures")
      .delete({ count: "exact" })
      .in("id", targetIds);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    console.log(`[API] 캡처 삭제 완료: ${count}건`);
    return NextResponse.json({ deleted: count });
  } catch (err) {
    console.error("[API] DELETE /captures error:", err);
    return NextResponse.json(
      { error: "서버 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

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
import {
  resolveBatchPerCaptureTimeoutMs,
  SERVERLESS_BATCH_BUDGET_MS,
} from "@/lib/capture/batch-serverless";
import {
  isBrowserbaseConfigured,
  PuppeteerEngine,
} from "@/lib/capture/engine/puppeteer-engine";
import { isGdnExcludedHost } from "@/lib/capture/channels/gdn/host-strategies";
import type { ChannelType, VisionDaCaptureRow } from "@/lib/supabase/types";
import {
  isExecutableYouTubeAdType,
  isLegacyYouTubeAdType,
  isPublicYouTubeAdType,
  type PublicYouTubeAdType,
} from "@/lib/capture/youtube-ad-types";
import {
  makeCaptureStoragePath,
  removeCaptureStorageFolder,
  uploadStorageObject,
} from "@/lib/storage/capture-storage";

export const maxDuration = 300; // 5분
export const dynamic = "force-dynamic";

function normalizeHttpUrl(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t.replace(/^\/+/, "")}`;
}

function isValidHttpUrl(value?: string | null): boolean {
  if (!value?.trim()) return false;
  try {
    const url = new URL(normalizeHttpUrl(value));
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isYouTubeUrl(value: string): boolean {
  try {
    const host = new URL(normalizeHttpUrl(value)).hostname.toLowerCase().replace(/^www\./, "");
    return host === "youtube.com" || host.endsWith(".youtube.com") || host === "youtu.be";
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
      creativeObjectFit = "contain", // 📐 슬롯 내 소재: contain | cover
      youtubeAdType,             // 🎬 YouTube 광고 유형
      instreamOpts,              // 🎬 인스트림 광고 옵션
      infeedOpts,                // 인피드 광고 옵션
      gdnViewportMode,           // GDN: PC vs Mobile 뷰포트
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
      creativeObjectFit?: "contain" | "cover";
      youtubeAdType?: string;
      infeedOpts?: {
        videoUrl?: string;
        searchQuery?: string;
        searchPlacement?: "top" | "feed";
        searchFeedInsertAfterIndex?: number;
        description1?: string;
        description2?: string;
        ctaPrimary?: string;
        ctaSecondary?: string;
        /** 관련동영상: 메인 플레이어 덮개용 퍼블리셔 영상 시점(초) */
        watchNextPlayerFrameOffsetSec?: number;
      };
      instreamOpts?: {
        videoUrl?: string;
        skipSeconds?: number;
        instreamSkipMode?: "skippable" | "non-skippable";
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
      gdnViewportMode?: "pc" | "mobile";
    };

    // URL 배열 통합
    const urls: string[] = publisherUrls?.length
      ? publisherUrls
      : publisherUrl
        ? [publisherUrl]
        : [];

    // 인스트림 광고는 creativeUrl 대신 videoUrl 사용 (PC/모바일 공통)
    const normalizedUrls = urls
      .map((u) => (u.trim() ? normalizeHttpUrl(u) : ""))
      .filter((url) => isValidHttpUrl(url));
    let resolvedYoutubeAdType: PublicYouTubeAdType | undefined;
    if (channel === "youtube") {
      const rawYoutubeAdType =
        typeof youtubeAdType === "string" && youtubeAdType.trim()
          ? youtubeAdType.trim()
          : "preroll";
      if (isLegacyYouTubeAdType(rawYoutubeAdType) || rawYoutubeAdType === "infeed-home") {
        return NextResponse.json(
          {
            error:
              "현재 공개 상품 구성에서 지원하지 않는 YouTube 광고 유형입니다. Display/Overlay와 PC 홈 인피드는 legacy/internal 타입으로 분리되었습니다.",
          },
          { status: 400 }
        );
      }
      if (!isPublicYouTubeAdType(rawYoutubeAdType)) {
        return NextResponse.json(
          { error: `지원하지 않는 YouTube 광고 유형입니다: ${rawYoutubeAdType}` },
          { status: 400 }
        );
      }
      resolvedYoutubeAdType = rawYoutubeAdType;
    }
    const isPreroll =
      channel === "youtube" &&
      (resolvedYoutubeAdType === "preroll" ||
        resolvedYoutubeAdType === "bumper" ||
        resolvedYoutubeAdType === "mobile-preroll-aos" ||
        resolvedYoutubeAdType === "mobile-preroll-ios" ||
        resolvedYoutubeAdType === "mobile-bumper-aos" ||
        resolvedYoutubeAdType === "mobile-bumper-ios");
    const isBumper =
      channel === "youtube" &&
      (resolvedYoutubeAdType === "bumper" ||
        resolvedYoutubeAdType === "mobile-bumper-aos" ||
        resolvedYoutubeAdType === "mobile-bumper-ios");
    const hasValidVideoSource = isPreroll && isValidHttpUrl(instreamOpts?.videoUrl);
    const isInfeedYt =
      channel === "youtube" &&
      (resolvedYoutubeAdType === "mobile-infeed-home" ||
        resolvedYoutubeAdType === "infeed-search" ||
        resolvedYoutubeAdType === "infeed-watch-next");
    const isShortsYt = channel === "youtube" && resolvedYoutubeAdType === "shorts-feed";
    const isMastheadYt = channel === "youtube" && resolvedYoutubeAdType === "masthead-home";
    /** 인피드·Shorts·Masthead 등 프리롤이 아닌 YouTube 유형 */
    const hasValidCreativeSource = !isPreroll && isValidHttpUrl(creativeUrl);
    const hasValidInfeedThumbSource =
      isInfeedYt &&
      (isValidHttpUrl(creativeUrl) || isValidHttpUrl(infeedOpts?.videoUrl));
    const hasValidShortsSource =
      isShortsYt &&
      (isValidHttpUrl(creativeUrl) || isValidHttpUrl(infeedOpts?.videoUrl));
    const hasValidMastheadSource =
      isMastheadYt &&
      (isValidHttpUrl(creativeUrl) || isValidHttpUrl(infeedOpts?.videoUrl));
    const hasSource =
      hasValidVideoSource ||
      hasValidInfeedThumbSource ||
      hasValidShortsSource ||
      hasValidMastheadSource ||
      (!isPreroll && !isInfeedYt && !isShortsYt && !isMastheadYt && isValidHttpUrl(creativeUrl));

    if (!channel || normalizedUrls.length === 0 || !hasSource) {
      return NextResponse.json(
        { error: "channel, publisherUrl(s), creativeUrl/videoUrl 형식을 확인해주세요." },
        { status: 400 }
      );
    }

    if (channel === "youtube" && normalizedUrls.some((url) => !isYouTubeUrl(url))) {
      return NextResponse.json(
        { error: "YouTube 캡처 요청에는 YouTube 게재면 URL만 사용할 수 있습니다." },
        { status: 400 }
      );
    }

    const normalizedCreativeObjectFit =
      creativeObjectFit === "cover" ? "cover" : "contain";

    const supabase = createServerClient();
    const createdCaptures: any[] = [];

    const instreamOptsNormalized =
      instreamOpts &&
      ({
        ...instreamOpts,
        skipSeconds: isBumper
          ? Math.max(
              0,
              Math.min(
                5,
                Number.isFinite(Number(instreamOpts.skipSeconds))
                  ? Number(instreamOpts.skipSeconds)
                  : 3,
              ),
            )
          : instreamOpts.skipSeconds,
        instreamSkipMode: isBumper
          ? "non-skippable"
          : instreamOpts.instreamSkipMode,
        videoUrl: instreamOpts.videoUrl?.trim()
          ? normalizeHttpUrl(instreamOpts.videoUrl)
          : undefined,
        landingUrl: instreamOpts.landingUrl?.trim()
          ? normalizeHttpUrl(instreamOpts.landingUrl)
          : undefined,
        companionImageUrl: instreamOpts.companionImageUrl?.trim()
          ? normalizeHttpUrl(instreamOpts.companionImageUrl)
          : undefined,
        companionChannelUrl: instreamOpts.companionChannelUrl?.trim()
          ? normalizeHttpUrl(instreamOpts.companionChannelUrl)
          : undefined,
        avatarImageUrl: instreamOpts.avatarImageUrl?.trim()
          ? normalizeHttpUrl(instreamOpts.avatarImageUrl)
          : undefined,
      } as typeof instreamOpts);

    const infeedOptsNormalized =
      infeedOpts &&
      ({
        ...infeedOpts,
        videoUrl: infeedOpts.videoUrl?.trim()
          ? normalizeHttpUrl(infeedOpts.videoUrl)
          : undefined,
      } as typeof infeedOpts);

    // 각 URL마다 캡처 요청 생성
    for (const url of normalizedUrls) {
      const requestMetadata = {
        injectionMode,
        slotCount,
        creativeDimensions,
        adSizeMode,
        targetAdSizes,
        creativeObjectFit: normalizedCreativeObjectFit,
        youtubeAdType: resolvedYoutubeAdType,
        instreamOpts: instreamOptsNormalized ?? instreamOpts,
        infeedOpts: infeedOptsNormalized ?? infeedOpts,
        gdnViewportMode:
          channel === "gdn"
            ? gdnViewportMode === "mobile"
              ? "mobile"
              : "pc"
            : undefined,
      };
      const creativeUrlForRow =
        (creativeUrl?.trim() ? normalizeHttpUrl(creativeUrl) : "") ||
        ((isInfeedYt || isShortsYt || isMastheadYt) && infeedOpts?.videoUrl?.trim()
          ? normalizeHttpUrl(infeedOpts.videoUrl)
          : "") ||
        "";

      const { data, error } = await supabase
        .from("vision_da_captures")
        .insert({
          channel,
          source_url: url,
          creative_url: creativeUrlForRow,
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
 * 배치 캡처 실행 — 다건일 때도 페이지 단위로만 정리하고 Chromium은 재사용해
 * 서버리스 남은 시간에 맞춰 최대한 많은 캡처를 처리합니다.
 * (after() 콜백 또는 /api/captures/execute에서 호출)
 */
async function executeBatchCaptures(captureIds: string[]): Promise<void> {
  const startTime = Date.now();
  const supabase = createServerClient();
  const sharedEngine = new PuppeteerEngine();
  let engineLaunched = false;
  const isolatedHosts = new Map<string, string>();
  const hostFailureCounts = new Map<string, number>();
  const multiBatch = captureIds.length > 1;

  console.log(`[BatchCapture] 🎬 배치 시작: ${captureIds.length}건`);
  if (isBrowserbaseFallbackConfiguredForAnyChannel()) {
    console.log("[BatchCapture] Browserbase fallback 대기 상태: configured");
  }

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
          console.error(`[BatchCapture] ❌ 요청 조회 실패: ${captureId}`);
          continue;
        }

        const capture = data as unknown as VisionDaCaptureRow;
        sourceUrlForFailure = capture.source_url ?? null;
        captureMetadata = ((capture as any).metadata ?? {}) as Record<string, unknown>;
        const host = getHostname(capture.source_url ?? null);

        if (capture.status !== "pending") {
          console.log(`[BatchCapture] ⏭️ 건너뜀 (status: ${capture.status}): ${captureId}`);
          continue;
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
          console.warn(`[BatchCapture] ⛔ 운영 제외 사이트 스킵: ${host} (${captureId})`);
          continue;
        }

        // 사이트 격리 큐: 배치 중 격리된 도메인은 즉시 스킵(실패 기록) 후 다음 작업 진행
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
          console.warn(`[BatchCapture] ⏭️ 격리 사이트 스킵: ${host} (${captureId})`);
          continue;
        }

        const perCaptureTimeoutMs = resolveBatchPerCaptureTimeoutMs(multiBatch, startTime);
        if (perCaptureTimeoutMs === null) {
          const remainingIds = captureIds.slice(captureIndex);
          await markRemainingPendingAsBudgetSkipped(supabase, remainingIds);
          console.warn(
            `[BatchCapture] ⏭️ 서버 시간 예산 부족 — 남은 ${remainingIds.length}건 실패 처리 후 배치 종료`
          );
          break;
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
        let channel = createChannel(capture.channel as ChannelType, sharedEngine);
        const storedYoutubeAdType =
          (typeof captureMetadata.youtubeAdType === "string" &&
            captureMetadata.youtubeAdType) ||
          (typeof captureMetadata["youtube_ad_type"] === "string" &&
            captureMetadata["youtube_ad_type"]) ||
          "preroll";
        if (capture.channel === "youtube" && !isExecutableYouTubeAdType(storedYoutubeAdType)) {
          throw new Error(`지원하지 않는 YouTube 광고 유형입니다: ${storedYoutubeAdType}`);
        }
        const captureRequest = {
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
            youtubeAdType: capture.channel === "youtube" ? storedYoutubeAdType : undefined,
            instreamOpts: captureMetadata.instreamOpts,
            infeedOpts: captureMetadata.infeedOpts,
            publisherGotoRelaxed: multiBatch && capture.channel === "gdn",
            gdnBatchFastMode: multiBatch && capture.channel === "gdn",
            gdnViewportMode:
              capture.channel === "gdn"
                ? captureMetadata.gdnViewportMode === "mobile"
                  ? "mobile"
                  : "pc"
                : undefined,
          },
        };

        // 5) 캡처 실행
        let runtimeProvider = "vercel-chromium";
        let fallbackRuntime: Record<string, unknown> | null = null;
        let result: Awaited<ReturnType<typeof channel.execute>>;
        try {
          result = await executeWithRetry(
            () => channel.execute(captureRequest),
            1,
            perCaptureTimeoutMs
          );
        } catch (primaryError) {
          const fallbackTimeoutMs = resolveBrowserbaseFallbackTimeoutMs(
            perCaptureTimeoutMs,
            multiBatch,
            startTime
          );
          if (
            !shouldAttemptBrowserbaseFallback(
              capture.channel,
              primaryError,
              fallbackTimeoutMs
            )
          ) {
            throw primaryError;
          }

          console.warn(
            `[BatchCapture] Browserbase fallback 시도: ${captureId} (${classifyFailureReason(primaryError).code})`
          );
          if (engineLaunched) {
            try {
              await sharedEngine.close();
            } catch {
              /* ignore */
            }
            engineLaunched = false;
          }

          const browserbaseEngine = new PuppeteerEngine({
            provider: "browserbase",
            browserbase: {
              timeoutSeconds: Math.ceil((fallbackTimeoutMs ?? 60_000) / 1000),
            },
          });
          try {
            await browserbaseEngine.launch();
            channel = createChannel(capture.channel as ChannelType, browserbaseEngine);
            result = await executeWithRetry(
              () =>
                channel.execute({
                  ...captureRequest,
                  options: {
                    ...captureRequest.options,
                    runtimeProvider: "browserbase",
                    fallbackFrom: "vercel-chromium",
                  },
                }),
              1,
              fallbackTimeoutMs ?? 60_000
            );
            runtimeProvider = "browserbase";
            const primaryFailure = classifyFailureReason(primaryError);
            fallbackRuntime = {
              used: true,
              from: "vercel-chromium",
              provider: "browserbase",
              primaryFailureCategory: primaryFailure.category,
              primaryFailureCode: primaryFailure.code,
            };
          } catch (fallbackError) {
            const err = new Error(
              `Browserbase fallback 실패: ${
                fallbackError instanceof Error ? fallbackError.message : String(fallbackError)
              }`
            );
            (err as any).fallbackRuntime = {
              attempted: true,
              provider: "browserbase",
              primaryFailure: classifyFailureReason(primaryError),
              fallbackFailure: classifyFailureReason(fallbackError),
            };
            throw err;
          } finally {
            await browserbaseEngine.close().catch(() => {});
          }
        }

        // 6) Storage 업로드
        const timestamp = Date.now();
        const placementUpload = await uploadStorageObject(
          supabase,
          makeCaptureStoragePath(captureId, "placement", timestamp),
          result.placementScreenshot,
          {
            contentType: "image/png",
            label: "게재면 이미지",
          }
        );

        let landingPublicUrl: string | null = null;
        if (result.landingScreenshot) {
          const landingUpload = await uploadStorageObject(
            supabase,
            makeCaptureStoragePath(captureId, "landing", timestamp),
            result.landingScreenshot,
            {
              contentType: "image/png",
              label: "랜딩 이미지",
            }
          );

          landingPublicUrl = landingUpload.publicUrl;
        }

        // 7) DB → completed
        const durationMs = Date.now() - captureStart;
        const diagnostics = (channel as any).getDiagnostics?.() ?? null;
        const successCategory = classifySuccessCategory(diagnostics);

        await supabase
          .from("vision_da_captures")
          .update({
            status: "completed",
            placement_image_url: placementUpload.publicUrl,
            screenshot_storage_path: placementUpload.path,
            landing_image_url: landingPublicUrl,
            landing_final_url: result.landingUrl ?? null,
            metadata: {
              ...captureMetadata,
              capturedAt: result.capturedAt,
              durationMs,
              resultCategory: successCategory,
              diagnostics,
              runtime: {
                provider: runtimeProvider,
                capturedAt: result.capturedAt,
                durationMs,
                diagnostics,
                fallback: fallbackRuntime ?? undefined,
              },
            },
            updated_at: new Date().toISOString(),
          })
          .eq("id", captureId);

        console.log(`[BatchCapture] ✅ 완료: ${captureId} (${durationMs}ms)`);

      } catch (captureError) {
        const errorMessage = captureError instanceof Error ? captureError.message : "알 수 없는 오류";
        const failureInfo = classifyFailureReason(captureError);
        const fallbackRuntime =
          typeof captureError === "object" && captureError !== null
            ? ((captureError as any).fallbackRuntime as Record<string, unknown> | undefined)
            : undefined;
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
              fallback: fallbackRuntime,
              failedAt: new Date().toISOString(),
            },
            updated_at: new Date().toISOString(),
          })
          .eq("id", captureId);

        console.error(`[BatchCapture] ❌ 실패: ${captureId}`, captureError);

        if (host) {
          const nextCount = (hostFailureCounts.get(host) ?? 0) + 1;
          hostFailureCounts.set(host, nextCount);
          const isolate =
            failureInfo.hardBlocked ||
            (nextCount >= 2 && isHostIsolatableRuntimeError(captureError));
          if (isolate && !isolatedHosts.has(host)) {
            const reason = failureInfo.code || "host-failure";
            isolatedHosts.set(host, reason);
            console.warn(`[BatchCapture] 🚧 사이트 격리 등록: ${host} (reason=${reason}, fails=${nextCount})`);
          }
        }

        // 세션 종료/타임아웃/프레임 분리: 엔진 정리. 단건 배치는 즉시 재기동, 다건은 다음 사이트에서 새로 시작
        if (isRecoverableEngineError(captureError)) {
          console.warn("[BatchCapture] ♻️ 복구 가능 엔진 에러 감지 — 엔진 정리");
          try {
            if (engineLaunched) {
              await sharedEngine.close();
            }
          } catch {
            // 이미 닫혔으면 무시
          }
          engineLaunched = false;
          if (!multiBatch) {
            try {
              await sharedEngine.launch();
              engineLaunched = true;
              console.log("[BatchCapture] ♻️ Chromium 재시작 완료");
            } catch (relaunchErr) {
              console.error("[BatchCapture] ❌ Chromium 재시작 실패", relaunchErr);
            }
          } else {
            console.log("[BatchCapture] (다건) 다음 사이트에서 Chromium을 새로 시작합니다.");
          }
        } else if (multiBatch && engineLaunched) {
          try {
            await sharedEngine.close();
            console.log("[BatchCapture] 🔄 Chromium 종료 (다건·오류 후 세션 분리)");
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
      console.warn("[BatchCapture] processing 정리 실패:", cleanupErr);
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
      console.warn("[BatchCapture] pending 정리 실패:", cleanupErr);
    }

    if (engineLaunched) {
      await sharedEngine.close();
      console.log(`[BatchCapture] 🛑 Chromium 종료`);
    }
  }

  const totalMs = Date.now() - startTime;
  console.log(`[BatchCapture] 📊 배치 완료 (${totalMs}ms)`);
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

function isDisabledEnvFlag(value: string | undefined): boolean {
  const v = value?.trim().toLowerCase();
  return v === "0" || v === "false" || v === "off" || v === "no";
}

function getBrowserbaseFallbackChannels(): Set<string> {
  const raw = (process.env.BROWSERBASE_FALLBACK_CHANNELS ?? "gdn,youtube").trim().toLowerCase();
  if (raw === "*" || raw === "all") return new Set(["gdn", "youtube"]);
  return new Set(
    raw
      .split(",")
      .map((channel) => channel.trim())
      .filter(Boolean)
  );
}

function isBrowserbaseFallbackConfiguredForAnyChannel(): boolean {
  return (
    isBrowserbaseConfigured() &&
    !isDisabledEnvFlag(process.env.BROWSERBASE_FALLBACK_ENABLED) &&
    getBrowserbaseFallbackChannels().size > 0
  );
}

function resolveBrowserbaseFallbackTimeoutMs(
  perCaptureTimeoutMs: number,
  multiBatch: boolean,
  batchStartMs: number
): number | null {
  const configured = Number(process.env.BROWSERBASE_FALLBACK_TIMEOUT_MS);
  const desired = Number.isFinite(configured) && configured > 0 ? configured : 90_000;
  const base = Math.min(perCaptureTimeoutMs, desired);
  if (!multiBatch) return Math.max(45_000, base);

  const remaining = SERVERLESS_BATCH_BUDGET_MS - (Date.now() - batchStartMs);
  if (remaining < 45_000) return null;
  return Math.max(30_000, Math.min(base, remaining - 8_000));
}

function shouldAttemptBrowserbaseFallback(
  channel: string,
  err: unknown,
  fallbackTimeoutMs: number | null
): boolean {
  if (fallbackTimeoutMs === null) return false;
  if (!isBrowserbaseFallbackConfiguredForAnyChannel()) return false;
  const allowedChannels = getBrowserbaseFallbackChannels();
  if (!allowedChannels.has(channel.toLowerCase())) return false;

  const failure = classifyFailureReason(err);
  return (
    failure.category === "blocked" ||
    failure.category === "runtime" ||
    failure.category === "timeout"
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

async function executeWithRetry<T>(fn: () => Promise<T>, maxAttempts: number, timeoutMs: number): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await withTimeout(fn(), timeoutMs);
    } catch (err) {
      lastErr = err;
      // 브라우저 세션 종료/연결 종료는 재시도해도 같은 엔진에서 실패 확률이 높음
      // → 외부 루프의 엔진 재시작 복구 로직으로 넘김
      if (isBrowserSessionClosedError(err)) {
        break;
      }

      // 타임아웃 계열만 재시도 (요청하신 장기 처리중 대응)
      const msg = (err instanceof Error ? err.message : String(err)).toLowerCase();
      const retryableTimeout =
        msg.includes("capture timeout") ||
        msg.includes("timeout") ||
        msg.includes("timed out");
      if (!retryableTimeout) {
        break;
      }

      if (attempt >= maxAttempts) break;
      console.warn(`[BatchCapture] 시도 ${attempt}/${maxAttempts} 실패 — 다음 시도 진행`);
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
    // 캡처 중에는 DB를 건드리지 않아 updated_at이 갱신되지 않음 → 너무 짧으면 정상 장기 처리중 행까지 실패 처리됨(SBS 등)
    const staleThresholdIso = new Date(Date.now() - 12 * 60 * 1000).toISOString();

    // 오래된 processing 상태 자동 정리 (워커 중단/세션 종료 후 고착 방지)
    await supabase
      .from("vision_da_captures")
      .update({
        status: "failed",
        error_message: "처리 시간 초과로 자동 종료되었습니다.",
        updated_at: new Date().toISOString(),
      })
      .eq("status", "processing")
      .lt("updated_at", staleThresholdIso);

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
        await removeCaptureStorageFolder(supabase, captureId);
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

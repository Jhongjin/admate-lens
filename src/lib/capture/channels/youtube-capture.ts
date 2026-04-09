/**
 * YouTube Capture v1 — YouTube 광고 캡처 모듈
 *
 * 지원 광고 유형:
 * 1. 인스트림 (프리롤) — 영상 플레이어에 프리롤 광고 시뮬레이션
 * 2. 디스플레이 — 사이드바 컴패니언 배너 영역에 인젝션
 * 3. 오버레이 — 영상 플레이어 하단 반투명 오버레이 배너
 */

import type { IPageHandle } from "../engine/browser-engine";
import { BaseChannel, type CaptureRequest } from "./base-channel";

/** YouTube 광고 유형 */
export type YouTubeAdType = "preroll" | "display" | "overlay";

/** YouTube 캡처 진단 정보 */
export interface YouTubeDiagnostics {
  adType: YouTubeAdType;
  playerFound: boolean;
  playerSize: { width: number; height: number };
  sidebarFound: boolean;
  injectionSuccess: boolean;
  creativeDownloaded: boolean;
  creativeBase64Size: number;
}

/**
 * 이미지 URL → base64 data URL 변환 (서버 측)
 */
async function imageUrlToDataUrl(imageUrl: string): Promise<{ dataUrl: string; sizeKB: number; ok: boolean }> {
  try {
    console.log(`[YouTube] 소재 이미지 다운로드 시작: ${imageUrl}`);
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const contentType = response.headers.get("content-type") || "image/png";
    const arrayBuffer = await response.arrayBuffer();
    const sizeKB = Math.round(arrayBuffer.byteLength / 1024);
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const dataUrl = `data:${contentType};base64,${base64}`;
    console.log(`[YouTube] 소재 이미지 변환 완료 (${contentType}, ${sizeKB}KB)`);
    return { dataUrl, sizeKB, ok: true };
  } catch (err) {
    console.error(`[YouTube] 소재 이미지 다운로드 실패:`, err);
    return { dataUrl: imageUrl, sizeKB: 0, ok: false };
  }
}

/** 인스트림 메타데이터 (API·폼에서 options.instreamOpts 로 전달) */
type InstreamOptsPayload = {
  videoUrl?: string;
  skipSeconds?: number;
  adTitle?: string;
  ctaText?: string;
  landingUrl?: string;
  displayUrl?: string;
  displayPath1?: string;
  displayPath2?: string;
  companionImageUrl?: string;
  /** 카드 원형 로고(업로드 URL → 서버에서 data URL로 변환 후 주입) */
  avatarImageUrl?: string;
};

/** YouTube URL에서 Video ID 추출 */
function extractVideoId(url: string): string | null {
  try {
    const u = new URL(url.trim());
    if (u.hostname.includes("youtube.com") && u.pathname === "/watch") {
      return u.searchParams.get("v");
    }
    if (u.hostname === "youtu.be") {
      const id = u.pathname.replace(/^\//, "").split("/")[0]?.split("?")[0];
      return id || null;
    }
    if (u.pathname.startsWith("/embed/")) return u.pathname.split("/embed/")[1]?.split("?")[0] || null;
    if (u.pathname.startsWith("/live/")) return u.pathname.split("/live/")[1]?.split("?")[0] || null;
    return null;
  } catch {
    return null;
  }
}

/** YouTube 썸네일 URL 생성 (공개 API, 인증 불필요) */
function getThumbnailUrl(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
}

export class YouTubeCapture extends BaseChannel {
  private diagnostics: YouTubeDiagnostics | null = null;

  getDiagnostics(): YouTubeDiagnostics | null {
    return this.diagnostics;
  }

  async captureAdPlacement(page: IPageHandle, request: CaptureRequest): Promise<Buffer> {
    const adType = (request.options?.youtubeAdType as YouTubeAdType) || "preroll";
    console.log(`[YouTube] ===== 캡처 시작 =====`);
    console.log(`[YouTube] 영상 URL: ${request.publisherUrl}`);
    console.log(`[YouTube] 광고 유형: ${adType}`);
    const instreamOpts = (request.options?.instreamOpts as InstreamOptsPayload | undefined) ?? {};
    const prerollCaptureSeconds =
      adType === "preroll"
        ? (() => {
            const sec = instreamOpts.skipSeconds;
            return typeof sec === "number" && Number.isFinite(sec) && sec >= 0 ? sec : 5;
          })()
        : null;

    console.log(`[YouTube] 소재(creative_url): ${request.creativeUrl || "(없음)"}`);
    if (adType === "preroll" && instreamOpts.videoUrl) {
      console.log(`[YouTube] 인스트림 광고 동영상 URL: ${instreamOpts.videoUrl}`);
    }

    // 초기화
    this.diagnostics = {
      adType,
      playerFound: false,
      playerSize: { width: 0, height: 0 },
      sidebarFound: false,
      injectionSuccess: false,
      creativeDownloaded: false,
      creativeBase64Size: 0,
    };

    /** 캡처 1회당 1장 — 마스트헤드 폴백 오버레이·재주입에 동일 이미지 사용 */
    const mastheadProfileDataUrl = await this.pickRandomMastheadAvatarDataUrl();

    // 1) 소재 이미지 → base64 data URL
    // 인스트림은 폼에서 creativeUrl 없이 videoUrl만 보내는 경우가 많음 → 광고 동영상의 썸네일을 소재로 사용
    const rawCreative = (request.creativeUrl || "").trim();
    let creativeFetchUrl = rawCreative;
    let prerollAdVideoId: string | null = null;
    if (instreamOpts.videoUrl?.trim()) {
      prerollAdVideoId = extractVideoId(instreamOpts.videoUrl.trim());
    }
    if (adType === "preroll") {
      if (rawCreative && /youtube\.com|youtu\.be/i.test(rawCreative)) {
        const id = extractVideoId(rawCreative);
        if (id) {
          creativeFetchUrl = getThumbnailUrl(id);
          prerollAdVideoId = prerollAdVideoId || id;
        }
      } else if (!rawCreative && prerollAdVideoId) {
        creativeFetchUrl = getThumbnailUrl(prerollAdVideoId);
      }
    }

    let { dataUrl: creativeDataUrl, sizeKB, ok } = creativeFetchUrl
      ? await imageUrlToDataUrl(creativeFetchUrl)
      : { dataUrl: "", sizeKB: 0, ok: false };
    if (adType === "preroll" && !ok && prerollAdVideoId) {
      const fb = await imageUrlToDataUrl(
        `https://img.youtube.com/vi/${prerollAdVideoId}/hqdefault.jpg`
      );
      if (fb.ok) {
        creativeDataUrl = fb.dataUrl;
        sizeKB = fb.sizeKB;
        ok = true;
      }
    }
    this.diagnostics.creativeDownloaded = ok;
    this.diagnostics.creativeBase64Size = sizeKB;
    if (adType === "preroll" && !ok) {
      console.error(
        `[YouTube] 인스트림 소재 이미지 확보 실패 — creativeUrl·videoUrl을 확인하세요 (fetch 시도: ${creativeFetchUrl || "(없음)"})`
      );
    }

    // 인스트림 카드 로고: 업로드 URL이 있으면 서버에서 fetch → data URL (YouTube 페이지 CSP/CORS 회피)
    let instreamAvatarDataUrl = creativeDataUrl;
    if (adType === "preroll" && instreamOpts.avatarImageUrl?.trim()) {
      const av = await imageUrlToDataUrl(instreamOpts.avatarImageUrl.trim());
      if (av.ok) {
        instreamAvatarDataUrl = av.dataUrl;
        console.log(`[YouTube] 로고 이미지 적용 (${av.sizeKB}KB)`);
      } else {
        console.warn("[YouTube] 로고 URL fetch 실패 — 썸네일로 대체");
      }
    }

    // 1.5) 🖼️ 비디오 ID 추출 + 썸네일 준비
    // 프리롤은 "광고주 영상(instreamVideoUrl)"을 기준으로 해야 함.
    const videoId =
      adType === "preroll"
        ? prerollAdVideoId ||
          (instreamOpts.videoUrl ? extractVideoId(instreamOpts.videoUrl) : null) ||
          extractVideoId(request.publisherUrl)
        : extractVideoId(request.publisherUrl);
    let thumbnailDataUrl: string | null = null;
    if (videoId) {
      const thumbResult = await imageUrlToDataUrl(getThumbnailUrl(videoId));
      if (thumbResult.ok) {
        thumbnailDataUrl = thumbResult.dataUrl;
        console.log(`[YouTube] 🖼️ 썸네일 다운로드 성공 (${thumbResult.sizeKB}KB)`);
      } else {
        // fallback: hqdefault
        const fallback = await imageUrlToDataUrl(`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`);
        if (fallback.ok) {
          thumbnailDataUrl = fallback.dataUrl;
          console.log(`[YouTube] 🖼️ 썸네일 폴백(hqdefault) 성공`);
        }
      }
    }

    // 1.55) timed-frame 추출 전에 동의 쿠키를 먼저 주입
    //      (순서가 뒤면 embed에서 1x1 비디오로 남아 프레임 추출이 실패할 수 있다)
    await this.applyYouTubeConsentCookies(page);

    // 1.6) 광고주 영상에서 캡처 시점 프레임을 선추출 (퍼블리셔 페이지와 분리)
    let timedFrameDataUrl: string | null = null;
    let timedFrameDurationSec = 0;
    if (adType === "preroll" && instreamOpts.videoUrl?.trim() && prerollCaptureSeconds !== null) {
      const timedFrame = await this.captureTimedFrameFromInstreamVideo(
        page,
        instreamOpts.videoUrl.trim(),
        prerollCaptureSeconds
      );
      timedFrameDataUrl = timedFrame.frameDataUrl;
      timedFrameDurationSec = timedFrame.durationSec;
      if (timedFrameDataUrl) {
        console.log(`[YouTube] 🎞️ 광고주 영상 프레임 추출 성공 (${prerollCaptureSeconds}초)`);
      } else {
        console.warn(`[YouTube] ⚠️ 광고주 프레임 추출 실패 — 소재 이미지 폴백`);
      }
    }

    // 2) 🍪 쿠키 동의 사전 처리 — CONSENT 쿠키 설정
    await this.applyYouTubeConsentCookies(page);

    // 3) YouTube 페이지 로드 — 🔑 embed-first 전략
    // YouTube /watch 페이지는 봇 감지가 매우 강력하므로
    // /embed/ URL로 먼저 접근하여 봇 감지를 우회
    const targetUrl = request.publisherUrl;

    // 데스크톱 시청 레이아웃 고정 — 로컬 2560 등과 무관하게 실제 브라우저(≈1920)와 동일 비율로 캡처
    await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });

    // 📺 YouTube watch 페이지 로드 (레이아웃 확보 목적)
    await page.goto(targetUrl, {
      waitUntil: "networkidle2",
      timeout: 45000,
    });

    // 3.3) 🔤 한글 폰트 주입 (Vercel 서버리스 Chromium에는 CJK 폰트가 없음)
    await this.injectKoreanFonts(page);

    // 3.5) 쿠키 동의 팝업 강제 처리
    await this.dismissYouTubeConsent(page);

    // 4) YouTube 페이지 안정화 대기
    await new Promise((r) => setTimeout(r, 3000));
    await this.applyMastheadLoggedInLook(page, mastheadProfileDataUrl);

    // 4.5) 쿠키 동의 팝업이 여전히 있으면 재시도
    const hasConsent = await page.evaluate<boolean>(`
      (() => {
        const consentDialog = document.querySelector(
          'ytd-consent-bump-v2-lightbox, tp-yt-iron-overlay-backdrop, ' +
          '[action*="consent"], #consent-bump, .consent-bump-v2-lightbox, ' +
          'ytd-enforcement-message-view-model'
        );
        return !!consentDialog;
      })()
    `);

    if (hasConsent) {
      console.log(`[YouTube] 🍪 쿠키 동의 팝업 여전히 존재 — 강제 제거 + 페이지 리로드`);
      await page.evaluate<void>(`
        (() => {
          const selectors = [
            'ytd-consent-bump-v2-lightbox',
            'tp-yt-iron-overlay-backdrop',
            '#consent-bump',
            '.consent-bump-v2-lightbox',
            'ytd-enforcement-message-view-model',
            'tp-yt-paper-dialog',
            'ytd-popup-container',
          ];
          selectors.forEach(sel => {
            document.querySelectorAll(sel).forEach(el => el.remove());
          });
          document.body.style.overflow = '';
          document.documentElement.style.overflow = '';
        })()
      `);
      await page.goto(targetUrl, { waitUntil: "networkidle2", timeout: 45000 });
      await new Promise((r) => setTimeout(r, 3000));
      await this.applyMastheadLoggedInLook(page, mastheadProfileDataUrl);
    }

    // 🔑 4.7) 봇 감지 확인 + 강력한 폴백 전략
    const botDetected = await this.checkBotDetection(page);

    if (botDetected) {
      console.log(`[YouTube] 🤖 봇 감지됨 — 강력 폴백: 썸네일 직접 교체`);

      // 🔑 핵심 전략: 봇 감지 시 플레이어 영역을 완전히 새 DOM으로 교체
      // embed iframe은 봇 감지 상태에서도 실패할 수 있으므로
      // 강제로 모든 봇 관련 요소를 제거 + 플레이어를 썸네일로 완전 교체
      
      // 1단계: 봇 감지 관련 모든 DOM 요소를 강력하게 제거
      await this.nukeAllBotElements(page);
      await new Promise((r) => setTimeout(r, 500));

      // 2단계: 플레이어 영역을 썸네일로 완전 교체
      if (thumbnailDataUrl) {
        console.log(`[YouTube] 🖼️ 플레이어를 썸네일으로 완전 교체`);
        await this.forceReplacePlayerWithThumbnail(page, thumbnailDataUrl);
        await new Promise((r) => setTimeout(r, 1000));
      }

      // 3단계: 혹시 남아있는 봇 메시지 텍스트 최종 제거
      await this.nukeAllBotElements(page);
    }

    // 5) 퍼블리셔 페이지에서는 영상 seek를 수행하지 않는다.
    //    (광고주 영상 프레임은 1.6 단계에서 별도 추출 완료)
    await this.pauseVideo(page, { preserveTimeline: true });
    await new Promise((r) => setTimeout(r, 1000));

    // 캡처 시점 모드: 광고주 영상에서 미리 추출한 프레임을 우선 사용
    let prerollOverlayImageUrl = timedFrameDataUrl || creativeDataUrl;
    let prerollProgressPercent = 33;
    const useTimedFrameOverlay = !!timedFrameDataUrl;
    if (prerollCaptureSeconds !== null) {
      const denom =
        timedFrameDurationSec > 0
          ? timedFrameDurationSec
          : Math.max(15, prerollCaptureSeconds + 1);
      prerollProgressPercent = Math.min(100, Math.max(0, (prerollCaptureSeconds / denom) * 100));
    }

    // 6) 플레이어 정보 수집 (확장된 셀렉터)
    const playerInfo = await page.evaluate<{ found: boolean; width: number; height: number; top: number; left: number; sidebarFound: boolean }>(`
      (() => {
        // 다양한 셀렉터로 플레이어 탐색 (우선순위 순)
        const playerSelectors = [
          '#movie_player',
          '#player-container-inner',
          '#player-container-outer',
          'ytd-player#ytd-player',
          'ytd-player',
          '.html5-video-player',
          '#player',
          '#ytd-player',
          'div.ytd-watch-flexy#player',
        ];

        let player = null;
        for (const sel of playerSelectors) {
          const el = document.querySelector(sel);
          if (el) {
            const rect = el.getBoundingClientRect();
            // 실제 크기가 있는 요소만 사용
            if (rect.width > 100 && rect.height > 100) {
              player = el;
              break;
            }
          }
        }

        const sidebar = document.querySelector('#secondary, #related, ytd-watch-next-secondary-results-renderer');
        
        if (!player) return { found: false, width: 0, height: 0, top: 0, left: 0, sidebarFound: !!sidebar };
        
        const rect = player.getBoundingClientRect();
        return {
          found: true,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          top: Math.round(rect.top),
          left: Math.round(rect.left),
          sidebarFound: !!sidebar
        };
      })()
    `);

    this.diagnostics.playerFound = playerInfo.found;
    this.diagnostics.playerSize = { width: playerInfo.width, height: playerInfo.height };
    this.diagnostics.sidebarFound = playerInfo.sidebarFound;
    console.log(`[YouTube] 플레이어: ${playerInfo.found ? `✅ ${playerInfo.width}x${playerInfo.height}` : "❌ 미감지"}`);
    console.log(`[YouTube] 사이드바: ${playerInfo.sidebarFound ? "✅" : "❌"}`);

    // 6.5) 🧹 인젝션 전 방해 요소 제거 (구독 팝업, 봇 감지, 동의 팝업 등)
    await page.evaluate<void>(`
      (() => {
        // 1) "채널을 구독하시겠습니까?" 팝업 완전 제거
        const popupSelectors = [
          'ytd-popup-container',
          'tp-yt-paper-dialog',
          'yt-confirm-dialog-renderer',
          'ytd-modal-with-title-and-button-renderer',
          'ytd-mealbar-promo-renderer',
          '#dialog',
        ];
        popupSelectors.forEach(sel => {
          document.querySelectorAll(sel).forEach(el => el.remove());
        });

        // 2) "로그인하여 봇이 아님을 확인하세요" 메시지 숨김
        //    플레이어 내부의 에러/확인 오버레이를 숨김
        const playerErrorSelectors = [
          '.ytp-error',
          '.ytp-error-content',
          '.ytp-error-content-wrap',
          '.ytp-error-content-wrap-reason',
          '.ytp-offline-slate',
          '.ytp-offline-slate-bar',
          'ytd-enforcement-message-view-model',
          '.ytp-pause-overlay',
          '#clarify-box',
          '.ytp-suggested-action',
          // 봇 확인 메시지 (로그인 프롬프트)
          '.ytp-error-content-wrap .ytp-error-content-wrap-reason',
        ];
        playerErrorSelectors.forEach(sel => {
          document.querySelectorAll(sel).forEach(el => {
            el.style.display = 'none !important';
            el.style.visibility = 'hidden !important';
            el.style.opacity = '0 !important';
          });
        });

        // 3) 쿠키 동의 관련 요소 제거
        const consentSelectors = [
          'ytd-consent-bump-v2-lightbox',
          'tp-yt-iron-overlay-backdrop',
          '#consent-bump',
          '.consent-bump-v2-lightbox',
        ];
        consentSelectors.forEach(sel => {
          document.querySelectorAll(sel).forEach(el => el.remove());
        });

        // 4) 텍스트 기반으로 "봇이 아님" 메시지가 포함된 요소 숨김
        const allTexts = document.querySelectorAll('*');
        allTexts.forEach(el => {
          const text = el.textContent || '';
          if (
            (text.includes('봇이 아님을 확인') || text.includes('confirm you') ||
             text.includes('Confirm your identity') || text.includes('로그인하여')) &&
            el.closest('#movie_player, #player-container-inner, .html5-video-player')
          ) {
            el.style.display = 'none';
          }
        });

        // 5) body/html overflow 복원 (모달이 스크롤 막는 경우)
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.documentElement.style.overflow = '';

        console.log('[YouTube Cleanup] ✅ 방해 요소 제거 완료');
      })()
    `);

    // 7) 광고 유형별 인젝션
    let injectionSuccess = false;

    switch (adType) {
      case "preroll": {
        const prerollUiOpts = {
          videoUrl: instreamOpts.videoUrl || "",
          adTitle: instreamOpts.adTitle || "",
          ctaText: instreamOpts.ctaText || "",
          landingUrl: instreamOpts.landingUrl || request.clickUrl || "",
          displayUrl: instreamOpts.displayUrl || "",
          displayPath1: instreamOpts.displayPath1 || "",
          displayPath2: instreamOpts.displayPath2 || "",
          companionImageUrl: instreamOpts.companionImageUrl || "",
          avatarImageUrl: instreamAvatarDataUrl,
          progressFillPercent: prerollProgressPercent,
        };
        console.log(
          `[YouTube] 인스트림 옵션: title="${prerollUiOpts.adTitle}" cta="${prerollUiOpts.ctaText}" landing="${prerollUiOpts.landingUrl}"`
        );

        injectionSuccess = await this.injectPrerollAd(page, prerollOverlayImageUrl, playerInfo, prerollUiOpts);
        // 🎯 컴패니언 배너 동시 삽입
        if (injectionSuccess) {
          const companionImg = prerollUiOpts.companionImageUrl || creativeDataUrl;
          const companionResult = await this.injectDisplayAd(page, companionImg, {
            variant: "companion-300x60",
          });
          console.log(`[YouTube] 컴패니언 배너: ${companionResult ? '✅ 성공' : '⚠️ 실패'}`);
        }
        break;
      }
      case "display":
        injectionSuccess = await this.injectDisplayAd(page, creativeDataUrl);
        break;
      case "overlay":
        injectionSuccess = await this.injectOverlayAd(page, creativeDataUrl, playerInfo);
        break;
    }

    this.diagnostics.injectionSuccess = injectionSuccess;

    if (!injectionSuccess) {
      console.warn(`[YouTube] ⚠️ 기본 인젝션 실패 — 폴백: 프리롤 강제 오버레이`);
      await this.injectPrerollAd(page, prerollOverlayImageUrl, playerInfo, {
        avatarImageUrl: instreamAvatarDataUrl,
        progressFillPercent: prerollProgressPercent,
      });
    }

    // 8) 렌더링 안정화
    await new Promise((r) => setTimeout(r, 2000));

    // 9) 스크롤 최상단 복원
    await page.evaluate<void>(`
      (() => {
        window.scrollTo({ top: 0, behavior: 'instant' });
        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
      })()
    `);
    await new Promise((r) => setTimeout(r, 1000));

    // 9.5) 기본 모드에서는 기존대로 video/canvas 숨김.
    // 캡처 시점 모드에서는 "프레임 오버레이를 확보한 경우"에만 숨김 적용(합성 불안정 회피).
    const shouldHideVideoLayers =
      adType !== "preroll" ||
      prerollCaptureSeconds === null ||
      useTimedFrameOverlay;
    if (shouldHideVideoLayers) {
      await page.evaluate<void>(`
        (() => {
          const hide = (el) => {
            el.style.setProperty("visibility", "hidden", "important");
            el.style.setProperty("opacity", "0", "important");
            el.style.setProperty("pointer-events", "none", "important");
          };
          document.querySelectorAll("video").forEach(hide);
          document
            .querySelectorAll("#movie_player canvas, .html5-video-player canvas, ytd-player canvas")
            .forEach(hide);
        })()
      `);
      await new Promise((r) => setTimeout(r, 300));
    }

    // 유튜브가 헤더를 다시 그리면 로그인 버튼이 복구될 수 있음 → 캡처 직전 한 번 더 덮음
    await this.applyMastheadLoggedInLook(page, mastheadProfileDataUrl);

    // 10) 전체 페이지 스크린샷
    const screenshot = await page.screenshot({
      fullPage: false, // YouTube는 뷰포트 캡처가 더 적합
      type: "png",
    });

    console.log(`[YouTube] ===== 캡처 완료 (${adType}) =====`);
    return screenshot;
  }

  /**
   * 🎬 인스트림 (프리롤) 광고 시뮬레이션
   * 📌 실제 YouTube 인스트림 광고 형태를 정확히 재현:
   *   - 좌상단: 작은 "광고" 라벨
   *   - 좌하단: 카드형 CTA (썸네일 + 상품명 + CTA 버튼 + "스폰서 · URL")
   *   - 우하단: "건너뛰기 ▶|" 버튼
   *   - 하단: 노란색 프로그레스 바
   */
  private async injectPrerollAd(
    page: IPageHandle,
    imgDataUrl: string,
    playerInfo: { found: boolean; width: number; height: number; top: number; left: number },
    instreamOpts: {
      videoUrl?: string;
      adTitle?: string;
      ctaText?: string;
      landingUrl?: string;
      displayUrl?: string;
      displayPath1?: string;
      displayPath2?: string;
      skipSeconds?: number;
      companionImageUrl?: string;
      avatarImageUrl?: string;
      progressFillPercent?: number;
    } = {}
  ): Promise<boolean> {
    console.log(`[YouTube] 🎬 프리롤 광고 인젝션 시작`);

    // 표시 URL 텍스트 구성:
    // 1) 폼의 displayUrl 입력값 우선
    // 2) 없으면 videoUrl 호스트
    // 3) 그래도 없으면 landingUrl 호스트
    let landingDomain = "advertiser.com";
    let displayUrlText = "";
    try {
      if (instreamOpts.displayUrl?.trim()) {
        displayUrlText = instreamOpts.displayUrl.trim().replace(/^https?:\/\//, "");
      }
      if (instreamOpts.videoUrl) {
        landingDomain = new URL(instreamOpts.videoUrl).hostname.replace("www.", "");
      } else if (instreamOpts.landingUrl) {
        landingDomain = new URL(instreamOpts.landingUrl).hostname.replace("www.", "");
      }
    } catch { /* ignore */ }
    if (!displayUrlText) displayUrlText = landingDomain;
    const displayPathSegments = [instreamOpts.displayPath1, instreamOpts.displayPath2]
      .map((v) => (v || "").trim().replace(/^\/+|\/+$/g, ""))
      .filter((v) => v.length > 0);
    if (displayPathSegments.length > 0) {
      displayUrlText = displayUrlText.replace(/\/+$/g, "") + "/" + displayPathSegments.join("/");
    }
    const truncateWithDots = (text: string, maxLen: number): string => {
      if (!text || maxLen <= 3) return text;
      return text.length > maxLen ? text.slice(0, maxLen - 3) + "..." : text;
    };
    // 원본 YouTube 카드/스폰서 영역에서 보이는 URL 길이에 맞춰 수동 절삭(...)
    const displayUrlCard = truncateWithDots(displayUrlText, 28);
    const displayUrlSponsor = truncateWithDots(displayUrlText, 34);

    const adTitle = instreamOpts.adTitle || '광고주 사이트 방문';
    const ctaText = instreamOpts.ctaText || '자세히 알아보기';

    const result = await page.evaluate<boolean>(`
      (() => {
        try {
          const imgUrl = ${JSON.stringify(imgDataUrl)};
          const avatarImgUrl = ${JSON.stringify(instreamOpts.avatarImageUrl || "")};
          const domainText = ${JSON.stringify(displayUrlCard)};
          const sponsorDomainText = ${JSON.stringify(displayUrlSponsor)};
          const titleText = ${JSON.stringify(adTitle)};
          const ctaBtnText = ${JSON.stringify(ctaText)};
          const progressFillPct = ${JSON.stringify(
            Math.min(100, Math.max(0, instreamOpts.progressFillPercent ?? 33))
          )};

          // 플레이어 좌표 수집
          const playerSelectors = [
            '#movie_player', '#player-container-inner', '#player-container-outer',
            'ytd-player', '.html5-video-player', '#player',
          ];

          let playerRect = null;
          for (const sel of playerSelectors) {
            const el = document.querySelector(sel);
            if (el) {
              const r = el.getBoundingClientRect();
              if (r.width > 100 && r.height > 100) {
                playerRect = r;
                break;
              }
            }
          }

          const px = playerRect ? playerRect.left : 0;
          const py = playerRect ? playerRect.top : 56;
          const pw = playerRect ? playerRect.width : window.innerWidth * 0.7;
          const ph = playerRect ? playerRect.height : window.innerHeight * 0.6;
          const playerRadius = '12px';
          // ═══════════════════════════════════════════════════
          // 메인 오버레이 (플레이어 전체를 덮음 + 라운딩)
          // ═══════════════════════════════════════════════════
          const overlay = document.createElement('div');
          overlay.id = 'admate-preroll-overlay';
          overlay.setAttribute('data-injected', 'admate-youtube-preroll');
          overlay.style.cssText = [
            'position: fixed',
            'top: ' + py + 'px',
            'left: ' + px + 'px',
            'width: ' + pw + 'px',
            'height: ' + ph + 'px',
            'z-index: 2147483647',
            'display: flex',
            'align-items: center',
            'justify-content: center',
            'overflow: hidden',
            'border-radius: ' + playerRadius,
            'transform: translateZ(0)',
            'backface-visibility: hidden',
            'isolation: isolate',
          ].join(' !important;') + ' !important';

          // ─── 광고 소재 이미지 (존재할 경우 화면 꽉 채움) ───
          if (imgUrl) {
            // Black halo 방지: 코너 안티앨리어싱 픽셀 뒤에 검정 배경을 두지 않는다.
            overlay.style.background = 'transparent !important';
            const img = document.createElement('img');
            img.src = imgUrl;
            img.setAttribute('data-injected', 'admate');
            // Subpixel seam 방지: 이미지를 0.5px bleed 시켜 가장자리 틈/검은선 제거
            img.style.cssText = 'width:calc(100% + 1px) !important;height:calc(100% + 1px) !important;object-fit:cover !important;display:block !important;position:absolute !important;top:-0.5px !important;left:-0.5px !important;z-index:1 !important;border-radius:inherit !important;transform:translateZ(0) !important;backface-visibility:hidden !important';
            overlay.appendChild(img);
          } else {
            overlay.style.background = 'transparent !important';
          }

          // ─── 좌상단: "광고" 라벨 (실제 YouTube처럼 극히 미세하게) ───
          const adLabel = document.createElement('div');
          adLabel.style.cssText = "position:absolute;top:10px;left:10px;color:rgba(255,255,255,0.5);font-size:10px;font-family:Roboto,Arial,sans-serif;font-weight:400;letter-spacing:0.2px;z-index:10";
          adLabel.textContent = '광고';
          overlay.appendChild(adLabel);

          // ═══ 좌하단: CTA 카드 + 스폰서 줄 (한 스택으로 묶어 좌측 정렬·세로 간격 고정) ═══
          const adLowerStack = document.createElement('div');
          adLowerStack.id = 'admate-preroll-lower-stack';
          adLowerStack.setAttribute('data-injected', 'admate-youtube-preroll');
          adLowerStack.style.cssText = [
            'position: absolute',
            'left: 16px',
            'bottom: 16px',
            'z-index: 20',
            'display: flex',
            'flex-direction: column',
            'align-items: flex-start',
            'justify-content: flex-end',
            'gap: 8px',
            'margin: 0',
            'padding: 0',
            'pointer-events: none',
          ].join(' !important;') + ' !important';

          const ctaCard = document.createElement('div');
          ctaCard.style.cssText = [
            'position: relative',
            'display: flex',
            'align-items: center',
            'background: rgba(0,0,0,0.65)',
            'border-radius: 8px',
            'padding: 8px 12px',
            'max-width: 400px',
            'z-index: 10',
            'overflow: hidden',
            'cursor: pointer',
            'pointer-events: auto',
            'flex-shrink: 0',
          ].join(' !important;') + ' !important';

          // 원형 아이콘 (ytp-ad-avatar--size-m = 40px)
          if (avatarImgUrl) {
            const ctaIcon = document.createElement('img');
            ctaIcon.src = avatarImgUrl;
            ctaIcon.style.cssText = 'width:38px !important;height:38px !important;border-radius:50% !important;object-fit:cover !important;flex-shrink:0 !important;margin-right:12px !important';
            ctaCard.appendChild(ctaIcon);
          } else {
            // 이미지가 없으면 기본 아이콘 표시 (사용자 아바타 느낌)
            const ctaIconFallback = document.createElement('div');
            ctaIconFallback.style.cssText = 'width:38px !important;height:38px !important;border-radius:50% !important;background:#555 !important;display:flex;align-items:center;justify-content:center;flex-shrink:0 !important;margin-right:12px !important;color:#fff;font-size:20px;';
            ctaIconFallback.textContent = titleText.charAt(0) || '선';
            ctaCard.appendChild(ctaIconFallback);
          }

          // 텍스트 영역 (광고제목 + 도메인)
          const ctaTextDiv = document.createElement('div');
          ctaTextDiv.style.cssText = 'flex:1;min-width:0;margin-right:12px';
          // font-family에 작은따옴표를 쓰면 evaluate 문자열이 깨져 SyntaxError 남 → HTML 엔티티 사용
          ctaTextDiv.innerHTML = [
            '<div style="font-size:14px;font-weight:500;color:#fff;font-family:&quot;YouTube Noto&quot;,Roboto,Arial,Helvetica,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:20px;letter-spacing:normal">' + titleText + '</div>',
            '<div style="font-size:12px;color:rgba(255,255,255,0.7);font-family:&quot;YouTube Noto&quot;,Roboto,Arial,Helvetica,sans-serif;margin-top:2px;line-height:16px;letter-spacing:normal">' + domainText + '</div>',
          ].join('');
          ctaCard.appendChild(ctaTextDiv);

          // ✅ CTA 버튼 (ytp-ad-button-vm--style-filled-white)
          // YouTube CSS: --yt-spec-white-3: #f1f1f1
          const ctaBtn = document.createElement('div');
          ctaBtn.style.cssText = "background:#f1f1f1;color:rgb(15,15,15);font-size:14px;font-weight:500;line-height:36px;letter-spacing:normal;font-family:Roboto,Arial,sans-serif;padding:0 16px;border-radius:18px;height:36px;white-space:nowrap;cursor:pointer;flex-shrink:0;display:inline-flex;align-items:center";
          ctaBtn.textContent = ctaBtnText;
          ctaCard.appendChild(ctaBtn);

          // ─── "스폰서 ⓘ  URL" — 밝은 영상에서도 읽히도록 다중 텍스트 그림자 적용
          const sponsorText = document.createElement('div');
          sponsorText.id = 'admate-preroll-sponsor';
          sponsorText.setAttribute('data-injected', 'admate-youtube-preroll');
          sponsorText.style.cssText = [
            'position: relative',
            'display: flex',
            'align-items: center',
            'margin: 0',
            'padding: 0',
            'font-size: 13px',
            'line-height: 16px',
            'color: rgba(255, 255, 255, 0.9)',
            'font-family: Roboto, Arial, Helvetica, sans-serif',
            'text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9), 0 1px 8px rgba(0, 0, 0, 0.8), 0 0 14px rgba(0, 0, 0, 0.8), 0 0 2px rgba(0, 0, 0, 0.9)',
            '-webkit-font-smoothing: antialiased',
            'font-weight: 500',
            'pointer-events: auto',
            'flex-shrink: 0',
            'box-sizing: border-box',
          ].join(' !important;') + ' !important';
          sponsorText.innerHTML = [
            '<span style="margin-right:4px">스폰서</span>',
            '<span style="font-family:Arial,Helvetica,sans-serif;font-size:9px;font-weight:600;width:13px;height:13px;border:1px solid rgba(255,255,255,0.8);border-radius:50%;display:inline-flex;align-items:center;justify-content:center;line-height:1;flex-shrink:0;box-sizing:border-box;margin-right:6px">i</span>',
            '<span style="display:inline-block;max-width:280px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;vertical-align:bottom;">' + sponsorDomainText + '</span>'
          ].join('');
          adLowerStack.appendChild(ctaCard);
          adLowerStack.appendChild(sponsorText);
          overlay.appendChild(adLowerStack);

          // ─── 하단: 노란색 프로그레스 바 ───
          const timerBg = document.createElement('div');
          timerBg.style.cssText = 'position:absolute;bottom:0;left:0;width:100%;height:3px;background:rgba(255,255,255,0.15);z-index:10;border-radius:0 0 12px 12px';
          overlay.appendChild(timerBg);

          const timerBar = document.createElement('div');
          const barRadius = progressFillPct >= 99.5 ? '0 0 12px 12px' : '0 0 0 12px';
          timerBar.style.cssText = 'position:absolute;bottom:0;left:0;width:' + progressFillPct + '%;height:3px;background:#f2bc42;z-index:11;border-radius:' + barRadius;
          overlay.appendChild(timerBar);

          // body에 오버레이 추가
          document.body.appendChild(overlay);

          // ═══════════════════════════════════════════════════
          // 🔑 "건너뛰기" 버튼 — 실제 YouTube 둥근 알약형 (pill shape)
          //    body에 fixed로 배치 (오버레이 overflow:hidden 회피)
          // ═══════════════════════════════════════════════════
          const skipBtn = document.createElement('div');
          skipBtn.id = 'admate-skip-btn';
          skipBtn.className = 'admate-ytp-skip-ad-button';
          skipBtn.setAttribute('data-injected', 'admate-youtube-preroll');
          // 레이아웃은 실제 .ytp-skip-ad-button 과 동일: flex + 텍스트 div + 아이콘 span(24px SVG)
          skipBtn.style.cssText = [
            'position: fixed',
            'top: ' + (py + ph - 90) + 'px',
            'left: ' + (px + pw - 24) + 'px',
            'transform: translateX(-100%)',
            'box-sizing: border-box',
            'background: rgba(28,28,28,0.8)',
            'color: #fff',
            'padding: 8px 16px',
            'min-height: 36px',
            'border-radius: 18px',
            'border: none',
            'cursor: pointer',
            'display: flex',
            'align-items: center',
            'flex-direction: row',
            'gap: 12px',
            'z-index: 2147483647',
            'letter-spacing: 0',
            'backdrop-filter: blur(4px)',
          ].join(' !important;') + ' !important';
          // SVG: 유튜브 플레이어에서 복사한 skip 아이콘(path 동일, 24×24)
          skipBtn.innerHTML =
            '<div class="admate-ytp-skip-ad-button__text" style="color:#fff !important;font-size:15px !important;font-weight:500 !important;line-height:1 !important;font-family: \\'Noto Sans KR\\', \\'Roboto\\', Arial, Helvetica, sans-serif !important;display:flex !important;align-items:center !important">건너뛰기</div>' +
            '<span class="admate-ytp-skip-ad-button__icon" style="display:inline-flex !important;align-items:center !important;justify-content:center !important;line-height:0 !important;flex-shrink:0 !important">' +
            '<svg fill="none" height="24" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg" focusable="false" aria-hidden="true">' +
            '<path d="M20 20C20.26 20 20.51 19.89 20.70 19.70C20.89 19.51 21 19.26 21 19V5C21 4.73 20.89 4.48 20.70 4.29C20.51 4.10 20.26 4 20 4C19.73 4 19.48 4.10 19.29 4.29C19.10 4.48 19 4.73 19 5V19C19 19.26 19.10 19.51 19.29 19.70C19.48 19.89 19.73 20 20 20ZM5.04 19.77L18 12L5.04 4.22C4.84 4.10 4.60 4.03 4.36 4.03C4.12 4.03 3.89 4.09 3.68 4.21C3.47 4.32 3.30 4.49 3.18 4.70C3.06 4.91 2.99 5.14 3 5.38V18.61C2.99 18.85 3.06 19.08 3.18 19.29C3.30 19.50 3.47 19.67 3.68 19.79C3.89 19.90 4.12 19.96 4.36 19.96C4.60 19.96 4.84 19.89 5.04 19.77Z" fill="white"/>' +
            '</svg></span>';
          document.body.appendChild(skipBtn);

          console.log('[YouTube Inject] ✅ 프리롤 인젝션 성공 (실제 YouTube 형태, ' + pw + 'x' + ph + ')');
          return true;
        } catch (err) {
          console.error('[YouTube Inject] ❌ 프리롤 인젝션 에러:', err);
          return false;
        }
      })()
    `);

    console.log(`[YouTube] 프리롤 인젝션: ${result ? "✅ 성공" : "❌ 실패"}`);
    return result;
  }

  /**
   * 📺 디스플레이 / 인스트림 컴패니언 광고 인젝션
   * - sidebar-display: 300×250 비율 이미지 + 하단 푸터 (순수 디스플레이 슬롯)
   * - companion-300x60: 높이 60px 배너 + 추천 영상·칩과 동일 가로 정렬, 하단 플레이스홀더 박스
   */
  private async injectDisplayAd(
    page: IPageHandle,
    imgDataUrl: string,
    options?: { variant?: "sidebar-display" | "companion-300x60" }
  ): Promise<boolean> {
    const variant = options?.variant ?? "sidebar-display";
    console.log(
      `[YouTube] 📺 사이드바 광고 인젝션 시작 (variant=${variant})`
    );

    const result = await page.evaluate<boolean>(`
      (() => {
        const imgUrl = ${JSON.stringify(imgDataUrl)};
        const variant = ${JSON.stringify(variant)};

        // 사이드바 영역 찾기 (다양한 셀렉터)
        const sidebarSelectors = [
          '#secondary-inner',
          '#secondary',
          'ytd-watch-next-secondary-results-renderer',
          '#related',
        ];

        let sidebar = null;
        for (const sel of sidebarSelectors) {
          const el = document.querySelector(sel);
          if (el) {
            const r = el.getBoundingClientRect();
            if (r.width > 50) {
              sidebar = el;
              console.log('[YouTube Inject] 사이드바 발견:', sel, Math.round(r.width) + 'px');
              break;
            }
          }
        }

        if (!sidebar) {
          console.warn('[YouTube Inject] 사이드바를 찾을 수 없습니다');
          return false;
        }

        // 추천 영상 행·칩바와 동일한 콘텐츠 가로폭 (컴패니언이 더 넓게 보이는 현상 방지)
        const sidebarRect = sidebar.getBoundingClientRect();
        const sidebarWidth = Math.round(sidebarRect.width);
        let alignW = 0;
        const chipEl = sidebar.querySelector(
          'ytd-feed-filter-chip-bar-renderer, yt-chip-cloud-renderer'
        );
        const firstVideo = sidebar.querySelector('ytd-compact-video-renderer');
        if (firstVideo) alignW = firstVideo.getBoundingClientRect().width;
        if (chipEl) {
          const cw = chipEl.getBoundingClientRect().width;
          if (alignW > 0) alignW = Math.min(alignW, cw);
          else alignW = cw;
        }
        if (alignW < 120) alignW = sidebarWidth;
        alignW = Math.round(alignW);

        const isCompanion = variant === 'companion-300x60';
        const adWidth = isCompanion
          ? alignW
          : Math.min(alignW, 336);

        // ═══════════════════════════════════════════════════
        // 전체 광고 컨테이너 (실제 YouTube 스타일)
        // ═══════════════════════════════════════════════════
        const container = document.createElement('div');
        container.setAttribute(
          'data-injected',
          isCompanion ? 'admate-youtube-companion' : 'admate-youtube-display'
        );
        const containerStyles = [
          'width: 100% !important',
          'max-width: 100% !important',
          'box-sizing: border-box !important',
          'margin: 0 !important',
          'overflow: hidden !important',
          'box-shadow: 0 1px 2px rgba(0,0,0,0.1) !important',
          'background: #fff !important',
          'border: 1px solid #e5e5e5 !important',
          'position: relative !important',
        ];
        if (isCompanion) {
          containerStyles.push('border-radius: 2px !important', 'height: 60px !important');
        } else {
          containerStyles.push('border-radius: 12px !important');
        }
        container.style.cssText = containerStyles.join(';');

        // ─── 배너 이미지 ───
        const imgEl = document.createElement('img');
        imgEl.src = imgUrl;
        imgEl.setAttribute('data-injected', 'admate');
        if (isCompanion) {
          imgEl.style.cssText = [
            'display: block !important',
            'width: 100% !important',
            'height: 60px !important',
            'object-fit: cover !important',
            'object-position: center !important',
          ].join(';');
        } else {
          imgEl.style.cssText = [
            'display: block !important',
            'width: 100% !important',
            'height: auto !important',
            'aspect-ratio: 300/250 !important',
            'object-fit: cover !important',
          ].join(';');
        }
        container.appendChild(imgEl);

        if (!isCompanion) {
          // ─── 하단 푸터: [파비콘] "광고주 사이트 방문" + "Ad · Sponsored" (디스플레이 전용) ───
          const footer = document.createElement('div');
          footer.style.cssText = [
            'padding: 12px 12px !important',
            'display: flex !important',
            'align-items: center !important',
            'gap: 10px !important',
            'background: #fff !important',
          ].join(';');

          const favicon = document.createElement('div');
          favicon.style.cssText =
            'width:36px;height:36px;border-radius:50%;background:#065fd4;display:flex;align-items:center;justify-content:center;flex-shrink:0';
          favicon.innerHTML =
            '<svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M19 19H5V5h7V3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>';

          const textArea = document.createElement('div');
          textArea.style.cssText = 'flex:1;min-width:0';
          textArea.innerHTML = [
            "<div style=\\"font-size:14px;font-weight:400;color:#0f0f0f;font-family:Roboto,'Noto Sans KR',Arial,sans-serif;line-height:1.4\\">광고주 사이트 방문</div>",
            "<div style=\\"font-size:12px;color:#606060;font-family:Roboto,Arial,sans-serif;margin-top:2px;\\">Ad · Sponsored</div>",
          ].join('');

          footer.appendChild(favicon);
          footer.appendChild(textArea);
          container.appendChild(footer);
        }

        const wrap = document.createElement('div');
        wrap.setAttribute('data-injected', 'admate-youtube-sidebar-ad-wrap');
        const wrapStyles = [
          'width: ' + adWidth + 'px',
          'max-width: 100%',
          'box-sizing: border-box',
          isCompanion ? 'margin: 0 0 24px 0' : 'margin: 0 0 16px 0',
        ];
        if (isCompanion) {
          wrapStyles.push(
            'display: flex',
            'flex-direction: column',
            'gap: 16px',
            'align-items: stretch'
          );
        }
        wrap.style.cssText = wrapStyles.join(' !important;') + ' !important';
        wrap.appendChild(container);

        if (isCompanion) {
          const belowBox = document.createElement('div');
          belowBox.id = 'admate-companion-below-slot';
          belowBox.setAttribute('data-injected', 'admate-youtube-companion');
          belowBox.setAttribute('aria-hidden', 'true');
          belowBox.style.cssText = [
            'width: 100%',
            'box-sizing: border-box',
            'min-height: 88px',
            'flex-shrink: 0',
            'background: #ffffff',
            'border: 1px solid #e5e5e5',
            'border-radius: 12px',
          ].join(' !important;') + ' !important';
          wrap.appendChild(belowBox);
        }

        // ═══════════════════════════════════════════════════
        // 삽입 위치: 카테고리 칩 아래, 추천 영상 리스트 위
        // ═══════════════════════════════════════════════════

        const chipContainer = sidebar.querySelector(
          'ytd-feed-filter-chip-bar-renderer, ' +
          'yt-chip-cloud-renderer, ' +
          '#chip-bar, ' +
          'iron-selector#chips'
        );

        if (chipContainer) {
          chipContainer.parentNode.insertBefore(wrap, chipContainer.nextSibling);
          console.log(
            '[YouTube Inject] ✅ 사이드바 광고 (칩 아래) 삽입 성공',
            isCompanion ? '(컴패니언+하단박스, alignW=' + alignW + ')' : '(디스플레이)'
          );
        } else {
          sidebar.insertBefore(wrap, sidebar.firstChild);
          console.log(
            '[YouTube Inject] ✅ 사이드바 광고 (최상단) 삽입 성공',
            isCompanion ? '(컴패니언+하단박스, alignW=' + alignW + ')' : '(디스플레이)'
          );
        }

        return true;
      })()
    `);

    console.log(`[YouTube] 디스플레이 인젝션: ${result ? "✅ 성공" : "❌ 실패"}`);
    return result;
  }

  /**
   * 🎭 오버레이 광고 인젝션
   * 📌 실제 YouTube 오버레이 광고 형태:
   *   - 플레이어 하단에 배치 (컨트롤바 바로 위)
   *   - 468×60 사이즈, 플레이어 중앙 정렬
   *   - 반투명 어두운 배경
   *   - 우상단에 X 닫기 버튼
   */
  private async injectOverlayAd(
    page: IPageHandle,
    imgDataUrl: string,
    playerInfo: { found: boolean; width: number; height: number; top: number; left: number }
  ): Promise<boolean> {
    console.log(`[YouTube] 🎭 오버레이 광고 인젝션 시작 (실제 YouTube 형태)`);

    const result = await page.evaluate<boolean>(`
      (() => {
        try {
          const imgUrl = ${JSON.stringify(imgDataUrl)};

          // 플레이어 좌표 수집
          const playerSelectors = [
            '#movie_player', '#player-container-inner', '#player-container-outer',
            'ytd-player', '.html5-video-player', '#player',
          ];

          let playerRect = null;
          for (const sel of playerSelectors) {
            const el = document.querySelector(sel);
            if (el) {
              const r = el.getBoundingClientRect();
              if (r.width > 100 && r.height > 100) {
                playerRect = r;
                break;
              }
            }
          }

          // 플레이어 기준 좌표 계산
          const px = playerRect ? Math.round(playerRect.left) : 0;
          const py = playerRect ? Math.round(playerRect.top) : 56;
          const pw = playerRect ? Math.round(playerRect.width) : Math.round(window.innerWidth * 0.7);
          const ph = playerRect ? Math.round(playerRect.height) : Math.round(window.innerHeight * 0.6);

          // 오버레이 배너 크기 (실제 YouTube: 468x60, 플레이어 너비에 따라 조정)
          const bannerW = Math.min(468, Math.round(pw * 0.55));
          const bannerH = 60;
          // 플레이어 하단에서 컨트롤바(약 48px) 바로 위에 배치
          const bannerTop = py + ph - bannerH - 48;
          const bannerLeft = px + Math.round((pw - bannerW) / 2);

          console.log('[YouTube Inject] 오버레이 위치:', bannerLeft, bannerTop, bannerW, bannerH);

          // 📌 document.body에 fixed 오버레이 생성
          const overlay = document.createElement('div');
          overlay.id = 'admate-overlay-ad';
          overlay.setAttribute('data-injected', 'admate-youtube-overlay');
          overlay.style.cssText = [
            'position: fixed',
            'top: ' + bannerTop + 'px',
            'left: ' + bannerLeft + 'px',
            'width: ' + bannerW + 'px',
            'height: ' + bannerH + 'px',
            'z-index: 2147483647',
            'background: rgba(0,0,0,0.85)',
            'overflow: hidden',
            'display: flex',
            'align-items: stretch',
            'box-shadow: 0 2px 8px rgba(0,0,0,0.3)',
          ].join(' !important;') + ' !important';

          // 광고 이미지 (468x60 크기에 맞게)
          const img = document.createElement('img');
          img.src = imgUrl;
          img.setAttribute('data-injected', 'admate');
          img.style.cssText = 'width:100% !important;height:100% !important;object-fit:cover !important;display:block !important';
          overlay.appendChild(img);

          // 우상단 X 닫기 버튼 (실제 YouTube 스타일)
          const closeBtn = document.createElement('div');
          closeBtn.style.cssText = [
            'position: absolute',
            'top: 0',
            'right: -24px',
            'width: 24px',
            'height: 24px',
            'background: rgba(0,0,0,0.75)',
            'display: flex',
            'align-items: center',
            'justify-content: center',
            'cursor: pointer',
            'z-index: 2147483647',
          ].join(' !important;') + ' !important';
          closeBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="white"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
          overlay.appendChild(closeBtn);

          // 좌하단 "광고" 라벨
          const adLabel = document.createElement('div');
          adLabel.style.cssText = 'position:absolute;bottom:2px;left:4px;font-size:10px;color:rgba(255,255,255,0.7);font-family:Roboto,Arial,sans-serif;letter-spacing:0.3px';
          adLabel.textContent = 'Ad';
          overlay.appendChild(adLabel);

          document.body.appendChild(overlay);

          console.log('[YouTube Inject] ✅ 오버레이 광고 인젝션 성공 (실제 YouTube 형태, ' + bannerW + 'x' + bannerH + ')');
          return true;
        } catch (err) {
          console.error('[YouTube Inject] ❌ 오버레이 인젝션 에러:', err);
          return false;
        }
      })()
    `);

    console.log(`[YouTube] 오버레이 인젝션: ${result ? "✅ 성공" : "❌ 실패"}`);
    return result;
  }

  /** YouTube 동영상 일시정지 */
  private async pauseVideo(page: IPageHandle, opts?: { preserveTimeline?: boolean }): Promise<void> {
    const preserveTimeline = opts?.preserveTimeline === true;
    await page.evaluate<void>(`
      (() => {
        const preserveTimeline = ${preserveTimeline ? "true" : "false"};
        // 방법 1: video 요소 직접 제어
        const video = document.querySelector('video');
        if (video) {
          video.pause();
          // 첫 프레임 표시를 위해 currentTime 설정
          if (!preserveTimeline && video.currentTime === 0) video.currentTime = 2;
        }

        // 방법 2: YouTube Player API
        const player = document.querySelector('#movie_player');
        if (player && typeof player.pauseVideo === 'function') {
          player.pauseVideo();
        }

        // 방법 3: 키보드 이벤트 (스페이스바)
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', code: 'KeyK' }));
      })()
    `);
    console.log(`[YouTube] ⏸️ 영상 일시정지`);
  }

  /**
   * 광고주 유튜브 영상에서 특정 초수 프레임을 추출
   *
   * Vercel chromium-min 에는 비디오 코덱이 없어 headless 에서 YouTube 영상이
   * 디코딩되지 않는다(videoWidth=1). 따라서 브라우저 내 재생/canvas 추출 대신
   * YouTube Storyboard API(프리뷰 스프라이트)를 서버 사이드 fetch 로 가져와
   * 해당 초수 타일을 잘라내고 1280×720 으로 확대해 반환한다.
   */
  private async captureTimedFrameFromInstreamVideo(
    page: IPageHandle,
    instreamVideoUrl: string,
    seconds: number
  ): Promise<{ frameDataUrl: string | null; durationSec: number }> {
    try {
      const adVideoId = extractVideoId(instreamVideoUrl);
      if (!adVideoId) return { frameDataUrl: null, durationSec: 0 };

      // 1) Storyboard spec 획득 — InnerTube API → 브라우저 폴백
      let spec = "";
      let videoDuration = 0;

      // 1) VPS storyboard proxy (yt-dlp based — set STORYBOARD_PROXY_URL env var)
      const proxyUrl = process.env.STORYBOARD_PROXY_URL;
      if (proxyUrl) {
        try {
          // Prefer high-quality exact frame extraction from VPS ffmpeg endpoint
          const frameUrl = `${proxyUrl.replace(/\/$/, "")}/yt-frame?v=${adVideoId}&t=${seconds}&_t=${Date.now()}`;
          const frameResp = await fetch(frameUrl, {
            headers: { Accept: "application/json" },
            signal: AbortSignal.timeout(20000),
          });
          if (frameResp.ok) {
            const frameData = await frameResp.json() as {
              frameDataUrl?: string; bytes?: number; duration?: number;
            };
            if (frameData.frameDataUrl && frameData.frameDataUrl.length > 2000) {
              if (frameData.duration && frameData.duration > 0) {
                videoDuration = frameData.duration;
              }
              console.log(
                "[YouTube] ✅ high-quality frame from VPS ffmpeg (" +
                (frameData.bytes || 0) + " bytes, t=" + seconds + "s)"
              );
              return { frameDataUrl: frameData.frameDataUrl, durationSec: videoDuration };
            }
          }

          const sbUrl = `${proxyUrl.replace(/\/$/, "")}/yt-storyboard?v=${adVideoId}&_t=${Date.now()}`;
          console.log("[YouTube] storyboard proxy: " + proxyUrl.substring(0, 60));
          const sbResp = await fetch(sbUrl, {
            headers: { Accept: "application/json" },
            signal: AbortSignal.timeout(15000),
          });
          if (sbResp.ok) {
            const sbData = await sbResp.json() as {
              duration?: number;
              storyboard?: {
                width: number; height: number;
                rows: number; columns: number;
                fps: number;
                sheetOffset?: number;
                fragments: { url: string; duration: number }[];
              } | null;
            };
            videoDuration = sbData.duration || 0;

            if (sbData.storyboard && sbData.storyboard.fragments?.length > 0) {
              const sb = sbData.storyboard;
              const tilesPerSheet = sb.rows * sb.columns;
              const totalFrames = sb.fragments.reduce(
                (acc, frag) => acc + Math.round(frag.duration * (sb.fps || 1)),
                0
              );
              const interval = videoDuration > 0 && totalFrames > 0 ? videoDuration / totalFrames : 1;
              const rawFrameIdx = Math.min(Math.floor(seconds / interval), Math.max(0, totalFrames - 1));
              const sheetOffsetFrames = Math.max(0, sb.sheetOffset || 0) * tilesPerSheet;
              const frameIdx = Math.max(0, rawFrameIdx - sheetOffsetFrames);
              const sheetIdx = Math.floor(frameIdx / tilesPerSheet);
              const tileInSheet = frameIdx % tilesPerSheet;
              const tileCol = tileInSheet % sb.columns;
              const tileRow = Math.floor(tileInSheet / sb.columns);

              console.log(
                "[YouTube] storyboard: " + totalFrames + " frames, interval=" +
                interval.toFixed(2) + "s, target=" + seconds + "s → rawFrame " +
                rawFrameIdx + " correctedFrame " + frameIdx + " (sheet " + sheetIdx +
                " tile " + tileCol + "," + tileRow + ", sheetOffset=" + (sb.sheetOffset || 0) + ")"
              );

              const fragmentUrl = sb.fragments[Math.min(sheetIdx, sb.fragments.length - 1)]?.url;
              if (fragmentUrl) {
                const sheetResp = await fetch(fragmentUrl, {
                  headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
                  },
                });
                if (sheetResp.ok) {
                  const sheetBuf = Buffer.from(await sheetResp.arrayBuffer());
                  if (sheetBuf.length > 500) {
                    const sheetMime = sheetResp.headers.get("content-type") || "image/jpeg";
                    const sheetB64 = "data:" + sheetMime + ";base64," + sheetBuf.toString("base64");
                    const outW = 1280;
                    const outH = 720;
                    // Some storyboard sheets include thin divider pixels around tiles.
                    // Trim a small inset to avoid black edge artifacts after upscale.
                    const inset = 2;
                    const cropX = tileCol * sb.width + inset;
                    const cropY = tileRow * sb.height + inset;
                    const cropW = Math.max(1, sb.width - inset * 2);
                    const cropH = Math.max(1, sb.height - inset * 2);

                    await page.goto("about:blank", { waitUntil: "load", timeout: 5000 });
                    const frameDataUrl = await page.evaluate<string>(`
                      (() => new Promise((resolve) => {
                        const img = new Image();
                        img.onload = () => {
                          try {
                            const c = document.createElement("canvas");
                            c.width = ${outW}; c.height = ${outH};
                            const ctx = c.getContext("2d");
                            if (!ctx) { resolve(""); return; }
                            ctx.imageSmoothingEnabled = true;
                            ctx.imageSmoothingQuality = "high";
                            ctx.drawImage(img, ${cropX}, ${cropY}, ${cropW}, ${cropH}, 0, 0, ${outW}, ${outH});
                            resolve(c.toDataURL("image/png"));
                          } catch { resolve(""); }
                        };
                        img.onerror = () => resolve("");
                        img.src = ${JSON.stringify(sheetB64)};
                      }))()
                    `);

                    if (frameDataUrl && frameDataUrl.length > 2000) {
                      console.log(
                        "[YouTube] ✅ storyboard frame at " + seconds + "s (" +
                        sb.width + "x" + sb.height + " → " + outW + "x" + outH + ", " +
                        sheetBuf.length + " bytes)"
                      );
                      return { frameDataUrl, durationSec: videoDuration };
                    }
                  }
                }
                console.warn("[YouTube] storyboard sheet fetch/crop failed");
              }
            }
          }
        } catch (proxyErr) {
          console.warn("[YouTube] storyboard proxy error:", proxyErr);
        }
      }

      // 2) YouTube Data API v3 for duration (fallback)
      if (!videoDuration) {
        const ytApiKey = process.env.YOUTUBE_API_KEY;
        if (ytApiKey) {
          try {
            const apiUrl = `https://www.googleapis.com/youtube/v3/videos?id=${adVideoId}&part=contentDetails&key=${ytApiKey}`;
            const apiResp = await fetch(apiUrl, { signal: AbortSignal.timeout(5000) });
            if (apiResp.ok) {
              const apiData = await apiResp.json() as {
                items?: { contentDetails?: { duration?: string } }[];
              };
              const iso = apiData.items?.[0]?.contentDetails?.duration || "";
              if (iso) {
                const hMatch = iso.match(/(\d+)H/);
                const mMatch = iso.match(/(\d+)M/);
                const sMatch = iso.match(/(\d+)S/);
                videoDuration =
                  (hMatch ? parseInt(hMatch[1]) * 3600 : 0) +
                  (mMatch ? parseInt(mMatch[1]) * 60 : 0) +
                  (sMatch ? parseInt(sMatch[1]) : 0);
                console.log("[YouTube] ✅ Data API duration: " + videoDuration + "s");
              }
            }
          } catch (apiErr) {
            console.warn("[YouTube] Data API error:", apiErr);
          }
        }
      }

      // 3) Numbered thumbnails — fallback (25%, 50%, 75%)
      if (!spec) {
        console.log("[YouTube] using numbered thumbnails (duration=" + videoDuration + "s, target=" + seconds + "s)");

        let thumbIdx = 1;
        if (videoDuration > 0) {
          const pct = seconds / videoDuration;
          if (pct >= 0.625) thumbIdx = 3;
          else if (pct >= 0.375) thumbIdx = 2;
        } else {
          if (seconds > 20) thumbIdx = 3;
          else if (seconds > 10) thumbIdx = 2;
        }

        for (const prefix of ["maxres", "sd", "hq"]) {
          try {
            const thumbUrl = `https://i.ytimg.com/vi/${adVideoId}/${prefix}${thumbIdx}.jpg`;
            const thumbResp = await fetch(thumbUrl);
            if (!thumbResp.ok) continue;
            const thumbBuf = Buffer.from(await thumbResp.arrayBuffer());
            if (thumbBuf.length < 1000) continue;
            const thumbB64 = "data:image/jpeg;base64," + thumbBuf.toString("base64");
            console.log("[YouTube] ✅ frame from " + prefix + thumbIdx + ".jpg (" + thumbBuf.length + " bytes)");
            return { frameDataUrl: thumbB64, durationSec: videoDuration };
          } catch { /* try next */ }
        }

        console.warn("[YouTube] numbered thumbnails also failed");
        return { frameDataUrl: null, durationSec: videoDuration };
      }

      // 3) Storyboard 레벨 파싱
      spec = spec.replace(/\\u0026/g, "&").replace(/\\u007c/g, "|");

      const segments = spec.split("|");
      const baseUrl = segments[0];

      const levels: {
        w: number; h: number; count: number;
        cols: number; rows: number; name: string; sigh: string; idx: number;
      }[] = [];

      if (segments.length > 1) {
        // Classic format: baseUrl|w#h#count#cols#rows#ms#name#sigh|...
        for (let i = 1; i < segments.length; i++) {
          const parts = segments[i].split("#");
          if (parts.length < 6) continue;
          levels.push({
            w: parseInt(parts[0], 10),
            h: parseInt(parts[1], 10),
            count: parseInt(parts[2], 10),
            cols: parseInt(parts[3], 10),
            rows: parseInt(parts[4], 10),
            name: parts[6] || "default",
            sigh: parts[parts.length - 1] || "",
            idx: i - 1,
          });
        }
      } else {
        // New format: base URL only (no | levels). Use standard YouTube levels.
        console.log("[YouTube] storyboard: new format (no levels in spec), using standard levels");
        const dur = videoDuration || 30;
        const frameCount = Math.max(1, Math.ceil(dur));
        const standardLevels = [
          { w: 48, h: 27, cols: 10, rows: 10, name: "default" },
          { w: 80, h: 45, cols: 10, rows: 10, name: "M$M" },
          { w: 160, h: 90, cols: 5, rows: 5, name: "M$M" },
          { w: 320, h: 180, cols: 3, rows: 3, name: "M$M" },
        ];
        standardLevels.forEach((sl, idx) => {
          levels.push({
            w: sl.w, h: sl.h,
            count: Math.min(frameCount, dur > 0 ? Math.ceil(dur) : 100),
            cols: sl.cols, rows: sl.rows,
            name: sl.name, sigh: "", idx,
          });
        });
      }

      if (levels.length === 0) {
        console.warn("[YouTube] storyboard: 0 levels after parsing");
        return { frameDataUrl: null, durationSec: videoDuration };
      }

      const lv = levels[levels.length - 1];
      const interval =
        videoDuration > 0 && lv.count > 0
          ? videoDuration / lv.count
          : 1;
      const fIdx = Math.min(
        Math.floor(seconds / interval),
        Math.max(0, lv.count - 1)
      );
      const perSheet = lv.cols * lv.rows;
      const sheet = Math.floor(fIdx / perSheet);
      const tile = fIdx % perSheet;
      const col = tile % lv.cols;
      const row = Math.floor(tile / lv.cols);

      const sheetName = lv.name === "default"
        ? String(sheet)
        : lv.name.replace("$M", String(sheet));

      let sheetUrl = baseUrl
        .replace("$L", String(lv.idx))
        .replace("$N", sheetName);
      if (lv.sigh) {
        if (sheetUrl.includes("sigh=")) {
          sheetUrl = sheetUrl.replace(/sigh=[^&#]+/, "sigh=" + lv.sigh);
        } else {
          sheetUrl +=
            (sheetUrl.includes("?") ? "&" : "?") + "sigh=" + lv.sigh;
        }
      }

      console.log(
        "[YouTube] storyboard: lv" + lv.idx +
        " " + lv.w + "x" + lv.h +
        " frame " + fIdx + "/" + lv.count +
        " sheet" + sheet + " (" + col + "," + row + ")"
      );

      // 4) 스프라이트 시트 fetch
      const sheetResp = await fetch(sheetUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        },
      });
      if (!sheetResp.ok) {
        console.warn("[YouTube] storyboard: sheet " + sheetResp.status);
        return { frameDataUrl: null, durationSec: videoDuration };
      }
      const sheetBuf = Buffer.from(await sheetResp.arrayBuffer());
      if (sheetBuf.length < 500) {
        console.warn("[YouTube] storyboard: sheet too small");
        return { frameDataUrl: null, durationSec: videoDuration };
      }
      const sheetMime = sheetResp.headers.get("content-type") || "image/jpeg";
      const sheetB64 =
        "data:" + sheetMime + ";base64," + sheetBuf.toString("base64");

      // 5) 브라우저 canvas 로 타일 crop + 1280×720 scale
      const cropX = col * lv.w;
      const cropY = row * lv.h;
      const outW = 1280;
      const outH = 720;

      await page.goto("about:blank", { waitUntil: "load", timeout: 5000 });

      const frameDataUrl = await page.evaluate<string>(`
        (() => new Promise((resolve) => {
          const img = new Image();
          img.onload = () => {
            try {
              const c = document.createElement("canvas");
              c.width = ${outW};
              c.height = ${outH};
              const ctx = c.getContext("2d");
              if (!ctx) { resolve(""); return; }
              ctx.imageSmoothingEnabled = true;
              ctx.imageSmoothingQuality = "high";
              ctx.drawImage(
                img,
                ${cropX}, ${cropY}, ${lv.w}, ${lv.h},
                0, 0, ${outW}, ${outH}
              );
              resolve(c.toDataURL("image/png"));
            } catch { resolve(""); }
          };
          img.onerror = () => resolve("");
          img.src = ${JSON.stringify(sheetB64)};
        }))()
      `);

      if (!frameDataUrl || frameDataUrl.length < 2000) {
        console.warn("[YouTube] storyboard: canvas crop empty");
        return { frameDataUrl: null, durationSec: videoDuration };
      }

      console.log(
        "[YouTube] storyboard frame OK at " + seconds + "s" +
        " (lv" + lv.idx + " " + lv.w + "x" + lv.h + ")"
      );
      return { frameDataUrl, durationSec: videoDuration };
    } catch (err) {
      console.warn("[YouTube] timed frame extraction failed:", err);
      return { frameDataUrl: null, durationSec: 0 };
    }
  }

  private async applyYouTubeConsentCookies(page: IPageHandle): Promise<void> {
    console.log(`[YouTube] 🍪 쿠키 동의 사전 처리 시작`);
    try {
      await page.setCookie({
        name: "CONSENT",
        value: "PENDING+987",
        domain: ".youtube.com",
        path: "/",
      });
      await page.setCookie({
        name: "CONSENT",
        value: "YES+cb.20210328-17-p0.en+FX+987",
        domain: ".youtube.com",
        path: "/",
      });
      await page.setCookie({
        name: "SOCS",
        value: "CAISHAgBEhJnd3NfMjAyMzA4MTUtMF9SQzIaAmVuIAEaBgiA_LyaBg",
        domain: ".youtube.com",
        path: "/",
      });
      console.log(`[YouTube] 🍪 CONSENT 쿠키 설정 완료`);
    } catch (cookieErr) {
      console.warn(`[YouTube] 🍪 쿠키 설정 실패 (진행 계속):`, cookieErr);
    }
  }

  /** YouTube 쿠키 동의 팝업 제거 */
  private async dismissYouTubeConsent(page: IPageHandle): Promise<void> {
    const dismissed = await page.evaluate<boolean>(`
      (() => {
        // YouTube 동의 다이얼로그 제거
        const consentBtn = document.querySelector(
          'button[aria-label*="Accept"], button[aria-label*="동의"], ' +
          'tp-yt-paper-button.style-scope.ytd-consent-bump-v2-lightbox, ' +
          'button.yt-spec-button-shape-next--filled, ' +
          '[aria-label="Accept the use of cookies and other data for the purposes described"]'
        );
        if (consentBtn) {
          consentBtn.click();
          return true;
        }

        // 동의 오버레이 직접 제거
        const consentOverlays = document.querySelectorAll(
          'ytd-consent-bump-v2-lightbox, tp-yt-iron-overlay-backdrop, #consent-bump'
        );
        consentOverlays.forEach(el => el.remove());

        return consentOverlays.length > 0;
      })()
    `);

    if (dismissed) {
      console.log(`[YouTube] 🍪 쿠키 동의 팝업 제거 완료`);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  /** 🔤 한글 폰트 주입 — Vercel 서버리스 Chromium에 CJK 폰트 없는 문제 해결 (강화 v2) */
  private async injectKoreanFonts(page: IPageHandle): Promise<void> {
    try {
      await page.evaluate<void>(`
        (() => {
          // 이미 주입됐으면 스킵
          if (document.querySelector('#admate-korean-fonts')) return;

          // 1) Google Fonts preconnect (속도 향상)
          const preconnect = document.createElement('link');
          preconnect.rel = 'preconnect';
          preconnect.href = 'https://fonts.gstatic.com';
          preconnect.crossOrigin = 'anonymous';
          document.head.appendChild(preconnect);

          // 2) Google Fonts CSS 로드 (Noto Sans KR + Roboto)
          const link = document.createElement('link');
          link.id = 'admate-korean-fonts';
          link.rel = 'stylesheet';
          link.href = 'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700&family=Roboto:wght@300;400;500;700&display=swap';
          document.head.appendChild(link);

          // 3) 전체 페이지에 폰트 강제 적용 (더 공격적인 셀렉터)
          const style = document.createElement('style');
          style.id = 'admate-korean-fonts-style';
          style.textContent = [
            '*, *::before, *::after {',
            "  font-family: 'Noto Sans KR', 'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif !important;",
            '}',
            '/* YouTube 모든 텍스트 요소 */',
            'ytd-watch-flexy, ytd-watch-flexy *, ytd-compact-video-renderer, ytd-compact-video-renderer *,',
            '#title, #video-title, #description, #info-contents, #info, #meta,',
            '.ytd-video-primary-info-renderer, .ytd-video-secondary-info-renderer,',
            '#content-text, yt-formatted-string, span.yt-core-attributed-string,',
            '#owner-name, #channel-name, #subscriber-count, .ytd-channel-name,',
            '#count .ytd-video-primary-info-renderer, #date,',
            'ytd-comment-renderer, #content-text.ytd-comment-renderer,',
            'h1.ytd-watch-metadata, h1 yt-formatted-string,',
            '#secondary *, ytd-compact-video-renderer .details *,',
            'ytd-video-renderer *, ytd-grid-video-renderer *,',
            '.ytp-videowall-still-info-content *, .ytp-ce-element *,',
            '#chat-messages *, yt-live-chat-text-message-renderer * {',
            "  font-family: 'Noto Sans KR', 'Roboto', sans-serif !important;",
            '}',
          ].join('\\n');
          document.head.appendChild(style);

          console.log('[YouTube Inject] 🔤 한글 폰트 CSS 주입 완료');
        })()
      `);

      // 4) document.fonts.ready로 확실히 폰트 로드 대기 (최대 5초)
      const fontLoaded = await page.evaluate<boolean>(`
        (() => {
          return new Promise((resolve) => {
            const timeout = setTimeout(() => resolve(false), 5000);
            document.fonts.ready.then(() => {
              clearTimeout(timeout);
              // 추가로 Noto Sans KR이 로드됐는지 확인
              const loaded = document.fonts.check('16px Noto Sans KR');
              resolve(loaded);
            }).catch(() => resolve(false));
          });
        })()
      `);

      if (fontLoaded) {
        console.log(`[YouTube] 🔤 한글 폰트 로드 확인 완료 ✅`);
      } else {
        console.warn(`[YouTube] 🔤 한글 폰트 로드 대기 타임아웃 — 추가 대기 3초`);
        await new Promise((r) => setTimeout(r, 3000));
      }
    } catch (err) {
      console.warn(`[YouTube] 🔤 한글 폰트 인젝션 실패 (진행 계속):`, err);
    }
  }

  /** 마스트헤드용 랜덤 프로필(data URL). 캡처 1회당 한 번만 호출해 URL을 재사용한다. */
  private async pickRandomMastheadAvatarDataUrl(): Promise<string> {
    const imgIndex = 1 + Math.floor(Math.random() * 70);
    const fetched = await imageUrlToDataUrl(`https://i.pravatar.cc/128?img=${imgIndex}`);
    if (fetched.ok) return fetched.dataUrl;
    return `data:image/svg+xml,${encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect fill="#1a73e8" width="128" height="128"/><circle cx="64" cy="45" r="22" fill="#fff" opacity=".9"/><path fill="#fff" opacity=".9" d="M32 118c8-28 56-28 64 0z"/></svg>'
    )}`;
  }

  /**
   * 우측 상단 로그인 UI를 최대한 숨기고, fixed 프로필 원을 올려 실제 로그인 상태처럼 보이게 한다.
   * Shadow DOM·URL 변형·재렌더에 대비해 (1) 버튼 숨김 (2) #end 기준 좌표의 플로터를 항상 시도.
   */
  private async applyMastheadLoggedInLook(page: IPageHandle, avatarDataUrl: string): Promise<void> {
    const avatarJson = JSON.stringify(avatarDataUrl);
    await page.evaluate<void>(`
      (() => {
        const dataUrl = ${avatarJson};
        try {
          const masthead = document.querySelector("ytd-masthead");
          if (!masthead) return;

          function walk(node, fn) {
            if (!node) return;
            if (node.nodeType === 1) {
              fn(node);
              const sr = node.shadowRoot;
              if (sr) walk(sr, fn);
              const ch = node.children;
              for (let i = 0; i < ch.length; i++) walk(ch[i], fn);
            }
          }

          function hideHost(el) {
            try {
              el.style.setProperty("display", "none", "important");
              el.style.setProperty("visibility", "hidden", "important");
              el.style.setProperty("opacity", "0", "important");
              el.style.setProperty("pointer-events", "none", "important");
              el.style.setProperty("max-width", "0", "important");
              el.style.setProperty("max-height", "0", "important");
              el.style.setProperty("overflow", "hidden", "important");
              el.style.setProperty("margin", "0", "important");
              el.style.setProperty("padding", "0", "important");
            } catch (e) { /* ignore */ }
          }

          function findButtonRendererHost(start) {
            let cur = start;
            while (cur && cur !== masthead) {
              const tag = cur.tagName || "";
              if (tag === "YTD-BUTTON-RENDERER" || tag === "YT-BUTTON-SHAPE-BUTTON-VIEW-MODEL") return cur;
              const p = cur.parentElement;
              if (p) cur = p;
              else {
                const rn = cur.getRootNode && cur.getRootNode();
                cur = rn && rn.host ? rn.host : null;
              }
            }
            return null;
          }

          const hideSet = new Set();

          walk(masthead, (el) => {
            if (el.tagName !== "A") return;
            const href = (el.href || el.getAttribute("href") || "").toString();
            if (!href) return;
            const isGoogleAcct =
              href.includes("accounts.google.com") ||
              href.includes("youtube.com/signin") ||
              href.includes("youtube.com/channel_switcher");
            if (!isGoogleAcct) return;
            const host = findButtonRendererHost(el);
            if (host) hideSet.add(host);
          });

          walk(masthead, (el) => {
            const tag = el.tagName || "";
            if (tag !== "YTD-BUTTON-RENDERER" && tag !== "YT-BUTTON-SHAPE-BUTTON-VIEW-MODEL") return;
            const t = (el.textContent || "").replace(/\\s+/g, " ").trim();
            if (t === "로그인" || t === "Sign in" || (t.includes("로그인") && t.length < 24)) {
              hideSet.add(el);
            }
          });

          hideSet.forEach(hideHost);

          document.getElementById("admate-masthead-avatar-slot")?.remove();
          const prevFloater = document.getElementById("admate-fake-profile-floater");
          if (prevFloater) prevFloater.remove();

          const end = masthead.querySelector("#end") || masthead.querySelector("#buttons");
          const refRect = end ? end.getBoundingClientRect() : masthead.getBoundingClientRect();
          const size = 32;
          const topPx = Math.round(refRect.top + Math.max(0, (refRect.height - size) / 2));
          // #end 영역 오른쪽 안쪽에 붙임 (viewport right 기준이면 바가 짧을 때 치우침)
          var leftPx = Math.round(refRect.right - size - 10);
          if (leftPx + size > window.innerWidth - 4) leftPx = window.innerWidth - size - 8;
          if (leftPx < 4) leftPx = 4;

          const floater = document.createElement("div");
          floater.id = "admate-fake-profile-floater";
          floater.setAttribute("data-injected", "admate-youtube-avatar");
          floater.style.cssText = [
            "position:fixed",
            "z-index:2147483646",
            "width:" + size + "px",
            "height:" + size + "px",
            "top:" + topPx + "px",
            "left:" + leftPx + "px",
            "border-radius:50%",
            "overflow:hidden",
            "box-sizing:border-box",
            "pointer-events:none",
            "box-shadow:0 0 0 2px #fff, 0 1px 4px rgba(0,0,0,0.35)",
          ].join(";");
          const img = document.createElement("img");
          img.src = dataUrl;
          img.alt = "";
          img.draggable = false;
          img.style.cssText = "width:100%;height:100%;object-fit:cover;display:block;";
          floater.appendChild(img);
          document.body.appendChild(floater);

          console.log("[YouTube Inject] 👤 마스트헤드 로그인 룩 적용 (숨김 " + hideSet.size + " + 플로터)");
        } catch (e) {
          console.warn("[admate] applyMastheadLoggedInLook", e);
        }
      })()
    `);
  }

  /**
   * 💥 봇 감지 관련 모든 DOM 요소를 완전히 파괴
   * YouTube가 React/Polymer로 재렌더링하기 전에 모든 흔적을 제거
   */
  private async nukeAllBotElements(page: IPageHandle): Promise<void> {
    await page.evaluate<void>(`
      (() => {
        // 1) 봇 감지 전용 웹 컴포넌트 완전 제거
        const botSelectors = [
          'ytd-enforcement-message-view-model',
          'yt-player-error-message-renderer',
          'yt-playability-error-supported-renderers',
          '.ytp-error',
          '.ytp-error-content',
          '.ytp-error-content-wrap',
          '.ytp-error-content-wrap-reason',
          '.ytp-offline-slate',
          '.ytp-offline-slate-bar',
          'yt-confirm-dialog-renderer',
          '#error-screen',
          '.ytp-error-content-wrap-subreason',
        ];
        
        botSelectors.forEach(sel => {
          document.querySelectorAll(sel).forEach(el => {
            el.remove();
          });
        });

        // 2) 봇 관련 텍스트를 포함하는 모든 요소 제거/숨김
        const botTexts = [
          '봇이 아님을 확인',
          '로그인하여 봇이 아님',
          '봇이 아님',
          'Confirm you\\'re not a bot',
          'confirm your identity',
          'Sign in to confirm',
          'confirm that you\\'re not',
        ];

        // TreeWalker로 텍스트 노드 순회 (더 효율적)
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_ELEMENT,
          null
        );

        const toRemove = [];
        let node;
        while (node = walker.nextNode()) {
          const el = node;
          const text = el.textContent || '';
          const isSmallElement = text.length < 500; // 큰 컨테이너는 건드리지 않음
          
          if (isSmallElement) {
            for (const keyword of botTexts) {
              if (text.includes(keyword)) {
                toRemove.push(el);
                break;
              }
            }
          }
        }

        toRemove.forEach(el => {
          // 플레이어 내부의 봇 메시지만 제거 (페이지 전체 제거 방지)
          const inPlayer = el.closest(
            '#movie_player, #player-container-inner, ytd-player, .html5-video-player, #player, #player-container-outer'
          );
          if (inPlayer) {
            el.style.display = 'none';
            el.style.visibility = 'hidden';
            el.style.opacity = '0';
            el.style.position = 'absolute';
            el.style.pointerEvents = 'none';
            el.style.zIndex = '-1';
            // 텍스트도 비움
            if (el.childElementCount === 0) {
              el.textContent = '';
            }
          }
        });

        // 3) 로그인 버튼 제거
        document.querySelectorAll('a[href*="accounts.google.com"], button').forEach(el => {
          const text = (el.textContent || '').trim();
          if (text === '로그인' || text === 'Sign in' || text === '로그인하기') {
            const inPlayer = el.closest('#movie_player, #player-container-inner, ytd-player, .html5-video-player, #player');
            if (inPlayer) {
              el.style.display = 'none';
            }
          }
        });

        // 4) tp-yt-paper-dialog (팝업 다이얼로그) 제거
        document.querySelectorAll('tp-yt-paper-dialog, ytd-popup-container').forEach(el => {
          el.remove();
        });

        // 5) backdrop 제거
        document.querySelectorAll('tp-yt-iron-overlay-backdrop').forEach(el => {
          el.remove();
        });

        console.log('[YouTube] 💥 봇 요소 완전 제거 완료');
      })()
    `);
  }

  /**
   * 🖼️ 플레이어를 썸네일로 강제 완전 교체 (봇 메시지 위에 덮어씀)
   * 기존 innerHTML 제거 방식이 실패할 수 있으므로
   * position:absolute로 기존 내용 위에 완전히 덮어쓰기
   */
  private async forceReplacePlayerWithThumbnail(page: IPageHandle, thumbnailDataUrl: string): Promise<void> {
    console.log(`[YouTube] 🖼️ 플레이어를 썸네일로 강제 교체 중...`);

    await page.evaluate<void>(`
      ((thumbSrc) => {
        // 플레이어 컨테이너 찾기 (가장 큰 요소 우선)
        const playerSelectors = [
          '#movie_player',
          '#player-container-inner', 
          'ytd-player',
          '#player-container-outer',
          '.html5-video-player',
          '#player',
        ];

        let playerEl = null;
        for (const sel of playerSelectors) {
          const el = document.querySelector(sel);
          if (el) {
            const r = el.getBoundingClientRect();
            if (r.width > 100 && r.height > 100) {
              playerEl = el;
              break;
            }
          }
        }

        if (!playerEl) {
          console.warn('[YouTube] 플레이어를 찾을 수 없음 — 강제 생성');
          return;
        }

        const rect = playerEl.getBoundingClientRect();
        const w = Math.round(rect.width);
        const h = Math.round(rect.height);

        // 🔑 핵심: 기존 내용을 innerHTML로 삭제하지 않고
        // position:absolute 오버레이로 완전히 덮어씀
        // (YouTube의 MutationObserver가 innerHTML 삭제 시 재렌더링하는 것을 방지)
        
        // 기존 자식 요소들의 visibility를 모두 숨김
        const allChildren = playerEl.querySelectorAll('*');
        allChildren.forEach(child => {
          child.style.visibility = 'hidden';
          child.style.opacity = '0';
        });

        // 플레이어 position 보장
        const computedPos = window.getComputedStyle(playerEl).position;
        if (computedPos === 'static') {
          playerEl.style.position = 'relative';
        }

        // 기존 오버레이 제거 (중복 방지)
        const existing = playerEl.querySelector('#yt-thumb-overlay');
        if (existing) existing.remove();

        // 썸네일 오버레이 컨테이너 (z-index 최상위)
        const overlay = document.createElement('div');
        overlay.id = 'yt-thumb-overlay';
        overlay.style.cssText = [
          'position: absolute',
          'top: 0',
          'left: 0',
          'width: 100%',
          'height: 100%',
          'z-index: 9999',
          'background: #000',
          'display: flex',
          'align-items: center',
          'justify-content: center',
          'overflow: hidden',
        ].join(';');

        // 썸네일 이미지
        const img = document.createElement('img');
        img.src = thumbSrc;
        img.style.cssText = [
          'width: 100%',
          'height: 100%',
          'object-fit: cover',
          'display: block',
        ].join(';');
        overlay.appendChild(img);

        // 하단 진행바 (영상 재생 중인 것처럼 보이게)
        const progressBar = document.createElement('div');
        progressBar.style.cssText = [
          'position: absolute',
          'bottom: 0',
          'left: 0',
          'width: 100%',
          'height: 4px',
          'background: rgba(255,255,255,0.3)',
          'z-index: 10000',
        ].join(';');

        const progressFill = document.createElement('div');
        progressFill.style.cssText = [
          'width: 15%',
          'height: 100%',
          'background: #ff0000',
          'border-radius: 0 2px 2px 0',
        ].join(';');
        progressBar.appendChild(progressFill);
        overlay.appendChild(progressBar);

        // 플레이어에 오버레이 삽입
        playerEl.appendChild(overlay);

        console.log('[YouTube] 🖼️ 썸네일 오버레이 강제 삽입 완료 (' + w + 'x' + h + ')');
      })(${JSON.stringify(thumbnailDataUrl)})
    `);

    console.log(`[YouTube] 🖼️ 강제 썸네일 교체 완료`);
  }

  /**
   * 🤖 봇 감지 메시지 존재 여부 확인
   * "로그인하여 봇이 아님을 확인하세요" 등의 메시지가 있으면 true 반환
   */
  private async checkBotDetection(page: IPageHandle): Promise<boolean> {
    const result = await page.evaluate<{ detected: boolean; message: string }>(`
      (() => {
        // 1) YouTube 봇 감지 전용 요소 확인
        const enforcementMsg = document.querySelector('ytd-enforcement-message-view-model');
        if (enforcementMsg) {
          return { detected: true, message: 'ytd-enforcement-message-view-model 발견' };
        }

        // 2) 플레이어 에러 화면 확인 (봇 감지 시 표시됨)
        const playerError = document.querySelector('.ytp-error');
        if (playerError) {
          const errorText = playerError.textContent || '';
          if (errorText.includes('봇') || errorText.includes('로그인') ||
              errorText.includes('confirm') || errorText.includes('Sign in') ||
              errorText.includes('bot')) {
            return { detected: true, message: '플레이어 에러 (봇 감지): ' + errorText.substring(0, 100) };
          }
        }

        // 3) 텍스트 기반 봇 감지 메시지 검색
        const body = document.body?.innerText || '';
        const botKeywords = [
          '봇이 아님을 확인',
          '로그인하여 봇이 아님',
          'Confirm you\\'re not a bot',
          'confirm your identity',
          'Sign in to confirm you',
          'confirm that you\\'re not a bot',
        ];

        for (const keyword of botKeywords) {
          if (body.includes(keyword)) {
            return { detected: true, message: '텍스트 감지: ' + keyword };
          }
        }

        // 4) video 요소가 있지만 재생 불가 상태인지 확인
        const video = document.querySelector('video');
        if (video) {
          const hasError = video.error !== null;
          const noSrc = !video.src && !video.currentSrc;
          if (hasError || noSrc) {
            const errorOverlay = document.querySelector(
              '.ytp-error-content, .ytp-error-content-wrap, .ytp-offline-slate'
            );
            if (errorOverlay) {
              return { detected: true, message: '비디오 소스 없음 + 에러 오버레이 감지' };
            }
          }
        }

        return { detected: false, message: 'OK' };
      })()
    `);

    if (result.detected) {
      console.log(`[YouTube] 🤖 봇 감지 확인: ${result.message}`);
    } else {
      console.log(`[YouTube] ✅ 봇 감지 없음 — 정상 상태`);
    }

    return result.detected;
  }

  /**
   * 🔄 YouTube watch URL → embed URL 변환
   * embed URL은 봇 감지가 훨씬 느슨함
   */
  private convertToEmbedUrl(watchUrl: string): string | null {
    try {
      const url = new URL(watchUrl);
      let videoId: string | null = null;

      if (url.hostname.includes('youtube.com') && url.pathname === '/watch') {
        videoId = url.searchParams.get('v');
      } else if (url.hostname === 'youtu.be') {
        videoId = url.pathname.slice(1);
      } else if (url.pathname.startsWith('/embed/')) {
        return watchUrl;
      }

      if (!videoId) return null;
      return `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&rel=0&showinfo=0&controls=1`;
    } catch {
      return null;
    }
  }

  /**
   * 🖼️ YouTube 비디오 플레이어를 썸네일 이미지로 교체 (레거시)
   */
  private async replacePlayerWithThumbnail(page: IPageHandle, thumbnailDataUrl: string): Promise<void> {
    // forceReplacePlayerWithThumbnail으로 위임
    await this.forceReplacePlayerWithThumbnail(page, thumbnailDataUrl);
  }

  /**
   * 📺 YouTube 플레이어 영역을 embed iframe으로 교체
   */
  private async replacePlayerWithEmbed(page: IPageHandle, embedUrl: string): Promise<void> {
    console.log(`[YouTube] 📺 플레이어를 embed iframe으로 교체 중...`);

    await page.evaluate<void>(`
      (() => {
        const embedSrc = ${JSON.stringify(embedUrl)};
        const playerSelectors = [
          '#movie_player',
          '#player-container-inner',
          'ytd-player',
          '.html5-video-player',
        ];

        let playerEl = null;
        for (const sel of playerSelectors) {
          const el = document.querySelector(sel);
          if (el) {
            const r = el.getBoundingClientRect();
            if (r.width > 100 && r.height > 100) {
              playerEl = el;
              break;
            }
          }
        }

        if (!playerEl) {
          console.warn('[YouTube Embed] 플레이어를 찾을 수 없음');
          return;
        }

        const rect = playerEl.getBoundingClientRect();
        const w = Math.round(rect.width);
        const h = Math.round(rect.height);

        playerEl.innerHTML = '';
        const iframe = document.createElement('iframe');
        iframe.src = embedSrc;
        iframe.width = String(w);
        iframe.height = String(h);
        iframe.frameBorder = '0';
        iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
        iframe.allowFullscreen = true;
        iframe.style.cssText = 'width:100%!important;height:100%!important;border:none!important;display:block!important';
        playerEl.appendChild(iframe);
        playerEl.style.overflow = 'hidden';
        playerEl.style.position = 'relative';

        // 봇 감지 오버레이 제거
        ['.ytp-error','.ytp-error-content','.ytp-error-content-wrap','ytd-enforcement-message-view-model','.ytp-offline-slate']
          .forEach(sel => document.querySelectorAll(sel).forEach(el => el.remove()));

        console.log('[YouTube Embed] ✅ 플레이어 embed 교체 완료 (' + w + 'x' + h + ')');
      })()
    `);

    await new Promise((r) => setTimeout(r, 3000));
    console.log(`[YouTube] 📺 embed iframe 로드 완료`);
  }
}



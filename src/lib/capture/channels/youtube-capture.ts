/**
 * YouTube Capture v1 — YouTube 광고 캡처 모듈
 *
 * 지원 광고 유형:
 * 1. 인스트림 (프리롤) — 영상 플레이어에 프리롤 광고 시뮬레이션
 * 2. 디스플레이 — 사이드바 컴패니언 배너 영역에 인젝션
 * 3. 오버레이 — 영상 플레이어 하단 반투명 오버레이 배너
 * 4. 인피드 — 홈 피드 / 검색 결과 / 관련동영상(시청 사이드바) 카드 시뮬레이션
 */

import type { IPageHandle } from "../engine/browser-engine";
import { BaseChannel, type CaptureRequest } from "./base-channel";
import {
  MOBILE_AOS_VIEWPORT,
  MOBILE_IOS_VIEWPORT,
  UA_MOBILE_AOS,
  UA_MOBILE_IOS,
} from "../engine/puppeteer-engine";
import { runPrerollInjectInPage, type PrerollInjectPagePayload } from "./youtube-preroll-inpage";
import { runInfeedInjectInPage, type InfeedSurface } from "./youtube-infeed-inpage";

/** YouTube 광고 유형 */
export type YouTubeAdType =
  | "preroll"
  | "display"
  | "overlay"
  | "mobile-preroll-aos"
  | "mobile-preroll-ios"
  | "infeed-home"
  | "infeed-search"
  | "infeed-watch-next";

function isInfeedAdType(t: YouTubeAdType): t is "infeed-home" | "infeed-search" | "infeed-watch-next" {
  return t === "infeed-home" || t === "infeed-search" || t === "infeed-watch-next";
}

function infeedSurfaceFromAdType(t: YouTubeAdType): InfeedSurface | null {
  if (t === "infeed-home") return "home";
  if (t === "infeed-search") return "search";
  if (t === "infeed-watch-next") return "watch-next";
  return null;
}

/** YouTube 캡처 진단 정보 */
export interface YouTubeDiagnostics {
  adType: YouTubeAdType;
  playerFound: boolean;
  playerSize: { width: number; height: number };
  sidebarFound: boolean;
  injectionSuccess: boolean;
  creativeDownloaded: boolean;
  creativeBase64Size: number;
  /** 인피드 캡처 직전 브라우저 URL(배포·리다이렉트 이슈 확인용) */
  infeedCaptureUrl?: string;
  /** 트렌딩/홈 그리드에 보이는 리치·쇼프 카드 합(대기 루프 마지막 스냅샷) */
  infeedRichGridCount?: number;
  /** `ytd-browse` 의 page-subtype (예: trending, home) */
  infeedPageSubtype?: string;
  /** 실제 인젝션에 쓴 지면(트렌딩 실패 시 검색 폴백이면 search) */
  infeedInjectSurface?: InfeedSurface;
  /** 검색 폴백 시 `ytd-video-renderer` 개수 */
  infeedVideoRendererCount?: number;
  /** 트렌딩 browse 루트 안의 리치·쇼프 카드 합(게스트 빈 홈 오판 방지용) */
  infeedTrendingGridCount?: number;
  /** `#primary` 주 컬럼의 리치·쇼프 카드 합(트렌딩/홈 피드 준비 판별에 사용) */
  infeedPrimaryRichGridCount?: number;
  /** 인피드 홈 대기 루프에서 실제로 쓴 피드 URL 모드 */
  infeedHomeFeedMode?: "trending" | "home";
  /** 스냅샷에 ‘검색하여 시작’류 게스트 빈 홈 문구가 보였는지 */
  infeedGuestEmptyPrompt?: boolean;
  /** 인피드 검색 삽입 위치(top | feed) */
  infeedSearchPlacement?: "top" | "feed";
  /** 인피드 홈: 유기 본문이 없어 광고 카드 인젝션을 건너뜀 */
  infeedHomeInjectionSkipped?: boolean;
  /** 인피드 홈: URL 부트스트랩 순회 중 관측한 #primary 신호 최대값 */
  infeedBootstrapBest?: number;
  /** 인피드 홈: 브라우즈 본문 0건일 때 검색 결과로 세션 워밍 후 브라우즈 재진입 시 true */
  infeedHomeSearchWarmUsed?: boolean;
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
type InfeedOptsPayload = {
  /** 광고주 YouTube 영상 URL — 소재 이미지가 없을 때 썸네일 자동 추출 */
  videoUrl?: string;
  searchQuery?: string;
  /** 인피드 검색: `top`(기본) 첫 결과 위 / `feed` 실제 검색 결과 행 사이 */
  searchPlacement?: "top" | "feed";
  /** `feed` 일 때: N번째(0부터) 유기 결과 **바로 아래**에 삽입 (기본 1 → 두 번째 결과 아래) */
  searchFeedInsertAfterIndex?: number;
  description1?: string;
  description2?: string;
  ctaPrimary?: string;
  ctaSecondary?: string;
  /** 관련동영상: 메인 플레이어 덮개에 쓸 퍼블리셔 영상 시점(초). 스토리보드/VPS 성공 시 정적 썸네일 대신 해당 프레임 */
  watchNextPlayerFrameOffsetSec?: number;
};

type InstreamOptsPayload = {
  videoUrl?: string;
  skipSeconds?: number;
  /** 스킵 가능 광고면 UI에 건너뛰기 노출(미지정 시 스킵 가능으로 간주) */
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
  /** 카드 원형 로고(업로드 URL → 서버에서 data URL로 변환 후 주입) */
  avatarImageUrl?: string;
};

/** YouTube Channel Banner URL Fetcher */
async function fetchYoutubeChannelBannerUrl(channelUrl: string): Promise<string | null> {
  try {
    const formattedUrl = channelUrl.startsWith("http") ? channelUrl : `https://${channelUrl}`;
    const res = await fetch(formattedUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)",
        "Accept-Language": "en-US,en;q=0.9",
      }
    });
    const html = await res.text();
    const match = html.match(/ytInitialData\s*=\s*(\{.*?\});/);
    if (!match) return null;
    const data = JSON.parse(match[1]);
    const banner = data?.header?.pageHeaderRenderer?.content?.pageHeaderViewModel?.banner?.imageBannerViewModel?.image?.sources?.[0]?.url 
      || data?.header?.c4TabbedHeaderRenderer?.banner?.thumbnails?.[0]?.url;
    return banner || null;
  } catch (err) {
    console.error("[fetchYoutubeChannelBannerUrl] err:", err);
    return null;
  }
}

/** YouTube Channel Logo(Profile Image) URL Fetcher */
async function fetchYoutubeChannelLogoUrl(channelUrl: string): Promise<string | null> {
  try {
    const formattedUrl = channelUrl.startsWith("http") ? channelUrl : `https://${channelUrl}`;
    const res = await fetch(formattedUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)",
        "Accept-Language": "en-US,en;q=0.9",
      }
    });
    const html = await res.text();
    const match = html.match(/ytInitialData\s*=\s*(\{.*?\});/);
    if (!match) return null;
    const data = JSON.parse(match[1]);
    // 다양한 경로에서 채널 아바타 추출 시도
    const logo =
      data?.header?.pageHeaderRenderer?.content?.pageHeaderViewModel?.image?.decoratedAvatarViewModel?.avatar?.avatarViewModel?.image?.sources?.[0]?.url ||
      data?.header?.c4TabbedHeaderRenderer?.avatar?.thumbnails?.[1]?.url ||
      data?.header?.c4TabbedHeaderRenderer?.avatar?.thumbnails?.[0]?.url;
    return logo || null;
  } catch (err) {
    console.error("[fetchYoutubeChannelLogoUrl] err:", err);
    return null;
  }
}

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
    if (isInfeedAdType(adType)) {
      return this.captureInfeedPlacement(page, request, adType);
    }
    console.log(`[YouTube] ===== 캡처 시작 =====`);
    console.log(`[YouTube] 영상 URL: ${request.publisherUrl}`);
    console.log(`[YouTube] 광고 유형: ${adType}`);
    const instreamOpts = (request.options?.instreamOpts as InstreamOptsPayload | undefined) ?? {};

    // 모바일 여부 판정
    const isMobilePlatform = adType === "mobile-preroll-aos" || adType === "mobile-preroll-ios";
    const isAOS = adType === "mobile-preroll-aos";
    // 모바일은 컴패니언 배너 강제 비활성화
    if (isMobilePlatform) {
      instreamOpts.enableCompanionBanner = false;
    }

    // 🌟 데스크톱/모바일 뷰포트 및 User-Agent 초기 강제 설정 (어떤 네트워크 요청보다도 먼저 실행)
    if (isMobilePlatform) {
      const mobileVp = isAOS ? MOBILE_AOS_VIEWPORT : MOBILE_IOS_VIEWPORT;
      const mobileUA = isAOS ? UA_MOBILE_AOS : UA_MOBILE_IOS;
      await page.setViewport(mobileVp);
      await page.setUserAgent(mobileUA);
      console.log(`[YouTube] 📱 초기 모바일 뷰포트/UA 적용: ${isAOS ? "AOS (Pixel 8)" : "iOS (iPhone 15)"} ${mobileVp.width}×${mobileVp.height}`);
    } else {
      // 데스크톱 시청 레이아웃 고정
      await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
    }


    // preroll 계열(인스트림)은 PC/모바일 통일 로직
    const isPrerollFamily = adType === "preroll" || isMobilePlatform;
    const prerollCaptureSeconds = isPrerollFamily
        ? (() => {
            const sec = instreamOpts.skipSeconds;
            return typeof sec === "number" && Number.isFinite(sec) && sec >= 0 ? sec : 3;
          })()
        : null;

    console.log(`[YouTube] 소재(creative_url): ${request.creativeUrl || "(없음)"}`);
    if (isPrerollFamily && instreamOpts.videoUrl) {
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
    if (isPrerollFamily) {
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
    if (isPrerollFamily && !ok && prerollAdVideoId) {
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
    if (isPrerollFamily && !ok) {
      console.error(
        `[YouTube] 인스트림 소재 이미지 확보 실패 — creativeUrl·videoUrl을 확인하세요 (fetch 시도: ${creativeFetchUrl || "(없음)"})`
      );
    }

    // 인스트림 카드 로고: 업로드 URL이 있으면 서버에서 fetch → data URL (YouTube 페이지 CSP/CORS 회피)
    // 업로드가 없으면 companionChannelUrl에서 채널 로고 자동 추출
    let instreamAvatarDataUrl = creativeDataUrl;
    if (isPrerollFamily) {
      if (instreamOpts.avatarImageUrl?.trim()) {
        // 1순위: 직접 업로드된 로고
        const av = await imageUrlToDataUrl(instreamOpts.avatarImageUrl.trim());
        if (av.ok) {
          instreamAvatarDataUrl = av.dataUrl;
          console.log(`[YouTube] 로고 이미지 적용 (${av.sizeKB}KB)`);
        } else {
          console.warn("[YouTube] 로고 URL fetch 실패 — 썸네일로 대체");
        }
      } else if (instreamOpts.companionChannelUrl?.trim()) {
        // 2순위: 채널 URL에서 프로필 이미지 자동 추출
        console.log(`[YouTube] 채널 로고 자동 추출 시도: ${instreamOpts.companionChannelUrl}`);
        const channelLogoUrl = await fetchYoutubeChannelLogoUrl(instreamOpts.companionChannelUrl.trim());
        if (channelLogoUrl) {
          const av = await imageUrlToDataUrl(channelLogoUrl);
          if (av.ok) {
            instreamAvatarDataUrl = av.dataUrl;
            console.log(`[YouTube] 채널 로고 자동 적용 성공 (${av.sizeKB}KB)`);
          } else {
            console.warn("[YouTube] 채널 로고 fetch 실패 — 썸네일로 대체");
          }
        } else {
          console.warn("[YouTube] 채널 로고 URL 추출 실패 — 썸네일로 대체");
        }
      }
    }

    // 컴패니언 배너 이미지: URL 파싱 -> data URL
    let instreamCompanionDataUrl: string | null = null;
    if (isPrerollFamily) {
      let companionSourceUrl = instreamOpts.companionImageUrl?.trim();
      if (instreamOpts.companionUseChannelBanner && instreamOpts.companionChannelUrl?.trim()) {
        console.log(`[YouTube] 채널 배너 URL 파싱 시도: ${instreamOpts.companionChannelUrl}`);
        const extractedBanner = await fetchYoutubeChannelBannerUrl(instreamOpts.companionChannelUrl.trim());
        if (extractedBanner) {
          companionSourceUrl = extractedBanner;
          console.log(`[YouTube] 채널 배너 원본 이미지 발견: ${extractedBanner}`);
        } else {
          console.warn("[YouTube] 채널 배너를 찾지 못했습니다.");
        }
      }
      if (companionSourceUrl) {
        const comp = await imageUrlToDataUrl(companionSourceUrl);
        if (comp.ok) {
          instreamCompanionDataUrl = comp.dataUrl;
          console.log(`[YouTube] 컴패니언 배너 데이터 주입 성공 (${comp.sizeKB}KB)`);
        } else {
          console.warn("[YouTube] 컴패니언 배너 이미지 fetch 실패");
        }
      }
    }

    // 1.5) 🖼️ 비디오 ID 추출 + 썸네일 준비
    // 프리롤은 "광고주 영상(instreamVideoUrl)"을 기준으로 해야 함.
    const videoId =
      isPrerollFamily
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
    if (isPrerollFamily && instreamOpts.videoUrl?.trim() && prerollCaptureSeconds !== null) {
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
    let targetUrl = request.publisherUrl;
    if (isMobilePlatform) {
      if (targetUrl.includes('youtu.be/')) {
        const vid = extractVideoId(targetUrl);
        if (vid) targetUrl = `https://m.youtube.com/watch?v=${vid}`;
      } else if (targetUrl.includes('www.youtube.com') || targetUrl.includes('youtube.com')) {
        targetUrl = targetUrl.replace('www.youtube.com', 'm.youtube.com').replace('youtube.com', 'm.youtube.com');
      }
      // Clean up duplication if any
      targetUrl = targetUrl.replace('m.m.youtube.com', 'm.youtube.com');
    }

    // (뷰포트 및 UA는 captureAdPlacement 시작 시점에 이미 설정됨)


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
    const botDetected =
      (await this.checkBotDetection(page)) || (await this.checkWatchPagePlayerLoginWall(page));

    if (botDetected) {
      console.log(`[YouTube] 🤖 봇 감지됨 — 강력 폴백: 썸네일 직접 교체`);
      if (thumbnailDataUrl) {
        await this.applyWatchPageBotThumbnailMitigation(page, thumbnailDataUrl);
      } else {
        await this.nukeAllBotElements(page);
        await new Promise((r) => setTimeout(r, 500));
        await this.nukeAllBotElements(page);
      }
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
          '#admate-bot-cover-dialog',
          '#yt-thumb-overlay',
          '#movie_player',
          '#player-container-inner',
          '#player-container-outer',
          'ytd-player#ytd-player',
          'ytd-player',
          '.html5-video-player',
          '#player',
          '#ytd-player',
          'div.ytd-watch-flexy#player',
          'ytm-player-body',
          'ytm-player-section-renderer',
          '#player-container-id',
          '.player-container',
        ];

        let player = null;
        for (const sel of playerSelectors) {
          const el = document.querySelector(sel);
          if (el) {
            const rect = el.getBoundingClientRect();
            const minW =
              sel === '#yt-thumb-overlay' || sel === '#admate-bot-cover-dialog' ? 80 : 100;
            if (rect.width > minW && rect.height > minW) {
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
    await this.suppressWatchPageInjectionBlockers(page);

    // 7) 광고 유형별 인젝션
    let injectionSuccess = false;

    switch (adType) {
      case "preroll":
      case "mobile-preroll-aos":
      case "mobile-preroll-ios": {
        const prerollUiOpts = {
          videoUrl: instreamOpts.videoUrl || "",
          adTitle: instreamOpts.adTitle || "",
          ctaText: instreamOpts.ctaText || "",
          landingUrl: instreamOpts.landingUrl || request.clickUrl || "",
          displayUrl: instreamOpts.displayUrl || "",
          displayPath1: instreamOpts.displayPath1 || "",
          displayPath2: instreamOpts.displayPath2 || "",
          companionImageUrl: instreamCompanionDataUrl || instreamOpts.companionImageUrl || "",
          avatarImageUrl: instreamAvatarDataUrl,
          progressFillPercent: prerollProgressPercent,
          enableCtaText: instreamOpts.enableCtaText,
          isMobile: isMobilePlatform,
          instreamSkipMode: instreamOpts.instreamSkipMode,
        };
        console.log(
          `[YouTube] 인스트림 옵션: title="${prerollUiOpts.adTitle}" cta="${prerollUiOpts.ctaText}" landing="${prerollUiOpts.landingUrl}" enableCtaText="${prerollUiOpts.enableCtaText}" mobile=${isMobilePlatform}`
        );

        injectionSuccess = await this.injectPrerollAd(page, prerollOverlayImageUrl, playerInfo, prerollUiOpts);
        // 🎯 컴패니언 배너 동시 삽입 (모바일은 instreamOpts.enableCompanionBanner 이미 false로 강제됨)
        if (injectionSuccess) {
          if (instreamOpts.enableCompanionBanner !== false) {
            const companionImg = prerollUiOpts.companionImageUrl || creativeDataUrl;
            const companionResult = await this.injectDisplayAd(page, companionImg, {
              variant: "companion-300x60",
              uiOpts: prerollUiOpts,
            });
            console.log(`[YouTube] 컴패니언 배너: ${companionResult ? '✅ 성공' : '⚠️ 실패'}`);
          } else {
            console.log('[YouTube] 컴패니언 배너 삽입 생략 (opt-out)');
          }
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
      !isPrerollFamily ||
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
    if (isMobilePlatform) {
      await page.evaluate<void>(`
        (() => {
          const popupSelectors =
            'ytm-popup-container, tp-yt-paper-dialog, ytm-confirm-dialog-renderer, ytm-single-option-survey-renderer,' +
            'ytm-bottom-sheet-renderer, ytm-subscribe-button-renderer tp-yt-paper-dialog, tp-yt-iron-overlay-backdrop,' +
            '[role="dialog"], ytm-action-sheet-renderer';

          const removePopups = () => {
            // 닫기/취소 버튼 우선 클릭
            document.querySelectorAll('button, tp-yt-paper-button').forEach((el) => {
              const text = (el.textContent || '').trim();
              if (text === '취소' || text === '닫기' || text === '나중에') {
                if (el instanceof HTMLElement) {
                  try { el.click(); } catch {}
                }
              }
            });

            // 팝업 노드를 숨기고 제거
            document.querySelectorAll(popupSelectors).forEach((el) => {
              if (el instanceof HTMLElement) {
                el.style.setProperty('display', 'none', 'important');
                el.style.setProperty('visibility', 'hidden', 'important');
                el.style.setProperty('opacity', '0', 'important');
              }
              el.remove();
            });
            document
              .querySelectorAll('*')
              .forEach((el) => {
                const text = (el.textContent || '').trim();
                if (text.includes('채널을 구독하시겠습니까?') || text.includes('채널을 구독하려면 로그인')) {
                  const dialog = el.closest('tp-yt-paper-dialog, ytm-confirm-dialog-renderer, ytm-popup-container');
                  if (dialog) dialog.remove();
                }
              });

            document.body.style.setProperty('overflow', 'auto', 'important');
            document.documentElement.style.setProperty('overflow', 'auto', 'important');
          };

          document
            .querySelectorAll(
              'ytm-mobile-topbar-renderer, ytm-app-header, ytm-header, #header, .mobile-topbar-header-content, .ytm-header-bar'
            )
            .forEach((el) => {
              if (el instanceof HTMLElement) el.style.display = 'none';
            });

          removePopups();

          const key = '__admate_popup_observer_installed__';
          if (!window[key]) {
            window[key] = true;
            const obs = new MutationObserver(() => removePopups());
            obs.observe(document.documentElement, { childList: true, subtree: true });
          }
        })()
      `);
      await new Promise((r) => setTimeout(r, 300));
      await page.evaluate<void>(`
        (() => {
          const popupSelectors =
            'ytm-popup-container, tp-yt-paper-dialog, ytm-confirm-dialog-renderer, ytm-single-option-survey-renderer,' +
            'ytm-bottom-sheet-renderer, tp-yt-iron-overlay-backdrop, [role="dialog"], ytm-action-sheet-renderer';
          document.querySelectorAll(popupSelectors).forEach((el) => el.remove());
          document.body.style.setProperty('overflow', 'auto', 'important');
          document.documentElement.style.setProperty('overflow', 'auto', 'important');
        })()
      `);
      await new Promise((r) => setTimeout(r, 120));
    }

    // 10) 스크린샷
    // 모바일: 뷰포트 전체 clip | 데스크탑: fullPage false (YouTube 비율 최적)
    let screenshot: Buffer;
    if (isMobilePlatform) {
      const mobileVp = isAOS ? MOBILE_AOS_VIEWPORT : MOBILE_IOS_VIEWPORT;
      screenshot = await page.screenshot({
        fullPage: false,
        type: "png",
        clip: { x: 0, y: 0, width: mobileVp.width, height: mobileVp.height },
      });
    } else {
      screenshot = await page.screenshot({
        fullPage: false,
        type: "png",
      });
    }

    console.log(`[YouTube] ===== 캡처 완료 (${adType}) =====`);

    // 11) 폰 프레임 합성 제거: 사용자는 순수 모바일 웹 UI 캡처를 원함

    return screenshot;
  }

  private async readYoutubeRichGridSnapshot(page: IPageHandle): Promise<{
    richItems: number;
    shelfItems: number;
    videoRenderers: number;
    pageSubtype: string | null;
    hasFeedNudge: boolean;
    /** `ytd-browse[page-subtype="trending"]` 내부만 — URL은 trending인데 홈 UI일 때 0으로 남는 경우가 많음 */
    trendingGridTotal: number;
    /** 본문 `#primary` 안의 리치·쇼프 카드(트렌딩 DOM 변경·홈(/) 피드 대기에 사용) */
    primaryRichGridCount: number;
    guestEmptySearchPrompt: boolean;
  }> {
    return page.evaluate(() => {
      const firstBrowse = document.querySelector("ytd-browse");
      const pageSubtype = firstBrowse?.getAttribute("page-subtype") ?? null;
      const trendingBrowse = document.querySelector('ytd-browse[page-subtype="trending"]');
      const trendingRichItems = trendingBrowse
        ? trendingBrowse.querySelectorAll("ytd-rich-grid-renderer ytd-rich-item-renderer").length
        : 0;
      const trendingShelfItems = trendingBrowse
        ? trendingBrowse.querySelectorAll(
            "ytd-rich-shelf-renderer ytd-rich-item-renderer, ytd-rich-section-renderer ytd-rich-item-renderer"
          ).length
        : 0;
      const trendingStrictTotal = trendingRichItems + trendingShelfItems;

      const countInRoot = (root: Element | null) => {
        if (!root) return 0;
        const pa = root.querySelectorAll("ytd-rich-grid-renderer ytd-rich-item-renderer").length;
        const pb = root.querySelectorAll(
          "ytd-rich-grid-renderer ytd-rich-grid-row ytd-rich-item-renderer"
        ).length;
        const pc = root.querySelectorAll(
          "ytd-rich-shelf-renderer ytd-rich-item-renderer, ytd-rich-section-renderer ytd-rich-item-renderer"
        ).length;
        const pv = root.querySelectorAll("ytd-video-renderer").length;
        const pg = root.querySelectorAll("ytd-grid-video-renderer").length;
        const pr = root.querySelectorAll("ytd-rich-item-renderer").length;
        return Math.max(pa, pb, pc, pv, pg, pr);
      };
      const primaryEl = document.querySelector("#primary");
      let primaryRichGridCount = countInRoot(primaryEl);
      const app = document.querySelector("ytd-app");
      const guide = app?.querySelector("#guide, ytd-mini-guide-renderer, ytd-guide-renderer");
      const contentRoot = app?.querySelector("#content");
      if (contentRoot) {
        const sel =
          "ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-reel-item-renderer";
        let outside = 0;
        contentRoot.querySelectorAll(sel).forEach((el: Element) => {
          if (guide && guide.contains(el)) return;
          outside++;
        });
        primaryRichGridCount = Math.max(primaryRichGridCount, outside);
      }

      const path = location.pathname || "";
      const onTrendingPath = /\/feed\/trending/i.test(path);
      const trendingGridTotal = Math.max(trendingStrictTotal, onTrendingPath ? primaryRichGridCount : 0);

      const richItems = document.querySelectorAll("ytd-rich-grid-renderer ytd-rich-item-renderer").length;
      const shelfItems = document.querySelectorAll(
        "ytd-rich-shelf-renderer ytd-rich-item-renderer, ytd-rich-section-renderer ytd-rich-item-renderer"
      ).length;
      const hasFeedNudge = !!document.querySelector("ytd-feed-nudge-renderer");
      const videoRenderers = document.querySelectorAll("ytd-video-renderer").length;

      const blob =
        (document.querySelector("#primary")?.textContent || "") +
        (document.querySelector("ytd-app")?.textContent?.slice(0, 14000) || "");
      const guestEmptySearchPrompt =
        /검색하여\s*시작/i.test(blob) ||
        /Start\s+by\s+searching/i.test(blob) ||
        /내가\s*좋아할\s*만한\s*동영상\s*피드/i.test(blob);

      return {
        richItems,
        shelfItems,
        videoRenderers,
        pageSubtype,
        hasFeedNudge,
        trendingGridTotal,
        primaryRichGridCount,
        guestEmptySearchPrompt,
      };
    });
  }

  /** 인피드 홈: 관련동영상과 유사하게 짧은 /watch 로 세션을 깨운 뒤 브라우즈 피드로 넘어간다. */
  private async warmupYoutubeSessionBeforeBrowseFeed(page: IPageHandle): Promise<void> {
    try {
      console.log("[YouTube] 인피드 홈: /watch 선로드로 세션 워밍업 (빈 primary 완화)");
      await page.goto(
        "https://www.youtube.com/watch?v=jNQXAC9IVRw&autoplay=0&hl=ko&gl=KR",
        { waitUntil: "domcontentloaded", timeout: 22000 }
      );
      await new Promise((r) => setTimeout(r, 1500));
    } catch (e) {
      console.warn("[YouTube] 인피드 홈: /watch 워밍업 스킵", e);
    }
  }

  /**
   * 트렌딩·홈(/) 브라우즈 URL 전용 이동.
   * `networkidle2`는 YouTube에서 지연·조기 종료가 잦아, domcontentloaded + 고정 대기가 그리드에 유리한 경우가 많다.
   */
  private async gotoYoutubeInfeedBrowseFeed(page: IPageHandle, url: string): Promise<void> {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 50000 });
    await new Promise((r) => setTimeout(r, 4500));
  }

  /** 브라우즈 피드 본문: `#primary` + `ytd-app #content`(가이드 제외) 동영상·리치 카드 신호 */
  private async countPrimaryBrowseRichItems(page: IPageHandle): Promise<number> {
    return page.evaluate<number>(`
      (() => {
        const countInRoot = (root) => {
          if (!root) return 0;
          const a = root.querySelectorAll("ytd-rich-grid-renderer ytd-rich-item-renderer").length;
          const b = root.querySelectorAll(
            "ytd-rich-grid-renderer ytd-rich-grid-row ytd-rich-item-renderer"
          ).length;
          const c = root.querySelectorAll(
            "ytd-rich-shelf-renderer ytd-rich-item-renderer, ytd-rich-section-renderer ytd-rich-item-renderer"
          ).length;
          const v = root.querySelectorAll("ytd-video-renderer").length;
          const g = root.querySelectorAll("ytd-grid-video-renderer").length;
          const r = root.querySelectorAll("ytd-rich-item-renderer").length;
          return Math.max(a, b, c, v, g, r);
        };
        const primary = document.querySelector("#primary");
        let m = countInRoot(primary);
        const app = document.querySelector("ytd-app");
        const guide = app?.querySelector("#guide, ytd-mini-guide-renderer, ytd-guide-renderer");
        const contentRoot = app?.querySelector("#content");
        if (contentRoot) {
          const sel =
            "ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-reel-item-renderer";
          let outside = 0;
          contentRoot.querySelectorAll(sel).forEach((el) => {
            if (guide && guide.contains(el)) return;
            outside++;
          });
          m = Math.max(m, outside);
        }
        return m;
      })()
    `);
  }

  /** 브라우즈 본문이 계속 0일 때 DOM 상태만 짧게 로그 (원인 추적) */
  private async logYoutubeBrowseDomProbe(page: IPageHandle): Promise<void> {
    const s = await page.evaluate<string>(`
      (() => {
        const app = !!document.querySelector("ytd-app");
        const primary = !!document.querySelector("#primary");
        const content = !!document.querySelector("ytd-app #content");
        const browse = document.querySelectorAll("ytd-browse").length;
        const ph = (document.querySelector("#primary")?.innerHTML || "").length;
        const ytdPlayer = document.querySelectorAll("ytd-player").length;
        return "ytd-app=" + app + " #primary=" + primary + " #content=" + content +
          " ytd-browse=" + browse + " primaryHtmlLen=" + ph + " ytd-player=" + ytdPlayer;
      })()
    `);
    console.warn("[YouTube] 인피드 홈: DOM 프로브 " + s);
  }

  /**
   * 브라우즈 URL에서 본문이 전혀 안 붙을 때만: 검색 결과(성공 지면)에 잠시 머문 뒤 브라우즈로 복귀.
   * 최종 캡처 지면은 여전히 트렌딩/홈(검색 결과로 캡처하지 않음).
   */
  private async warmBrowseViaSearchResults(
    page: IPageHandle,
    mastheadProfileDataUrl: string,
    thenBrowseUrl: string
  ): Promise<number> {
    try {
      console.log(
        "[YouTube] 인피드 홈: 검색 결과로 세션 워밍 → 브라우즈 재진입 (최종 URL은 브라우즈만 유지)"
      );
      const searchUrl =
        "https://www.youtube.com/results?search_query=news&hl=ko&gl=KR&app=desktop";
      await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 50000 });
      await new Promise((r) => setTimeout(r, 5000));
      await this.reapplyPostNavigationChrome(page, mastheadProfileDataUrl);
      await this.primeYoutubeBrowsePrimaryGrid(page, 2, 10000);
      await this.gotoYoutubeInfeedBrowseFeed(page, thenBrowseUrl);
      await this.reapplyPostNavigationChrome(page, mastheadProfileDataUrl);
      return await this.primeYoutubeBrowsePrimaryGrid(page, 3, 14000);
    } catch (e) {
      console.warn("[YouTube] 인피드 홈: 검색 경유 워밍 실패", e);
      return 0;
    }
  }

  /**
   * 인피드 홈: 광고보다 먼저 **유튜브 본문**이 붙도록 트렌딩/홈·로케일 후보를 순회한다.
   * (데이터센터 IP에서 한 경로만 비는 경우가 있어 다각 시도)
   */
  private async bootstrapInfeedHomeBrowseMainContent(
    page: IPageHandle,
    mastheadProfileDataUrl: string
  ): Promise<{ bestCount: number; bestUrl: string }> {
    const candidates: { url: string; label: string }[] = [
      { url: "https://www.youtube.com/feed/trending?app=desktop&hl=ko&gl=KR", label: "trending-ko" },
      { url: "https://www.youtube.com/feed/trending?app=desktop&hl=en&gl=US", label: "trending-en" },
      { url: "https://www.youtube.com/?app=desktop&hl=ko&gl=KR", label: "home-ko" },
      { url: "https://www.youtube.com/?app=desktop&hl=en&gl=US", label: "home-en" },
    ];
    let bestCount = 0;
    let bestUrl = candidates[0]!.url;
    for (const { url, label } of candidates) {
      console.log(`[YouTube] 인피드 홈: 유기 본문 로드 시도 [${label}]`);
      await this.gotoYoutubeInfeedBrowseFeed(page, url);
      await this.reapplyPostNavigationChrome(page, mastheadProfileDataUrl);
      const n = await this.primeYoutubeBrowsePrimaryGrid(page, 3, 11000);
      if (n > bestCount) {
        bestCount = n;
        bestUrl = url;
      }
      if (n >= 8) break;
    }
    if (bestCount === 0) {
      if (this.diagnostics) this.diagnostics.infeedHomeSearchWarmUsed = true;
      const warmed = await this.warmBrowseViaSearchResults(
        page,
        mastheadProfileDataUrl,
        candidates[0]!.url
      );
      if (warmed > bestCount) {
        bestCount = warmed;
        bestUrl = candidates[0]!.url;
      }
    }
    if (bestCount > 0) {
      console.log(`[YouTube] 인피드 홈: 본문 최대 ${bestCount} — 해당 URL로 마무리 이동`);
      await this.gotoYoutubeInfeedBrowseFeed(page, bestUrl);
      await this.reapplyPostNavigationChrome(page, mastheadProfileDataUrl);
      await this.primeYoutubeBrowsePrimaryGrid(page, 3, 8000);
    } else {
      await this.logYoutubeBrowseDomProbe(page);
    }
    return { bestCount, bestUrl };
  }

  /** 스크롤로 리치 그리드 lazy mount를 유도한 뒤 주 컬럼 카드 수를 올린다. */
  private async primeYoutubeBrowsePrimaryGrid(
    page: IPageHandle,
    min: number,
    timeoutMs: number
  ): Promise<number> {
    const deadline = Date.now() + timeoutMs;
    let last = 0;
    while (Date.now() < deadline) {
      last = await this.countPrimaryBrowseRichItems(page);
      if (last >= min) {
        await page.evaluate<void>(
          `(() => { window.scrollTo({ top: 0, behavior: "instant" }); })()`
        );
        return last;
      }
      await page.evaluate<void>(`(() => { window.scrollBy(0, 700); })()`);
      await new Promise((r) => setTimeout(r, 550));
    }
    await page.evaluate<void>(
      `(() => { window.scrollTo({ top: 0, behavior: "instant" }); })()`
    );
    return last;
  }

  private async reapplyPostNavigationChrome(
    page: IPageHandle,
    mastheadProfileDataUrl: string
  ): Promise<void> {
    await this.injectKoreanFonts(page);
    await this.dismissYouTubeConsent(page);
    await new Promise((r) => setTimeout(r, 1500));
    await this.applyMastheadLoggedInLook(page, mastheadProfileDataUrl);
    await this.applySignedOutPromptSuppression(page);
  }

  /** 좌측 가이드/본문의 비로그인 유도 문구를 숨겨 로그인 상태처럼 보이게 보정 */
  private async applySignedOutPromptSuppression(page: IPageHandle): Promise<void> {
    await page.evaluate<void>(`
      (() => {
        const removeSelectors = [
          "ytd-guide-signin-promo-renderer",
          "ytd-mini-guide-signin-promo-renderer",
          "ytd-feed-nudge-renderer",
          "ytd-mealbar-promo-renderer",
          "ytd-upsell-dialog-renderer",
          "ytd-action-companion-ad-renderer",
        ];
        removeSelectors.forEach((sel) => {
          document.querySelectorAll(sel).forEach((el) => el.remove());
        });

        const hideByText = (root) => {
          if (!root) return;
          const txt = (root.textContent || "").replace(/\\s+/g, " ").trim();
          if (!txt) return;
          if (
            txt.includes("로그인하면 동영상에 좋아요를 표시") ||
            txt.includes("채널을 구독") ||
            txt.includes("Sign in to like videos") ||
            txt.includes("Sign in to subscribe")
          ) {
            root.style.setProperty("display", "none", "important");
            const host = root.closest("ytd-guide-entry-renderer, ytd-guide-signin-promo-renderer, #header-entry");
            if (host) host.style.setProperty("display", "none", "important");
          }
        };

        document.querySelectorAll("ytd-guide-entry-renderer, ytd-guide-signin-promo-renderer, yt-formatted-string").forEach(
          (el) => hideByText(el)
        );
      })()
    `);
  }

  /**
   * 인피드 홈: 트렌딩(`/feed/trending`)에서 주 컬럼 그리드가 안 나오면 실제 홈(`/`)으로 전환해 재시도합니다.
   * 준비 판별은 `ytd-browse[page-subtype=trending]`뿐 아니라 **`#primary` 리치 카드 수**를 사용합니다(DOM 변경 대응).
   * 정책상 infeed-home은 검색 결과 지면으로 폴백하지 않습니다.
   */
  private async ensureInfeedHomeFeedReady(
    page: IPageHandle,
    mastheadProfileDataUrl: string
  ): Promise<{
    injectSurface: InfeedSurface;
    richCount: number;
    pageSubtype: string | null;
    feedMode: "trending" | "home";
  }> {
    const minPrimaryCards = 3;
    const timeoutMs = 38000;
    const deadline = Date.now() + timeoutMs;
    let injectSurface: InfeedSurface = "home";
    let reloadCount = 0;
    let localeFlipCount = 0;
    let lastPrimaryTotal = -1;
    let stagnantIters = 0;

    const isTrendingUrl = (u: string) => /\/feed\/trending/i.test(u);
    const isHomeFeedUrl = (u: string) => {
      try {
        const { pathname, hostname } = new URL(u);
        const h = hostname.replace(/^www\./i, "");
        if (h !== "youtube.com" && h !== "m.youtube.com") return false;
        return pathname === "/" || pathname === "";
      } catch {
        return false;
      }
    };
    const urlMatchesMode = (u: string, mode: "trending" | "home") =>
      mode === "trending" ? isTrendingUrl(u) : isHomeFeedUrl(u);

    const browseFeedReady = (
      snap: Awaited<ReturnType<typeof this.readYoutubeRichGridSnapshot>>,
      url: string,
      mode: "trending" | "home"
    ) =>
      urlMatchesMode(url, mode) &&
      snap.primaryRichGridCount >= minPrimaryCards &&
      !snap.guestEmptySearchPrompt;

    const boot = await this.bootstrapInfeedHomeBrowseMainContent(page, mastheadProfileDataUrl);
    console.log(
      `[YouTube] 인피드 홈: 유기 본문 부트스트랩 best=${boot.bestCount} (기준 URL=${boot.bestUrl})`
    );
    if (this.diagnostics) {
      this.diagnostics.infeedBootstrapBest = boot.bestCount;
    }

    let feedMode: "trending" | "home" = isTrendingUrl(page.url())
      ? "trending"
      : isHomeFeedUrl(page.url())
        ? "home"
        : "home";

    while (Date.now() < deadline) {
      const snap = await this.readYoutubeRichGridSnapshot(page);
      const url = page.url();
      const globalRich = snap.richItems + snap.shelfItems;

      if (this.diagnostics) {
        this.diagnostics.infeedRichGridCount = globalRich;
        this.diagnostics.infeedTrendingGridCount = snap.trendingGridTotal;
        this.diagnostics.infeedPrimaryRichGridCount = snap.primaryRichGridCount;
        this.diagnostics.infeedPageSubtype = snap.pageSubtype ?? undefined;
        this.diagnostics.infeedGuestEmptyPrompt = snap.guestEmptySearchPrompt;
        this.diagnostics.infeedHomeFeedMode = feedMode;
      }

      if (browseFeedReady(snap, url, feedMode)) {
        return {
          injectSurface,
          richCount: snap.primaryRichGridCount,
          pageSubtype: snap.pageSubtype,
          feedMode,
        };
      }

      if (!urlMatchesMode(url, feedMode)) {
        const dest =
          feedMode === "trending"
            ? "https://www.youtube.com/feed/trending?app=desktop&hl=ko&gl=KR"
            : "https://www.youtube.com/?app=desktop&hl=ko&gl=KR";
        console.warn(
          `[YouTube] 인피드 홈: URL이 ${feedMode} 지면과 불일치 (${url}) — 재이동합니다.`
        );
        await this.gotoYoutubeInfeedBrowseFeed(page, dest);
        await this.reapplyPostNavigationChrome(page, mastheadProfileDataUrl);
        stagnantIters = 0;
        continue;
      } else if (
        feedMode === "trending" &&
        isTrendingUrl(url) &&
        snap.guestEmptySearchPrompt &&
        snap.primaryRichGridCount < minPrimaryCards &&
        localeFlipCount < 1 &&
        stagnantIters >= 6
      ) {
        localeFlipCount++;
        stagnantIters = 0;
        console.warn(
          "[YouTube] 인피드 홈: URL은 trending인데 게스트 빈 홈 UI — 로케일 전환(en/US) 후 재시도합니다."
        );
        await this.gotoYoutubeInfeedBrowseFeed(
          page,
          `https://www.youtube.com/feed/trending?app=desktop&hl=en&gl=US&persist_app=1&cb=${Date.now()}`
        );
        await this.reapplyPostNavigationChrome(page, mastheadProfileDataUrl);
        continue;
      } else if (
        feedMode === "home" &&
        isHomeFeedUrl(url) &&
        snap.guestEmptySearchPrompt &&
        snap.primaryRichGridCount < minPrimaryCards &&
        localeFlipCount < 1 &&
        stagnantIters >= 6
      ) {
        localeFlipCount++;
        stagnantIters = 0;
        console.warn(
          "[YouTube] 인피드 홈: 홈(/)에서 게스트 빈 홈 UI — 로케일 전환(en/US) 후 재시도합니다."
        );
        await this.gotoYoutubeInfeedBrowseFeed(
          page,
          `https://www.youtube.com/?app=desktop&hl=en&gl=US&persist_app=1&cb=${Date.now()}`
        );
        await this.reapplyPostNavigationChrome(page, mastheadProfileDataUrl);
        continue;
      }

      if (snap.primaryRichGridCount === lastPrimaryTotal) stagnantIters++;
      else {
        stagnantIters = 0;
        lastPrimaryTotal = snap.primaryRichGridCount;
      }

      if (stagnantIters >= 14 && reloadCount < 2) {
        reloadCount++;
        stagnantIters = 0;
        console.warn("[YouTube] 인피드 홈: 그리드 정체 — 전체 리로드 후 재시도합니다.");
        await Promise.all([
          page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 50000 }),
          page.evaluate<void>(`
            (() => { window.location.reload(); })()
          `),
        ]);
        await new Promise((r) => setTimeout(r, 3500));
        await this.reapplyPostNavigationChrome(page, mastheadProfileDataUrl);
      }

      await page.evaluate<void>(`
        (() => { window.scrollBy(0, 600); })()
      `);
      await new Promise((r) => setTimeout(r, 650));
    }

    let snap = await this.readYoutubeRichGridSnapshot(page);
    const finalUrl = page.url();
    if (browseFeedReady(snap, finalUrl, feedMode)) {
      return {
        injectSurface,
        richCount: snap.primaryRichGridCount,
        pageSubtype: snap.pageSubtype,
        feedMode,
      };
    }

    const total = snap.primaryRichGridCount;
    const trendInner = snap.trendingGridTotal;
    console.warn(
      `[YouTube] 인피드 홈: 주 컬럼 그리드 미확보 (primary=${total}, trendingBrowse합=${trendInner}, mode=${feedMode}, 게스트빈홈=${snap.guestEmptySearchPrompt}) — home 지면 유지 상태로 인젝션합니다.`
    );
    const globalRich = snap.richItems + snap.shelfItems;
    if (this.diagnostics) {
      this.diagnostics.infeedRichGridCount = globalRich;
      this.diagnostics.infeedTrendingGridCount = snap.trendingGridTotal;
      this.diagnostics.infeedPrimaryRichGridCount = snap.primaryRichGridCount;
      this.diagnostics.infeedPageSubtype = snap.pageSubtype ?? undefined;
      this.diagnostics.infeedGuestEmptyPrompt = snap.guestEmptySearchPrompt;
      this.diagnostics.infeedHomeFeedMode = feedMode;
    }
    return {
      injectSurface,
      richCount: snap.primaryRichGridCount || globalRich,
      pageSubtype: snap.pageSubtype,
      feedMode,
    };
  }

  /**
   * 인피드 동영상 광고 — 홈 / 검색 / 관련동영상(시청 사이드바) 카드 UI 주입
   */
  private async captureInfeedPlacement(
    page: IPageHandle,
    request: CaptureRequest,
    adType: "infeed-home" | "infeed-search" | "infeed-watch-next"
  ): Promise<Buffer> {
    const surface = infeedSurfaceFromAdType(adType)!;
    console.log(`[YouTube] ===== 인피드 캡처 시작 (${surface}) =====`);

    await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });

    this.diagnostics = {
      adType,
      playerFound: false,
      playerSize: { width: 0, height: 0 },
      sidebarFound: surface === "watch-next",
      injectionSuccess: false,
      creativeDownloaded: false,
      creativeBase64Size: 0,
    };

    const mastheadProfileDataUrl = await this.pickRandomMastheadAvatarDataUrl();
    const instreamOpts = (request.options?.instreamOpts as InstreamOptsPayload | undefined) ?? {};
    const infeedOpts = (request.options?.infeedOpts as InfeedOptsPayload | undefined) ?? {};

    const rawCreative = (request.creativeUrl || "").trim();
    const infeedVideo = infeedOpts.videoUrl?.trim() || "";
    let creativeFetchUrl = "";
    if (rawCreative) {
      if (/youtube\.com|youtu\.be/i.test(rawCreative)) {
        const id = extractVideoId(rawCreative);
        creativeFetchUrl = id ? getThumbnailUrl(id) : rawCreative;
      } else {
        creativeFetchUrl = rawCreative;
      }
    }
    if (!creativeFetchUrl && infeedVideo) {
      const id = extractVideoId(infeedVideo);
      if (id) creativeFetchUrl = getThumbnailUrl(id);
    }
    let { dataUrl: creativeDataUrl, sizeKB, ok } = creativeFetchUrl
      ? await imageUrlToDataUrl(creativeFetchUrl)
      : { dataUrl: "", sizeKB: 0, ok: false };
    const fallbackVid =
      extractVideoId(infeedVideo) ||
      (rawCreative && /youtube\.com|youtu\.be/i.test(rawCreative) ? extractVideoId(rawCreative) : null);
    if (!ok && fallbackVid) {
      const fb = await imageUrlToDataUrl(`https://img.youtube.com/vi/${fallbackVid}/hqdefault.jpg`);
      if (fb.ok) {
        creativeDataUrl = fb.dataUrl;
        sizeKB = fb.sizeKB;
        ok = true;
      }
    }
    this.diagnostics.creativeDownloaded = ok;
    this.diagnostics.creativeBase64Size = sizeKB;
    if (!ok || !creativeDataUrl) {
      console.error(
        "[YouTube] 인피드: 소재 이미지(creativeUrl) 또는 광고 영상 URL(videoUrl)로 썸네일을 확보해야 합니다."
      );
    }

    /** 인피드 스폰서 줄·홈 카드 원형 아이콘은 썸네일로 대체하지 않음 — 아이콘 URL 또는 채널 URL로 확보된 경우만 표시 */
    let avatarDataUrl = "";
    let showChannelAvatar = false;
    if (instreamOpts.avatarImageUrl?.trim()) {
      const av = await imageUrlToDataUrl(instreamOpts.avatarImageUrl.trim());
      if (av.ok) {
        avatarDataUrl = av.dataUrl;
        showChannelAvatar = true;
      }
    }
    if (!showChannelAvatar && instreamOpts.companionChannelUrl?.trim()) {
      const logoUrl = await fetchYoutubeChannelLogoUrl(instreamOpts.companionChannelUrl.trim());
      if (logoUrl) {
        const av = await imageUrlToDataUrl(logoUrl);
        if (av.ok) {
          avatarDataUrl = av.dataUrl;
          showChannelAvatar = true;
        }
      }
    }

    let sponsorName = "brand.example";
    try {
      if (instreamOpts.displayUrl?.trim()) {
        sponsorName = instreamOpts.displayUrl
          .trim()
          .replace(/^https?:\/\//i, "")
          .replace(/^www\./i, "")
          .split("/")[0]!;
      } else if (request.clickUrl?.trim()) {
        sponsorName = new URL(request.clickUrl.trim()).hostname.replace(/^www\./i, "");
      }
    } catch {
      /* keep default */
    }

    const title = instreamOpts.adTitle?.trim() || "광고 제목";
    const description1 = infeedOpts.description1?.trim() || "";
    const description2 = infeedOpts.description2?.trim() || "";
    const searchPlacement: "top" | "feed" =
      adType === "infeed-search" && infeedOpts.searchPlacement === "feed" ? "feed" : "top";
    const searchFeedInsertAfterIndex =
      typeof infeedOpts.searchFeedInsertAfterIndex === "number" &&
      !Number.isNaN(infeedOpts.searchFeedInsertAfterIndex)
        ? Math.max(0, Math.min(12, Math.floor(infeedOpts.searchFeedInsertAfterIndex)))
        : 1;
    if (this.diagnostics && adType === "infeed-search") {
      this.diagnostics.infeedSearchPlacement = searchPlacement;
    }

    let ctaPrimary = infeedOpts.ctaPrimary?.trim() || "";
    let ctaSecondary = infeedOpts.ctaSecondary?.trim() || "";
    /** 검색: 제목 아래 한 줄·주/보조 CTA가 모두 비면 버튼·기본 CTA 없이 스폰서만 제목 바로 아래 */
    const infeedSearchTitleOnly =
      adType === "infeed-search" && !description1 && !ctaPrimary && !ctaSecondary;
    if (adType === "infeed-home") {
      if (!ctaPrimary) ctaPrimary = "시작하기";
      if (!ctaSecondary) ctaSecondary = "시청";
    } else if (adType === "infeed-search") {
      if (!infeedSearchTitleOnly) {
        if (!ctaPrimary) ctaPrimary = "사이트 방문";
        if (!ctaSecondary) ctaSecondary = "시청";
      }
    } else {
      /** 관련동영상: CTA 1개만 — API/옵션의 보조 CTA는 무시 */
      if (!ctaPrimary) ctaPrimary = "사이트 방문";
      ctaSecondary = "";
    }

    let targetUrl = request.publisherUrl;
    if (adType === "infeed-home") {
      /** 비로그인 `/` 는 빈 홈·리다이렉트가 잦음 → 데스크톱·로케일을 고정한 트렌딩 URL로 그리드 확보 */
      targetUrl = "https://www.youtube.com/feed/trending?app=desktop&hl=ko&gl=KR";
      console.log("[YouTube] 인피드 홈: 추천 그리드 확보를 위해 /feed/trending 에서 캡처합니다.");
    } else if (adType === "infeed-search") {
      const q = (infeedOpts.searchQuery?.trim() || "시세이도").slice(0, 200);
      targetUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`;
    }

    let infeedWatchNextNavUrl = "";
    if (adType === "infeed-watch-next" && request.publisherUrl?.trim()) {
      try {
        const wu = new URL(request.publisherUrl.trim());
        if (!wu.searchParams.has("hl")) wu.searchParams.set("hl", "ko");
        if (!wu.searchParams.has("gl")) wu.searchParams.set("gl", "KR");
        infeedWatchNextNavUrl = wu.toString();
      } catch {
        infeedWatchNextNavUrl = request.publisherUrl.trim();
      }
    }

    /** 관련동영상: 메인 플레이어 덮개 — 정적 썸네일 후 스토리보드·VPS 등으로 중간 프레임 시도 */
    let publisherThumbDataUrl = "";
    if (adType === "infeed-watch-next") {
      const pubUrl = (infeedWatchNextNavUrl || request.publisherUrl || "").trim();
      const pubVid = extractVideoId(pubUrl);
      if (pubVid) {
        let pubThumb = await imageUrlToDataUrl(getThumbnailUrl(pubVid));
        if (!pubThumb.ok) {
          pubThumb = await imageUrlToDataUrl(`https://img.youtube.com/vi/${pubVid}/hqdefault.jpg`);
        }
        if (pubThumb.ok) {
          publisherThumbDataUrl = pubThumb.dataUrl;
        }
      }
      if (pubUrl && extractVideoId(pubUrl)) {
        const offRaw = infeedOpts.watchNextPlayerFrameOffsetSec;
        const frameSec =
          typeof offRaw === "number" && !Number.isNaN(offRaw)
            ? Math.max(0, Math.min(180, Math.floor(offRaw)))
            : 4;
        try {
          const live = await this.captureTimedFrameFromInstreamVideo(page, pubUrl, frameSec);
          if (live.frameDataUrl) {
            publisherThumbDataUrl = live.frameDataUrl;
            console.log(
              `[YouTube] 인피드 관련동영상: 퍼블리셔 영상 ${frameSec}s 프레임으로 플레이어 덮개(정적 썸네일 대체)`
            );
          }
        } catch (e) {
          console.warn("[YouTube] 인피드 관련동영상: 영상 프레임 추출 실패 — 정적 썸네일 유지", e);
        }
      }
    }

    await this.applyYouTubeConsentCookies(page);
    if (adType === "infeed-home") {
      await this.warmupYoutubeSessionBeforeBrowseFeed(page);
    }
    if (adType === "infeed-watch-next" && infeedWatchNextNavUrl) {
      const embedFirst = this.convertToEmbedUrl(infeedWatchNextNavUrl);
      if (embedFirst) {
        console.log("[YouTube] 인피드 관련동영상: embed 선로드 후 /watch 진입 (봇 검증 완화)");
        await page.goto(embedFirst, { waitUntil: "networkidle2", timeout: 45000 });
        await new Promise((r) => setTimeout(r, 2000));
      }
      await page.goto(infeedWatchNextNavUrl, { waitUntil: "networkidle2", timeout: 45000 });
      targetUrl = infeedWatchNextNavUrl;
    } else if (adType === "infeed-home") {
      await this.gotoYoutubeInfeedBrowseFeed(page, targetUrl);
    } else {
      await page.goto(targetUrl, { waitUntil: "networkidle2", timeout: 45000 });
    }
    if (adType === "infeed-home") {
      const opened = page.url();
      if (!/\/feed\/trending/i.test(opened)) {
        console.warn(
          `[YouTube] 인피드 홈: 첫 이동 후 URL이 트렌딩이 아님 (${opened}) — /feed/trending 으로 재이동합니다.`
        );
        await this.gotoYoutubeInfeedBrowseFeed(
          page,
          "https://www.youtube.com/feed/trending?app=desktop&hl=ko&gl=KR"
        );
      }
    }
    await this.injectKoreanFonts(page);
    await this.dismissYouTubeConsent(page);
    await new Promise((r) => setTimeout(r, 2500));
    await this.applyMastheadLoggedInLook(page, mastheadProfileDataUrl);
    await this.applySignedOutPromptSuppression(page);

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
      if (adType === "infeed-home") {
        await this.gotoYoutubeInfeedBrowseFeed(page, targetUrl);
      } else {
        await page.goto(targetUrl, { waitUntil: "networkidle2", timeout: 45000 });
      }
      await new Promise((r) => setTimeout(r, 2000));
      await this.applyMastheadLoggedInLook(page, mastheadProfileDataUrl);
      await this.applySignedOutPromptSuppression(page);
      if (adType === "infeed-home") {
        const opened = page.url();
        if (!/\/feed\/trending/i.test(opened)) {
          console.warn(
            `[YouTube] 인피드 홈: 동의 처리 후 URL이 트렌딩이 아님 (${opened}) — /feed/trending 으로 재이동합니다.`
          );
          await this.gotoYoutubeInfeedBrowseFeed(
            page,
            "https://www.youtube.com/feed/trending?app=desktop&hl=ko&gl=KR"
          );
        }
      }
    }

    if (adType === "infeed-watch-next") {
      /** 인스트림과 동일 타이밍: 동의 후 플레이어 안정화 */
      await new Promise((r) => setTimeout(r, 3000));
      const legacyBot = await this.checkBotDetection(page);
      const playerWall = await this.checkWatchPagePlayerLoginWall(page);
      if (legacyBot || playerWall) {
        console.log(
          `[YouTube] 인피드 관련동영상: 봇/로그인 벽 감지 (innerText=${legacyBot}, player+shadow=${playerWall})`
        );
      }
      /** 인스트림(/watch)과 동일: 봇 제거→썸네일→pause. 서버 환경에선 퍼블리셔 썸네일로 항상 덮음 */
      const playerCoverUrl = publisherThumbDataUrl || creativeDataUrl;
      if (playerCoverUrl) {
        console.log("[YouTube] 인피드 관련동영상: 인스트림 동일 경로로 메인 플레이어 썸네일 적용");
        await this.applyWatchPageBotThumbnailMitigation(page, playerCoverUrl);
      } else {
        console.warn(
          "[YouTube] 인피드 관련동영상: 퍼블리셔·소재 썸네일 없음 — 봇 UI가 남을 수 있습니다."
        );
        await this.nukeAllBotElements(page);
      }
      await this.pauseVideo(page, { preserveTimeline: true });
      await new Promise((r) => setTimeout(r, 1000));
      await this.suppressWatchPageInjectionBlockers(page);
      await this.applyWatchPrimaryPlayerRadiusCss(page);
    }

    let injectSurface: InfeedSurface = surface;
    if (adType === "infeed-home") {
      const ready = await this.ensureInfeedHomeFeedReady(page, mastheadProfileDataUrl);
      injectSurface = ready.injectSurface;
      if (this.diagnostics) {
        this.diagnostics.infeedRichGridCount = ready.richCount;
        this.diagnostics.infeedPageSubtype = ready.pageSubtype ?? undefined;
        this.diagnostics.infeedInjectSurface = injectSurface;
        this.diagnostics.infeedHomeFeedMode = ready.feedMode;
      }
    }

    if (injectSurface === "home") {
      await page.evaluate<void>(`
        (() => {
          for (let i = 0; i < 8; i++) {
            window.scrollBy(0, 450);
          }
          window.scrollTo({ top: 0, behavior: 'instant' });
        })()
      `);
      await new Promise((r) => setTimeout(r, 2400));
    }

    if (injectSurface === "search") {
      if (searchPlacement === "feed") {
        await page.evaluate<void>(`
          (() => {
            window.scrollTo({ top: 0, behavior: 'instant' });
            window.scrollBy(0, 520);
          })()
        `);
        await new Promise((r) => setTimeout(r, 2000));
      } else {
        await page.evaluate<void>(`
          (() => {
            window.scrollTo({ top: 0, behavior: 'instant' });
          })()
        `);
      }
    }

    let skipHomeAdInjection = false;
    if (adType === "infeed-home" && injectSurface === "home") {
      const pc = await this.countPrimaryBrowseRichItems(page);
      skipHomeAdInjection = pc < 1;
      if (this.diagnostics) {
        this.diagnostics.infeedHomeInjectionSkipped = skipHomeAdInjection;
        this.diagnostics.infeedPrimaryRichGridCount = pc;
      }
      if (skipHomeAdInjection) {
        console.warn(
          "[YouTube] 인피드 홈: #primary 유기 콘텐츠 없음 — 광고 인젝션 생략(순수 유튜브 본문만 캡처)"
        );
      }
    }

    let injected = false;
    if (!skipHomeAdInjection) {
      injected = await page.evaluate(runInfeedInjectInPage, {
        surface: injectSurface,
        thumbDataUrl: creativeDataUrl,
        avatarDataUrl,
        showChannelAvatar,
        title,
        description1,
        description2,
        sponsorName,
        ctaPrimary,
        ctaSecondary,
        searchPlacement,
        searchFeedInsertAfterIndex,
      });
    }
    this.diagnostics.injectionSuccess = injected;

    if (!injected && injectSurface === "home" && !skipHomeAdInjection) {
      console.warn(
        "[YouTube] 홈(/) 인젝션 실패 — 인기 탭으로 이동 후 그리드 첫 칸에 재시도합니다."
      );
      await this.gotoYoutubeInfeedBrowseFeed(
        page,
        "https://www.youtube.com/feed/trending?app=desktop&hl=ko&gl=KR"
      );
      await this.injectKoreanFonts(page);
      await this.dismissYouTubeConsent(page);
      await new Promise((r) => setTimeout(r, 2000));
      await this.applyMastheadLoggedInLook(page, mastheadProfileDataUrl);
      await this.applySignedOutPromptSuppression(page);
      await this.primeYoutubeBrowsePrimaryGrid(page, 3, 12000);
      const pcRetry = await this.countPrimaryBrowseRichItems(page);
      if (adType === "infeed-home" && pcRetry < 1) {
        console.warn("[YouTube] 인피드 홈: 재시도 후에도 #primary 유기 콘텐츠 없음 — 인젝션 생략");
        if (this.diagnostics) {
          this.diagnostics.infeedHomeInjectionSkipped = true;
          this.diagnostics.infeedPrimaryRichGridCount = pcRetry;
        }
        injected = false;
      } else {
        injected = await page.evaluate(runInfeedInjectInPage, {
          surface: injectSurface,
          thumbDataUrl: creativeDataUrl,
          avatarDataUrl,
          showChannelAvatar,
          title,
          description1,
          description2,
          sponsorName,
          ctaPrimary,
          ctaSecondary,
          searchPlacement,
          searchFeedInsertAfterIndex,
        });
      }
      this.diagnostics.injectionSuccess = injected;
    }

    if (!injected && !skipHomeAdInjection) {
      console.warn("[YouTube] 인피드 인젝션 실패 — 빈 피드·레이아웃 변경 가능");
    }

    await new Promise((r) => setTimeout(r, 1200));
    if (adType === "infeed-search" && searchPlacement === "feed") {
      await page.evaluate<void>(`
        (() => {
          const el = document.querySelector('[data-injected="admate-youtube-infeed"]');
          if (el) el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
        })()
      `);
      await new Promise((r) => setTimeout(r, 700));
    } else {
      await page.evaluate<void>(`
        (() => {
          window.scrollTo({ top: 0, behavior: 'instant' });
          document.documentElement.scrollTop = 0;
          document.body.scrollTop = 0;
        })()
      `);
    }
    await this.applyMastheadLoggedInLook(page, mastheadProfileDataUrl);
    await this.applySignedOutPromptSuppression(page);

    this.diagnostics.infeedCaptureUrl = page.url();

    if (adType === "infeed-watch-next") {
      let coverDataUrl = publisherThumbDataUrl || creativeDataUrl;
      const capUrl = this.diagnostics.infeedCaptureUrl || "";
      if (!coverDataUrl && capUrl) {
        const id = extractVideoId(capUrl);
        if (id) {
          const r = await imageUrlToDataUrl(`https://img.youtube.com/vi/${id}/hqdefault.jpg`);
          if (r.ok) coverDataUrl = r.dataUrl;
        }
      }
      if (coverDataUrl) {
        console.log("[YouTube] 인피드 관련동영상: 캡처 직전 인스트림 동일 경로로 썸네일 재적용");
        await this.applyWatchPageBotThumbnailMitigation(page, coverDataUrl);
        await this.pauseVideo(page, { preserveTimeline: true });
        await new Promise((r) => setTimeout(r, 600));
        await this.suppressWatchPageInjectionBlockers(page);
        await this.applyWatchPrimaryPlayerRadiusCss(page);
      }
    }

    const screenshot = await page.screenshot({ fullPage: false, type: "png" });
    if (adType === "infeed-home") {
      const d = this.diagnostics;
      console.log(
        `[YouTube] ===== 인피드 캡처 완료 (${injectSurface}) url=${d?.infeedCaptureUrl ?? ""} ` +
          `feedMode=${d?.infeedHomeFeedMode ?? "-"} primary=${d?.infeedPrimaryRichGridCount ?? "-"} ` +
          `bootstrapBest=${d?.infeedBootstrapBest ?? "-"} injectSkipped=${d?.infeedHomeInjectionSkipped === true} ` +
          `searchWarm=${d?.infeedHomeSearchWarmUsed === true} ` +
          `trendingBrowse=${d?.infeedTrendingGridCount ?? "-"} guest빈홈=${d?.infeedGuestEmptyPrompt ?? "-"} =====`
      );
    } else {
      console.log(
        `[YouTube] ===== 인피드 캡처 완료 (${injectSurface}) url=${this.diagnostics.infeedCaptureUrl ?? ""} =====`
      );
    }
    return screenshot;
  }

  /**
   * 🎬 인스트림 (프리롤) 광고 시뮬레이션
   * 📌 실제 YouTube 인스트림 광고 형태를 정확히 재현:
   *   - 좌상단: 작은 "광고" 라벨
   *   - 좌하단: 카드형 CTA (썸네일 + 상품명 + CTA 버튼 + "스폰서 · URL")
   *   - 우하단: 스킵 가능일 때만 "건너뛰기 ▶|" 버튼
   *   - 하단: 노란색 프로그레스 바
   */
  private async injectPrerollAd(
    page: IPageHandle,
    imgDataUrl: string,
    playerInfo: { found: boolean; width: number; height: number; top: number; left: number },
    instreamOpts: {
      videoUrl?: string;
      adTitle?: string;
      enableCtaText?: boolean;
      ctaText?: string;
      landingUrl?: string;
      displayUrl?: string;
      displayPath1?: string;
      displayPath2?: string;
      skipSeconds?: number;
      companionImageUrl?: string;
      avatarImageUrl?: string;
      progressFillPercent?: number;
      isMobile?: boolean;
      instreamSkipMode?: "skippable" | "non-skippable";
    } = {}
  ): Promise<boolean> {
    const isMobile = instreamOpts.isMobile ?? false;
    console.log(`[YouTube] 🎬 프리롤 광고 인젝션 시작${isMobile ? " (모바일)" : ""}`);

    // 표시 URL 텍스트 구성:
    // 1) 폼의 displayUrl 입력값 우선
    // 2) 없으면 videoUrl 호스트
    // 3) 그래도 없으면 landingUrl 호스트
    let landingDomain = "advertiser.com";
    let displayUrlText = "";
    try {
      if (instreamOpts.displayUrl?.trim()) {
        displayUrlText = instreamOpts.displayUrl.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "").split('/')[0];
      }
      if (instreamOpts.videoUrl) {
        landingDomain = new URL(instreamOpts.videoUrl).hostname.replace(/^www\./i, "");
      } else if (instreamOpts.landingUrl) {
        landingDomain = new URL(instreamOpts.landingUrl).hostname.replace(/^www\./i, "");
      }
    } catch { /* ignore */ }
    if (!displayUrlText) displayUrlText = landingDomain;
    const displayPathSegments = [instreamOpts.displayPath1, instreamOpts.displayPath2]
      .map((v) => (v || "").trim().replace(/^\/+|\/+$/g, ""))
      .filter((v) => v.length > 0);
    if (displayPathSegments.length > 0) {
      displayUrlText = displayUrlText.replace(/\/+$/g, "") + "/" + displayPathSegments.join("/");
    }
    const truncateWithDots = (text: string, limit: number): string => {
      if (!text) return text;
      return text.length > limit ? text.slice(0, limit) + "..." : text;
    };
    // 원본 YouTube 카드/스폰서 영역에서 보이는 URL 길이에 맞춰 수동 절삭(...)
    const displayUrlCard = truncateWithDots(displayUrlText, 28);
    const displayUrlSponsor = truncateWithDots(displayUrlText, 32);

    let adTitle = instreamOpts.adTitle || '광고 제목';
    let currentLineCost = 0;
    let breakIdx = -1;
    for (let i = 0; i < adTitle.length; i++) {
      const char = adTitle[i];
      if (/[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(char)) {
        currentLineCost += 2;
      } else if (char === ' ') {
        currentLineCost += 1;
      } else {
        currentLineCost += 1.14; 
      }
      if (currentLineCost > 26.01) {
        breakIdx = i;
        break;
      }
    }
    if (breakIdx !== -1) {
      adTitle = adTitle.slice(0, breakIdx) + '<br/>' + adTitle.slice(breakIdx);
    }
    const ctaText = instreamOpts.ctaText || '자세히 알아보기';

    const showSkipButton = instreamOpts.instreamSkipMode !== "non-skippable";

    const prerollPayload: PrerollInjectPagePayload = {
      imgUrl: imgDataUrl,
      isMobile,
      avatarImgUrl: instreamOpts.avatarImageUrl || "",
      domainText: displayUrlCard,
      sponsorDomainText: displayUrlSponsor,
      titleText: adTitle,
      enableCtaText: instreamOpts.enableCtaText !== false,
      ctaBtnText: ctaText,
      progressFillPct: Math.min(100, Math.max(0, instreamOpts.progressFillPercent ?? 33)),
      showSkipButton,
      serverPlayerBox:
        playerInfo.found && playerInfo.width > 80 && playerInfo.height > 80
          ? {
              left: playerInfo.left,
              top: playerInfo.top,
              width: playerInfo.width,
              height: playerInfo.height,
            }
          : undefined,
    };
    const result = await page.evaluate(runPrerollInjectInPage, prerollPayload);

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
    options?: { variant?: "sidebar-display" | "companion-300x60"; uiOpts?: any }
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
        const adWidth = isCompanion ? alignW : Math.min(alignW, 336);

        const wrap = document.createElement('div');
        wrap.setAttribute('data-injected', 'admate-youtube-sidebar-ad-wrap');
        
        if (isCompanion) {
          const uiOpts = ${JSON.stringify(options?.uiOpts || {})};
          const rawUrl = uiOpts.displayUrl || uiOpts.landingUrl || '';
          const cleanUrl = rawUrl.replace(/^https?:\\/\\//i, '').replace(/^www\\./i, '').split('/')[0];

          const companionWrapStyles = [
            'width: ' + adWidth + 'px',
            'max-width: 100%',
            'box-sizing: border-box',
            'margin: 0 0 24px 0',
            'display: flex',
            'flex-direction: column',
            'border-radius: 12px',
            'border: 1px solid var(--yt-spec-10-percent-layer, #e5e5e5)',
            'overflow: hidden',
            'cursor: pointer'
          ];
          wrap.style.cssText = companionWrapStyles.join(' !important;') + ' !important';
          
          
          let bottomBarHTML = '';
          if (uiOpts.enableCtaText === false) {
            bottomBarHTML =
              '<div style="padding: 10px 16px; display: flex; align-items: center; justify-content: space-between; background: var(--yt-spec-base-background, #fff); border-radius: 0 0 12px 12px;">' +
                '<span style="font-family: Roboto, Arial, sans-serif; font-size: 1.2rem; font-weight: 500; color: var(--yt-spec-text-primary, #0f0f0f); opacity: 0.8;">스폰서</span>' +
                '<button style="background: none; border: none; padding: 0; margin: 0; cursor: pointer; color: var(--yt-spec-text-primary, #0f0f0f);">' +
                  '<svg height="24" viewBox="0 0 24 24" width="24" focusable="false" style="display: block; width: 24px; height: 24px; fill: currentColor;"><path d="M12 4a2 2 0 100 4 2 2 0 000-4Zm0 6a2 2 0 100 4 2 2 0 000-4Zm0 6a2 2 0 100 4 2 2 0 000-4Z"></path></svg>' +
                '</button>' +
              '</div>';
          } else {
            const avatarHtml = uiOpts.avatarImageUrl
              ? '<img src="' + uiOpts.avatarImageUrl + '" style="width: 100%; height: 100%; object-fit: cover;" />'
              : '';
            const ctaHtml = uiOpts.ctaText
              ? '<a style="display: inline-flex; align-items: center; justify-content: center; padding: 0 16px; height: 36px; border-radius: 18px; background: var(--yt-spec-badge-chip-background, rgba(0,0,0,0.05)); color: var(--yt-spec-text-primary, #0f0f0f); font-family: Roboto, Arial, sans-serif; font-size: 1.4rem; font-weight: 500; text-decoration: none;">' + uiOpts.ctaText + '</a>'
              : '';
            const adTitleText = uiOpts.adTitle || 'AD TITLE';
            bottomBarHTML =
              '<div style="padding: 12px 16px; display: flex; align-items: center; justify-content: space-between; gap: 8px; background: var(--yt-spec-base-background, #fff); border-radius: 0 0 12px 12px;">' +
                '<div style="display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0;">' +
                  '<div style="width: 40px; height: 40px; border-radius: 50%; overflow: hidden; flex-shrink: 0; background: #f0f0f0;">' +
                    avatarHtml +
                  '</div>' +
                  '<div style="display: flex; flex-direction: column; justify-content: center; min-width: 0;">' +
                    '<span style="font-family: Roboto, Arial, sans-serif; font-size: 1.4rem; font-weight: 500; line-height: 2rem; color: var(--yt-spec-text-primary, #0f0f0f); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">' + adTitleText + '</span>' +
                    '<div style="display: flex; align-items: center; gap: 4px; margin-top: 2px;">' +
                      '<span style="font-family: Roboto, Arial, sans-serif; font-size: 1.2rem; font-weight: 700; color: var(--yt-spec-text-primary, #0f0f0f); white-space: nowrap;">스폰서</span>' +
                      '<span style="font-family: Roboto, Arial, sans-serif; font-size: 1.2rem; color: var(--yt-spec-text-secondary, #606060); white-space: nowrap; margin: 0 2px;">·</span>' +
                      '<span style="font-family: Roboto, Arial, sans-serif; font-size: 1.2rem; color: var(--yt-spec-text-secondary, #606060); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">' + cleanUrl + '</span>' +
                    '</div>' +
                  '</div>' +
                '</div>' +
                '<div style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">' +
                  ctaHtml +
                  '<button style="background: none; border: none; padding: 8px; margin-right: -8px; cursor: pointer; color: var(--yt-spec-text-primary, #0f0f0f);">' +
                    '<svg height="24" viewBox="0 0 24 24" width="24" focusable="false" style="display: block; width: 24px; height: 24px; fill: currentColor;"><path d="M12 4a2 2 0 100 4 2 2 0 000-4Zm0 6a2 2 0 100 4 2 2 0 000-4Zm0 6a2 2 0 100 4 2 2 0 000-4Z"></path></svg>' +
                  '</button>' +
                '</div>' +
              '</div>';
          }

          wrap.innerHTML =
            '<div style="width: 100%; height: auto; aspect-ratio: 1060 / 175; overflow: hidden; background: #e5e5e5; display: flex; align-items: stretch; border-radius: 12px 12px 0 0;">' +
              '<img src="' + imgUrl + '" style="width: 100%; height: 100%; object-fit: cover; display: block;" />' +
            '</div>' +
            bottomBarHTML;
        } else {
          const container = document.createElement('div');
          container.setAttribute('data-injected', 'admate-youtube-display');
          const containerStyles = [
            'width: 100% !important',
            'max-width: 100% !important',
            'box-sizing: border-box !important',
            'margin: 0 !important',
            'overflow: hidden !important',
            'background: #fff !important',
            'border: 1px solid #e5e5e5 !important',
            'position: relative !important',
            'border-radius: 12px !important'
          ];
          container.style.cssText = containerStyles.join(';');

          const imgEl = document.createElement('img');
          imgEl.src = imgUrl;
          imgEl.setAttribute('data-injected', 'admate');
          imgEl.style.cssText = [
            'display: block !important',
            'width: 100% !important',
            'height: auto !important',
            'aspect-ratio: 300/250 !important',
            'object-fit: cover !important',
          ].join(';');
          container.appendChild(imgEl);

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
            "<div style=\\"font-size:14px;font-weight:400;color:#0f0f0f;font-family:Roboto,'Arial',sans-serif;line-height:1.4\\">광고주 사이트 방문</div>",
            "<div style=\\"font-size:12px;color:#606060;font-family:Roboto,Arial,sans-serif;margin-top:2px;\\">Ad · Sponsored</div>",
          ].join('');

          footer.appendChild(favicon);
          footer.appendChild(textArea);
          container.appendChild(footer);

          const wrapStyles = [
            'width: ' + adWidth + 'px',
            'max-width: 100%',
            'box-sizing: border-box',
            'margin: 0 0 16px 0',
          ];
          wrap.style.cssText = wrapStyles.join(' !important;') + ' !important';
          wrap.appendChild(container);
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

          // Add 'KR' label to YouTube logo
          const logoRenderer = masthead.querySelector('ytd-topbar-logo-renderer');
          if (logoRenderer) {
            let countryCode = logoRenderer.querySelector('#country-code');
            if (!countryCode) {
              countryCode = document.createElement('span');
              countryCode.id = 'country-code';
            }
            
            // Ensure countryCode is a child of logoRenderer directly
            if (countryCode.parentNode !== logoRenderer) {
              logoRenderer.appendChild(countryCode);
            }

            // Force flex layout to guarantee both logo and KR align vertically to the center
            logoRenderer.style.display = 'flex';
            logoRenderer.style.alignItems = 'center';

            countryCode.textContent = 'KR';
            // Position relative nudges the text upwards from the true vertical center.
            // This completely ignores the 56px container height trap.
            countryCode.className = 'style-scope ytd-topbar-logo-renderer';
            countryCode.style.cssText = 'color: var(--yt-spec-text-secondary, #606060); font-family: Roboto, Arial, sans-serif; font-size: 10px; font-weight: 400; padding: 0; margin: 0; position: relative; top: -7px; left: -10px; line-height: normal; display: inline-block;';
          }

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
            "pointer-events:none",
          ].join(";");
          
          floater.innerHTML = \`
            <div style="position: absolute; right: 100%; top: 50%; transform: translateY(-50%); display: flex; align-items: center; gap: 24px; padding-right: 24px; color: var(--yt-spec-text-primary, #0f0f0f);">
              <div style="display: flex; align-items: center; gap: 6px; background-color: var(--yt-spec-badge-chip-background, rgba(0,0,0,0.05)); padding: 0 15px 0 11px; height: 36px; border-radius: 18px; font-family: Roboto, Arial, sans-serif; font-size: 14px; font-weight: 500; white-space: nowrap; flex-shrink: 0;">
                <svg viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet" focusable="false" style="display: block; width: 24px; height: 24px; fill: currentColor; flex-shrink: 0;">
                  <path d="M19,13h-6v6h-2v-6H5v-2h6V5h2v6h6V13z"></path>
                </svg>
                <span style="white-space: nowrap;">만들기</span>
              </div>
              <div style="width: 40px; height: 40px; display: flex; justify-content: center; align-items: center; position: relative; border-radius: 50%;">
                <svg viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet" focusable="false" style="display: block; width: 24px; height: 24px; fill: currentColor;">
                  <path d="M16 19a4 4 0 11-8 0H4.765C3.21 19 2.25 17.304 3.05 15.97l1.806-3.01A1 1 0 005 12.446V8a7 7 0 0114 0v4.446c0 .181.05.36.142.515l1.807 3.01c.8 1.333-.161 3.029-1.716 3.029H16ZM12 3a5 5 0 00-5 5v4.446a3 3 0 01-.428 1.543L4.765 17h14.468l-1.805-3.01A3 3 0 0117 12.445V8a5 5 0 00-5-5Zm-2 16a2 2 0 104 0h-4Z"></path>
                </svg>
              </div>
            </div>
            <div style="width: 100%; height: 100%; border-radius: 50%; overflow: hidden;">
              <img src="\${dataUrl}" alt="" draggable="false" style="width: 100%; height: 100%; object-fit: cover; display: block;" />
            </div>
          \`;
          
          document.body.appendChild(floater);

          console.log("[YouTube Inject] 👤 마스트헤드 로그인 룩 적용 (숨김 " + hideSet.size + " + 플로터)");
        } catch (e) {
          console.warn("[admate] applyMastheadLoggedInLook", e);
        }
      })()
    `);
  }

  /**
   * 🧹 시청(/watch) 레이아웃에서 인젝션·캡처 전 방해 요소 정리
   * (구독 팝업, 봇/로그인 오버레이, 동의 잔여물 등)
   */
  private async suppressWatchPageInjectionBlockers(page: IPageHandle): Promise<void> {
    await page.evaluate<void>(`
      (() => {
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
          '.ytp-error-content-wrap .ytp-error-content-wrap-reason',
        ];
        playerErrorSelectors.forEach(sel => {
          document.querySelectorAll(sel).forEach(el => {
            el.style.display = 'none !important';
            el.style.visibility = 'hidden !important';
            el.style.opacity = '0 !important';
          });
        });

        const consentSelectors = [
          'ytd-consent-bump-v2-lightbox',
          'tp-yt-iron-overlay-backdrop',
          '#consent-bump',
          '.consent-bump-v2-lightbox',
        ];
        consentSelectors.forEach(sel => {
          document.querySelectorAll(sel).forEach(el => el.remove());
        });

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

        document.body.style.overflow = '';
        document.body.style.position = '';
        document.documentElement.style.overflow = '';

        console.log('[YouTube Cleanup] ✅ 방해 요소 제거 완료');
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

  /** 시청 페이지 메인 플레이어 컨테이너 모서리 라운딩(콘텐츠 영역) */
  private async applyWatchPrimaryPlayerRadiusCss(page: IPageHandle): Promise<void> {
    await page.evaluate<void>(`
      (() => {
        var s = document.getElementById('admate-primary-player-radius');
        if (!s) {
          s = document.createElement('style');
          s.id = 'admate-primary-player-radius';
          document.head.appendChild(s);
        }
        s.textContent =
          '#primary #player,#player-full-bleed-container #player-container,#movie_player,ytd-watch-flexy #primary-inner #player{' +
          'border-radius:12px!important;overflow:hidden!important;}';
      })()
    `);
  }

  /**
   * 인스트림(/watch) 봇 폴백과 동일한 한 사이클: 봇 DOM 제거 → 썸네일 덮음 → 잔여 봇 요소 제거
   * (pauseVideo·suppressWatchPageInjectionBlockers 는 호출부에서 인스트림과 같은 순서로 이어서 호출)
   */
  private async applyWatchPageBotThumbnailMitigation(
    page: IPageHandle,
    thumbnailDataUrl: string
  ): Promise<void> {
    await this.nukeAllBotElements(page);
    await new Promise((r) => setTimeout(r, 500));
    await this.forceReplacePlayerWithThumbnail(page, thumbnailDataUrl);
    await new Promise((r) => setTimeout(r, 1000));
    await this.nukeAllBotElements(page);
  }

  /**
   * 🖼️ 플레이어 영역을 썸네일로 덮음
   * 봇 슬레이트는 z-index 보다 위인 **top layer**(dialog/popover 등)에 그려질 수 있어
   * 우선 `HTMLDialogElement.showModal()` 로 같은 top layer에 올리고, 실패 시 fixed div 폴백
   */
  private async forceReplacePlayerWithThumbnail(page: IPageHandle, thumbnailDataUrl: string): Promise<void> {
    console.log(`[YouTube] 🖼️ 플레이어를 썸네일로 강제 교체 중...`);

    await page.evaluate<void>(`
      ((thumbSrc) => {
        document
          .querySelectorAll('#yt-thumb-overlay, #yt-thumb-overlay-fixed, #admate-bot-cover-dialog')
          .forEach(function (n) {
            n.remove();
          });
        var prevStyle = document.getElementById('admate-dialog-backdrop-style');
        if (prevStyle) prevStyle.remove();

        const anchorCandidates = [
          '#player-full-bleed-container #player-container',
          '#primary-inner #player',
          '#primary #player',
          '#player-wide-container',
          'ytd-watch-flexy #primary ytd-player',
          '#movie_player',
          'ytd-player',
          '#player-container-inner',
          '#player-container-outer',
          '.html5-video-player',
          '#player',
        ];

        var anchor = null;
        var bestArea = 0;
        for (var i = 0; i < anchorCandidates.length; i++) {
          var el = document.querySelector(anchorCandidates[i]);
          if (!el) continue;
          var r = el.getBoundingClientRect();
          var area = r.width * r.height;
          if (r.width > 120 && r.height > 90 && area > bestArea) {
            bestArea = area;
            anchor = el;
          }
        }

        if (!anchor) {
          var videoEl = document.querySelector('video');
          if (videoEl && videoEl.parentElement) {
            var pr = videoEl.parentElement.getBoundingClientRect();
            if (pr.width > 50 && pr.height > 50) anchor = videoEl.parentElement;
          }
        }

        if (!anchor) {
          console.warn('[YouTube] 플레이어 앵커를 찾을 수 없음');
          return;
        }

        var rect = anchor.getBoundingClientRect();
        var top = Math.max(0, Math.round(rect.top));
        var left = Math.max(0, Math.round(rect.left));
        var w = Math.round(rect.width);
        var h = Math.round(rect.height);

        function makeImg() {
          var img = document.createElement('img');
          img.src = thumbSrc;
          img.draggable = false;
          img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;';
          return img;
        }

        function makeProgress() {
          var progressBar = document.createElement('div');
          progressBar.style.cssText =
            'position:absolute;bottom:0;left:0;width:100%;height:4px;background:rgba(255,255,255,0.3);z-index:10000;';
          var progressFill = document.createElement('div');
          progressFill.style.cssText =
            'width:15%;height:100%;background:#ff0000;border-radius:0 2px 2px 0;';
          progressBar.appendChild(progressFill);
          return progressBar;
        }

        var boxStyle = [
          'border:none',
          'outline:none',
          'padding:0',
          'margin:0',
          'background:#000',
          'position:fixed',
          'top:' + top + 'px',
          'left:' + left + 'px',
          'width:' + w + 'px',
          'height:' + h + 'px',
          'max-width:none',
          'max-height:none',
          'box-sizing:border-box',
          'overflow:hidden',
          'border-radius:12px',
          'display:flex',
          'align-items:center',
          'justify-content:center',
          'pointer-events:none',
        ].join(';');

        var usedDialog = false;
        if (typeof HTMLDialogElement !== 'undefined') {
          try {
            var d = document.createElement('dialog');
            d.id = 'admate-bot-cover-dialog';
            d.style.cssText = boxStyle;
            d.appendChild(makeImg());
            d.appendChild(makeProgress());
            document.body.appendChild(d);
            if (typeof d.showModal === 'function') {
              d.showModal();
              var st = document.createElement('style');
              st.id = 'admate-dialog-backdrop-style';
              st.textContent =
                '#admate-bot-cover-dialog::backdrop{background:transparent!important;pointer-events:none!important;}';
              document.head.appendChild(st);
              usedDialog = true;
              console.log('[YouTube] 🖼️ 썸네일 top-layer(dialog) 오버레이 (' + w + 'x' + h + ')');
            } else {
              d.remove();
            }
          } catch (e) {
            usedDialog = false;
            var bad = document.getElementById('admate-bot-cover-dialog');
            if (bad) bad.remove();
            var st2 = document.getElementById('admate-dialog-backdrop-style');
            if (st2) st2.remove();
          }
        }

        if (!usedDialog) {
          var overlay = document.createElement('div');
          overlay.id = 'yt-thumb-overlay';
          overlay.style.cssText =
            boxStyle + ';z-index:2147483646;';
          overlay.appendChild(makeImg());
          overlay.appendChild(makeProgress());
          document.body.appendChild(overlay);
          console.log('[YouTube] 🖼️ 썸네일 fixed 오버레이 폴백 (' + w + 'x' + h + ')');
        }
      })(${JSON.stringify(thumbnailDataUrl)})
    `);

    console.log(`[YouTube] 🖼️ 강제 썸네일 교체 완료`);
  }

  /**
   * 시청 페이지 메인 플레이어(#movie_player / ytd-player) 내부를 Shadow 포함해 훑어
   * 봇·로그인 확인 문구가 있으면 true (body.innerText 만으로는 놓치는 케이스 보완)
   */
  private async checkWatchPagePlayerLoginWall(page: IPageHandle): Promise<boolean> {
    const detected = await page.evaluate<boolean>(() => {
      const needlesKo = ["봇이 아님", "로그인하여", "봇이 아님을 확인"];
      const needlesEn = [
        "not a bot",
        "sign in to confirm",
        "confirm you're not",
        "confirm you are not",
        "verify it's you",
      ];

      function walk(n: Node, acc: string[]): void {
        if (!n) return;
        if (n.nodeType === 3) {
          const t = n.textContent || "";
          if (t.trim()) acc.push(t);
          return;
        }
        if (n.nodeType !== 1) return;
        const el = n as Element;
        const tag = el.tagName.toUpperCase();
        if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT") return;
        const sr = el.shadowRoot;
        if (sr) {
          for (let i = 0; i < sr.childNodes.length; i++) {
            walk(sr.childNodes[i]!, acc);
          }
        }
        for (let i = 0; i < el.childNodes.length; i++) {
          walk(el.childNodes[i]!, acc);
        }
      }

      function collectDeepText(root: Element | null): string {
        if (!root) return "";
        const acc: string[] = [];
        walk(root, acc);
        return acc.join(" ");
      }

      const roots: (Element | null)[] = [
        document.querySelector("#movie_player"),
        document.querySelector("ytd-player"),
        document.querySelector("#player-container-inner"),
        document.querySelector("#player-container-outer"),
      ];

      for (const el of roots) {
        if (!el) continue;
        const hay = collectDeepText(el);
        const low = hay.toLowerCase();
        for (const nd of needlesKo) {
          if (hay.includes(nd)) return true;
        }
        for (const nd of needlesEn) {
          if (low.includes(nd)) return true;
        }
      }

      const errNodes = document.querySelectorAll(
        "yt-player-error-message-renderer, yt-playability-error-supported-renderers, .ytp-error"
      );
      for (let i = 0; i < errNodes.length; i++) {
        const node = errNodes[i] as HTMLElement;
        const t = (node.textContent || "").toLowerCase();
        if (
          t.includes("봇") ||
          t.includes("bot") ||
          t.includes("sign in") ||
          t.includes("로그인") ||
          t.includes("confirm")
        ) {
          const rect = node.getBoundingClientRect?.();
          if (rect && rect.width > 2 && rect.height > 2) return true;
        }
      }

      return false;
    });

    if (detected) {
      console.log("[YouTube] 🤖 시청 플레이어(Shadow 포함) 봇/로그인 벽 감지");
    }
    return detected;
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



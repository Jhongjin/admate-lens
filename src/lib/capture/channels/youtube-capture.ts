/**
 * YouTube Capture v1 — YouTube 광고 캡처 모듈
 *
 * 지원 광고 유형:
 * 1. 인스트림 (프리롤) — 영상 플레이어에 프리롤 광고 시뮬레이션
 * 2. 범퍼 — 6초 이하 non-skippable 인스트림 프리셋
 * 3. 디스플레이 — 사이드바 컴패니언 배너 영역에 인젝션(레거시)
 * 4. 오버레이 — 영상 플레이어 하단 반투명 오버레이 배너(레거시)
 * 5. 인피드 — 홈 피드 / 검색 결과 / 관련동영상(시청 사이드바) 카드 시뮬레이션
 */

import { randomInt } from "node:crypto";
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
import { generateMobileSyntheticInfeedHomeHtml } from "./mobile-synthetic-infeed";
import { generateYouTubeShortsSyntheticHtml } from "./youtube-shorts-synthetic";
import { generateYouTubeMastheadSyntheticHtml } from "./youtube-masthead-synthetic";
import {
  isExecutableYouTubeAdType,
  type ExecutableYouTubeAdType,
} from "../youtube-ad-types";

/** YouTube 광고 유형 */
export type YouTubeAdType = ExecutableYouTubeAdType;

function isInfeedAdType(t: YouTubeAdType): t is "infeed-home" | "mobile-infeed-home" | "infeed-search" | "infeed-watch-next" {
  return t === "infeed-home" || t === "mobile-infeed-home" || t === "infeed-search" || t === "infeed-watch-next";
}

function infeedSurfaceFromAdType(t: YouTubeAdType): InfeedSurface | null {
  if (t === "infeed-home" || t === "mobile-infeed-home") return "home";
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
  /** 인피드 홈: 유기 피드 대신 oEmbed+썸네일 합성 그리드를 사용함 */
  infeedHomeSyntheticFeed?: boolean;
  /** 합성 피드 메타 출처: `youtube-data-api` | `youtube-data-api+search` | `youtube-data-api-search` | `invidious` | `youtube-web-scrape` | `oembed-fallback` */
  infeedHomeSyntheticSource?: string;
  /** 인스트림/범퍼: 플레이어 내부 광고 UI 마커 검증 */
  instreamUiChecks?: {
    overlay: boolean;
    sponsorCard: boolean;
    sponsorText: boolean;
    skipButton: boolean;
    expectedSkipButton: boolean;
    blockingCover: boolean;
    isMobile: boolean;
  };
  /** 인스트림 PC: 원본 watch 페이지 본문/추천 영역이 비면 합성 컨텍스트로 보강 */
  watchContextChecks?: {
    hadTitle: boolean;
    hadSidebar: boolean;
    injectedBelow: boolean;
    injectedSidebar: boolean;
  };
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

/** 인피드 홈: API·Invidious 모두 실패 시에만 쓰는 공개 영상 ID (공식 MV 위주, oEmbed로 실채널명 확보) */
const INFEED_HOME_SYNTHETIC_FALLBACK_IDS: string[] = [
  "gdZLi9oWNZg",
  "IHNzOHi8sJs",
  "Amq-qlqbjYA",
  "ysz5S6PUM-U",
  "7C2zAIQfWkU",
  "RcCsG7AFxZ8",
  "pSUydWEqKwE",
  "67yxoKs30Oo",
];

export type SyntheticInfeedHomeItem = {
  id: string;
  title: string;
  channel: string;
  /** 예: `조회수 123만회` — 없으면 합성 그리드에서 id 기반 플레이스홀더 */
  viewText?: string;
  /** Data API `channels.list` 로 채움 — 있으면 롱폼 카드에 원형 채널 로고 표시 */
  channelThumbUrl?: string;
  /** HTML 파싱에서 reelWatchEndpoint로 감지된 쇼츠 플래그 */
  isShort?: boolean;
  /** 검색/스크랩 시 원본에서 가져온 정확한 썸네일 URL */
  thumbUrl?: string;
};

function formatKrViewCount(raw: string | number): string {
  const n =
    typeof raw === "string"
      ? parseInt(String(raw).replace(/\D/g, ""), 10)
      : Math.floor(raw);
  if (!Number.isFinite(n) || n < 0) return "";
  if (n >= 100_000_000) return `조회수 ${(n / 100_000_000).toFixed(1)}억회`;
  if (n >= 10_000) return `조회수 ${(n / 10_000).toFixed(1)}만회`;
  if (n >= 1_000) return `조회수 ${(n / 1_000).toFixed(1)}천회`;
  return `조회수 ${n}회`;
}

/** 합성 인피드 홈: 캡처마다 카드 순서를 섞음 (`YOUTUBE_INFEED_SYNTHETIC_SHUFFLE=0|false` 로 끔) */
function isSyntheticInfeedShuffleEnabled(): boolean {
  const v = (process.env.YOUTUBE_INFEED_SYNTHETIC_SHUFFLE ?? "").trim().toLowerCase();
  if (v === "0" || v === "false" || v === "off" || v === "no") return false;
  return true;
}

/** 데스크톱 캡처 DPR(기본 2). 품질 저하 시 2~3 권장 */
function getDesktopCaptureDpr(): number {
  const raw = Number(process.env.YOUTUBE_CAPTURE_DEVICE_SCALE_FACTOR ?? "2");
  if (!Number.isFinite(raw)) return 2;
  return Math.max(1, Math.min(2, Math.round(raw)));
}

function shuffleArrayCopy<T>(items: readonly T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    const t = a[i]!;
    a[i] = a[j]!;
    a[j] = t;
  }
  return a;
}

/** 동일 videoId는 앞 배열(인기 차트 등) 메타를 유지 */
function mergeSyntheticByIdPreferFirst(
  primary: SyntheticInfeedHomeItem[],
  secondary: SyntheticInfeedHomeItem[]
): SyntheticInfeedHomeItem[] {
  const map = new Map<string, SyntheticInfeedHomeItem>();
  for (const r of primary) map.set(r.id, r);
  for (const r of secondary) {
    if (!map.has(r.id)) map.set(r.id, r);
  }
  return [...map.values()];
}

function dedupeSyntheticByIdPreserveOrder(items: readonly SyntheticInfeedHomeItem[]): SyntheticInfeedHomeItem[] {
  const seen = new Set<string>();
  const out: SyntheticInfeedHomeItem[] = [];
  for (const r of items) {
    if (!r.id || seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
}

/** 풀이 클 때 캡처마다 다른 부분집합을 쓰기 위한 연속 구간 무작위 추출 */
function takeRandomContiguousWindow<T>(arr: readonly T[], windowSize: number): T[] {
  if (arr.length <= windowSize) return [...arr];
  const w = Math.min(windowSize, arr.length);
  const start = randomInt(arr.length - w + 1);
  return arr.slice(start, start + w);
}

/** YouTube Data API `contentDetails.duration` (ISO 8601, 예: PT1M33S) */
function parseYoutubeIsoDurationSeconds(iso: string | undefined): number | null {
  if (!iso || typeof iso !== "string") return null;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return null;
  const h = parseInt(m[1] || "0", 10) || 0;
  const min = parseInt(m[2] || "0", 10) || 0;
  const s = parseInt(m[3] || "0", 10) || 0;
  const total = h * 3600 + min * 60 + s;
  return total > 0 ? total : null;
}

/** 합성 홈: 롱폼만 4열 그리드 (쇼츠 제거 — 네이티브 YT 홈과 동일) */
type SyntheticInfeedHomeGridPayload = {
  longTop: SyntheticInfeedHomeItem[];
  shortsMid: SyntheticInfeedHomeItem[]; // 하위 호환: 항상 빈 배열
  longBottom: SyntheticInfeedHomeItem[];
};

/** `search.list` 보강·차트 폴백 (`YOUTUBE_INFEED_SYNTHETIC_SEARCH_ENRICH=0` 로 끔, search 할당량 절약) */
function isSyntheticSearchEnrichEnabled(): boolean {
  const v = (process.env.YOUTUBE_INFEED_SYNTHETIC_SEARCH_ENRICH ?? "").trim().toLowerCase();
  if (v === "0" || v === "false" || v === "off" || v === "no") return false;
  return true;
}

const INVIDIOUS_TRENDING_HOSTS: string[] = [
  "https://inv.tux.pizza",
  "https://vid.puffyan.us",
  "https://invidious.protokolla.fi",
  "https://inv.nadeko.net",
];

export class YouTubeCapture extends BaseChannel {
  private diagnostics: YouTubeDiagnostics | null = null;

  getDiagnostics(): YouTubeDiagnostics | null {
    return this.diagnostics;
  }

  async captureAdPlacement(page: IPageHandle, request: CaptureRequest): Promise<Buffer> {
    const rawAdType = request.options?.youtubeAdType;
    const adType = typeof rawAdType === "string" && rawAdType.trim()
      ? rawAdType.trim()
      : "preroll";
    if (!isExecutableYouTubeAdType(adType)) {
      throw new Error(`지원하지 않는 YouTube 광고 유형입니다: ${String(rawAdType ?? "")}`);
    }
    if (adType === "shorts-feed") {
      return this.captureShortsFeedPlacement(page, request);
    }
    if (adType === "masthead-home") {
      return this.captureMastheadHomePlacement(page, request);
    }
    if (isInfeedAdType(adType)) {
      return this.captureInfeedPlacement(page, request, adType);
    }
    console.log(`[YouTube] ===== 캡처 시작 =====`);
    console.log(`[YouTube] 영상 URL: ${request.publisherUrl}`);
    console.log(`[YouTube] 광고 유형: ${adType}`);
    const rawInstreamOpts = (request.options?.instreamOpts as InstreamOptsPayload | undefined) ?? {};
    const isBumperAd =
      adType === "bumper" ||
      adType === "mobile-bumper-aos" ||
      adType === "mobile-bumper-ios";
    const instreamOpts = isBumperAd
      ? {
          ...rawInstreamOpts,
          instreamSkipMode: "non-skippable" as const,
          skipSeconds: Math.max(
            0,
            Math.min(
              5,
              Number.isFinite(Number(rawInstreamOpts.skipSeconds))
                ? Number(rawInstreamOpts.skipSeconds)
                : 3,
            ),
          ),
        }
      : rawInstreamOpts;

    // 모바일 여부 판정
    const isMobilePlatform =
      adType === "mobile-preroll-aos" ||
      adType === "mobile-preroll-ios" ||
      adType === "mobile-bumper-aos" ||
      adType === "mobile-bumper-ios";
    const isAOS = adType === "mobile-preroll-aos" || adType === "mobile-bumper-aos";
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
      await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: getDesktopCaptureDpr() });
    }


    // preroll 계열(인스트림)은 PC/모바일 통일 로직
    const isPrerollFamily = adType === "preroll" || adType === "bumper" || isMobilePlatform;
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
    const publisherVideoId = extractVideoId(request.publisherUrl);
    const videoId =
      isPrerollFamily
        ? prerollAdVideoId ||
          (instreamOpts.videoUrl ? extractVideoId(instreamOpts.videoUrl) : null) ||
          publisherVideoId
        : publisherVideoId;
    const publisherWatchMeta =
      isPrerollFamily && publisherVideoId
        ? await this.fetchYoutubeOembedMeta(publisherVideoId)
        : { title: "", author: "" };
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
    if (isPrerollFamily && !isMobilePlatform) {
      const watchContextChecks = await this.ensureDesktopWatchContext(page, playerInfo, {
        title: publisherWatchMeta.title,
        author: publisherWatchMeta.author,
        videoId: publisherVideoId || "",
      });
      if (this.diagnostics) {
        this.diagnostics.watchContextChecks = watchContextChecks;
      }
      if (watchContextChecks.injectedBelow || watchContextChecks.injectedSidebar) {
        console.log(
          `[YouTube] watch 컨텍스트 보강: below=${watchContextChecks.injectedBelow ? "✅" : "native"} sidebar=${watchContextChecks.injectedSidebar ? "✅" : "native"}`
        );
      }
    }

    // 7) 광고 유형별 인젝션
    let injectionSuccess = false;

    switch (adType) {
      case "preroll":
      case "bumper":
      case "mobile-preroll-aos":
      case "mobile-preroll-ios":
      case "mobile-bumper-aos":
      case "mobile-bumper-ios": {
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
          const expectedSkipButton = prerollUiOpts.instreamSkipMode !== "non-skippable";
          const instreamUiChecks = await page.evaluate<YouTubeDiagnostics["instreamUiChecks"]>(`
            (() => ({
              overlay: !!document.querySelector("#admate-preroll-overlay"),
              sponsorCard: !!document.querySelector("#admate-preroll-sponsored-card, #admate-preroll-lower-stack, #admate-mobile-preroll-cta-bar"),
              sponsorText: !!document.querySelector("#admate-preroll-sponsor, [data-injected='admate-ytp-ad-badge'], #admate-mobile-preroll-cta-bar"),
              skipButton: !!document.querySelector("#admate-skip-btn"),
              expectedSkipButton: ${JSON.stringify(expectedSkipButton)},
              blockingCover: !!document.querySelector("#admate-bot-cover-dialog, #yt-thumb-overlay, #yt-thumb-overlay-fixed"),
              isMobile: ${JSON.stringify(isMobilePlatform)}
            }))()
          `);
          if (this.diagnostics) {
            this.diagnostics.instreamUiChecks = instreamUiChecks;
          }
          console.log(
            `[YouTube] 인스트림 UI 검증: overlay=${instreamUiChecks?.overlay ? "✅" : "❌"} sponsorCard=${instreamUiChecks?.sponsorCard ? "✅" : "❌"} skipButton=${instreamUiChecks?.skipButton ? "✅" : "❌"} expectedSkip=${expectedSkipButton ? "yes" : "no"} blockingCover=${instreamUiChecks?.blockingCover ? "⚠️" : "clear"}`
          );
          if (expectedSkipButton && !instreamUiChecks?.skipButton) {
            console.warn("[YouTube] ⚠️ 스킵 가능 인스트림인데 건너뛰기 버튼 마커가 없습니다.");
          }
          if (!expectedSkipButton && instreamUiChecks?.skipButton) {
            console.warn("[YouTube] ⚠️ 논스킵/범퍼인데 건너뛰기 버튼이 표시되었습니다.");
          }
          if (instreamUiChecks?.blockingCover) {
            console.warn("[YouTube] ⚠️ 프리롤 위를 가리는 bot-cover/top-layer 잔여물이 있습니다.");
          }
        }
        break;
      }
    }

    this.diagnostics.injectionSuccess = injectionSuccess;

    if (!injectionSuccess) {
      console.warn(`[YouTube] ⚠️ 기본 인젝션 실패 — 폴백: 프리롤 강제 오버레이`);
      await this.injectPrerollAd(page, prerollOverlayImageUrl, playerInfo, {
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
      if (primaryEl) {
        const synth = primaryEl.querySelectorAll("[data-admate-synthetic-feed-card]").length;
        primaryRichGridCount = Math.max(primaryRichGridCount, synth);
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
        if (primary) {
          const synth = primary.querySelectorAll("[data-admate-synthetic-feed-card]").length;
          m = Math.max(m, synth);
        }
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

  private async fetchYoutubeOembedMeta(videoId: string): Promise<{ title: string; author: string }> {
    if (!/^[a-zA-Z0-9_-]{6,15}$/.test(videoId)) return { title: "", author: "" };
    try {
      const watch = `https://www.youtube.com/watch?v=${videoId}`;
      const url = `https://www.youtube.com/oembed?url=${encodeURIComponent(watch)}&format=json`;
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), 5000);
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: ac.signal,
      });
      clearTimeout(t);
      if (!res.ok) return { title: "", author: "" };
      const j = (await res.json()) as { title?: string; author_name?: string };
      return {
        title: (j.title || "").trim().slice(0, 120),
        author: (j.author_name || "").trim().slice(0, 100),
      };
    } catch {
      return { title: "", author: "" };
    }
  }

  /** YouTube Data API v3 `videos.list` chart=mostPopular (키 없으면 빈 배열) */
  private async fetchMostPopularFromYoutubeDataApi(
    region: string,
    max: number
  ): Promise<SyntheticInfeedHomeItem[]> {
    const key = process.env.YOUTUBE_DATA_API_KEY?.trim();
    if (!key) return [];
    const regionCode = region.slice(0, 2).toUpperCase() || "KR";
    try {
      const u = new URL("https://www.googleapis.com/youtube/v3/videos");
      u.searchParams.set("part", "snippet,statistics");
      u.searchParams.set("chart", "mostPopular");
      u.searchParams.set("regionCode", regionCode);
      const pool = Math.min(50, Math.max(max, 28));
      u.searchParams.set("maxResults", String(pool));
      u.searchParams.set("key", key);
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), 10_000);
      const res = await fetch(u.toString(), {
        headers: { Accept: "application/json" },
        signal: ac.signal,
      });
      clearTimeout(t);
      const rawText = await res.text();
      let j: {
        items?: Array<{
          id?: string;
          snippet?: { title?: string; channelTitle?: string };
          statistics?: { viewCount?: string };
        }>;
        error?: { message?: string; code?: number; errors?: Array<{ reason?: string }> };
      };
      try {
        j = JSON.parse(rawText) as typeof j;
      } catch {
        console.warn(
          `[YouTube] 합성 그리드: Data API 응답 JSON 파싱 실패 (HTTP ${res.status}, region=${regionCode})`
        );
        return [];
      }
      if (!res.ok) {
        const msg = j.error?.message || rawText.slice(0, 200);
        console.warn(
          `[YouTube] 합성 그리드: Data API videos.list 실패 HTTP ${res.status} region=${regionCode} — ${msg}`
        );
        return [];
      }
      const out: SyntheticInfeedHomeItem[] = [];
      for (const it of j.items || []) {
        const id = it.id;
        if (!id || !/^[a-zA-Z0-9_-]{6,15}$/.test(id)) continue;
        const vc = it.statistics?.viewCount;
        out.push({
          id,
          title: (it.snippet?.title || "동영상").slice(0, 120),
          channel: (it.snippet?.channelTitle || "").slice(0, 100),
          viewText: vc ? formatKrViewCount(vc) : "",
        });
        if (out.length >= pool) break;
      }
      if (out.length === 0 && (j.items === undefined || j.items.length === 0)) {
        console.warn(
          `[YouTube] 합성 그리드: Data API 정상 응답이나 items 비어 있음 (region=${regionCode}, pool=${pool}) — 키·API 활성화·할당량 확인`
        );
      } else if (out.length > 0) {
        console.log(
          `[YouTube] 합성 그리드: Data API 인기 차트 ${out.length}건 (region=${regionCode}, maxResults=${pool})`
        );
      }
      return out;
    } catch (e) {
      console.warn(`[YouTube] 합성 그리드: Data API 요청 예외 (region=${regionCode})`, e);
      return [];
    }
  }

  /**
   * Data API `search.list` — 인기 차트와 다른 롱폼 후보(뉴스·예능 등)를 섞을 때 사용.
   * (할당량: search.list 1회 ≈ videos.list 대비 높음 — `YOUTUBE_INFEED_SYNTHETIC_SEARCH_ENRICH` 로 끌 수 있음)
   */
  private async fetchKrVideosFromYoutubeSearchApi(
    region: string,
    query: string,
    maxResults: number,
    opts?: {
      publishedAfter?: string;
      order?: "date" | "rating" | "relevance" | "title" | "videoCount" | "viewCount";
      videoDuration?: "any" | "long" | "medium" | "short";
    }
  ): Promise<SyntheticInfeedHomeItem[]> {
    const key = process.env.YOUTUBE_DATA_API_KEY?.trim();
    if (!key || !query.trim()) return [];
    const regionCode = region.slice(0, 2).toUpperCase() || "KR";
    const relLang = regionCode === "KR" ? "ko" : regionCode === "JP" ? "ja" : "en";
    try {
      const u = new URL("https://www.googleapis.com/youtube/v3/search");
      u.searchParams.set("part", "snippet");
      u.searchParams.set("type", "video");
      u.searchParams.set("maxResults", String(Math.min(25, Math.max(1, maxResults))));
      u.searchParams.set("q", query.trim().slice(0, 80));
      u.searchParams.set("regionCode", regionCode);
      u.searchParams.set("relevanceLanguage", relLang);
      if (opts?.publishedAfter) u.searchParams.set("publishedAfter", opts.publishedAfter);
      if (opts?.order) u.searchParams.set("order", opts.order);
      if (opts?.videoDuration) u.searchParams.set("videoDuration", opts.videoDuration);
      u.searchParams.set("key", key);
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), 10_000);
      const res = await fetch(u.toString(), {
        headers: { Accept: "application/json" },
        signal: ac.signal,
      });
      clearTimeout(t);
      const rawText = await res.text();
      let j: {
        items?: Array<{
          id?: { kind?: string; videoId?: string };
          snippet?: { title?: string; channelTitle?: string };
        }>;
        error?: { message?: string };
      };
      try {
        j = JSON.parse(rawText) as typeof j;
      } catch {
        console.warn(`[YouTube] 합성 그리드: search.list JSON 파싱 실패 HTTP ${res.status}`);
        return [];
      }
      if (!res.ok) {
        console.warn(
          `[YouTube] 합성 그리드: search.list 실패 HTTP ${res.status} — ${j.error?.message || rawText.slice(0, 160)}`
        );
        return [];
      }
      const out: SyntheticInfeedHomeItem[] = [];
      for (const it of j.items || []) {
        const vid = it.id?.videoId;
        if (!vid || !/^[a-zA-Z0-9_-]{6,15}$/.test(vid)) continue;
        if (it.id?.kind && it.id.kind !== "youtube#video") continue;
        out.push({
          id: vid,
          title: (it.snippet?.title || "동영상").slice(0, 120),
          channel: (it.snippet?.channelTitle || "").slice(0, 100),
          viewText: "",
        });
        if (out.length >= maxResults) break;
      }
      if (out.length > 0) {
        console.log(
          `[YouTube] 합성 그리드: search.list ${out.length}건 (region=${regionCode}, q=${query.trim().slice(0, 40)})`
        );
      }
      return out;
    } catch (e) {
      console.warn(`[YouTube] 합성 그리드: search.list 예외 (region=${regionCode})`, e);
      return [];
    }
  }

  /** 여러 검색어로 최소 `minUnique` 개까지 모음 (중복 제거) */
  private async collectSyntheticItemsFromSearchQueries(
    region: string,
    minUnique: number,
    cap: number
  ): Promise<SyntheticInfeedHomeItem[]> {
    const rc = region.slice(0, 2).toUpperCase() || "KR";
    const queries =
      rc === "KR"
        ? [
            "KBS 뉴스",
            "예능 하이라이트",
            "한국 음악",
            "스포츠 하이라이트",
            "MBC 예능",
            "요리 레시피",
            "드라마 하이라이트",
            "SBS 뉴스",
          ]
        : [
            "trending news",
            "official music video",
            "sports highlights",
            "movie trailer",
          ];
    const seen = new Set<string>();
    const out: SyntheticInfeedHomeItem[] = [];
    for (const q of shuffleArrayCopy(queries)) {
      const chunk = await this.fetchKrVideosFromYoutubeSearchApi(region, q, 15, { videoDuration: "medium" });
      for (const r of chunk) {
        if (seen.has(r.id)) continue;
        seen.add(r.id);
        out.push(r);
        if (out.length >= cap) return out;
      }
      if (out.length >= minUnique) break;
    }
    return out;
  }

  /** `videos.list` contentDetails — 합성 홈에서 롱폼/쇼츠 구분용 */
  private async fetchVideoContentDetailsDurations(videoIds: string[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    const key = process.env.YOUTUBE_DATA_API_KEY?.trim();
    if (!key || videoIds.length === 0) return out;
    const valid = [...new Set(videoIds.filter((id) => /^[a-zA-Z0-9_-]{6,15}$/.test(id)))];
    for (let i = 0; i < valid.length; i += 50) {
      const chunk = valid.slice(i, i + 50);
      try {
        const u = new URL("https://www.googleapis.com/youtube/v3/videos");
        u.searchParams.set("part", "contentDetails");
        u.searchParams.set("id", chunk.join(","));
        u.searchParams.set("key", key);
        const ac = new AbortController();
        const t = setTimeout(() => ac.abort(), 10_000);
        const res = await fetch(u.toString(), {
          headers: { Accept: "application/json" },
          signal: ac.signal,
        });
        clearTimeout(t);
        const rawText = await res.text();
        let j: {
          items?: Array<{ id?: string; contentDetails?: { duration?: string } }>;
        };
        try {
          j = JSON.parse(rawText) as typeof j;
        } catch {
          continue;
        }
        if (!res.ok) continue;
        for (const it of j.items || []) {
          const id = it.id;
          const sec = parseYoutubeIsoDurationSeconds(it.contentDetails?.duration);
          if (id && sec != null) out.set(id, sec);
        }
      } catch {
        continue;
      }
    }
    return out;
  }

  private async fetchVideoIdToChannelIdMap(videoIds: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const key = process.env.YOUTUBE_DATA_API_KEY?.trim();
    if (!key || videoIds.length === 0) return out;
    const valid = [...new Set(videoIds.filter((id) => /^[a-zA-Z0-9_-]{6,15}$/.test(id)))];
    for (let i = 0; i < valid.length; i += 50) {
      const chunk = valid.slice(i, i + 50);
      try {
        const u = new URL("https://www.googleapis.com/youtube/v3/videos");
        u.searchParams.set("part", "snippet");
        u.searchParams.set("id", chunk.join(","));
        u.searchParams.set("key", key);
        const ac = new AbortController();
        const t = setTimeout(() => ac.abort(), 10_000);
        const res = await fetch(u.toString(), {
          headers: { Accept: "application/json" },
          signal: ac.signal,
        });
        clearTimeout(t);
        const rawText = await res.text();
        let j: {
          items?: Array<{ id?: string; snippet?: { channelId?: string } }>;
        };
        try {
          j = JSON.parse(rawText) as typeof j;
        } catch {
          continue;
        }
        if (!res.ok) continue;
        for (const it of j.items || []) {
          const vid = it.id;
          const cid = it.snippet?.channelId;
          if (vid && cid && typeof cid === "string" && cid.length >= 10) out.set(vid, cid);
        }
      } catch {
        continue;
      }
    }
    return out;
  }

  private async fetchChannelIdToDefaultThumbUrl(channelIds: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const key = process.env.YOUTUBE_DATA_API_KEY?.trim();
    if (!key || channelIds.length === 0) return out;
    const uniq = [...new Set(channelIds.filter((c) => typeof c === "string" && c.length >= 10))];
    for (let i = 0; i < uniq.length; i += 50) {
      const chunk = uniq.slice(i, i + 50);
      try {
        const u = new URL("https://www.googleapis.com/youtube/v3/channels");
        u.searchParams.set("part", "snippet");
        u.searchParams.set("id", chunk.join(","));
        u.searchParams.set("key", key);
        const ac = new AbortController();
        const t = setTimeout(() => ac.abort(), 10_000);
        const res = await fetch(u.toString(), {
          headers: { Accept: "application/json" },
          signal: ac.signal,
        });
        clearTimeout(t);
        const rawText = await res.text();
        let j: {
          items?: Array<{
            id?: string;
            snippet?: { thumbnails?: { medium?: { url?: string }; default?: { url?: string } } };
          }>;
        };
        try {
          j = JSON.parse(rawText) as typeof j;
        } catch {
          continue;
        }
        if (!res.ok) continue;
        for (const it of j.items || []) {
          const id = it.id;
          const url =
            it.snippet?.thumbnails?.medium?.url || it.snippet?.thumbnails?.default?.url || "";
          if (id && url && /^https:\/\//i.test(url)) out.set(id, url);
        }
      } catch {
        continue;
      }
    }
    return out;
  }

  /** 첫·하단 롱폼 행 카드에 채널 원형 로고 URL 주입 */
  private async enrichSyntheticLongformChannelAvatars(
    items: SyntheticInfeedHomeItem[]
  ): Promise<void> {
    if (items.length === 0) return;
    const key = process.env.YOUTUBE_DATA_API_KEY?.trim();
    // 1) Data API 경로 (키 있을 때)
    if (key) {
      const ids = [...new Set(items.map((x) => x.id).filter((id) => /^[a-zA-Z0-9_-]{6,15}$/.test(id)))];
      if (ids.length > 0) {
        const vidToCh = await this.fetchVideoIdToChannelIdMap(ids);
        const chIds = [...new Set([...vidToCh.values()])];
        const chToUrl = await this.fetchChannelIdToDefaultThumbUrl(chIds);
        let n = 0;
        for (const it of items) {
          const ch = vidToCh.get(it.id);
          const url = ch ? chToUrl.get(ch) : undefined;
          if (url) { it.channelThumbUrl = url; n++; }
        }
        if (n > 0) {
          console.log(`[YouTube] 합성 롱폼: 채널 로고 URL ${n}/${items.length}건 (Data API)`);
          return;
        }
      }
    }
    // 2) 폴백: YouTube 영상 페이지 HTML에서 채널 아바타 추출 (API 키 불필요)
    let n = 0;
    for (const it of items) {
      if (it.channelThumbUrl) continue;
      try {
        const thumbUrl = await this.fetchChannelAvatarFromVideoPage(it.id);
        if (thumbUrl) { it.channelThumbUrl = thumbUrl; n++; }
      } catch { /* skip */ }
    }
    if (n > 0) {
      console.log(`[YouTube] 합성 롱폼: 채널 로고 URL ${n}/${items.length}건 (HTML 스크랩)`);
    }
  }

  /** YouTube 영상 watch 페이지 HTML에서 채널 아바타 URL 추출 */
  private async fetchChannelAvatarFromVideoPage(videoId: string): Promise<string | null> {
    if (!/^[a-zA-Z0-9_-]{6,15}$/.test(videoId)) return null;
    try {
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), 6000);
      const res = await fetch(`https://www.youtube.com/watch?v=${videoId}&hl=ko`, {
        headers: {
          Accept: "text/html",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        },
        signal: ac.signal,
      });
      clearTimeout(t);
      if (!res.ok) return null;
      const html = await res.text();
      // ytInitialData에서 channelThumbnail 추출
      const patterns = [
        /"channelThumbnail":\s*\{"thumbnails":\[\{"url":"(https:\/\/yt3[^"]+)"/,
        /"avatar":\s*\{"thumbnails":\[\{"url":"(https:\/\/yt3[^"]+)"/,
        /"ownerProfileUrl"[^}]*"thumbnail":\s*\{"thumbnails":\[\{"url":"(https:\/\/yt3[^"]+)"/,
      ];
      for (const pat of patterns) {
        const m = html.match(pat);
        if (m?.[1]) return m[1].replace(/s\d+-c-k/g, "s88-c-k");
      }
      return null;
    } catch {
      return null;
    }
  }

  /**
   * 합성 풀을 롱폼(16:9)·쇼츠(9:16)로 나눈 뒤 무작위 샘플링.
   * — 제목 `#shorts`·재생길이(키 있을 때)·쇼츠 검색 보강으로 슬롯 혼선 완화
   * — 풀이 크면 연속 구간+셔플로 캡처마다 다른 ID 조합
   */
  private async partitionAndSampleSyntheticHomeGrid(
    poolIn: SyntheticInfeedHomeItem[],
    region: string
  ): Promise<SyntheticInfeedHomeGridPayload> {
    const poolCapWindow = 52;
    let pool = dedupeSyntheticByIdPreserveOrder(poolIn);
    if (pool.length > poolCapWindow) {
      pool = takeRandomContiguousWindow(pool, poolCapWindow);
    }
    pool = shuffleArrayCopy(pool);

    const hasKey = Boolean(process.env.YOUTUBE_DATA_API_KEY?.trim());
    const searchOk = hasKey && isSyntheticSearchEnrichEnabled();
    const rc = region.slice(0, 2).toUpperCase() || "KR";
    const ids = pool.map((p) => p.id);
    const durations = hasKey ? await this.fetchVideoContentDetailsDurations(ids) : new Map<string, number>();

    // 쇼츠 필터 — 쇼츠를 제외하고 롱폼만 사용
    const isLikelyShort = (it: SyntheticInfeedHomeItem): boolean => {
      if (it.isShort === true) return true;
      if (/#shorts?\b/i.test(it.title)) return true;
      if (/(?:^|\s|#|\[)(쇼츠|숏|shorts?)(?:\s|$|\])/i.test(it.title) && !/(풀|full|롱폼|full\s*ep)/i.test(it.title)) return true;
      if (/(쇼츠|short[s]?)\s*$/i.test(it.title)) return true;
      const d = durations.get(it.id);
      if (d != null && d > 0 && d <= 120) return true;
      if (d != null && d > 120 && d <= 180 && /쇼츠|shorts|#short/i.test(it.title)) return true;
      return false;
    };

    let longPool = pool.filter((it) => !isLikelyShort(it));

    // 롱폼이 부족하면 API 검색으로 보강
    if (longPool.length < 12 && searchOk) {
      const q =
        rc === "KR"
          ? ["예능 풀영상", "KBS 뉴스", "다큐멘터리", "스포츠 단독중계"][randomInt(0, 4)]!
          : "documentary";
      const extra = await this.fetchKrVideosFromYoutubeSearchApi(region, q, 24, {
        publishedAfter: new Date(Date.now() - randomInt(6, 120) * 3600 * 1000).toISOString(),
        order: (["date", "relevance", "viewCount"] as const)[randomInt(0, 3)]!,
        videoDuration: "medium",
      });
      for (const x of extra) {
        if (isLikelyShort(x)) continue;
        if (!longPool.some((s) => s.id === x.id)) longPool.push(x);
      }
    }

    if (searchOk) {
      const longQ =
        rc === "KR"
          ? ["예능 풀영상", "뉴스 속보", "스포츠 하이라이트", "음악 프로그램", "다큐멘터리 스페셜", "영화 리뷰"][randomInt(0, 6)]!
          : "documentary";
      const extraLong = await this.fetchKrVideosFromYoutubeSearchApi(region, longQ, 25, {
        publishedAfter: new Date(Date.now() - randomInt(4, 96) * 3600 * 1000).toISOString(),
        order: (["date", "relevance"] as const)[randomInt(0, 2)]!,
        videoDuration: "medium",
      });
      for (const x of extraLong) {
        if (isLikelyShort(x)) continue;
        if (!longPool.some((p) => p.id === x.id)) longPool.push(x);
      }
    }

    // 롱폼을 상단 4개 + 하단 8개로 분배 (총 12개, 4열 × 3행)
    const longMix = shuffleArrayCopy(longPool);
    let longTop: SyntheticInfeedHomeItem[];
    let longBottom: SyntheticInfeedHomeItem[];
    if (longMix.length >= 12) {
      const off = randomInt(longMix.length - 12 + 1);
      const pick = longMix.slice(off, off + 12);
      longTop = pick.slice(0, 4);
      longBottom = pick.slice(4, 12);
    } else {
      longTop = longMix.slice(0, 4);
      longBottom = longMix.slice(4, 12);
    }

    // 부족분 보충
    if (longTop.length < 4 || longBottom.length < 8) {
      const used = new Set<string>([...longTop, ...longBottom].map((x) => x.id));
      const filler = shuffleArrayCopy(pool.filter((p) => !used.has(p.id)));
      for (const x of filler) {
        if (longTop.length < 4) longTop.push(x);
        else if (longBottom.length < 8) longBottom.push(x);
        if (longTop.length >= 4 && longBottom.length >= 8) break;
      }
    }

    console.log(
      `[YouTube] 합성 레이아웃: 롱폼 ${longTop.length}+${longBottom.length} (풀=${longPool.length}·원본=${poolIn.length}) — 쇼츠 없음`
    );
    return { longTop, shortsMid: [], longBottom };
  }

  /** 한국 쇼츠 콘텐츠를 YouTube 검색 페이지에서 동적으로 스크래핑 */
  private async fetchKoreanShortsFromWebScrape(
    needed: number
  ): Promise<SyntheticInfeedHomeItem[]> {
    const queries = shuffleArrayCopy([
      "한국 쇼츠", "인기 쇼츠", "요즘 쇼츠", "강아지 릴스", "고양이 릴스",
      "웃긴 영상 쇼츠", "영화 명장면 쇼츠", "애니 명장면 쇼츠", "아이브 쇼츠", "뉴진스 직캠",
      "에스파 쇼츠", "르세라핌 직캠", "롤 매드무비 쇼츠", "배그 쇼츠", "오버워치 쇼츠",
      "발로란트 숏", "먹방 쇼츠 하이라이트", "여행 브이로그 숏", "캠핑 쇼츠", "요리 쇼츠",
      "운동 자극 릴스", "헬스 쇼츠", "골프 스윙 쇼츠", "야구 하이라이트 쇼츠", "축구 하이라이트 쇼츠",
      "손흥민 쇼츠", "이강인 직캠", "페이커 쇼츠", "침착맨 쇼츠", "워크맨 쇼츠",
      "유퀴즈 쇼츠", "놀면뭐하니 쇼츠", "무한도전 레전드 숏", "런닝맨 쇼츠", "코미디빅리그 쇼츠",
      "SNL 코리아 쇼츠", "피식대학 쇼츠", "숏박스", "너덜트 숏", "틱톡 레전드",
      "틱톡 댄스 챌린지", "슬릭백 챌린지", "마술 쇼츠", "차량 블랙박스 쇼츠", "자동차 리뷰 쇼츠",
      "명언 쇼츠", "동기부여 숏", "재테크 쇼츠", "주식 단타 쇼츠", "부동산 임장 쇼츠", "퇴사 브이로그 숏"
    ]);
    const out: SyntheticInfeedHomeItem[] = [];
    const seen = new Set<string>();

    for (const q of queries) {
      if (out.length >= needed) break;
      try {
        const searchUrl =
          `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}&sp=EgIYAQ%3D%3D&hl=ko&gl=KR&app=desktop`;
        const ac = new AbortController();
        const t = setTimeout(() => ac.abort(), 8000);
        const res = await fetch(searchUrl, {
          headers: {
            Accept: "text/html,application/xhtml+xml",
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
            "Accept-Language": "ko-KR,ko;q=0.9",
          },
          signal: ac.signal,
        });
        clearTimeout(t);
        if (!res.ok) continue;
        const html = await res.text();
        if (!html || html.length < 1000) continue;

        // ytInitialData에서 videoId + title 추출
        const initDataMatch = html.match(/var ytInitialData\s*=\s*({[\s\S]+?});\s*<\/script>/);
        if (initDataMatch?.[1]) {
          try {
            const data = JSON.parse(initDataMatch[1]);
            const contents = data?.contents?.twoColumnSearchResultsRenderer
              ?.primaryContents?.sectionListRenderer?.contents;
            if (Array.isArray(contents)) {
              for (const section of contents) {
                const items = section?.itemSectionRenderer?.contents;
                if (!Array.isArray(items)) continue;
                for (const item of items) {
                  const vid = item?.videoRenderer;
                  if (!vid?.videoId) continue;
                  const id = String(vid.videoId);
                  if (seen.has(id)) continue;
                  seen.add(id);
                  const title = vid.title?.runs?.[0]?.text || vid.title?.simpleText || "";
                  const channel = vid.ownerText?.runs?.[0]?.text || vid.shortBylineText?.runs?.[0]?.text || "";
                  const viewText = vid.shortViewCountText?.simpleText || vid.viewCountText?.simpleText || "";
                  const tArr = vid.thumbnail?.thumbnails;
                  const thumbUrl = Array.isArray(tArr) && tArr.length > 0 ? tArr[tArr.length - 1].url : "";
                  if (title) {
                    out.push({ id, title: String(title).slice(0, 120), channel: String(channel).slice(0, 100), viewText: String(viewText), thumbUrl, isShort: true });
                  }
                  if (out.length >= needed) break;
                }
              }
            }
          } catch { /* JSON parse fail — fall through to regex */ }
        }

        // JSON 파싱 실패 시 regex로 videoId만 추출 + oEmbed
        if (out.length < needed) {
          const ids = this.extractVideoIdsFromYoutubeHtml(html, 20);
          for (const id of ids) {
            if (out.length >= needed) break;
            if (seen.has(id)) continue;
            seen.add(id);
            const m = await this.fetchYoutubeOembedMeta(id);
            if (m.title) {
              out.push({ id, title: m.title, channel: m.author || "", viewText: "" });
            }
          }
        }
      } catch {
        continue;
      }
    }
    if (out.length > 0) {
      console.log(`[YouTube] 한국 쇼츠 웹 스크래핑: ${out.length}건 확보`);
    }
    return out;
  }

  private async fetchTrendingFromInvidious(
    region: string,
    max: number
  ): Promise<SyntheticInfeedHomeItem[]> {
    const reg = region.slice(0, 2).toUpperCase() || "KR";
    for (const host of INVIDIOUS_TRENDING_HOSTS) {
      try {
        const url = `${host.replace(/\/$/, "")}/api/v1/trending?region=${encodeURIComponent(reg)}`;
        const ac = new AbortController();
        const t = setTimeout(() => ac.abort(), 9000);
        const res = await fetch(url, {
          headers: { Accept: "application/json" },
          signal: ac.signal,
        });
        clearTimeout(t);
        if (!res.ok) continue;
        const arr = (await res.json()) as unknown;
        if (!Array.isArray(arr) || arr.length === 0) continue;
        const out: SyntheticInfeedHomeItem[] = [];
        for (const v of arr) {
          if (!v || typeof v !== "object") continue;
          const o = v as Record<string, unknown>;
          const id = o.videoId;
          if (typeof id !== "string" || !/^[a-zA-Z0-9_-]{6,15}$/.test(id)) continue;
          const viewCount = o.viewCount;
          const vc =
            typeof viewCount === "number"
              ? viewCount
              : parseInt(String(viewCount ?? "").replace(/\D/g, ""), 10);
          const len = typeof o.lengthSeconds === "number" ? o.lengthSeconds : parseInt(String(o.lengthSeconds || "0"), 10);
          const isShort = len > 0 && len <= 65;
          out.push({
            id,
            title: String(o.title || "동영상").slice(0, 120),
            channel: String(o.author || "").slice(0, 100),
            viewText: Number.isFinite(vc) && vc > 0 ? formatKrViewCount(vc) : "",
            isShort: isShort || undefined,
          });
          if (out.length >= Math.min(40, Math.max(max, 24))) break;
        }
        if (out.length >= 4) return out;
      } catch {
        continue;
      }
    }
    return [];
  }

  private extractVideoIdsFromYoutubeHtml(html: string, max: number): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    const re = /"videoId":"([a-zA-Z0-9_-]{11})"/g;
    for (const m of html.matchAll(re)) {
      const id = m[1];
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
      if (out.length >= max) break;
    }
    return out;
  }

  /** HTML에서 reelWatchEndpoint에 등장하는 videoId를 수집하여 쇼츠 ID 세트를 반환 */
  private extractShortsIdsFromYoutubeHtml(html: string): Set<string> {
    const shorts = new Set<string>();
    // reelWatchEndpoint는 YouTube가 쇼츠 영상에만 사용하는 엔드포인트
    const re = /"reelWatchEndpoint":\s*\{"videoId":"([a-zA-Z0-9_-]{11})"/g;
    for (const m of html.matchAll(re)) {
      if (m[1]) shorts.add(m[1]);
    }
    // reelShelfRenderer 안의 videoId도 쇼츠
    const shelfRe = /"reelShelfRenderer"[\s\S]{0,5000}?"videoId":"([a-zA-Z0-9_-]{11})"/g;
    for (const m of html.matchAll(shelfRe)) {
      if (m[1]) shorts.add(m[1]);
    }
    return shorts;
  }

  private async fetchTrendingFromYoutubeWebScrape(
    region: string,
    max: number
  ): Promise<SyntheticInfeedHomeItem[]> {
    const rg = region.slice(0, 2).toLowerCase() || "kr";
    const gl = rg.toUpperCase();
    /** 영어·글로벌 쇼츠가 잘 섞이는 키워드는 KR 스크랩 후보에서 제외 */
    const searchPoolKr = [
      "인기 동영상",
      "한국 인기",
      "실시간 인기",
      "예능 하이라이트",
      "음악방송",
      "스포츠 하이라이트",
      "뉴스 클립",
      "드라마",
      "예능",
      "KBS",
      "SBS 뉴스",
      "요리",
      "브이로그",
      "게임 실황",
      "한국 예능",
      "인기 음악",
    ];
    const pickKr = () =>
      searchPoolKr[Math.floor(Math.random() * searchPoolKr.length)] || "인기 동영상";
    const q1 = pickKr();
    let q2 = pickKr();
    for (let i = 0; i < 10 && q2 === q1; i++) q2 = pickKr();

    const isLikelyKr = gl === "KR";
    const year = new Date().getFullYear();

    /**
     * URL 순서를 섞지 않음: 트렌딩·홈·한국어 검색을 먼저 시도해야 gl=KR 피드가 우선됨.
     * (셔플 시 `hl=en&gl=US`가 먼저 성공하면 로그만 KR이어도 영상 메타가 해외로 쏠림)
     */
    const candidates: string[] = shuffleArrayCopy([
      `https://www.youtube.com/feed/trending?app=desktop&persist_app=1&hl=${rg}&gl=${gl}`,
      `https://www.youtube.com/?app=desktop&persist_app=1&hl=${rg}&gl=${gl}`,
      `https://www.youtube.com/results?search_query=${encodeURIComponent("인기 동영상")}&app=desktop&hl=${rg}&gl=${gl}`,
      `https://www.youtube.com/results?search_query=${encodeURIComponent(q1)}&app=desktop&hl=${rg}&gl=${gl}`,
      `https://www.youtube.com/results?search_query=${encodeURIComponent(q2)}&app=desktop&hl=${rg}&gl=${gl}`,
      `https://www.youtube.com/results?search_query=${encodeURIComponent(`인기 동영상 ${year}`)}&app=desktop&hl=${rg}&gl=${gl}`,
    ]);
    if (!isLikelyKr) {
      candidates.push(
        `https://www.youtube.com/results?search_query=trending&app=desktop&hl=en&gl=US`,
        `https://www.youtube.com/feed/trending?app=desktop&persist_app=1&hl=en&gl=US`
      );
    }

    for (const url of candidates) {
      try {
        const ac = new AbortController();
        const t = setTimeout(() => ac.abort(), 10_000);
        const res = await fetch(url, {
          headers: {
            Accept: "text/html,application/xhtml+xml",
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
            "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
          },
          signal: ac.signal,
        });
        clearTimeout(t);
        if (!res.ok) continue;
        const html = await res.text();
        if (!html || html.length < 1000) continue;
        const rawIds = this.extractVideoIdsFromYoutubeHtml(html, Math.max(max * 5, 36));
        if (rawIds.length < 4) continue;
        // KR 여부와 무관하게 배열을 섞어 매번 다른 조합이 나오도록 함.
        const ids = shuffleArrayCopy(rawIds).slice(0, max);
        const metas = await Promise.all(ids.map((id) => this.fetchYoutubeOembedMeta(id)));
        const rows: SyntheticInfeedHomeItem[] = ids.map((id, i) => ({
          id,
          title: metas[i]?.title || "동영상",
          channel: metas[i]?.author || "",
          viewText: "",
        }));
        if (rows.length >= 4) return rows;
      } catch {
        continue;
      }
    }
    return [];
  }

  /**
   * 유기 피드가 비었을 때 합성 그리드용 카드 메타.
   * 1) `YOUTUBE_DATA_API_KEY` 인기 차트(+선택 `search.list` KR 보강), 2) Invidious 트렌딩,
   * 3) YouTube 웹 HTML 스크랩, 4) oEmbed 고정 ID.
   * 캡처마다 순서는 기본적으로 셔플됨(`YOUTUBE_INFEED_SYNTHETIC_SHUFFLE` 로 끔).
   * `infeedVideoUrl`: 특정 영상을 목록 맨 앞에 고정할 때만 전달. 인피드 홈+광고 카드와 **같은** URL이면
   *   광고 바로 옆 유기 칸이 동일 영상이 되므로 호출부에서 `undefined` 로 두는 것이 일반적임.
   */
  private async resolveSyntheticInfeedHomeItems(infeedVideoUrl: string | undefined): Promise<{
    items: SyntheticInfeedHomeItem[];
    source: string;
  }> {
    /** 레이아웃 분리·무작위 창에 쓸 후보 풀 크기 (실제 그리드는 3+6+4=13슬롯) */
    const poolCap = 44;
    const region = (process.env.YOUTUBE_TRENDING_REGION || "KR").trim().slice(0, 2) || "KR";
    const pinned = infeedVideoUrl?.trim()
      ? extractVideoId(infeedVideoUrl.trim())
      : null;
    const pinnedOk = pinned && /^[a-zA-Z0-9_-]{6,15}$/.test(pinned) ? pinned : null;

    const withPinnedFirst = async (
      rows: SyntheticInfeedHomeItem[],
      source: string,
      limit: number
    ): Promise<{ items: SyntheticInfeedHomeItem[]; source: string }> => {
      const ordered = isSyntheticInfeedShuffleEnabled() ? shuffleArrayCopy(rows) : [...rows];
      const seen = new Set<string>();
      const out: SyntheticInfeedHomeItem[] = [];
      if (pinnedOk) {
        const fromList = rows.find((r) => r.id === pinnedOk);
        if (fromList) {
          out.push(fromList);
          seen.add(pinnedOk);
        } else {
          const m = await this.fetchYoutubeOembedMeta(pinnedOk);
          out.push({
            id: pinnedOk,
            title: m.title || "동영상",
            channel: m.author || "",
            viewText: "",
          });
          seen.add(pinnedOk);
        }
      }
      for (const r of ordered) {
        if (seen.has(r.id)) continue;
        out.push(r);
        seen.add(r.id);
        if (out.length >= limit) break;
      }
      return { items: out.slice(0, limit), source };
    };

    const hasDataApiKey = Boolean(process.env.YOUTUBE_DATA_API_KEY?.trim());
    if (hasDataApiKey) {
      console.log(
        `[YouTube] 합성 그리드: YOUTUBE_DATA_API_KEY 사용 — videos.list(chart=mostPopular) 우선 (region=${region.slice(0, 2).toUpperCase() || "KR"})`
      );
    }
    let apiRows = await this.fetchMostPopularFromYoutubeDataApi(region, poolCap);
    let dataApiSource: "youtube-data-api" | "youtube-data-api+search" | "youtube-data-api-search" =
      "youtube-data-api";

    if (apiRows.length >= 4) {
      if (
        hasDataApiKey &&
        isSyntheticSearchEnrichEnabled() &&
        region.slice(0, 2).toUpperCase() === "KR"
      ) {
        const enrichQueries = [
          "예능 하이라이트",
          "KBS 뉴스",
          "스포츠 하이라이트",
          "음악방송",
          "요리 레시피",
        ];
        const eq = enrichQueries[Math.floor(Math.random() * enrichQueries.length)]!;
        const extra = await this.fetchKrVideosFromYoutubeSearchApi(region, eq, 12);
        if (extra.length > 0) {
          const merged = mergeSyntheticByIdPreferFirst(apiRows, extra);
          if (merged.length > apiRows.length) {
            apiRows = merged;
            dataApiSource = "youtube-data-api+search";
            console.log(
              `[YouTube] 합성 그리드: 인기 차트+search.list 병합 → ${apiRows.length}건 풀 (보강 질의=${eq})`
            );
          }
        }
      }
      return withPinnedFirst(apiRows, dataApiSource, poolCap);
    }

    if (hasDataApiKey && isSyntheticSearchEnrichEnabled()) {
      const searchOnly = await this.collectSyntheticItemsFromSearchQueries(region, 4, poolCap);
      if (searchOnly.length >= 4) {
        console.log(
          `[YouTube] 합성 그리드: chart 미달(${apiRows.length}건) — search.list만 ${searchOnly.length}건으로 대체 시도`
        );
        return withPinnedFirst(searchOnly, "youtube-data-api-search", poolCap);
      }
    }

    if (hasDataApiKey) {
      console.warn(
        `[YouTube] 합성 그리드: Data API 유효 카드 ${apiRows.length}건(4건 미만) — Invidious·스크랩·oEmbed 순으로 폴백합니다.`
      );
    }

    const invRows = await this.fetchTrendingFromInvidious(region, poolCap);
    if (invRows.length >= 4) {
      return withPinnedFirst(invRows, "invidious", poolCap);
    }

    const webRows = await this.fetchTrendingFromYoutubeWebScrape(region, poolCap);
    if (webRows.length >= 4) {
      return withPinnedFirst(webRows, "youtube-web-scrape", poolCap);
    }

    const seen = new Set<string>();
    const ids: string[] = [];
    if (pinnedOk) {
      ids.push(pinnedOk);
      seen.add(pinnedOk);
    }
    for (const id of INFEED_HOME_SYNTHETIC_FALLBACK_IDS) {
      if (seen.has(id)) continue;
      ids.push(id);
      seen.add(id);
      if (ids.length >= 16) break;
    }
    const metas = await Promise.all(ids.map((id) => this.fetchYoutubeOembedMeta(id)));
    let items: SyntheticInfeedHomeItem[] = ids.map((id, i) => ({
      id,
      title: metas[i]?.title || "동영상",
      channel: metas[i]?.author || "",
      viewText: "",
    }));
    if (isSyntheticInfeedShuffleEnabled()) {
      if (pinnedOk) {
        const pinIdx = items.findIndex((x) => x.id === pinnedOk);
        if (pinIdx >= 0) {
          const pinnedRow = items[pinIdx]!;
          const rest = items.filter((_, i) => i !== pinIdx);
          items = [pinnedRow, ...shuffleArrayCopy(rest)];
        } else {
          items = shuffleArrayCopy(items);
        }
      } else {
        items = shuffleArrayCopy(items);
      }
    }
    return { items: items.slice(0, Math.min(poolCap, items.length)), source: "oembed-fallback" };
  }

  /**
   * 유기 브라우즈 피드가 비었을 때: 실메타(가능 시) + i.ytimg.com 썸네일로 홈 그리드에 가까운 카드 주입.
   * (데이터센터 IP에서 InnerTube 피드가 안 내려올 때 인스트림·스토리보드와 같은 “정적 자산” 계열 폴백)
   */
  private async applySyntheticInfeedHomeBrowseGrid(
    page: IPageHandle,
    layout: SyntheticInfeedHomeGridPayload
  ): Promise<void> {
    const itemsJson = JSON.stringify(layout);
    await page.evaluate(
      ((payload: string) => {
      const layout = JSON.parse(payload) as {
        longTop: SyntheticInfeedHomeItem[];
        shortsMid: SyntheticInfeedHomeItem[];
        longBottom: SyntheticInfeedHomeItem[];
      };
      const longTop = layout.longTop || [];
      const shortsMid = layout.shortsMid || [];
      const longBottom = layout.longBottom || [];
      document.querySelectorAll("[data-admate-synthetic-feed-root]").forEach((e) => e.remove());
      const primary =
        (document.getElementById("primary") as HTMLElement | null) ||
        (document.querySelector("ytd-browse #primary") as HTMLElement | null);
      if (!primary) return;
      // 합성 피드의 일관성을 위해 기존 유기 피드 렌더러를 숨깁니다.
      primary
        .querySelectorAll(
          "ytd-rich-grid-renderer, ytd-rich-shelf-renderer, ytd-rich-section-renderer, ytd-item-section-renderer"
        )
        .forEach((el) => ((el as HTMLElement).style.display = "none"));
      const esc = (s: string) => {
        const d = document.createElement("div");
        d.textContent = s;
        return d.innerHTML;
      };
      const syntheticViewText = (id: string): string => {
        let h = 0;
        for (let i = 0; i < id.length; i++) {
          h = (h * 31 + id.charCodeAt(i)) | 0;
        }
        const opts = [
          "조회수 12만회",
          "조회수 3.1천회",
          "조회수 28만회",
          "조회수 901회",
          "조회수 155만회",
          "조회수 6.4천회",
          "조회수 2.1만회",
          "조회수 44만회",
        ];
        const pick = opts[Math.abs(h) % opts.length];
        return pick || "조회수 1.2만회";
      };
      const root = document.createElement("div");
      root.setAttribute("data-admate-synthetic-feed-root", "1");
      root.style.cssText =
        "box-sizing:border-box;width:100%;max-width:none;margin:0;padding:10px 16px 28px 16px;font-family:Roboto,'Noto Sans KR',Arial,sans-serif;";
      const chipRow = document.createElement("div");
      chipRow.setAttribute("data-admate-synthetic-chip-row", "1");
      chipRow.style.cssText =
        "display:flex;align-items:center;gap:8px;overflow-x:auto;white-space:nowrap;padding:0 0 10px 0;margin:2px 0 8px 0;";
      const chipPool = [
        "전체",
        "라이브",
        "게임",
        "뉴스",
        "음악",
        "믹스",
        "최근에 업로드된 동영상",
        "감상한 동영상",
        "새로운 맞춤 동영상",
        "AI",
        "브이로그",
        "요리",
        "트렌딩",
        "스포츠",
        "영화",
        "학습",
      ];
      const chips = [...chipPool]
        .sort(() => Math.random() - 0.5)
        .slice(0, 9);
      if (!chips.includes("전체")) chips.unshift("전체");
      chips.forEach((txt, i) => {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = txt;
        b.style.cssText =
          "height:32px;padding:0 12px;border-radius:8px;border:none;cursor:default;font:500 13px Roboto,'Noto Sans KR',Arial,sans-serif;" +
          (i === 0
            ? "background:#0f0f0f;color:#fff;"
            : "background:var(--yt-spec-badge-chip-background,rgba(0,0,0,0.05));color:var(--yt-spec-text-primary,#0f0f0f);");
        chipRow.appendChild(b);
      });
      const grid = document.createElement("div");
      grid.setAttribute("data-admate-synthetic-feed-grid", "1");
      grid.style.cssText =
        "display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px 12px;width:100%;";
      const metaMenuBtn =
        '<button type="button" aria-label="작업 더보기" tabindex="-1" style="flex-shrink:0;align-self:flex-start;margin:-4px -3px 0 0;padding:6px 3px;border:none;background:transparent;cursor:default;border-radius:50%;color:var(--yt-spec-text-secondary,#606060);line-height:0;">' +
        '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" focusable="false" aria-hidden="true" style="display:block;">' +
        '<path d="M5.5 12a2 2 0 114 0 2 2 0 01-4 0Zm4.5 0a2 2 0 114 0 2 2 0 01-4 0Zm4.5 0a2 2 0 114 0 2 2 0 01-4 0Z" fill="currentColor"/></svg>' +
        "</button>";
      const wideThumbSrc = (id: string): string =>
        "https://i.ytimg.com/vi_webp/" + id + "/maxresdefault.webp";
      const wideThumbFallback = (id: string): string =>
        "https://i.ytimg.com/vi_webp/" + id + "/hq720.webp";
      const makeWideCard = (it: SyntheticInfeedHomeItem): HTMLElement => {
        const card = document.createElement("div");
        card.setAttribute("data-admate-synthetic-feed-card", "1");
        card.style.cssText =
          "border-radius:12px;overflow:hidden;border:none;background:transparent;";
        const safeTitle = esc(it.title);
        const safeCh = esc((it.channel || "YouTube").replace(/\s*·\s*$/, ""));
        const safeViews = it.viewText ? esc(it.viewText) : esc(syntheticViewText(it.id));
        const safeTimeAgo = ["3시간 전", "5시간 전", "12시간 전", "1일 전", "2일 전", "3일 전", "1주 전"][Math.abs((it.id || "").split("").reduce((a, c) => a + c.charCodeAt(0), 0)) % 7] || "1일 전";
        const metaLine =
          '<div style="margin-top:4px;font-size:14px;line-height:20px;color:var(--yt-spec-text-secondary,#606060);">' +
          safeCh +
          "</div>" +
          '<div style="font-size:14px;line-height:20px;color:var(--yt-spec-text-secondary,#606060);">' +
          safeViews + " · " + safeTimeAgo +
          "</div>";
        const avatarBg = ["#8e24aa", "#1e88e5", "#43a047", "#fb8c00"][
          Math.abs((it.id || "").split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0)) % 4
        ];
        const avatarChar = esc((it.channel || "Y").trim().charAt(0).toUpperCase() || "Y");
        const rawChThumb = (it as { channelThumbUrl?: string }).channelThumbUrl;
        const chThumbOk =
          typeof rawChThumb === "string" &&
          rawChThumb.startsWith("https://") &&
          rawChThumb.length < 512;
        const chSrc = chThumbOk ? rawChThumb.replace(/"/g, "") : "";
        const avatarInner = chThumbOk
          ? '<div style="width:36px;height:36px;border-radius:50%;overflow:hidden;flex-shrink:0;background:#eee;">' +
            '<img src="' +
            chSrc +
            '" alt="" style="width:100%;height:100%;object-fit:cover;display:block;" referrerpolicy="no-referrer" onerror="this.onerror=null;this.parentElement.innerHTML=\'<div style=padding:0;width:36px;height:36px;border-radius:50%;background:' + avatarBg + ';color:#fff;display:flex;align-items:center;justify-content:center;font:700_12px_Roboto,sans-serif>' + avatarChar + '</div>\';" /></div>'
          : '<div style="width:36px;height:36px;border-radius:50%;background:' +
            avatarBg +
            ';color:#fff;display:flex;align-items:center;justify-content:center;font:700 12px Roboto,Arial,sans-serif;flex-shrink:0;">' +
            avatarChar +
            "</div>";
        card.innerHTML =
          '<div style="position:relative;width:100%;aspect-ratio:16/9;background:#000;border-radius:12px;overflow:hidden;">' +
          '<img src="' +
          wideThumbSrc(it.id) +
          '" alt="" style="width:100%;height:100%;object-fit:cover;display:block;" onload="if(this.naturalWidth<=120){this.src=\'https://i.ytimg.com/vi/'+it.id+'/hqdefault.jpg\';}" onerror="this.onerror=null;this.src=\'' +
          wideThumbFallback(it.id) +
          '\'; this.onerror=function(){this.src=\'https://i.ytimg.com/vi/'+it.id+'/hqdefault.jpg\';};"/>' +
          "</div>" +
          '<div style="padding:12px 0 0 0;display:flex;gap:12px;align-items:flex-start;">' +
          avatarInner +
          '<div style="min-width:0;flex:1;display:flex;gap:2px;align-items:flex-start;">' +
          '<div style="min-width:0;flex:1;">' +
          '<div style="font-size:16px;font-weight:500;line-height:22px;color:var(--yt-spec-text-primary,#0f0f0f);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word;">' +
          safeTitle +
          "</div>" +
          metaLine +
          "</div>" +
          metaMenuBtn +
          "</div>" +
          "</div>";
        return card;
      };
      const pushWide = (it: SyntheticInfeedHomeItem) => {
        if (!/^[a-zA-Z0-9_-]{6,15}$/.test(it.id)) return;
        grid.appendChild(makeWideCard(it));
      };
      // 모든 비디오를 롱폼 4열 그리드에 배치 (쇼츠 섹션 없음)
      longTop.forEach((it) => pushWide(it));
      longBottom.forEach((it) => pushWide(it));
      root.appendChild(chipRow);
      root.appendChild(grid);
      const chipBar = primary.querySelector(
        "ytd-feed-filter-chip-bar-renderer, yt-chip-cloud-renderer, ytd-rich-grid-renderer"
      );
      if (chipBar && chipBar.parentNode === primary) {
        chipBar.insertAdjacentElement("afterend", root);
      } else {
        primary.appendChild(root);
      }
    }) as (...args: unknown[]) => void,
      itemsJson
    );
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
      { url: "https://www.youtube.com/?app=desktop&hl=ko&gl=KR", label: "home-ko" },
    ];
    let bestCount = 0;
    let bestUrl = candidates[0]!.url;
    for (const { url, label } of candidates) {
      console.log(`[YouTube] 인피드 홈: 유기 본문 로드 시도 [${label}]`);
      await this.gotoYoutubeInfeedBrowseFeed(page, url);
      await this.reapplyPostNavigationChrome(page, mastheadProfileDataUrl);
      const n = await this.primeYoutubeBrowsePrimaryGrid(page, 3, 5000);
      if (n > bestCount) {
        bestCount = n;
        bestUrl = url;
      }
      if (n >= 8) break;
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
    const timeoutMs = 12000;
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
    if (boot.bestCount < 1) {
      const snap = await this.readYoutubeRichGridSnapshot(page);
      const globalRich = snap.richItems + snap.shelfItems;
      console.warn(
        `[YouTube] 인피드 홈: 부트스트랩에서 유기 본문 0건 — 합성 피드+광고 상단 고정 경로로 즉시 전환합니다.`
      );
      return {
        injectSurface,
        richCount: snap.primaryRichGridCount || globalRich,
        pageSubtype: snap.pageSubtype,
        feedMode: "trending",
      };
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
  private async captureMastheadHomePlacement(
    page: IPageHandle,
    request: CaptureRequest
  ): Promise<Buffer> {
    console.log("[YouTube] ===== Masthead 홈 캡처 시작 =====");
    await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: getDesktopCaptureDpr() });

    const instreamOpts = (request.options?.instreamOpts as InstreamOptsPayload | undefined) ?? {};
    const infeedOpts = (request.options?.infeedOpts as InfeedOptsPayload | undefined) ?? {};
    const adVideoUrl = infeedOpts.videoUrl?.trim() || instreamOpts.videoUrl?.trim() || "";
    const adVideoId = adVideoUrl ? extractVideoId(adVideoUrl) : null;

    let creativeDataUrl = "";
    const creativeSource = request.creativeUrl?.trim();
    if (creativeSource && !/youtube\.com|youtu\.be/i.test(creativeSource)) {
      const creative = await imageUrlToDataUrl(creativeSource);
      if (creative.ok) {
        creativeDataUrl = creative.dataUrl;
      }
    }
    if (!creativeDataUrl && adVideoId) {
      let thumb = await imageUrlToDataUrl(getThumbnailUrl(adVideoId));
      if (!thumb.ok) {
        thumb = await imageUrlToDataUrl(`https://img.youtube.com/vi/${adVideoId}/hqdefault.jpg`);
      }
      if (thumb.ok) {
        creativeDataUrl = thumb.dataUrl;
      }
    }
    if (!creativeDataUrl && creativeSource && /youtube\.com|youtu\.be/i.test(creativeSource)) {
      const id = extractVideoId(creativeSource);
      if (id) {
        const thumb = await imageUrlToDataUrl(getThumbnailUrl(id));
        if (thumb.ok) {
          creativeDataUrl = thumb.dataUrl;
        }
      }
    }

    let avatarDataUrl = "";
    if (instreamOpts.avatarImageUrl?.trim()) {
      const av = await imageUrlToDataUrl(instreamOpts.avatarImageUrl.trim());
      if (av.ok) {
        avatarDataUrl = av.dataUrl;
      }
    }
    if (!avatarDataUrl && instreamOpts.companionChannelUrl?.trim()) {
      const logoUrl = await fetchYoutubeChannelLogoUrl(instreamOpts.companionChannelUrl.trim());
      if (logoUrl) {
        const av = await imageUrlToDataUrl(logoUrl);
        if (av.ok) {
          avatarDataUrl = av.dataUrl;
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

    const displayUrl =
      instreamOpts.displayUrl?.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "") ||
      sponsorName;
    const description = [infeedOpts.description1?.trim(), infeedOpts.description2?.trim()]
      .filter(Boolean)
      .join(" ");
    const html = generateYouTubeMastheadSyntheticHtml({
      title: instreamOpts.adTitle?.trim() || sponsorName,
      description,
      sponsorName,
      creativeDataUrl,
      avatarDataUrl,
      ctaText: infeedOpts.ctaPrimary?.trim() || instreamOpts.ctaText?.trim() || "자세히 알아보기",
      displayUrl,
    });

    this.diagnostics = {
      adType: "masthead-home",
      playerFound: true,
      playerSize: { width: 1920, height: 420 },
      sidebarFound: true,
      injectionSuccess: true,
      creativeDownloaded: !!creativeDataUrl,
      creativeBase64Size: creativeDataUrl ? Math.round(creativeDataUrl.length / 1024) : 0,
      infeedCaptureUrl: "https://www.youtube.com/",
    };

    await page.goto("about:blank", { waitUntil: "load", timeout: 10000 });
    await page.evaluate(`
      document.open();
      document.write(${JSON.stringify(html)});
      document.close();
      window.scrollTo(0, 0);
    `);
    await this.injectKoreanFonts(page);
    await new Promise((r) => setTimeout(r, 1600));

    const screenshot = await page.screenshot({ fullPage: false, type: "png" });
    console.log("[YouTube] ===== Masthead 홈 캡처 완료 =====");
    return screenshot;
  }

  private async captureShortsFeedPlacement(
    page: IPageHandle,
    request: CaptureRequest
  ): Promise<Buffer> {
    console.log("[YouTube] ===== Shorts 피드 캡처 시작 =====");
    await page.setViewport(MOBILE_IOS_VIEWPORT);
    await page.setUserAgent(UA_MOBILE_IOS);

    const instreamOpts = (request.options?.instreamOpts as InstreamOptsPayload | undefined) ?? {};
    const infeedOpts = (request.options?.infeedOpts as InfeedOptsPayload | undefined) ?? {};
    const adVideoUrl = infeedOpts.videoUrl?.trim() || instreamOpts.videoUrl?.trim() || "";
    const adVideoId = adVideoUrl ? extractVideoId(adVideoUrl) : null;

    let creativeDataUrl = "";
    const creativeSource = request.creativeUrl?.trim();
    if (creativeSource && !/youtube\.com|youtu\.be/i.test(creativeSource)) {
      const creative = await imageUrlToDataUrl(creativeSource);
      if (creative.ok) {
        creativeDataUrl = creative.dataUrl;
      }
    }
    if (!creativeDataUrl && adVideoId) {
      let thumb = await imageUrlToDataUrl(getThumbnailUrl(adVideoId));
      if (!thumb.ok) {
        thumb = await imageUrlToDataUrl(`https://img.youtube.com/vi/${adVideoId}/hqdefault.jpg`);
      }
      if (thumb.ok) {
        creativeDataUrl = thumb.dataUrl;
      }
    }
    if (!creativeDataUrl && creativeSource && /youtube\.com|youtu\.be/i.test(creativeSource)) {
      const id = extractVideoId(creativeSource);
      if (id) {
        const thumb = await imageUrlToDataUrl(getThumbnailUrl(id));
        if (thumb.ok) {
          creativeDataUrl = thumb.dataUrl;
        }
      }
    }

    let avatarDataUrl = "";
    if (instreamOpts.avatarImageUrl?.trim()) {
      const av = await imageUrlToDataUrl(instreamOpts.avatarImageUrl.trim());
      if (av.ok) {
        avatarDataUrl = av.dataUrl;
      }
    }
    if (!avatarDataUrl && instreamOpts.companionChannelUrl?.trim()) {
      const logoUrl = await fetchYoutubeChannelLogoUrl(instreamOpts.companionChannelUrl.trim());
      if (logoUrl) {
        const av = await imageUrlToDataUrl(logoUrl);
        if (av.ok) {
          avatarDataUrl = av.dataUrl;
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

    const displayUrl =
      instreamOpts.displayUrl?.trim().replace(/^https?:\/\//i, "").replace(/^www\./i, "") ||
      sponsorName;
    const description = [infeedOpts.description1?.trim(), infeedOpts.description2?.trim()]
      .filter(Boolean)
      .join(" ");
    const html = generateYouTubeShortsSyntheticHtml({
      title: instreamOpts.adTitle?.trim() || sponsorName,
      description,
      sponsorName,
      avatarDataUrl,
      creativeDataUrl,
      ctaText: infeedOpts.ctaPrimary?.trim() || instreamOpts.ctaText?.trim() || "사이트 방문",
      displayUrl,
    });

    this.diagnostics = {
      adType: "shorts-feed",
      playerFound: true,
      playerSize: {
        width: MOBILE_IOS_VIEWPORT.width,
        height: MOBILE_IOS_VIEWPORT.height,
      },
      sidebarFound: false,
      injectionSuccess: true,
      creativeDownloaded: !!creativeDataUrl,
      creativeBase64Size: creativeDataUrl ? Math.round(creativeDataUrl.length / 1024) : 0,
      infeedCaptureUrl: adVideoUrl || request.publisherUrl,
    };

    await page.goto("about:blank", { waitUntil: "load", timeout: 10000 });
    await page.evaluate(`
      document.open();
      document.write(${JSON.stringify(html)});
      document.close();
      window.scrollTo(0, 0);
    `);
    await this.injectKoreanFonts(page);
    await new Promise((r) => setTimeout(r, 1600));

    const screenshot = await page.screenshot({ fullPage: false, type: "png" });
    console.log("[YouTube] ===== Shorts 피드 캡처 완료 =====");
    return screenshot;
  }

  private async captureInfeedPlacement(
    page: IPageHandle,
    request: CaptureRequest,
    adType: "infeed-home" | "mobile-infeed-home" | "infeed-search" | "infeed-watch-next"
  ): Promise<Buffer> {
    const surface = infeedSurfaceFromAdType(adType)!;
    console.log(`[YouTube] ===== 인피드 캡처 시작 (${surface}) =====`);

    let vpWidth = 1920;
    let vpHeight = 1080;
    if (adType === "mobile-infeed-home") {
      vpWidth = 390;
      vpHeight = 844;
      await page.setUserAgent(UA_MOBILE_IOS);
    }
    await page.setViewport({ width: vpWidth, height: vpHeight, deviceScaleFactor: getDesktopCaptureDpr() });

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
      // no default CTA
    } else if (adType === "infeed-search") {
      // no default CTA
    } else {
      /** 관련동영상: 보조 CTA는 강제 무시 */
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

    if (adType === "mobile-infeed-home") {
      const organicItems = await this.resolveSyntheticInfeedHomeItems(infeedVideo).then(r => r.items);
      const adData = {
        title: instreamOpts.adTitle?.trim() || sponsorName,
        description: infeedOpts.description1?.trim() || "",
        channel: sponsorName,
        channelAvatarUrl: avatarDataUrl,
        adThumbUrl: creativeDataUrl,
        ctaPrimary: infeedOpts.ctaPrimary?.trim() || instreamOpts.ctaText?.trim() || "",
        ctaSecondary: infeedOpts.ctaSecondary?.trim() || "",
      };
      const html = generateMobileSyntheticInfeedHomeHtml(adData, organicItems);

      // DOM 완전 대체 및 렌더링 대기
      await page.evaluate(`
        document.open();
        document.write(${JSON.stringify(html)});
        document.close();
        window.scrollTo(0, 0);
      `);

      
      // 이미지 및 폰트 로드 대기
      await new Promise(r => setTimeout(r, 2000));
      
      const screenshot = await page.screenshot({ fullPage: false, type: "png" });
      console.log(`[YouTube] ===== 모바일 인피드 홈 합성 캡처 완료 =====`);
      return screenshot;
    }

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
      const forceSyntheticHome = !["0", "false", "off", "no"].includes(
        (process.env.YOUTUBE_INFEED_HOME_FORCE_SYNTHETIC ?? "1").trim().toLowerCase()
      );
      let pc = await this.countPrimaryBrowseRichItems(page);
      if (forceSyntheticHome || pc < 1) {
        // 광고 소재 `videoUrl`은 이미 광고 카드 썸네일·메타에 사용됨. 합성 피드에까지 맨 앞에 pin 하면
        // 첫 유기 칸이 동일 videoId가 되어 "광고 다음에 똑같은 영상"처럼 보이므로 pin 하지 않음.
        const synth = await this.resolveSyntheticInfeedHomeItems(undefined);
        const trendRegion =
          (process.env.YOUTUBE_TRENDING_REGION || "KR").trim().slice(0, 2) || "KR";
        const gridLayout = await this.partitionAndSampleSyntheticHomeGrid(synth.items, trendRegion);
        await this.enrichSyntheticLongformChannelAvatars([
          ...gridLayout.longTop,
          ...gridLayout.longBottom,
        ]);
        console.log(
          `[YouTube] 인피드 홈: 합성 그리드 주입 (force=${forceSyntheticHome}, source=${synth.source}, pool=${synth.items.length})`
        );
        await this.applySyntheticInfeedHomeBrowseGrid(page, gridLayout);
        if (this.diagnostics) {
          this.diagnostics.infeedHomeSyntheticFeed = true;
          this.diagnostics.infeedHomeSyntheticSource = synth.source;
        }
        pc = await this.countPrimaryBrowseRichItems(page);
      }
      skipHomeAdInjection = pc < 1;
      if (this.diagnostics) {
        this.diagnostics.infeedHomeInjectionSkipped = skipHomeAdInjection;
        this.diagnostics.infeedPrimaryRichGridCount = pc;
      }
      if (skipHomeAdInjection) {
        console.warn(
          "[YouTube] 인피드 홈: 합성 그리드까지 실패 — 광고 인젝션 생략"
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
    if (adType === "infeed-home") {
      await page.evaluate<void>(`
        (() => {
          const app = document.querySelector("ytd-app");
          if (!app) return;
          // 네이티브 햄버거 메뉴를 클릭하여 사이드바를 접고, Polymer의 리사이즈 로직이 자연스럽게 동작하도록 유도
          if (app.hasAttribute("guide-persistent-and-visible")) {
            const guideBtn = document.querySelector("#guide-button button");
            if (guideBtn) guideBtn.click();
          }
        })()
      `);
      // Polymer 리사이즈 및 레이아웃 재계산 대기
      await new Promise((r) => setTimeout(r, 500));
    }

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
          `synthetic=${d?.infeedHomeSyntheticFeed === true} syntheticSource=${d?.infeedHomeSyntheticSource ?? "-"} ` +
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
    let resolvedServerPlayerBox:
      | { left: number; top: number; width: number; height: number }
      | undefined =
      playerInfo.found && playerInfo.width > 80 && playerInfo.height > 80
        ? {
            left: playerInfo.left,
            top: playerInfo.top,
            width: playerInfo.width,
            height: playerInfo.height,
          }
        : undefined;

    if (!resolvedServerPlayerBox && !isMobile) {
      resolvedServerPlayerBox = await page.evaluate<
        { left: number; top: number; width: number; height: number } | undefined
      >(`
        (() => {
          const visibleRect = (el) => {
            if (!el) return null;
            const r = el.getBoundingClientRect();
            const st = window.getComputedStyle(el);
            if (
              r.width <= 16 ||
              r.height <= 8 ||
              st.display === "none" ||
              st.visibility === "hidden" ||
              Number(st.opacity || "1") <= 0
            ) return null;
            return r;
          };

          const sidebarSelectors = [
            "#admate-watch-context-sidebar",
            "#secondary",
            "#secondary-inner",
            "#related",
            "ytd-watch-next-secondary-results-renderer"
          ];
          let sidebarRect = null;
          for (const sel of sidebarSelectors) {
            const r = visibleRect(document.querySelector(sel));
            if (r && r.width > 160 && r.height > 80 && r.left > 420 && r.left < window.innerWidth - 80) {
              sidebarRect = r;
              break;
            }
          }

          const playerSelectors = [
            "video",
            "#movie_player",
            "#player-container-inner",
            "#player-container-outer",
            "ytd-player#ytd-player",
            "ytd-player",
            ".html5-video-player",
            "#player",
            "#ytd-player",
            "div.ytd-watch-flexy#player",
            "#player-container-id",
            ".player-container"
          ];

          const normalize = (r) => {
            if (!r) return null;
            const left = Math.max(24, Math.round(r.left || 86));
            const top = Math.max(50, Math.round(r.top || 56));
            const safeRight = sidebarRect
              ? Math.min(window.innerWidth - 24, sidebarRect.left - 24)
              : window.innerWidth - 24;
            let width = Math.floor(Math.min(r.width || 0, safeRight - left));
            if (width < 480) return null;
            let height = Math.round(r.height || 0);
            const ratio = width / Math.max(height, 1);
            if (height < 220 || height > window.innerHeight * 0.82 || ratio > 1.95 || ratio < 1.45) {
              height = Math.round((width * 9) / 16);
            }
            return { left, top, width, height };
          };

          for (const sel of playerSelectors) {
            const r = visibleRect(document.querySelector(sel));
            const box = normalize(r);
            if (box) return box;
          }

          const left = Math.max(24, Math.round(Math.min(86, window.innerWidth * 0.06)));
          const top = Math.max(50, Math.round(Math.min(72, window.innerHeight * 0.08)));
          const safeRight = sidebarRect
            ? Math.min(window.innerWidth - 24, sidebarRect.left - 24)
            : window.innerWidth - 24;
          const width = Math.floor(Math.min(Math.max(640, window.innerWidth * 0.64), safeRight - left));
          if (width < 480) return undefined;
          return { left, top, width, height: Math.round((width * 9) / 16) };
        })()
      `);

      if (resolvedServerPlayerBox) {
        console.log(
          `[YouTube] 프리롤 플레이어 fallback: ✅ ${resolvedServerPlayerBox.width}x${resolvedServerPlayerBox.height} @ ${resolvedServerPlayerBox.left},${resolvedServerPlayerBox.top}`
        );
      }
    }

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
      serverPlayerBox: resolvedServerPlayerBox,
    };
    const result = await page.evaluate(runPrerollInjectInPage, prerollPayload);

    console.log(`[YouTube] 프리롤 인젝션: ${result ? "✅ 성공" : "❌ 실패"}`);
    return result;
  }

  /**
   * 데스크톱 /watch 페이지가 서버 환경에서 플레이어만 렌더링되고
   * 제목/추천 영역이 비는 경우가 있어, 필요한 경우에만 YouTube형 컨텍스트를 보강한다.
   */
  private async ensureDesktopWatchContext(
    page: IPageHandle,
    playerInfo: { found: boolean; width: number; height: number; top: number; left: number },
    meta: { title?: string; author?: string; videoId?: string }
  ): Promise<NonNullable<YouTubeDiagnostics["watchContextChecks"]>> {
    const payload = {
      playerInfo,
      title: meta.title || "YouTube 동영상",
      author: meta.author || "YouTube",
      videoId: meta.videoId || "",
    };

    return page.evaluate<NonNullable<YouTubeDiagnostics["watchContextChecks"]>>(`
      ((payload) => {
        const playerInfo = payload.playerInfo || {};
        const titleFallback = payload.title || "YouTube 동영상";
        const authorFallback = payload.author || "YouTube";
        const videoId = payload.videoId || "";

        const isVisible = (el) => {
          if (!el) return false;
          const r = el.getBoundingClientRect();
          const st = window.getComputedStyle(el);
          return r.width > 16 && r.height > 8 && st.display !== "none" && st.visibility !== "hidden" && Number(st.opacity || "1") > 0;
        };
        const hasText = (el) => ((el && el.textContent) || "").trim().length > 4;
        const hadTitle = Array.from(
          document.querySelectorAll("h1.ytd-watch-metadata, #title h1, #above-the-fold h1, ytd-watch-metadata h1")
        ).some((el) => isVisible(el) && hasText(el));
        const hadSidebar = Array.from(
          document.querySelectorAll("#secondary ytd-compact-video-renderer, #related ytd-compact-video-renderer, ytd-watch-next-secondary-results-renderer ytd-compact-video-renderer")
        ).some((el) => isVisible(el));

        if (hadTitle && hadSidebar) {
          return { hadTitle, hadSidebar, injectedBelow: false, injectedSidebar: false };
        }

        const esc = (s) => {
          const d = document.createElement("div");
          d.textContent = String(s || "");
          return d.innerHTML;
        };
        const left = Math.max(24, Math.round(playerInfo.left || 86));
        const top = Math.max(50, Math.round(playerInfo.top || 56));
        const width = Math.max(640, Math.round(playerInfo.width || Math.min(window.innerWidth * 0.64, 1100)));
        const height = Math.max(360, Math.round(playerInfo.height || (width * 9) / 16));
        const belowTop = top + height + 16;
        const sidebarLeft = Math.min(left + width + 24, window.innerWidth - 392);
        const sidebarWidth = Math.max(320, Math.min(392, window.innerWidth - sidebarLeft - 24));

        let style = document.getElementById("admate-watch-context-style");
        if (!style) {
          style = document.createElement("style");
          style.id = "admate-watch-context-style";
          document.head.appendChild(style);
        }
        style.textContent = [
          "html,body{background:#fff!important;}",
          "#admate-watch-context-below,#admate-watch-context-sidebar{font-family:Roboto,Arial,'Noto Sans KR',sans-serif!important;color:#0f0f0f!important;}",
          "#admate-watch-context-below * ,#admate-watch-context-sidebar *{box-sizing:border-box!important;letter-spacing:0!important;}",
          "#admate-watch-context-sidebar img{display:block!important;}"
        ].join("\\n");

        let injectedBelow = false;
        if (!hadTitle) {
          document.querySelectorAll("#admate-watch-context-below").forEach((el) => el.remove());
          const below = document.createElement("section");
          below.id = "admate-watch-context-below";
          below.setAttribute("data-injected", "admate-watch-context");
          below.style.cssText = [
            "position:fixed",
            "left:" + left + "px",
            "top:" + belowTop + "px",
            "width:" + width + "px",
            "z-index:2147482000",
            "background:#fff",
            "padding:0 0 18px 0",
            "pointer-events:none"
          ].join("!important;") + "!important";
          below.innerHTML =
            '<h1 style="margin:0 0 10px 0;font-size:20px;line-height:28px;font-weight:600;color:#0f0f0f;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' +
              esc(titleFallback) +
            '</h1>' +
            '<div style="display:flex;align-items:center;justify-content:space-between;gap:16px;">' +
              '<div style="display:flex;align-items:center;min-width:0;gap:12px;">' +
                '<div style="width:40px;height:40px;border-radius:50%;background:#f1f1f1;display:flex;align-items:center;justify-content:center;font-weight:700;color:#606060;flex-shrink:0;">' + esc(authorFallback.charAt(0) || "Y") + '</div>' +
                '<div style="min-width:0;">' +
                  '<div style="font-size:14px;line-height:20px;font-weight:600;color:#0f0f0f;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(authorFallback) + '</div>' +
                  '<div style="font-size:12px;line-height:18px;color:#606060;">구독자 81.0만명</div>' +
                '</div>' +
                '<div style="height:36px;padding:0 16px;border-radius:18px;background:#0f0f0f;color:#fff;display:flex;align-items:center;font-size:14px;font-weight:500;">구독</div>' +
              '</div>' +
              '<div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">' +
                '<div style="height:36px;padding:0 14px;border-radius:18px;background:#f2f2f2;display:flex;align-items:center;font-size:14px;font-weight:500;">좋아요</div>' +
                '<div style="height:36px;padding:0 14px;border-radius:18px;background:#f2f2f2;display:flex;align-items:center;font-size:14px;font-weight:500;">공유</div>' +
                '<div style="height:36px;padding:0 14px;border-radius:18px;background:#f2f2f2;display:flex;align-items:center;font-size:14px;font-weight:500;">저장</div>' +
              '</div>' +
            '</div>' +
            '<div style="margin-top:12px;border-radius:12px;background:#f2f2f2;padding:12px 14px;font-size:13px;line-height:19px;color:#0f0f0f;">' +
              '<strong>조회수 20억회</strong> 5년 전 &nbsp; #' + esc((titleFallback.split(" ")[0] || "YouTube").replace(/[^0-9A-Za-z가-힣_-]/g, "")) +
              '<br/>이 동영상에 대한 설명과 댓글 영역입니다. 광고 캡처 증거용으로 원본 YouTube 시청 페이지의 본문 컨텍스트를 유지합니다.' +
            '</div>';
          document.body.appendChild(below);
          injectedBelow = true;
        }

        let injectedSidebar = false;
        if (!hadSidebar) {
          document.querySelectorAll("#admate-watch-context-sidebar").forEach((el) => el.remove());
          const sidebar = document.createElement("aside");
          sidebar.id = "admate-watch-context-sidebar";
          sidebar.setAttribute("data-injected", "admate-watch-context");
          sidebar.style.cssText = [
            "position:fixed",
            "left:" + sidebarLeft + "px",
            "top:" + top + "px",
            "width:" + sidebarWidth + "px",
            "z-index:2147482000",
            "background:#fff",
            "display:flex",
            "flex-direction:column",
            "gap:12px",
            "pointer-events:none"
          ].join("!important;") + "!important";
          const seeds = [
            { id: videoId || "jNQXAC9IVRw", title: titleFallback, channel: authorFallback, meta: "조회수 20억회 · 5년 전" },
            { id: "aqz-KE-bpKQ", title: "AI 시대를 이해하는 핵심 장면 모음", channel: "YouTube Korea", meta: "조회수 91만회 · 3개월 전" },
            { id: "dQw4w9WgXcQ", title: "오늘 가장 많이 본 인기 동영상", channel: "Music", meta: "조회수 124만회 · 1년 전" },
            { id: "M7lc1UVf-VE", title: "크리에이터가 설명하는 새로운 영상 흐름", channel: "Creator Insider", meta: "조회수 38만회 · 2주 전" },
            { id: "ScMzIvxBSi4", title: "짧게 보는 주요 이슈와 트렌드", channel: "News", meta: "조회수 12만회 · 1일 전" },
            { id: "ysz5S6PUM-U", title: "추천 콘텐츠 플레이리스트", channel: "Playlist", meta: "조회수 52만회 · 8개월 전" }
          ];
          sidebar.innerHTML =
            '<div style="display:flex;gap:8px;overflow:hidden;margin-bottom:2px;">' +
              ['전체','관련 콘텐츠','최근 업로드'].map((chip, i) =>
                '<span style="height:32px;padding:0 12px;border-radius:8px;display:inline-flex;align-items:center;white-space:nowrap;font-size:14px;font-weight:500;background:' + (i === 0 ? '#0f0f0f;color:#fff' : '#f2f2f2;color:#0f0f0f') + ';">' + chip + '</span>'
              ).join("") +
            '</div>' +
            seeds.map((it) => {
              const thumb = 'https://i.ytimg.com/vi/' + encodeURIComponent(it.id) + '/mqdefault.jpg';
              return '<div style="display:flex;gap:8px;width:100%;min-height:94px;">' +
                '<div style="width:168px;height:94px;border-radius:8px;background:#e5e5e5;overflow:hidden;flex-shrink:0;position:relative;">' +
                  '<img src="' + thumb + '" style="width:100%;height:100%;object-fit:cover;" />' +
                  '<span style="position:absolute;right:4px;bottom:4px;background:rgba(0,0,0,.8);color:#fff;border-radius:4px;padding:1px 4px;font-size:12px;line-height:16px;">12:05</span>' +
                '</div>' +
                '<div style="min-width:0;flex:1;padding-right:4px;">' +
                  '<div style="font-size:14px;line-height:20px;font-weight:600;color:#0f0f0f;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">' + esc(it.title) + '</div>' +
                  '<div style="margin-top:4px;font-size:12px;line-height:18px;color:#606060;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(it.channel) + '</div>' +
                  '<div style="font-size:12px;line-height:18px;color:#606060;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + esc(it.meta) + '</div>' +
                '</div>' +
              '</div>';
            }).join("");
          document.body.appendChild(sidebar);
          injectedSidebar = true;
        }

        document.body.style.minHeight = Math.max(document.body.scrollHeight || 0, belowTop + 260) + "px";
        return { hadTitle, hadSidebar, injectedBelow, injectedSidebar };
      })(${JSON.stringify(payload)})
    `);
  }

  /**
   * 📺 디스플레이 / 인스트림 컴패니언 광고 인젝션
   * - sidebar-display: 300×250 비율 이미지 + 하단 푸터 (순수 디스플레이 슬롯)
   * - companion-300x60: 높이 60px 배너 + 추천 영상 컬럼에 맞춘 compact sponsor row
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
          '#admate-watch-context-sidebar',
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
        const adWidth = isCompanion ? Math.min(Math.max(alignW, 300), 360) : Math.min(alignW, 336);
        sidebar
          .querySelectorAll('[data-injected="admate-youtube-sidebar-ad-wrap"]')
          .forEach((node) => node.remove());

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
            'margin: 0 0 12px 0',
            'display: flex',
            'flex-direction: column',
            'background: #fff',
            'border-radius: 8px',
            'border: 1px solid rgba(0,0,0,0.10)',
            'overflow: hidden',
            'cursor: pointer',
            'position: relative',
            'z-index: 2',
            'pointer-events: auto',
            'box-shadow: none'
          ];
          wrap.style.cssText = companionWrapStyles.join(' !important;') + ' !important';
          
          
          let bottomBarHTML = '';
          if (uiOpts.enableCtaText === false) {
            bottomBarHTML =
              '<div style="min-height: 40px; padding: 8px 10px; display: flex; align-items: center; justify-content: space-between; background: #fff;">' +
                '<span style="font-family: Roboto, Arial, sans-serif; font-size: 12px; line-height: 16px; font-weight: 500; color: #606060;">스폰서</span>' +
                '<button style="background: none; border: none; padding: 4px; margin: 0 -4px 0 0; cursor: pointer; color: #0f0f0f;">' +
                  '<svg height="20" viewBox="0 0 24 24" width="20" focusable="false" style="display: block; width: 20px; height: 20px; fill: currentColor;"><path d="M12 4a2 2 0 100 4 2 2 0 000-4Zm0 6a2 2 0 100 4 2 2 0 000-4Zm0 6a2 2 0 100 4 2 2 0 000-4Z"></path></svg>' +
                '</button>' +
              '</div>';
          } else {
            const avatarHtml = uiOpts.avatarImageUrl
              ? '<img src="' + uiOpts.avatarImageUrl + '" style="width: 100%; height: 100%; object-fit: cover;" />'
              : '';
            const ctaHtml = uiOpts.ctaText
              ? '<a style="display: inline-flex; align-items: center; justify-content: center; padding: 0 12px; height: 30px; border-radius: 15px; background: #f2f2f2; color: #0f0f0f; font-family: Roboto, Arial, sans-serif; font-size: 13px; font-weight: 500; text-decoration: none; white-space: nowrap;">' + uiOpts.ctaText + '</a>'
              : '';
            const adTitleText = uiOpts.adTitle || 'AD TITLE';
            bottomBarHTML =
              '<div style="min-height: 52px; padding: 8px 10px; display: flex; align-items: center; justify-content: space-between; gap: 8px; background: #fff;">' +
                '<div style="display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0;">' +
                  '<div style="width: 28px; height: 28px; border-radius: 50%; overflow: hidden; flex-shrink: 0; background: #f0f0f0;">' +
                    avatarHtml +
                  '</div>' +
                  '<div style="display: flex; flex-direction: column; justify-content: center; min-width: 0;">' +
                    '<span style="font-family: Roboto, Arial, sans-serif; font-size: 13px; font-weight: 500; line-height: 18px; color: #0f0f0f; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">' + adTitleText + '</span>' +
                    '<div style="display: flex; align-items: center; gap: 4px; margin-top: 1px;">' +
                      '<span style="font-family: Roboto, Arial, sans-serif; font-size: 11px; line-height: 15px; font-weight: 700; color: #0f0f0f; white-space: nowrap;">스폰서</span>' +
                      '<span style="font-family: Roboto, Arial, sans-serif; font-size: 11px; line-height: 15px; color: #606060; white-space: nowrap; margin: 0 1px;">·</span>' +
                      '<span style="font-family: Roboto, Arial, sans-serif; font-size: 11px; line-height: 15px; color: #606060; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">' + cleanUrl + '</span>' +
                    '</div>' +
                  '</div>' +
                '</div>' +
                '<div style="display: flex; align-items: center; gap: 6px; flex-shrink: 0;">' +
                  ctaHtml +
                  '<button style="background: none; border: none; padding: 4px; margin-right: -4px; cursor: pointer; color: #0f0f0f;">' +
                    '<svg height="20" viewBox="0 0 24 24" width="20" focusable="false" style="display: block; width: 20px; height: 20px; fill: currentColor;"><path d="M12 4a2 2 0 100 4 2 2 0 000-4Zm0 6a2 2 0 100 4 2 2 0 000-4Zm0 6a2 2 0 100 4 2 2 0 000-4Z"></path></svg>' +
                  '</button>' +
                '</div>' +
              '</div>';
          }

          wrap.innerHTML =
            '<div style="width: 100%; height: 60px; overflow: hidden; background: #f5f5f5; display: flex; align-items: center; border-radius: 8px 8px 0 0;">' +
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

        if (isCompanion) {
          sidebar.insertBefore(wrap, sidebar.firstChild);
          console.log(
            '[YouTube Inject] ✅ 사이드바 광고 (최상단) 삽입 성공',
            '(컴패니언 compact, alignW=' + alignW + ', adW=' + adWidth + ')'
          );
        } else if (chipContainer) {
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
      spec = spec.replace(/\&/g, "&").replace(/\|/g, "|");

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



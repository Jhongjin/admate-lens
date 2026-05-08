"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  buildLensLoginPath,
  createLensAuthExpiredError,
  isLensAuthExpiredError,
  isLensAuthRequiredResponse,
  LENS_AUTH_EXPIRED_MESSAGE,
} from "@/lib/auth/lens-session-client";
import type { ExecutableYouTubeAdType } from "@/lib/capture/youtube-ad-types";

const MEDIA_SELECT_OPTIONS: Array<{ value: MediaMenu; label: string; enabled: boolean }> = [
  { value: "gdn", label: "Google Ads", enabled: true },
  { value: "youtube", label: "YouTube", enabled: true },
  { value: "naver", label: "Naver", enabled: true },
  { value: "kakao", label: "Kakao", enabled: true },
];

/**
 * 게재면 프리셋 — GDN 캡처용 URL 목록.
 * 호스트별 캡처 튜닝(제외·lazy·슬롯·모달 등)은 `src/lib/capture/channels/gdn/host-strategies.ts` 상단 체크리스트.
 */
interface PublisherPreset {
  name: string;
  url: string;
  category: string;
  icon: string;
  adSizes: string[];
  description: string;
}

const PUBLISHER_PRESETS: PublisherPreset[] = [
  // 종합 뉴스
  {
    name: "연합뉴스",
    url: "https://www.yna.co.kr/",
    category: "뉴스",
    icon: "NEWS",
    adSizes: ["300x250", "728x90"],
    description: "국내 대표 통신사",
  },
  {
    name: "조선일보",
    url: "https://www.chosun.com/",
    category: "뉴스",
    icon: "NEWS",
    adSizes: ["300x250", "970x250"],
    description: "종합일간지",
  },
  {
    name: "중앙일보",
    url: "https://www.joongang.co.kr/",
    category: "뉴스",
    icon: "NEWS",
    adSizes: ["300x250", "728x90"],
    description: "종합일간지",
  },
  {
    name: "동아일보",
    url: "https://www.donga.com/",
    category: "뉴스",
    icon: "NEWS",
    adSizes: ["300x250", "728x90"],
    description: "종합일간지",
  },
  // 경제
  {
    name: "매일경제",
    url: "https://www.mk.co.kr/",
    category: "경제",
    icon: "FIN",
    adSizes: ["300x250", "728x90"],
    description: "경제전문지",
  },
  {
    name: "헤럴드경제",
    url: "https://biz.heraldcorp.com/",
    category: "경제",
    icon: "FIN",
    adSizes: ["300x250", "728x90"],
    description: "경제전문지",
  },
  // IT/테크
  {
    name: "ZDNet Korea",
    url: "https://zdnet.co.kr/",
    category: "IT",
    icon: "TECH",
    adSizes: ["300x250", "970x90"],
    description: "IT전문 미디어",
  },
  {
    name: "블로터",
    url: "https://www.bloter.net/",
    category: "IT",
    icon: "TECH",
    adSizes: ["300x250"],
    description: "테크 미디어",
  },
  {
    name: "디지털데일리",
    url: "https://www.ddaily.co.kr/",
    category: "IT",
    icon: "TECH",
    adSizes: ["300x250", "728x90"],
    description: "디지털 전문 미디어",
  },
  {
    name: "전자신문",
    url: "https://www.etnews.com/",
    category: "IT",
    icon: "TECH",
    adSizes: ["300x250", "728x90"],
    description: "전자/IT 전문지",
  },
  // 방송
  {
    name: "SBS 뉴스",
    url: "https://news.sbs.co.kr/",
    category: "방송",
    icon: "TV",
    adSizes: ["300x250", "728x90"],
    description: "SBS 뉴스 포털",
  },
];

/** 프리셋 카테고리 목록 */
const PRESET_CATEGORIES = [
  "전체",
  ...Array.from(new Set(PUBLISHER_PRESETS.map((p) => p.category))),
];

/** GDN 광고 사이즈 가이드 */
interface AdSizeInfo {
  size: string;
  width: number;
  height: number;
  name: string;
  usage: string;
  popularity: "높음" | "보통" | "낮음";
}

const GDN_AD_SIZES: AdSizeInfo[] = [
  {
    size: "300×250",
    width: 300,
    height: 250,
    name: "미디엄 렉탱글",
    usage: "기사 본문 사이드바",
    popularity: "높음",
  },
  {
    size: "728×90",
    width: 728,
    height: 90,
    name: "리더보드",
    usage: "페이지 상단/하단",
    popularity: "높음",
  },
  {
    size: "970×250",
    width: 970,
    height: 250,
    name: "빌보드",
    usage: "페이지 최상단",
    popularity: "보통",
  },
  {
    size: "160×600",
    width: 160,
    height: 600,
    name: "와이드 스카이스크래퍼",
    usage: "사이드바 세로",
    popularity: "보통",
  },
  {
    size: "320×100",
    width: 320,
    height: 100,
    name: "모바일 배너",
    usage: "모바일 상단/하단",
    popularity: "높음",
  },
  {
    size: "336×280",
    width: 336,
    height: 280,
    name: "라지 렉탱글",
    usage: "기사 본문 중간",
    popularity: "보통",
  },
];

/** Google Ads MO 지면 — 직접 선택 시 노출할 모바일 단위 사이즈만 */
const GDN_AD_SIZES_MOBILE: AdSizeInfo[] = [
  {
    size: "320×100",
    width: 320,
    height: 100,
    name: "모바일 배너",
    usage: "모바일 상단/하단",
    popularity: "높음",
  },
  {
    size: "320×50",
    width: 320,
    height: 50,
    name: "모바일 배너(좁은형)",
    usage: "모바일 스티키/상단",
    popularity: "높음",
  },
  {
    size: "300×250",
    width: 300,
    height: 250,
    name: "미디엄 렉탱글",
    usage: "모바일 기사/피드",
    popularity: "높음",
  },
  {
    size: "336×280",
    width: 336,
    height: 280,
    name: "라지 렉탱글",
    usage: "모바일 본문 중간",
    popularity: "보통",
  },
];

const GDN_MOBILE_SIZE_KEYS = new Set(
  GDN_AD_SIZES_MOBILE.map((a) => `${a.width}x${a.height}`),
);

/** 인젝션 모드 */
/** 광고 사이즈 모드 */
type AdSizeMode = "auto" | "manual";

/** 자동 매칭 시 슬롯 안 소재 표시 방식 */
type CreativeObjectFitMode = "contain" | "cover";

/** YouTube 광고 유형 */
type YouTubeAdType = ExecutableYouTubeAdType;

type InjectionMode = "single" | "custom";
interface InjectionModeOption {
  value: InjectionMode;
  label: string;
  icon: string;
  description: string;
}

const INJECTION_MODES: InjectionModeOption[] = [
  {
    value: "single",
    label: "최상위 1개",
    icon: "1",
    description: "가장 좋은 위치의 슬롯 1개만 교체",
  },
  {
    value: "custom",
    label: "직접 지정",
    icon: "N",
    description: "원하는 슬롯 개수를 직접 선택",
  },
];

type ProductMenu =
  | "instream"
  | "shorts"
  | "masthead"
  | "infeed"
  | "demandgen"
  | "network-ads"
  | "naver-mobile"
  | "kakao-mobile";
type YouTubeProductMenu = "instream" | "shorts" | "masthead" | "infeed";
type GoogleAdsProductMenu = Extract<ProductMenu, "demandgen" | "network-ads">;
type DemandGenSurface = "youtube-feed" | "youtube-shorts";
type NaverMobileSurface =
  | "naver-smart-channel-mobile"
  | "naver-feed-mobile"
  | "naver-native-banner-feed"
  | "naver-image-banner-mobile"
  | "naver-mobile-feed";
type KakaoMobileSurface =
  | "kakao-bizboard"
  | "kakao-display-native"
  | "kakao-display-catalog"
  | "kakao-product-catalog"
  | "kakao-mobile-feed";
type MobileNativeSurface = NaverMobileSurface | KakaoMobileSurface;
type DetailOptionPreset =
  | "pc-skip"
  | "pc-non-skip"
  | "pc-bumper"
  | "aos-skip"
  | "aos-non-skip"
  | "aos-bumper"
  | "ios-skip"
  | "ios-non-skip"
  | "ios-bumper"
  | "shorts-feed"
  | "masthead-home"
  | "infeed-home"
  | "mo-infeed-home"
  | "infeed-search"
  | "infeed-watch-next"
  | "demandgen-youtube-feed"
  | "demandgen-youtube-shorts"
  | "naver-smart-channel-mobile"
  | "naver-feed-mobile"
  | "naver-native-banner-feed"
  | "naver-image-banner-mobile"
  | "naver-mobile-feed"
  | "kakao-bizboard"
  | "kakao-display-native"
  | "kakao-display-catalog"
  | "kakao-product-catalog"
  | "kakao-mobile-feed"
  | "gdn-pc"
  | "gdn-mobile"
  | "yt-other";

interface ProductMenuOption {
  value: ProductMenu;
  label: string;
  disabled?: boolean;
}

interface DetailMenuOption {
  value: DetailOptionPreset;
  label: string;
  disabled?: boolean;
}

const YOUTUBE_PRODUCT_OPTIONS: ProductMenuOption[] = [
  { value: "instream", label: "In-stream / Bumper" },
  { value: "shorts", label: "Shorts" },
  { value: "masthead", label: "Masthead" },
  { value: "infeed", label: "In-feed" },
];

const GOOGLE_ADS_PRODUCT_OPTIONS: ProductMenuOption[] = [
  { value: "network-ads", label: "Network Ads" },
  { value: "demandgen", label: "Demand Gen" },
];

const NAVER_PRODUCT_OPTIONS: ProductMenuOption[] = [
  { value: "naver-mobile", label: "디스플레이 광고" },
];

const KAKAO_PRODUCT_OPTIONS: ProductMenuOption[] = [
  { value: "kakao-mobile", label: "성과형 광고" },
];

const YOUTUBE_DETAIL_OPTIONS: DetailMenuOption[] = [
  { value: "pc-skip", label: "PC 인스트림 · Skip" },
  { value: "pc-non-skip", label: "PC 인스트림 · Non-skip" },
  { value: "pc-bumper", label: "PC 범퍼 · 6초" },
  { value: "aos-skip", label: "AOS 인스트림 · Skip" },
  { value: "aos-non-skip", label: "AOS 인스트림 · Non-skip" },
  { value: "aos-bumper", label: "AOS 범퍼 · 6초" },
  { value: "ios-skip", label: "iOS 인스트림 · Skip" },
  { value: "ios-non-skip", label: "iOS 인스트림 · Non-skip" },
  { value: "ios-bumper", label: "iOS 범퍼 · 6초" },
  { value: "shorts-feed", label: "Shorts 피드" },
  { value: "masthead-home", label: "Masthead 홈" },
  { value: "infeed-home", label: "In-feed PC 홈" },
  { value: "mo-infeed-home", label: "In-feed 모바일 홈" },
  { value: "infeed-search", label: "In-feed 검색 결과" },
  { value: "infeed-watch-next", label: "In-feed 관련동영상" },
];

const DEMAND_GEN_DETAIL_OPTIONS: DetailMenuOption[] = [
  { value: "demandgen-youtube-feed", label: "YouTube Feed" },
  { value: "demandgen-youtube-shorts", label: "YouTube Shorts" },
];

const NAVER_DETAIL_OPTIONS: DetailMenuOption[] = [
  { value: "naver-smart-channel-mobile", label: "스마트채널" },
  { value: "naver-feed-mobile", label: "피드 광고" },
  { value: "naver-native-banner-feed", label: "네이티브 배너" },
  { value: "naver-image-banner-mobile", label: "이미지 배너" },
];

const KAKAO_DETAIL_OPTIONS: DetailMenuOption[] = [
  { value: "kakao-bizboard", label: "비즈보드" },
  { value: "kakao-display-native", label: "디스플레이 네이티브" },
  { value: "kakao-display-catalog", label: "디스플레이 카탈로그" },
  { value: "kakao-product-catalog", label: "상품 카탈로그" },
];

function normalizeNaverMobileSurface(surface: MobileNativeSurface): NaverMobileSurface {
  if (surface === "naver-mobile-feed") return "naver-feed-mobile";
  if (
    surface === "naver-smart-channel-mobile" ||
    surface === "naver-feed-mobile" ||
    surface === "naver-native-banner-feed" ||
    surface === "naver-image-banner-mobile"
  ) {
    return surface;
  }
  return "naver-smart-channel-mobile";
}

function isNaverDetailPreset(preset: string): preset is NaverMobileSurface {
  return (
    preset === "naver-smart-channel-mobile" ||
    preset === "naver-feed-mobile" ||
    preset === "naver-native-banner-feed" ||
    preset === "naver-image-banner-mobile" ||
    preset === "naver-mobile-feed"
  );
}

function normalizeKakaoMobileSurface(surface: MobileNativeSurface): KakaoMobileSurface {
  if (surface === "kakao-mobile-feed") return "kakao-display-native";
  if (
    surface === "kakao-bizboard" ||
    surface === "kakao-display-native" ||
    surface === "kakao-display-catalog" ||
    surface === "kakao-product-catalog"
  ) {
    return surface;
  }
  return "kakao-bizboard";
}

function isKakaoDetailPreset(preset: string): preset is KakaoMobileSurface {
  return (
    preset === "kakao-bizboard" ||
    preset === "kakao-display-native" ||
    preset === "kakao-display-catalog" ||
    preset === "kakao-product-catalog" ||
    preset === "kakao-mobile-feed"
  );
}

const YOUTUBE_DETAIL_OPTIONS_BY_PRODUCT: Record<YouTubeProductMenu, DetailMenuOption[]> = {
  instream: YOUTUBE_DETAIL_OPTIONS.filter((option) =>
    [
      "pc-skip",
      "pc-non-skip",
      "pc-bumper",
      "aos-skip",
      "aos-non-skip",
      "aos-bumper",
      "ios-skip",
      "ios-non-skip",
      "ios-bumper",
    ].includes(option.value),
  ),
  shorts: YOUTUBE_DETAIL_OPTIONS.filter((option) => option.value === "shorts-feed"),
  masthead: YOUTUBE_DETAIL_OPTIONS.filter((option) => option.value === "masthead-home"),
  infeed: YOUTUBE_DETAIL_OPTIONS.filter((option) =>
    [
      "infeed-home",
      "mo-infeed-home",
      "infeed-search",
      "infeed-watch-next",
    ].includes(option.value),
  ),
};

function isYouTubeProductMenu(value: ProductMenu): value is YouTubeProductMenu {
  return value === "instream" || value === "shorts" || value === "masthead" || value === "infeed";
}

const GDN_DETAIL_OPTIONS: DetailMenuOption[] = [
  { value: "gdn-pc", label: "PC 지면" },
  { value: "gdn-mobile", label: "MO 지면" },
];

/** 폼 데이터 타입 */
interface CaptureFormData {
  /** 운영자 UI에서 선택한 매체. Demand Gen은 Google Ads 메뉴를 유지하면서 YouTube 렌더러를 사용할 수 있다. */
  mediaMenu: MediaMenu;
  channel: string;
  googleAdsProduct: GoogleAdsProductMenu;
  demandGenSurface: DemandGenSurface;
  mobileNativeSurface: MobileNativeSurface;
  selectedPublishers: string[]; // 멀티 사이트 URL 배열
  creativeUrl: string;
  clickUrl: string;
  captureLanding: boolean;
  injectionMode: InjectionMode;
  slotCount: number;
  adSizeMode: AdSizeMode;
  /** 자동 매칭일 때 슬롯 내 소재 맞춤(contain=여백 가능, cover=크롭) */
  creativeObjectFit: CreativeObjectFitMode;
  targetAdSizes: string[]; // 수동 모드에서 선택한 사이즈 (예: ["300x250", "728x90"])
  youtubeAdType: YouTubeAdType; // YouTube 광고 유형
  // 인스트림 광고 옵션
  instreamVideoUrl: string; // YouTube 동영상 URL
  instreamPublisherVideoUrl: string; // 콘텐츠(게재면) 영상 URL
  instreamCaptureSecond: string; // 캡처 시점(초)
  instreamAdTitle: string;
  instreamEnableCtaText: boolean;
  instreamCtaText: string;
  instreamLandingUrl: string;
  instreamDisplayUrl: string;
  instreamDisplayPath1: string;
  instreamDisplayPath2: string;
  instreamLogoSource: "channel" | "upload";
  instreamLogoImageUrl: string;
  instreamCompanionImageUrl: string;
  instreamCompanionChannelUrl: string;
  instreamUseChannelBanner: boolean;
  instreamEnableCompanionBanner: boolean;
  instreamSkipMode: "skippable" | "non-skippable";
  /** GDN 게재면 캡처: PC 뷰포트 vs 모바일 뷰포트 */
  gdnViewportMode: "pc" | "mobile";
  /** 인피드 — 광고주 YouTube 영상 URL(썸네일 자동), 검색어, 설명, CTA */
  infeedVideoUrl: string;
  infeedSearchQuery: string;
  infeedDescription1: string;
  infeedDescription2: string;
  infeedCtaPrimary: string;
  infeedCtaSecondary: string;
  /** 인피드 검색: 캡처 시 광고 삽입 위치 */
  infeedSearchPlacement: "top" | "feed";
  /** `feed` 일 때: N번째(0부터) 유기 결과 바로 아래 — 숫자 문자열 */
  infeedSearchFeedInsertAfterIndex: string;
}

type MediaMenu = "gdn" | "youtube" | "naver" | "kakao";

/** 캡처 결과 타입 */
export interface CaptureResult {
  id: string;
  status: string;
  channel: string;
  source_url: string;
  creative_url: string;
  capture_landing: boolean;
  created_at: string;
}

interface CaptureFormProps {
  onCaptureCreated?: (capture: CaptureResult) => void;
}

/** URL 유효성 검사 */
function isValidUrl(str: string): boolean {
  try {
    const url = new URL(str);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** `www...`, `youtube.com/...`처럼 스킴이 없으면 https를 붙여 처리 (type=url 제약 회피) */
function normalizeHttpUrl(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t.replace(/^\/+/, "")}`;
}

function isValidHttpSource(raw: string): boolean {
  const t = raw.trim();
  if (!t) return false;
  try {
    const url = new URL(normalizeHttpUrl(t));
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** 파일 크기 포맷 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export default function CaptureForm({ onCaptureCreated }: CaptureFormProps) {
  const [form, setForm] = useState<CaptureFormData>({
    mediaMenu: "gdn",
    channel: "gdn",
    googleAdsProduct: "network-ads",
    demandGenSurface: "youtube-feed",
    mobileNativeSurface: "naver-smart-channel-mobile",
    selectedPublishers: [],
    creativeUrl: "",
    clickUrl: "",
    captureLanding: false,
    injectionMode: "single",
    slotCount: 2,
    adSizeMode: "auto",
    creativeObjectFit: "contain",
    targetAdSizes: [],
    youtubeAdType: "preroll",
    instreamVideoUrl: "",
    instreamPublisherVideoUrl: "",
    instreamCaptureSecond: "5",
    instreamAdTitle: "",
    instreamEnableCtaText: true,
    instreamCtaText: "",
    instreamLandingUrl: "",
    instreamDisplayUrl: "",
    instreamDisplayPath1: "",
    instreamDisplayPath2: "",
    instreamSkipMode: "skippable",
    instreamLogoSource: "channel",
    instreamLogoImageUrl: "",
    instreamCompanionImageUrl: "",
    instreamCompanionChannelUrl: "",
    instreamUseChannelBanner: true,
    instreamEnableCompanionBanner: true,
    gdnViewportMode: "pc",
    infeedVideoUrl: "",
    infeedSearchQuery: "시세이도",
    infeedDescription1: "",
    infeedDescription2: "",
    infeedCtaPrimary: "",
    infeedCtaSecondary: "",
    infeedSearchPlacement: "top",
    infeedSearchFeedInsertAfterIndex: "1",
  });

  // 이미지 업로드 관련 상태
  const [uploadMode, setUploadMode] = useState<"upload" | "url">("upload");
  const [uploadedFile, setUploadedFile] = useState<{
    name: string;
    size: number;
    preview: string;
    width?: number;
    height?: number;
  } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const companionInputRef = useRef<HTMLInputElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [isCompanionUploading, setIsCompanionUploading] = useState(false);
  const [isLogoUploading, setIsLogoUploading] = useState(false);
  const [isOptionPanelExpanded, setIsOptionPanelExpanded] = useState(true);

  // 게재면 프리셋 관련 상태
  const [publisherMode, setPublisherMode] = useState<"preset" | "custom">(
    "preset",
  );
  const [presetCategory, setPresetCategory] = useState("전체");
  const [showAllPresets, setShowAllPresets] = useState(false);
  const [showSizeGuide, setShowSizeGuide] = useState(false);
  const [customUrl, setCustomUrl] = useState("");
  const [hardBlockedPresetUrls, setHardBlockedPresetUrls] = useState<string[]>([]);
  const [persistentlyFailedPresetUrls, setPersistentlyFailedPresetUrls] = useState<string[]>([]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authExpiredMessage, setAuthExpiredMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    type: "success" | "error" | "info";
    message: string;
  } | null>(null);

  /** 토스트 표시 */
  const showToast = useCallback(
    (type: "success" | "error" | "info", message: string) => {
      setToast({ type, message });
      setTimeout(() => setToast(null), 4000);
    },
    [],
  );

  const markAuthExpired = useCallback(
    (message = LENS_AUTH_EXPIRED_MESSAGE) => {
      setAuthExpiredMessage(message);
      showToast("error", message);
    },
    [showToast],
  );

  // 실패 이력(metadata.shouldRemoveFromPresetList=true) 기반으로 강차단 사이트 프리셋 자동 제외
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch(`/api/captures?status=failed&limit=200&_t=${Date.now()}`, {
          cache: "no-store",
        });
        const json = await res.json();
        if (isLensAuthRequiredResponse(res, json)) {
          if (mounted) {
            setAuthExpiredMessage(json?.error || LENS_AUTH_EXPIRED_MESSAGE);
          }
          return;
        }
        if (!res.ok || !Array.isArray(json?.data) || !mounted) return;
        const blocked = new Set<string>();
        for (const row of json.data as Array<{ source_url?: string | null; metadata?: Record<string, unknown> | null }>) {
          const shouldRemove = row.metadata?.shouldRemoveFromPresetList === true;
          if (shouldRemove && row.source_url) blocked.add(row.source_url);
        }
        setHardBlockedPresetUrls(Array.from(blocked));
      } catch {
        // 비치명: 프리셋 차단 정보 조회 실패 시 기본 목록 유지
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // 지속 실패 사이트(성공 0, 실패 3회 이상) 자동 제외
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch(`/api/captures?limit=500&_t=${Date.now()}`, {
          cache: "no-store",
        });
        const json = await res.json();
        if (isLensAuthRequiredResponse(res, json)) {
          if (mounted) {
            setAuthExpiredMessage(json?.error || LENS_AUTH_EXPIRED_MESSAGE);
          }
          return;
        }
        if (!res.ok || !Array.isArray(json?.data) || !mounted) return;

        const stats = new Map<string, { ok: number; fail: number }>();
        for (const row of json.data as Array<{ source_url?: string | null; status?: string }>) {
          if (!row.source_url) continue;
          const cur = stats.get(row.source_url) ?? { ok: 0, fail: 0 };
          if (row.status === "completed") cur.ok += 1;
          if (row.status === "failed") cur.fail += 1;
          stats.set(row.source_url, cur);
        }

        const persistentFails: string[] = [];
        for (const [url, s] of stats.entries()) {
          if (s.ok === 0 && s.fail >= 3) {
            persistentFails.push(url);
          }
        }
        setPersistentlyFailedPresetUrls(persistentFails);
      } catch {
        // 비치명
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // MO 지면: 직접 선택에 남아 있는 데스크톱 전용 사이즈(728×90 등) 제거
  useEffect(() => {
    if (form.channel !== "gdn" || form.gdnViewportMode !== "mobile") return;
    setForm((prev) => {
      if (prev.channel !== "gdn" || prev.gdnViewportMode !== "mobile") return prev;
      const next = prev.targetAdSizes.filter((s) => GDN_MOBILE_SIZE_KEYS.has(s));
      if (
        next.length === prev.targetAdSizes.length &&
        next.every((v, i) => v === prev.targetAdSizes[i])
      ) {
        return prev;
      }
      return { ...prev, targetAdSizes: next };
    });
  }, [form.channel, form.gdnViewportMode]);

  /** 파일 업로드 처리 */
  const handleFileUpload = async (file: File) => {
    // 유효성 검증
    const allowedTypes = ["image/png", "image/jpeg", "image/webp", "image/gif"];
    if (!allowedTypes.includes(file.type)) {
      showToast("error", "PNG, JPG, WebP, GIF 형식만 지원합니다.");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      showToast("error", "파일 크기는 10MB 이하여야 합니다.");
      return;
    }

    // 미리보기 생성 + 이미지 사이즈 감지
    const preview = URL.createObjectURL(file);
    setIsUploading(true);

    // 이미지 실제 픽셀 사이즈 감지
    const dimensions = await new Promise<{ width: number; height: number }>(
      (resolve) => {
        const img = new Image();
        img.onload = () =>
          resolve({ width: img.naturalWidth, height: img.naturalHeight });
        img.onerror = () => resolve({ width: 0, height: 0 });
        img.src = preview;
      },
    );

    setUploadedFile({
      name: file.name,
      size: file.size,
      preview,
      width: dimensions.width,
      height: dimensions.height,
    });
    console.log(
      `[CaptureForm] 업로드 배너 사이즈: ${dimensions.width}x${dimensions.height}`,
    );

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const result = await res.json();

      if (isLensAuthRequiredResponse(res, result)) {
        throw createLensAuthExpiredError(result);
      }

      if (!res.ok) {
        throw new Error(result.error || "업로드에 실패했습니다.");
      }

      // 업로드 성공 → creativeUrl 설정
      setAuthExpiredMessage(null);
      setForm((prev) => ({ ...prev, creativeUrl: result.url }));
      showToast(
        "success",
        `소재 이미지 업로드 완료! (${dimensions.width}×${dimensions.height})`,
      );
    } catch (err) {
      if (isLensAuthExpiredError(err)) {
        markAuthExpired(err.message);
        setUploadedFile(null);
        return;
      }
      const msg = err instanceof Error ? err.message : "업로드 실패";
      showToast("error", msg);
      setUploadedFile(null);
    } finally {
      setIsUploading(false);
    }
  };

  /** 공용 이미지 업로드 (인스트림 부가 에셋) */
  const uploadAssetImage = useCallback(
    async (
      file: File,
      opts?: { maxBytes?: number; exactWidth?: number; exactHeight?: number },
    ): Promise<string> => {
      const allowedTypes = ["image/png", "image/jpeg", "image/webp", "image/gif"];
      if (!allowedTypes.includes(file.type)) {
        throw new Error("PNG, JPG, WebP, GIF 형식만 지원합니다.");
      }
      const maxBytes = opts?.maxBytes ?? 10 * 1024 * 1024;
      if (file.size > maxBytes) {
        const kb = Math.floor(maxBytes / 1024);
        throw new Error(`파일 크기는 ${kb}KB 이하여야 합니다.`);
      }

      if (opts?.exactWidth && opts?.exactHeight) {
        const dim = await new Promise<{ width: number; height: number }>((resolve) => {
          const img = new Image();
          img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
          img.onerror = () => resolve({ width: 0, height: 0 });
          img.src = URL.createObjectURL(file);
        });
        if (dim.width !== opts.exactWidth || dim.height !== opts.exactHeight) {
          throw new Error(`이미지 크기는 ${opts.exactWidth}x${opts.exactHeight}px 이어야 합니다.`);
        }
      }

      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const result = await res.json();
      if (isLensAuthRequiredResponse(res, result)) {
        throw createLensAuthExpiredError(result);
      }
      if (!res.ok || !result.url) {
        throw new Error(result.error || "이미지 업로드 실패");
      }
      setAuthExpiredMessage(null);
      return result.url as string;
    },
    [],
  );

  /** 드래그 앤 드롭 핸들러 */
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };
  const handleDragLeave = () => setIsDragOver(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  };

  /** 파일 선택 핸들러 */
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
  };

  const handleCompanionSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsCompanionUploading(true);
    try {
      const url = await uploadAssetImage(file, {
        maxBytes: 150 * 1024,
        exactWidth: 300,
        exactHeight: 60,
      });
      setForm((prev) => ({
        ...prev,
        instreamCompanionImageUrl: url,
        instreamUseChannelBanner: false,
      }));
      showToast("success", "컴패니언 배너 이미지 업로드 완료");
    } catch (err) {
      if (isLensAuthExpiredError(err)) {
        markAuthExpired(err.message);
        return;
      }
      showToast("error", err instanceof Error ? err.message : "컴패니언 업로드 실패");
    } finally {
      setIsCompanionUploading(false);
      if (companionInputRef.current) companionInputRef.current.value = "";
    }
  };

  const handleLogoSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsLogoUploading(true);
    try {
      const url = await uploadAssetImage(file);
      setForm((prev) => ({ ...prev, instreamLogoImageUrl: url }));
      showToast("success", "로고 이미지 업로드 완료");
    } catch (err) {
      if (isLensAuthExpiredError(err)) {
        markAuthExpired(err.message);
        return;
      }
      showToast("error", err instanceof Error ? err.message : "로고 업로드 실패");
    } finally {
      setIsLogoUploading(false);
      if (logoInputRef.current) logoInputRef.current.value = "";
    }
  };

  /** 업로드 파일 제거 */
  const removeUploadedFile = () => {
    setUploadedFile(null);
    setForm((prev) => ({ ...prev, creativeUrl: "" }));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  /** 프리셋 토글 (멀티 선택) */
  const togglePreset = (preset: PublisherPreset) => {
    setForm((prev) => {
      const isSelected = prev.selectedPublishers.includes(preset.url);
      return {
        ...prev,
        selectedPublishers: isSelected
          ? prev.selectedPublishers.filter((u) => u !== preset.url)
          : [...prev.selectedPublishers, preset.url],
      };
    });
  };

  /** 커스텀 URL 추가 */
  const addCustomUrl = () => {
    if (
      customUrl &&
      isValidUrl(customUrl) &&
      !form.selectedPublishers.includes(customUrl)
    ) {
      setForm((prev) => ({
        ...prev,
        selectedPublishers: [...prev.selectedPublishers, customUrl],
      }));
      setCustomUrl("");
    }
  };

  /** 선택된 게재면 제거 */
  const removePublisher = (url: string) => {
    setForm((prev) => ({
      ...prev,
      selectedPublishers: prev.selectedPublishers.filter((u) => u !== url),
    }));
  };

  /** 프리셋 이름 찾기 */
  const getPresetName = (url: string): string => {
    const preset = PUBLISHER_PRESETS.find((p) => p.url === url);
    return preset ? preset.name : new URL(url).hostname;
  };

  /** 필터링된 프리셋 */
  const filteredPresets =
    presetCategory === "전체"
      ? PUBLISHER_PRESETS.filter(
          (p) =>
            !hardBlockedPresetUrls.includes(p.url) &&
            !persistentlyFailedPresetUrls.includes(p.url),
        )
      : PUBLISHER_PRESETS.filter(
          (p) =>
            p.category === presetCategory &&
            !hardBlockedPresetUrls.includes(p.url) &&
            !persistentlyFailedPresetUrls.includes(p.url),
        );

  const visiblePresets = showAllPresets
    ? filteredPresets
    : filteredPresets.slice(0, 6);

  /** 폼 유효성 검증 — YouTube/Naver/Kakao 채널은 게재면 자동 지정 */
  const isYouTubeChannel = form.channel === "youtube";
  const isMobileNativeChannel = form.channel === "naver" || form.channel === "kakao";
  const isAutoPublisherChannel = isYouTubeChannel || isMobileNativeChannel;
  const isMobilePreroll =
    form.youtubeAdType === "mobile-preroll-aos" ||
    form.youtubeAdType === "mobile-preroll-ios" ||
    form.youtubeAdType === "mobile-bumper-aos" ||
    form.youtubeAdType === "mobile-bumper-ios";
  const isBumperAd =
    form.youtubeAdType === "bumper" ||
    form.youtubeAdType === "mobile-bumper-aos" ||
    form.youtubeAdType === "mobile-bumper-ios";
  const isYoutubeInstream =
    isYouTubeChannel &&
    (form.youtubeAdType === "preroll" ||
      form.youtubeAdType === "bumper" ||
      isMobilePreroll);
  const isYoutubeShorts =
    isYouTubeChannel && form.youtubeAdType === "shorts-feed";
  const isYoutubeMasthead =
    isYouTubeChannel && form.youtubeAdType === "masthead-home";

  const isYoutubeInfeed =
    isYouTubeChannel &&
    (form.youtubeAdType === "infeed-home" ||
      form.youtubeAdType === "mobile-infeed-home" ||
      form.youtubeAdType === "infeed-search" ||
      form.youtubeAdType === "infeed-watch-next");

  const selectedMediaMenu = form.mediaMenu;
  const isDemandGenProduct = selectedMediaMenu === "gdn" && form.googleAdsProduct === "demandgen";
  const selectedProduct: ProductMenu =
    selectedMediaMenu === "youtube"
      ? isYoutubeShorts
        ? "shorts"
        : isYoutubeMasthead
          ? "masthead"
        : isYoutubeInfeed
        ? "infeed"
        : "instream"
      : selectedMediaMenu === "naver"
        ? "naver-mobile"
        : selectedMediaMenu === "kakao"
          ? "kakao-mobile"
          : form.googleAdsProduct;
  const selectedOptionPreset: DetailOptionPreset = (() => {
    if (selectedMediaMenu === "naver") {
      return normalizeNaverMobileSurface(form.mobileNativeSurface) as DetailOptionPreset;
    }
    if (selectedMediaMenu === "kakao") {
      return normalizeKakaoMobileSurface(form.mobileNativeSurface) as DetailOptionPreset;
    }
    if (selectedMediaMenu !== "youtube") {
      if (isDemandGenProduct) {
        return form.demandGenSurface === "youtube-shorts"
          ? "demandgen-youtube-shorts"
          : "demandgen-youtube-feed";
      }
      return form.gdnViewportMode === "mobile" ? "gdn-mobile" : "gdn-pc";
    }
    if (form.youtubeAdType === "bumper") return "pc-bumper";
    if (form.youtubeAdType === "mobile-bumper-aos") return "aos-bumper";
    if (form.youtubeAdType === "mobile-bumper-ios") return "ios-bumper";
    if (form.youtubeAdType === "shorts-feed") return "shorts-feed";
    if (form.youtubeAdType === "masthead-home") return "masthead-home";
    if (form.youtubeAdType === "preroll") {
      return form.instreamSkipMode === "non-skippable" ? "pc-non-skip" : "pc-skip";
    }
    if (form.youtubeAdType === "mobile-preroll-aos") {
      return form.instreamSkipMode === "non-skippable" ? "aos-non-skip" : "aos-skip";
    }
    if (form.youtubeAdType === "mobile-preroll-ios") {
      return form.instreamSkipMode === "non-skippable" ? "ios-non-skip" : "ios-skip";
    }
    if (form.youtubeAdType === "infeed-home") return "infeed-home";
    if (form.youtubeAdType === "mobile-infeed-home") return "mo-infeed-home";
    if (form.youtubeAdType === "infeed-search") return "infeed-search";
    if (form.youtubeAdType === "infeed-watch-next") return "infeed-watch-next";
    return "yt-other";
  })();

  const detailOptionLabel: Record<string, string> = {
    "pc-skip": "PC 인스트림 · Skip",
    "pc-non-skip": "PC 인스트림 · Non-skip",
    "pc-bumper": "PC 범퍼 · 6초",
    "aos-skip": "AOS 인스트림 · Skip",
    "aos-non-skip": "AOS 인스트림 · Non-skip",
    "aos-bumper": "AOS 범퍼 · 6초",
    "ios-skip": "iOS 인스트림 · Skip",
    "ios-non-skip": "iOS 인스트림 · Non-skip",
    "ios-bumper": "iOS 범퍼 · 6초",
    "shorts-feed": "Shorts 피드",
    "masthead-home": "Masthead 홈",
    "infeed-home": "In-feed PC 홈",
    "mo-infeed-home": "In-feed 모바일 홈",
    "infeed-search": "In-feed 검색 결과",
    "infeed-watch-next": "In-feed 관련동영상",
    "demandgen-youtube-feed": "Demand Gen · YouTube Feed",
    "demandgen-youtube-shorts": "Demand Gen · YouTube Shorts",
    "naver-smart-channel-mobile": "Naver · 스마트채널",
    "naver-feed-mobile": "Naver · 피드 광고",
    "naver-native-banner-feed": "Naver · 네이티브 배너",
    "naver-image-banner-mobile": "Naver · 이미지 배너",
    "naver-mobile-feed": "Naver · 피드 광고",
    "kakao-bizboard": "Kakao · 비즈보드",
    "kakao-display-native": "Kakao · 디스플레이 네이티브",
    "kakao-mobile-feed": "Kakao · 디스플레이 네이티브",
    "kakao-display-catalog": "Kakao · 디스플레이 카탈로그",
    "kakao-product-catalog": "Kakao · 상품 카탈로그",
    "yt-other": "YouTube 레거시/준비중",
    "gdn-pc": "PC 지면",
    "gdn-mobile": "MO 지면",
  };

  const availableYoutubeDetailOptions =
    selectedMediaMenu === "youtube" && isYouTubeProductMenu(selectedProduct)
      ? YOUTUBE_DETAIL_OPTIONS_BY_PRODUCT[selectedProduct]
      : [];
  const availableGoogleAdsDetailOptions =
    selectedProduct === "demandgen" ? DEMAND_GEN_DETAIL_OPTIONS : GDN_DETAIL_OPTIONS;
  const availableMobileNativeDetailOptions =
    selectedMediaMenu === "naver"
      ? NAVER_DETAIL_OPTIONS
      : selectedMediaMenu === "kakao"
        ? KAKAO_DETAIL_OPTIONS
        : [];
  const productLabel: Record<ProductMenu, string> = {
    instream: "In-stream / Bumper",
    shorts: "Shorts",
    masthead: "Masthead",
    infeed: "In-feed",
    demandgen: "Demand Gen",
    "network-ads": "Network Ads",
    "naver-mobile": "디스플레이 광고",
    "kakao-mobile": "성과형 광고",
  };

  const infeedTypeLabel =
    form.youtubeAdType === "infeed-home"
      ? "인피드 · PC 홈"
      : form.youtubeAdType === "mobile-infeed-home"
        ? "인피드 · 모바일 홈"
      : form.youtubeAdType === "infeed-search"
        ? "인피드 · 검색"
        : form.youtubeAdType === "infeed-watch-next"
          ? "인피드 · 관련동영상"
          : "인피드";
  const infeedSurfaceHint =
    form.youtubeAdType === "infeed-home"
      ? "PC 홈 지면은 YouTube 데스크톱 홈 추천 피드 안에 네이티브 광고 카드를 렌더링합니다."
      : form.youtubeAdType === "mobile-infeed-home"
        ? "모바일 홈 지면은 합성 피드로 안정적인 모바일 카드 화면을 렌더링합니다."
      : form.youtubeAdType === "infeed-search"
        ? "검색 지면은 검색어 기준 결과 목록에 광고 카드를 삽입합니다."
        : form.youtubeAdType === "infeed-watch-next"
          ? "관련동영상 지면은 시청 페이지 우측 추천 영역에 광고 카드를 삽입합니다."
          : "인피드는 PC 1920×1080 뷰포트에서 열립니다.";

  const isGdnMobileSurface =
    form.channel === "gdn" && form.gdnViewportMode === "mobile";

  const gdnAdSizeCatalog = useMemo(
    () => (isGdnMobileSurface ? GDN_AD_SIZES_MOBILE : GDN_AD_SIZES),
    [isGdnMobileSurface],
  );

  const hasValidSource = isYoutubeInstream
    ? form.instreamVideoUrl.trim().length > 0 && isValidHttpSource(form.instreamVideoUrl)
    : isYoutubeInfeed || isYoutubeShorts || isYoutubeMasthead
      ? (form.creativeUrl.trim() && isValidHttpSource(form.creativeUrl.trim())) ||
        (form.infeedVideoUrl.trim() && isValidHttpSource(form.infeedVideoUrl.trim()))
      : isMobileNativeChannel
        ? Boolean(form.creativeUrl.trim() && isValidHttpSource(form.creativeUrl.trim()))
      : form.creativeUrl && isValidUrl(form.creativeUrl);

  const isFormValid =
    (isAutoPublisherChannel || form.selectedPublishers.length > 0) &&
    hasValidSource;

  /** 폼 제출 */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isFormValid) {
      showToast("error", "게재면과 소재를 올바르게 선택해주세요.");
      return;
    }

    setIsSubmitting(true);

    try {
      // 자동 지면 채널은 기본 게재면 URL을 지정한다.
      // YouTube는 콘텐츠 URL이 입력되었으면 해당 URL, 없으면 한국 인기 콘텐츠 중 랜덤.
      const KOREAN_FALLBACK_VIDEOS = [
        "https://www.youtube.com/watch?v=09R8_2nJtjg", // BLACKPINK - Pink Venom
        "https://www.youtube.com/watch?v=gdZLi9oWNZg", // BTS - Dynamite
        "https://www.youtube.com/watch?v=MBdVXkSdhwU", // IVE - After LIKE
        "https://www.youtube.com/watch?v=pB-5XG-DbAA", // NewJeans - Hype Boy
        "https://www.youtube.com/watch?v=ArmDp-zijuc", // aespa - Next Level
        "https://www.youtube.com/watch?v=Oc_D9oDKDqE", // TWICE - FANCY
        "https://www.youtube.com/watch?v=FodHDBg9q7E", // LE SSERAFIM - ANTIFRAGILE
        "https://www.youtube.com/watch?v=R4QhDP-SLQY", // BTS - Boy With Luv
      ];
      const randomKoreanUrl = KOREAN_FALLBACK_VIDEOS[Math.floor(Math.random() * KOREAN_FALLBACK_VIDEOS.length)];
      const contentVideoUrl = form.instreamPublisherVideoUrl?.trim() || randomKoreanUrl;
      const youtubePublisherUrls =
        form.youtubeAdType === "shorts-feed"
          ? [
              form.infeedVideoUrl.trim()
                ? normalizeHttpUrl(form.infeedVideoUrl.trim())
                : "https://www.youtube.com/shorts/",
            ]
          : form.youtubeAdType === "infeed-home" || form.youtubeAdType === "mobile-infeed-home"
            ? ["https://www.youtube.com/"]
            : form.youtubeAdType === "masthead-home"
              ? ["https://www.youtube.com/"]
              : form.youtubeAdType === "infeed-search"
                ? [
                    `https://www.youtube.com/results?search_query=${encodeURIComponent(
                      form.infeedSearchQuery?.trim() || "시세이도",
                    )}`,
                  ]
                : [contentVideoUrl];
      const mobileNativePublisherUrls =
        form.channel === "naver"
          ? ["https://m.naver.com/"]
          : normalizeKakaoMobileSurface(form.mobileNativeSurface) === "kakao-bizboard"
            ? ["https://talk.kakao.com/"]
            : ["https://m.daum.net/"];
      const publisherUrls = isYouTubeChannel
        ? youtubePublisherUrls
        : isMobileNativeChannel
          ? mobileNativePublisherUrls
          : form.selectedPublishers;

      const res = await fetch("/api/captures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel: form.channel,
          publisherUrls,
          creativeUrl: form.creativeUrl,
          clickUrl: form.clickUrl || undefined,
          captureLanding: form.captureLanding,
          injectionMode: form.injectionMode,
          slotCount: form.slotCount,
          // 업로드한 배너의 실제 사이즈 (슬롯 매칭용)
          creativeDimensions:
            uploadedFile?.width && uploadedFile?.height
              ? { width: uploadedFile.width, height: uploadedFile.height }
              : undefined,
          // 사이즈 선택 모드 & 타겟 사이즈
          adSizeMode: form.adSizeMode,
          creativeObjectFit: form.creativeObjectFit,
          targetAdSizes: form.adSizeMode === "manual" ? form.targetAdSizes : [],
          // YouTube 광고 유형
          youtubeAdType:
            form.channel === "youtube" ? form.youtubeAdType : undefined,
          productFamily: isDemandGenProduct
            ? "demand-gen"
            : isMobileNativeChannel
              ? form.channel
              : undefined,
          productSurface: isDemandGenProduct
            ? form.demandGenSurface
            : isMobileNativeChannel
              ? form.mobileNativeSurface
              : undefined,
          gdnViewportMode:
            form.channel === "gdn" ? form.gdnViewportMode : undefined,
          mobileNativeOpts: isMobileNativeChannel
            ? {
                surface: form.mobileNativeSurface,
                title: form.instreamAdTitle || undefined,
                description1: form.infeedDescription1 || undefined,
                description2: form.infeedDescription2 || undefined,
                sponsorName: form.instreamDisplayUrl || undefined,
                displayUrl:
                  form.instreamDisplayUrl ||
                  (form.clickUrl ? normalizeHttpUrl(form.clickUrl) : undefined),
                ctaText:
                  form.infeedCtaPrimary ||
                  form.instreamCtaText ||
                  undefined,
                logoImageUrl: form.instreamLogoImageUrl
                  ? normalizeHttpUrl(form.instreamLogoImageUrl)
                  : undefined,
              }
            : undefined,
          // 인스트림 광고 옵션
          instreamOpts:
            form.channel === "youtube" && isYoutubeInstream
              ? {
                  videoUrl: form.instreamVideoUrl.trim()
                    ? normalizeHttpUrl(form.instreamVideoUrl)
                    : undefined,
                  skipSeconds: (() => {
                    const n = parseInt(form.instreamCaptureSecond, 10);
                    const safe = Number.isFinite(n) && n >= 0 ? n : 3;
                    return isBumperAd ? Math.min(safe, 5) : safe;
                  })(),
                  adTitle: form.instreamAdTitle || undefined,
                  enableCtaText: form.instreamEnableCtaText,
                  ctaText: form.instreamEnableCtaText
                    ? form.instreamCtaText || undefined
                    : undefined,
                  landingUrl: form.instreamLandingUrl.trim()
                    ? normalizeHttpUrl(form.instreamLandingUrl)
                    : undefined,
                  displayUrl: form.instreamDisplayUrl || undefined,
                  displayPath1: form.instreamDisplayPath1 || undefined,
                  displayPath2: form.instreamDisplayPath2 || undefined,
                  avatarImageUrl:
                    isMobilePreroll
                      ? form.instreamLogoSource === "upload"
                        ? form.instreamLogoImageUrl.trim()
                          ? normalizeHttpUrl(form.instreamLogoImageUrl)
                          : undefined
                        : undefined
                      : form.instreamLogoImageUrl.trim()
                        ? normalizeHttpUrl(form.instreamLogoImageUrl)
                        : undefined,
                  companionImageUrl:
                    form.instreamUseChannelBanner
                      ? undefined
                      : form.instreamCompanionImageUrl.trim()
                        ? normalizeHttpUrl(form.instreamCompanionImageUrl)
                        : undefined,
                  companionChannelUrl:
                    isMobilePreroll
                      ? form.instreamLogoSource === "channel"
                        ? form.instreamCompanionChannelUrl.trim()
                          ? normalizeHttpUrl(form.instreamCompanionChannelUrl)
                          : undefined
                        : undefined
                      : form.instreamUseChannelBanner
                        ? form.instreamCompanionChannelUrl.trim()
                          ? normalizeHttpUrl(form.instreamCompanionChannelUrl)
                          : undefined
                        : undefined,
                  companionUseChannelBanner: form.instreamUseChannelBanner,
                  enableCompanionBanner: form.instreamEnableCompanionBanner,
                  instreamSkipMode: isBumperAd ? "non-skippable" : form.instreamSkipMode,
                }
              : form.channel === "youtube" && (isYoutubeInfeed || isYoutubeShorts || isYoutubeMasthead)
                ? {
                    adTitle: form.instreamAdTitle || undefined,
                    landingUrl: form.instreamLandingUrl.trim()
                      ? normalizeHttpUrl(form.instreamLandingUrl)
                      : undefined,
                    displayUrl: form.instreamDisplayUrl || undefined,
                    avatarImageUrl: form.instreamLogoImageUrl.trim()
                      ? normalizeHttpUrl(form.instreamLogoImageUrl)
                      : undefined,
                    companionChannelUrl: form.instreamCompanionChannelUrl.trim()
                      ? normalizeHttpUrl(form.instreamCompanionChannelUrl)
                      : undefined,
                  }
                : undefined,
          infeedOpts:
            form.channel === "youtube" && (isYoutubeInfeed || isYoutubeShorts || isYoutubeMasthead)
              ? {
                  videoUrl: form.infeedVideoUrl.trim()
                    ? normalizeHttpUrl(form.infeedVideoUrl.trim())
                    : undefined,
                  searchQuery: form.infeedSearchQuery || undefined,
                  searchPlacement:
                    form.infeedSearchPlacement === "feed" ? "feed" : "top",
                  searchFeedInsertAfterIndex:
                    form.infeedSearchPlacement === "feed"
                      ? Math.max(
                          0,
                          Math.min(
                            12,
                            parseInt(form.infeedSearchFeedInsertAfterIndex || "1", 10) || 1
                          )
                        )
                      : undefined,
                  description1: form.infeedDescription1 || undefined,
                  description2: form.infeedDescription2 || undefined,
                  ctaPrimary: form.infeedCtaPrimary || undefined,
                  ctaSecondary:
                    form.youtubeAdType === "infeed-watch-next"
                      ? undefined
                      : form.infeedCtaSecondary || undefined,
                }
              : undefined,
        }),
      });

      const result = await res.json();

      if (isLensAuthRequiredResponse(res, result)) {
        markAuthExpired(result?.error || LENS_AUTH_EXPIRED_MESSAGE);
        return;
      }

      if (!res.ok) {
        throw new Error(result.error || "캡처 요청에 실패했습니다.");
      }

      const siteCount = result.count || 1;
      setAuthExpiredMessage(null);
      showToast("success", `${siteCount}개 사이트 캡처 요청이 생성되었습니다!`);

      if (onCaptureCreated && result.data) {
        onCaptureCreated(result.data);
      }

      // 폼 초기화
      setForm((prev) => ({
        ...prev,
        selectedPublishers: [],
        creativeUrl: "",
        clickUrl: "",
        captureLanding: false,
        instreamVideoUrl: "",
        instreamPublisherVideoUrl: "",
        instreamCaptureSecond: "5",
        instreamAdTitle: "",
        instreamEnableCtaText: true,
        instreamCtaText: "",
        instreamLandingUrl: "",
        instreamDisplayUrl: "",
        instreamDisplayPath1: "",
        instreamDisplayPath2: "",
        instreamLogoSource: "channel",
        instreamLogoImageUrl: "",
        instreamCompanionImageUrl: "",
        instreamCompanionChannelUrl: "",
        instreamUseChannelBanner: true,
        instreamSkipMode: "skippable",
        gdnViewportMode: "pc",
        infeedVideoUrl: "",
        infeedSearchQuery: "시세이도",
        infeedDescription1: "",
        infeedDescription2: "",
        infeedCtaPrimary: "",
        infeedCtaSecondary: "",
        infeedSearchPlacement: "top",
        infeedSearchFeedInsertAfterIndex: "1",
      }));
      setUploadedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.";
      showToast("error", errorMessage);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <form
        onSubmit={handleSubmit}
        className="glass-card-static p-6 animate-fade-in"
      >
        {authExpiredMessage && (
          <div className="mb-5 rounded-xl border border-[rgba(239,68,68,0.22)] bg-[rgba(239,68,68,0.08)] p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-[var(--color-error)]">세션 확인 필요</p>
                <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                  {authExpiredMessage}
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  window.location.assign(buildLensLoginPath("/#capture-studio"))
                }
                className="inline-flex items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-tertiary)]"
              >
                다시 로그인
              </button>
            </div>
          </div>
        )}

        {/* 헤더 */}
        <div className="flex items-center gap-3 mb-6">
          <div className="ops-icon-tile">요청</div>
          <div>
            <h2
              className="ops-section-title"
              style={{ color: "var(--color-text-primary)" }}
            >
              새 캡처 요청
            </h2>
            <p className="text-xs" style={{ color: "var(--color-text-muted)" }}>
              광고 게재면과 소재를 선택하세요
            </p>
          </div>
        </div>

        {/* ===== 매체 / 상품 / 상세 옵션 선택 ===== */}
        <div className="mb-5 space-y-3">
          <div>
            <label className="form-label">1) 매체 선택</label>
            <select
              className="form-input"
              value={selectedMediaMenu}
              onChange={(e) => {
                const next = e.target.value as MediaMenu;
                setIsOptionPanelExpanded(false);
                if (next === "youtube") {
                  setForm((prev) => ({
                    ...prev,
                    mediaMenu: "youtube",
                    channel: "youtube",
                    googleAdsProduct: "network-ads",
                    youtubeAdType: "mobile-preroll-aos",
                  }));
                } else if (next === "naver") {
                  setForm((prev) => ({
                    ...prev,
                    mediaMenu: "naver",
                    channel: "naver",
                    googleAdsProduct: "network-ads",
                    mobileNativeSurface: "naver-smart-channel-mobile",
                  }));
                } else if (next === "kakao") {
                  setForm((prev) => ({
                    ...prev,
                    mediaMenu: "kakao",
                    channel: "kakao",
                    googleAdsProduct: "network-ads",
                    mobileNativeSurface: "kakao-bizboard",
                  }));
                } else {
                  setForm((prev) => ({
                    ...prev,
                    mediaMenu: next,
                    channel: "gdn",
                    googleAdsProduct: "network-ads",
                    gdnViewportMode: "pc",
                  }));
                }
              }}
            >
              {MEDIA_SELECT_OPTIONS.map((m) => (
                <option key={m.value} value={m.value} disabled={!m.enabled}>
                  {m.label} {!m.enabled ? "(준비중)" : ""}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="form-label">2) 상품 선택</label>
            <select
              className="form-input"
              value={selectedProduct}
              onChange={(e) => {
                const next = e.target.value;
                setIsOptionPanelExpanded(false);
                if (next === "instream") {
                  setForm((prev) => ({
                    ...prev,
                    mediaMenu: "youtube",
                    channel: "youtube",
                    youtubeAdType: "mobile-preroll-aos",
                  }));
                } else if (next === "shorts") {
                  setForm((prev) => ({
                    ...prev,
                    mediaMenu: "youtube",
                    channel: "youtube",
                    youtubeAdType: "shorts-feed",
                  }));
                } else if (next === "masthead") {
                  setForm((prev) => ({
                    ...prev,
                    mediaMenu: "youtube",
                    channel: "youtube",
                    youtubeAdType: "masthead-home",
                  }));
                } else if (next === "infeed") {
                  setForm((prev) => ({
                    ...prev,
                    mediaMenu: "youtube",
                    channel: "youtube",
                    youtubeAdType: "mobile-infeed-home",
                  }));
                } else if (next === "demandgen") {
                  setForm((prev) => ({
                    ...prev,
                    mediaMenu: "gdn",
                    channel: "youtube",
                    googleAdsProduct: "demandgen",
                    demandGenSurface: "youtube-feed",
                    youtubeAdType: "mobile-infeed-home",
                  }));
                } else if (next === "naver-mobile") {
                  setForm((prev) => ({
                    ...prev,
                    mediaMenu: "naver",
                    channel: "naver",
                    googleAdsProduct: "network-ads",
                    mobileNativeSurface: "naver-smart-channel-mobile",
                  }));
                } else if (next === "kakao-mobile") {
                  setForm((prev) => ({
                    ...prev,
                    mediaMenu: "kakao",
                    channel: "kakao",
                    googleAdsProduct: "network-ads",
                    mobileNativeSurface: "kakao-bizboard",
                  }));
                } else {
                  setForm((prev) => ({
                    ...prev,
                    mediaMenu: "gdn",
                    channel: "gdn",
                    googleAdsProduct: "network-ads",
                    gdnViewportMode: "pc",
                  }));
                }
              }}
            >
              {selectedMediaMenu === "youtube" ? (
                <>
                  {YOUTUBE_PRODUCT_OPTIONS.map((option) => (
                    <option
                      key={option.value}
                      value={option.value}
                      disabled={option.disabled}
                    >
                      {option.label}
                    </option>
                  ))}
                </>
              ) : selectedMediaMenu === "naver" ? (
                <>
                  {NAVER_PRODUCT_OPTIONS.map((option) => (
                    <option
                      key={option.value}
                      value={option.value}
                      disabled={option.disabled}
                    >
                      {option.label}
                    </option>
                  ))}
                </>
              ) : selectedMediaMenu === "kakao" ? (
                <>
                  {KAKAO_PRODUCT_OPTIONS.map((option) => (
                    <option
                      key={option.value}
                      value={option.value}
                      disabled={option.disabled}
                    >
                      {option.label}
                    </option>
                  ))}
                </>
              ) : (
                <>
                  {GOOGLE_ADS_PRODUCT_OPTIONS.map((option) => (
                    <option
                      key={option.value}
                      value={option.value}
                      disabled={option.disabled}
                    >
                      {option.label}
                    </option>
                  ))}
                </>
              )}
            </select>
          </div>

          <div>
            <label className="form-label">3) 상세 옵션</label>
            <select
              className="form-input"
              value={selectedOptionPreset}
              onChange={(e) => {
                const preset = e.target.value;
                setIsOptionPanelExpanded(true);
                if (preset === "gdn-pc") {
                  setForm((prev) => ({
                    ...prev,
                    mediaMenu: "gdn",
                    channel: "gdn",
                    googleAdsProduct: "network-ads",
                    gdnViewportMode: "pc",
                  }));
                  return;
                }
                if (preset === "gdn-mobile") {
                  setForm((prev) => ({
                    ...prev,
                    mediaMenu: "gdn",
                    channel: "gdn",
                    googleAdsProduct: "network-ads",
                    gdnViewportMode: "mobile",
                    targetAdSizes: prev.targetAdSizes.filter((s) =>
                      GDN_MOBILE_SIZE_KEYS.has(s),
                    ),
                  }));
                  return;
                }
                if (preset === "demandgen-youtube-feed") {
                  setForm((prev) => ({
                    ...prev,
                    mediaMenu: "gdn",
                    channel: "youtube",
                    googleAdsProduct: "demandgen",
                    demandGenSurface: "youtube-feed",
                    youtubeAdType: "mobile-infeed-home",
                  }));
                  return;
                }
                if (preset === "demandgen-youtube-shorts") {
                  setForm((prev) => ({
                    ...prev,
                    mediaMenu: "gdn",
                    channel: "youtube",
                    googleAdsProduct: "demandgen",
                    demandGenSurface: "youtube-shorts",
                    youtubeAdType: "shorts-feed",
                  }));
                  return;
                }
                if (isNaverDetailPreset(preset)) {
                  setForm((prev) => ({
                    ...prev,
                    mediaMenu: "naver",
                    channel: "naver",
                    googleAdsProduct: "network-ads",
                    mobileNativeSurface: normalizeNaverMobileSurface(preset),
                  }));
                  return;
                }
                if (isKakaoDetailPreset(preset)) {
                  setForm((prev) => ({
                    ...prev,
                    mediaMenu: "kakao",
                    channel: "kakao",
                    googleAdsProduct: "network-ads",
                    mobileNativeSurface: normalizeKakaoMobileSurface(preset),
                  }));
                  return;
                }
                if (preset === "pc-skip") {
                  setForm((prev) => ({
                    ...prev,
                    mediaMenu: "youtube",
                    channel: "youtube",
                    youtubeAdType: "preroll",
                    instreamSkipMode: "skippable",
                    instreamCaptureSecond: "5",
                  }));
                  return;
                }
                if (preset === "pc-non-skip") {
                  setForm((prev) => ({
                    ...prev,
                    mediaMenu: "youtube",
                    channel: "youtube",
                    youtubeAdType: "preroll",
                    instreamSkipMode: "non-skippable",
                  }));
                  return;
                }
                if (preset === "pc-bumper") {
                  setForm((prev) => ({
                    ...prev,
                    mediaMenu: "youtube",
                    channel: "youtube",
                    youtubeAdType: "bumper",
                    instreamSkipMode: "non-skippable",
                    instreamCaptureSecond: "3",
                  }));
                  return;
                }
                if (preset === "aos-skip") {
                  setForm((prev) => ({
                    ...prev,
                    mediaMenu: "youtube",
                    channel: "youtube",
                    youtubeAdType: "mobile-preroll-aos",
                    instreamSkipMode: "skippable",
                    instreamCaptureSecond: "5",
                  }));
                  return;
                }
                if (preset === "aos-non-skip") {
                  setForm((prev) => ({
                    ...prev,
                    mediaMenu: "youtube",
                    channel: "youtube",
                    youtubeAdType: "mobile-preroll-aos",
                    instreamSkipMode: "non-skippable",
                  }));
                  return;
                }
                if (preset === "aos-bumper") {
                  setForm((prev) => ({
                    ...prev,
                    mediaMenu: "youtube",
                    channel: "youtube",
                    youtubeAdType: "mobile-bumper-aos",
                    instreamSkipMode: "non-skippable",
                    instreamCaptureSecond: "3",
                  }));
                  return;
                }
                if (preset === "ios-skip") {
                  setForm((prev) => ({
                    ...prev,
                    mediaMenu: "youtube",
                    channel: "youtube",
                    youtubeAdType: "mobile-preroll-ios",
                    instreamSkipMode: "skippable",
                    instreamCaptureSecond: "5",
                  }));
                  return;
                }
                if (preset === "ios-non-skip") {
                  setForm((prev) => ({
                    ...prev,
                    mediaMenu: "youtube",
                    channel: "youtube",
                    youtubeAdType: "mobile-preroll-ios",
                    instreamSkipMode: "non-skippable",
                  }));
                  return;
                }
                if (preset === "ios-bumper") {
                  setForm((prev) => ({
                    ...prev,
                    mediaMenu: "youtube",
                    channel: "youtube",
                    youtubeAdType: "mobile-bumper-ios",
                    instreamSkipMode: "non-skippable",
                    instreamCaptureSecond: "3",
                  }));
                  return;
                }
                if (preset === "shorts-feed") {
                  setForm((prev) => ({
                    ...prev,
                    mediaMenu: "youtube",
                    channel: "youtube",
                    youtubeAdType: "shorts-feed",
                  }));
                  return;
                }
                if (preset === "masthead-home") {
                  setForm((prev) => ({
                    ...prev,
                    mediaMenu: "youtube",
                    channel: "youtube",
                    youtubeAdType: "masthead-home",
                  }));
                  return;
                }
                if (preset === "infeed-home") {
                  setForm((prev) => ({
                    ...prev,
                    mediaMenu: "youtube",
                    channel: "youtube",
                    youtubeAdType: "infeed-home",
                  }));
                  return;
                }
                if (preset === "mo-infeed-home") {
                  setForm((prev) => ({
                    ...prev,
                    mediaMenu: "youtube",
                    channel: "youtube",
                    youtubeAdType: "mobile-infeed-home",
                  }));
                  return;
                }
                if (preset === "infeed-search") {
                  setForm((prev) => ({
                    ...prev,
                    mediaMenu: "youtube",
                    channel: "youtube",
                    youtubeAdType: "infeed-search",
                  }));
                  return;
                }
                if (preset === "infeed-watch-next") {
                  setForm((prev) => ({
                    ...prev,
                    mediaMenu: "youtube",
                    channel: "youtube",
                    youtubeAdType: "infeed-watch-next",
                  }));
                }
              }}
            >
              {selectedMediaMenu === "youtube" ? (
                <>
                  <optgroup label="선택 가능한 상세 옵션">
                    {availableYoutubeDetailOptions.map((option) => (
                      <option
                        key={option.value}
                        value={option.value}
                        disabled={option.disabled}
                      >
                        {option.label}
                      </option>
                    ))}
                  </optgroup>
                </>
              ) : selectedMediaMenu === "naver" || selectedMediaMenu === "kakao" ? (
                <>
                  {availableMobileNativeDetailOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </>
              ) : (
                <>
                  {availableGoogleAdsDetailOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </>
              )}
            </select>
          </div>

          <button
            type="button"
            className="text-xs underline"
            style={{ color: "var(--color-text-muted)" }}
            onClick={() => setIsOptionPanelExpanded((v) => !v)}
          >
            {isOptionPanelExpanded ? "선택된 옵션 접기" : "선택된 옵션 펼치기"}
          </button>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-[10px] px-2 py-1 rounded-full bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]">
              매체:{" "}
              {selectedMediaMenu === "youtube"
                ? "YouTube"
                : selectedMediaMenu === "naver"
                  ? "Naver"
                  : selectedMediaMenu === "kakao"
                    ? "Kakao"
                    : "Google Ads"}
            </span>
            <span className="text-[10px] px-2 py-1 rounded-full bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]">
              상품: {productLabel[selectedProduct]}
            </span>
            <span className="text-[10px] px-2 py-1 rounded-full bg-[var(--color-accent-subtle)] text-[var(--color-accent)]">
              상세:{" "}
              {detailOptionLabel[selectedOptionPreset] ?? selectedOptionPreset}
            </span>
          </div>
        </div>

        {isOptionPanelExpanded && form.channel === "youtube" && (
          <div className="mb-5 animate-fade-in">
            <p className="form-helper mt-1.5">
              {isDemandGenProduct &&
                (form.demandGenSurface === "youtube-shorts"
                  ? "Demand Gen 1차는 Google Ads 상품 흐름에서 YouTube Shorts 증빙 화면을 생성합니다."
                  : "Demand Gen 1차는 Google Ads 상품 흐름에서 YouTube Feed 증빙 화면을 생성합니다.")}
              {form.youtubeAdType === "bumper" &&
                "범퍼는 6초 이하 non-skippable 인스트림으로 처리되며 캡처 시점은 0~5초로 제한됩니다."}
              {form.youtubeAdType === "mobile-bumper-aos" &&
                "AOS 범퍼는 Pixel 8 뷰포트의 6초 이하 non-skippable 인스트림으로 캡처됩니다."}
              {form.youtubeAdType === "mobile-bumper-ios" &&
                "iOS 범퍼는 iPhone 15 뷰포트의 6초 이하 non-skippable 인스트림으로 캡처됩니다."}
              {form.youtubeAdType === "mobile-preroll-aos" &&
                "모바일 인스트림은 Android(Pixel 8) 뷰포트 기준으로 캡처됩니다."}
              {form.youtubeAdType === "mobile-preroll-ios" &&
                "모바일 인스트림은 iPhone 15 뷰포트 기준으로 캡처됩니다."}
              {!isDemandGenProduct && isYoutubeShorts &&
                "Shorts 피드는 9:16 모바일 화면에서 광고 소재, 스폰서 정보, CTA를 합성 렌더링합니다."}
              {isYoutubeMasthead &&
                "Masthead 홈은 YouTube 홈 최상단 대형 예약형 지면으로 합성 렌더링합니다."}
              {!isDemandGenProduct && isYoutubeInfeed &&
                infeedSurfaceHint}
            </p>

            {/* 인스트림/범퍼 광고 상세 옵션 */}
            {isYoutubeInstream && (
              <div
                className="mt-4 rounded-xl border p-4 animate-fade-in"
                style={{
                  borderColor: "var(--color-border)",
                  backgroundColor: "var(--color-bg-primary)",
                }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <span className="form-section-code">YT</span>
                  <p
                    className="text-sm font-semibold"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    {isBumperAd ? "범퍼 광고 정보" : "인스트림 광고 정보"}
                  </p>
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded-full"
                    style={{
                      backgroundColor: "var(--color-bg-tertiary)",
                      color: "var(--color-text-muted)",
                    }}
                  >
                    선택사항
                  </span>
                </div>
                <p
                  className="text-[11px] mb-3"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  실제 YouTube 인스트림 계열 광고처럼 CTA 카드, 스폰서 정보가
                  표시됩니다. 범퍼는 non-skippable 6초 상품으로 저장됩니다.
                </p>

                <div className="space-y-3">
                  {/* 영상 원본 URL */}
                  <div>
                    <label
                      className="text-[11px] font-medium mb-1 block"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      광고 동영상 원본 URL <span style={{ color: "var(--color-error)" }}>*</span>
                    </label>
                    <input
                      type="url"
                      className="form-input"
                      placeholder="https://www.youtube.com/watch?v=..."
                      value={form.instreamVideoUrl}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          instreamVideoUrl: e.target.value,
                        }))
                      }
                    />
                    <p
                      className="text-[10px] mt-0.5"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      프레임 추출 대상이 되는 광고 원본 영상 URL입니다.
                    </p>
                  </div>

                  {/* 콘텐츠(게재면) 영상 URL */}
                  <div>
                    <label
                      className="text-[11px] font-medium mb-1 block"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      콘텐츠 영상 URL <span className="text-[10px] font-normal" style={{ color: "var(--color-text-muted)" }}>(선택 – 미입력 시 한국 인기 영상 랜덤)</span>
                    </label>
                    <input
                      type="url"
                      className="form-input"
                      placeholder="https://www.youtube.com/watch?v=..."
                      value={form.instreamPublisherVideoUrl}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          instreamPublisherVideoUrl: e.target.value,
                        }))
                      }
                    />
                    <p
                      className="text-[10px] mt-0.5"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      광고가 노출될 유튜브 콘텐츠 영상입니다. 비워두면 한국 인기 영상이 자동 선택됩니다.
                    </p>
                  </div>

                  {/* 캡처를 원하는 시간(초) */}
                  <div>
                    <label
                      className="text-[11px] font-medium mb-1 block"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      프레임 캡처 시점 (초) <span style={{ color: "var(--color-error)" }}>*</span>
                    </label>
                    <input
                      type="number"
                      className="form-input"
                      placeholder="예: 10"
                      min="0"
                      value={form.instreamCaptureSecond}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          instreamCaptureSecond: e.target.value,
                        }))
                      }
                    />
                    <p
                      className="text-[10px] mt-0.5"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      {isBumperAd
                        ? "범퍼는 6초 이하 상품이므로 0~5초 범위에서 캡처합니다."
                        : form.instreamSkipMode === "skippable"
                          ? "입력한 초수의 프레임을 추출합니다. Skip은 5초 이후 노출되며 5초 미만은 진행바만 표시됩니다."
                          : "입력한 초수의 프레임을 추출합니다. 예: 10 입력 시 10초 프레임 캡처"}
                    </p>
                  </div>

                  {/* 랜딩 URL */}
                  <div>
                    <label
                      className="text-[11px] font-medium mb-1 block"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      랜딩 URL
                    </label>
                    <input
                      type="url"
                      className="form-input"
                      placeholder="https://www.samsung.com/galaxy-s25"
                      value={form.instreamLandingUrl}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          instreamLandingUrl: e.target.value,
                        }))
                      }
                    />
                    <p
                      className="text-[10px] mt-0.5"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      광고 클릭 시 이동할 페이지 URL (도메인이 CTA 카드 하단에
                      표시됩니다)
                    </p>
                  </div>

                  {/* CTA 버튼 텍스트 */}
                  <div>
                    <label className="flex items-center gap-2 text-[11px] mb-1" style={{ color: "var(--color-text-secondary)" }}>
                      <input
                        type="checkbox"
                        checked={form.instreamEnableCtaText}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            instreamEnableCtaText: e.target.checked,
                          }))
                        }
                      />
                      클릭 유도문안
                    </label>
                    {form.instreamEnableCtaText && (
                      <>
                    <label
                      className="text-[11px] font-medium mb-1 block"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      CTA 버튼 텍스트
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        className="form-input pr-12"
                        placeholder="예: 더알아보기"
                        value={form.instreamCtaText}
                        onChange={(e) => {
                          const val = e.target.value;
                          let b = 0;
                          for (let i = 0; i < val.length; i++) {
                            b += /[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(val[i]) ? 2 : 1;
                          }
                          if (b <= 10) {
                            setForm((prev) => ({
                              ...prev,
                              instreamCtaText: val,
                            }));
                          }
                        }}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">
                        {(() => {
                          let b = 0;
                          const t = form.instreamCtaText || "";
                          for (let i = 0; i < t.length; i++) {
                            b += /[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(t[i]) ? 2 : 1;
                          }
                          return b;
                        })()}/10
                      </span>
                    </div>
                    <p
                      className="text-[10px] mt-0.5"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      클릭 유도문안 (예: 자세히 알아보기)
                    </p>
                      </>
                    )}
                  </div>

                  {/* 광고 제목 */}
                  <div>
                    <label
                      className="text-[11px] font-medium mb-1 block"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      광고 제목
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        className="form-input pr-12"
                        placeholder="예: 광고 제목"
                        value={form.instreamAdTitle}
                        onChange={(e) => {
                          const val = e.target.value;
                          let b = 0;
                          for (let i = 0; i < val.length; i++) {
                            b += /[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(val[i]) ? 2 : 1;
                          }
                          if (b <= 30) {
                            setForm((prev) => ({
                              ...prev,
                              instreamAdTitle: val,
                            }));
                          }
                        }}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-gray-400">
                        {(() => {
                          let b = 0;
                          const t = form.instreamAdTitle || "";
                          for (let i = 0; i < t.length; i++) {
                            b += /[ㄱ-ㅎㅏ-ㅣ가-힣]/.test(t[i]) ? 2 : 1;
                          }
                          return b;
                        })()}/30
                      </span>
                    </div>
                  </div>

                  {/* 표시 URL */}
                  <div>
                    <label
                      className="text-[11px] font-medium mb-1 block"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      표시 URL
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="예: admate-capture-pro.vercel.app/ab/cd"
                      value={form.instreamDisplayUrl}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          instreamDisplayUrl: e.target.value,
                        }))
                      }
                    />
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <input
                        type="text"
                        className="form-input"
                        placeholder="경로 1"
                        value={form.instreamDisplayPath1}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            instreamDisplayPath1: e.target.value,
                          }))
                        }
                      />
                      <input
                        type="text"
                        className="form-input"
                        placeholder="경로 2"
                        value={form.instreamDisplayPath2}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            instreamDisplayPath2: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>

                  {/* 로고 이미지 */}
                  <div>
                    <label
                      className="text-[11px] font-medium mb-1 block"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      로고 이미지
                    </label>

                    {isMobilePreroll && (
                      <div className="space-y-2 mb-2">
                        <label className="flex items-center gap-2 text-xs" style={{ color: "var(--color-text-secondary)" }}>
                          <input
                            type="radio"
                            name="mobile-logo-mode"
                            checked={form.instreamLogoSource === "channel"}
                            onChange={() =>
                              setForm((prev) => ({
                                ...prev,
                                instreamLogoSource: "channel",
                              }))
                            }
                          />
                          채널 배너를 사용하여 자동 생성 (권장)
                        </label>
                        <label className="flex items-center gap-2 text-xs" style={{ color: "var(--color-text-secondary)" }}>
                          <input
                            type="radio"
                            name="mobile-logo-mode"
                            checked={form.instreamLogoSource === "upload"}
                            onChange={() =>
                              setForm((prev) => ({
                                ...prev,
                                instreamLogoSource: "upload",
                              }))
                            }
                          />
                          이미지 업로드
                        </label>
                      </div>
                    )}

                    {isMobilePreroll && form.instreamLogoSource === "channel" && (
                      <div className="space-y-2">
                        <input
                          type="text"
                          className="form-input"
                          placeholder="채널 URL (예: https://youtube.com/@shiseidokorea)"
                          value={form.instreamCompanionChannelUrl}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              instreamCompanionChannelUrl: e.target.value,
                            }))
                          }
                        />
                        <p className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>
                          * 채널 URL에서 로고를 자동으로 가져옵니다.
                        </p>
                      </div>
                    )}

                    {(!isMobilePreroll || form.instreamLogoSource === "upload") && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          className="btn btn-secondary text-xs px-3 py-1.5"
                          onClick={() => logoInputRef.current?.click()}
                          disabled={isLogoUploading}
                        >
                          {isLogoUploading ? "업로드 중..." : "파일 업로드"}
                        </button>
                        <input
                          ref={logoInputRef}
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/gif"
                          onChange={handleLogoSelect}
                          className="hidden"
                        />
                        {form.instreamLogoImageUrl && (
                          <a
                            href={form.instreamLogoImageUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[11px] text-[var(--color-accent)] hover:underline truncate"
                          >
                            업로드된 로고 보기
                          </a>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 컴패니언 배너 — 모바일 모드에서는 숨김 */}
                  {!isMobilePreroll && (
                  <div>
                    <div className="flex items-center mb-1 gap-2">
                      <label
                        className="text-[11px] font-medium block"
                        style={{ color: "var(--color-text-secondary)" }}
                      >
                        컴패니언 배너 (컴퓨터)
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          className="w-3 h-3 rounded"
                          style={{ accentColor: "var(--color-accent)", borderColor: "var(--color-border-input)" }}
                          checked={form.instreamEnableCompanionBanner}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              instreamEnableCompanionBanner: e.target.checked,
                            }))
                          }
                        />
                        <span className="text-[10px]" style={{ color: "var(--color-text-muted)" }}>배너 표시</span>
                      </label>
                    </div>
                    {form.instreamEnableCompanionBanner && (
                      <>
                        <div className="space-y-2">
                          <label className="flex items-center gap-2 text-xs" style={{ color: "var(--color-text-secondary)" }}>
                            <input
                              type="radio"
                              name="companion-mode"
                              checked={form.instreamUseChannelBanner}
                              onChange={() =>
                                setForm((prev) => ({
                                  ...prev,
                                  instreamUseChannelBanner: true,
                                }))
                              }
                            />
                            채널 배너를 사용하여 자동 생성 (권장)
                          </label>
                          <label className="flex items-center gap-2 text-xs" style={{ color: "var(--color-text-secondary)" }}>
                            <input
                              type="radio"
                              name="companion-mode"
                              checked={!form.instreamUseChannelBanner}
                              onChange={() =>
                                setForm((prev) => ({
                                  ...prev,
                                  instreamUseChannelBanner: false,
                                }))
                              }
                            />
                            이미지 업로드
                          </label>
                        </div>
                        {form.instreamUseChannelBanner && (
                          <div className="mt-2 space-y-2">
                            <input
                              type="text"
                              className="form-input"
                              placeholder="채널 URL (예: https://youtube.com/@shiseidokorea)"
                              value={form.instreamCompanionChannelUrl}
                              onChange={(e) =>
                                setForm((prev) => ({
                                  ...prev,
                                  instreamCompanionChannelUrl: e.target.value,
                                }))
                              }
                            />
                            <p
                              className="text-[10px] mt-0.5"
                              style={{ color: "var(--color-text-muted)" }}
                            >
                              * 해당 채널의 배너 이미지를 가져와 적용합니다.
                            </p>
                          </div>
                        )}
                        {!form.instreamUseChannelBanner && (
                          <div className="mt-2 space-y-2">
                            <button
                              type="button"
                              className="btn btn-secondary text-xs px-3 py-1.5"
                              onClick={() => companionInputRef.current?.click()}
                              disabled={isCompanionUploading}
                            >
                              {isCompanionUploading ? "업로드 중..." : "파일 선택"}
                            </button>
                            <input
                              ref={companionInputRef}
                              type="file"
                              accept="image/png,image/jpeg,image/webp,image/gif"
                              onChange={handleCompanionSelect}
                              className="hidden"
                            />
                            <input
                              type="text"
                              inputMode="url"
                              autoComplete="url"
                              className="form-input"
                              placeholder="또는 이미지 URL (스킴 생략 가능)"
                              value={form.instreamCompanionImageUrl}
                              onChange={(e) =>
                                setForm((prev) => ({
                                  ...prev,
                                  instreamCompanionImageUrl: e.target.value,
                                }))
                              }
                            />
                          </div>
                        )}
                        <p
                          className="text-[10px] mt-0.5"
                          style={{ color: "var(--color-text-muted)" }}
                        >
                          크기: 300x60픽셀, 최대 파일 크기: 150KB
                        </p>
                      </>
                    )}
                  </div>
                  )} {/* /isMobilePreroll companion banner */}
                </div>
              </div>
            )}

            {(isYoutubeInfeed || isYoutubeShorts || isYoutubeMasthead) && (
              <div
                className="mt-4 rounded-xl border p-4 animate-fade-in"
                style={{
                  borderColor: "var(--color-border)",
                  backgroundColor: "var(--color-bg-primary)",
                }}
              >
                <div className="flex items-center gap-2 mb-3">
                  <span className="form-section-code">FEED</span>
                  <p
                    className="text-sm font-semibold"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    {isYoutubeShorts
                      ? "Shorts 광고 정보"
                      : isYoutubeMasthead
                        ? "Masthead 광고 정보"
                        : "인피드 광고 정보"}
                  </p>
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded-full"
                    style={{
                      backgroundColor: "var(--color-bg-tertiary)",
                      color: "var(--color-text-muted)",
                    }}
                  >
                    {isYoutubeShorts
                      ? "Shorts 피드"
                      : isYoutubeMasthead
                        ? "Masthead 홈"
                        : infeedTypeLabel}
                  </span>
                </div>
                <p
                  className="text-[11px] mb-3"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  <span style={{ color: "var(--color-error)" }}>※</span> 광고 영상 URL과
                  하단 소재 이미지 중 <strong>최소 하나</strong>는 입력해야 합니다. 제목·스폰서명·
                  채널 아이콘은 아래에서 지정할 수 있고, CTA는 비우면 지면 유형별 기본값이
                  적용됩니다.
                </p>
                <p
                  className="text-[10px] mb-3"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  지면 안내:{" "}
                  {isYoutubeShorts
                    ? "Shorts 모바일 피드 화면으로 합성 렌더링합니다."
                    : isYoutubeMasthead
                      ? "YouTube 홈 상단의 대형 Masthead 지면으로 합성 렌더링합니다."
                      : infeedSurfaceHint}
                </p>
                <div className="space-y-3">
                  <div>
                    <label
                      className="text-[11px] font-medium mb-1 block"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      광고 영상 URL{" "}
                      <span
                        className="text-[10px] font-normal"
                        style={{ color: "var(--color-text-muted)" }}
                      >
                        (YouTube watch / youtu.be — 썸네일 자동)
                      </span>
                    </label>
                    <input
                      type="text"
                      inputMode="url"
                      autoComplete="url"
                      className="form-input"
                      placeholder="https://www.youtube.com/watch?v=... 또는 www.youtube.com/..."
                      value={form.infeedVideoUrl}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          infeedVideoUrl: e.target.value,
                        }))
                      }
                    />
                    <p
                      className="text-[10px] mt-0.5"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      소재 이미지를 함께 넣으면 이미지가 썸네일로 우선합니다.
                    </p>
                  </div>
                  {form.youtubeAdType === "infeed-search" && (
                    <>
                      <div>
                        <label
                          className="text-[11px] font-medium mb-1 block"
                          style={{ color: "var(--color-text-secondary)" }}
                        >
                          검색어
                        </label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="예: 시세이도"
                          value={form.infeedSearchQuery}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              infeedSearchQuery: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div>
                        <label
                          className="text-[11px] font-medium mb-1 block"
                          style={{ color: "var(--color-text-secondary)" }}
                        >
                          검색결과 내 광고 위치
                        </label>
                        <div className="flex flex-col gap-2">
                          <label className="flex items-center gap-2 cursor-pointer text-[12px]">
                            <input
                              type="radio"
                              name="infeedSearchPlacement"
                              checked={form.infeedSearchPlacement === "top"}
                              onChange={() =>
                                setForm((p) => ({ ...p, infeedSearchPlacement: "top" }))
                              }
                            />
                            <span>최상단 (첫 검색결과 위)</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer text-[12px]">
                            <input
                              type="radio"
                              name="infeedSearchPlacement"
                              checked={form.infeedSearchPlacement === "feed"}
                              onChange={() =>
                                setForm((p) => ({ ...p, infeedSearchPlacement: "feed" }))
                              }
                            />
                            <span>
                              피드 중간 (다른 검색 결과 사이, 실제 페이지에 가깝게)
                            </span>
                          </label>
                          {form.infeedSearchPlacement === "feed" && (
                            <div className="pl-6 pt-1">
                              <label
                                className="text-[10px] font-medium mb-0.5 block"
                                style={{ color: "var(--color-text-muted)" }}
                              >
                                삽입 기준: 몇 번째 결과(0부터) 바로 아래 (0~12)
                              </label>
                              <input
                                type="number"
                                min={0}
                                max={12}
                                className="form-input max-w-[120px]"
                                value={form.infeedSearchFeedInsertAfterIndex}
                                onChange={(e) =>
                                  setForm((prev) => ({
                                    ...prev,
                                    infeedSearchFeedInsertAfterIndex: e.target.value,
                                  }))
                                }
                              />
                            </div>
                          )}
                        </div>
                      </div>

                    </>
                  )}
                  {form.youtubeAdType === "infeed-watch-next" && (
                    <>
                      <div>
                        <label
                          className="text-[11px] font-medium mb-1 block"
                          style={{ color: "var(--color-text-secondary)" }}
                        >
                          콘텐츠(시청) 영상 URL{" "}
                          <span
                            className="text-[10px] font-normal"
                            style={{ color: "var(--color-text-muted)" }}
                          >
                            (선택 – 미입력 시 인기 영상 랜덤)
                          </span>
                        </label>
                        <input
                          type="url"
                          className="form-input"
                          placeholder="https://www.youtube.com/watch?v=..."
                          value={form.instreamPublisherVideoUrl}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              instreamPublisherVideoUrl: e.target.value,
                            }))
                          }
                        />
                      </div>

                    </>
                  )}
                  <div>
                    <label
                      className="text-[11px] font-medium mb-1 block"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      광고 제목
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      value={form.instreamAdTitle}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          instreamAdTitle: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div>
                    <label
                      className="text-[11px] font-medium mb-1 block"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      설명(Description) 텍스트 (본문 첫 줄)
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="예: 이걸로도 안가려지는 기미가 없어요"
                      value={form.infeedDescription1}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          infeedDescription1: e.target.value,
                        }))
                      }
                    />
                  </div>
                  {form.youtubeAdType !== "infeed-home" && form.youtubeAdType !== "mobile-infeed-home" && (
                    <div>
                      <label
                        className="text-[11px] font-medium mb-1 block"
                        style={{ color: "var(--color-text-secondary)" }}
                      >
                        보조 설명 텍스트 (본문 둘째 줄, 필요시)
                      </label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="대신 해 드려요"
                        value={form.infeedDescription2}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            infeedDescription2: e.target.value,
                          }))
                        }
                      />
                    </div>
                  )}
                  <div>
                    <label
                      className="text-[11px] font-medium mb-1 block"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      스폰서 표시(브랜드/도메인)
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="예: monday.com"
                      value={form.instreamDisplayUrl}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          instreamDisplayUrl: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div>
                    <label
                      className="text-[11px] font-medium mb-1 block"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      채널 아이콘 — 프로필 이미지 URL (선택)
                    </label>
                    <input
                      type="text"
                      inputMode="url"
                      autoComplete="url"
                      className="form-input"
                      placeholder="https://... (스킴 없이 www... 도 가능)"
                      value={form.instreamLogoImageUrl}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          instreamLogoImageUrl: e.target.value,
                        }))
                      }
                    />
                    <p
                      className="text-[10px] mt-0.5"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      비우면 채널 URL에서 자동 추출을 시도합니다.
                    </p>
                  </div>
                  <div>
                    <label
                      className="text-[11px] font-medium mb-1 block"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      채널 URL (아이콘 자동 추출용, 선택)
                    </label>
                    <input
                      type="text"
                      inputMode="url"
                      autoComplete="url"
                      className="form-input"
                      placeholder="www.youtube.com/@brand (https 없이 입력 가능)"
                      value={form.instreamCompanionChannelUrl}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          instreamCompanionChannelUrl: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div
                    className={
                      form.youtubeAdType === "infeed-watch-next"
                        ? "grid grid-cols-1 gap-3"
                        : "grid grid-cols-1 sm:grid-cols-2 gap-3"
                    }
                  >
                    <div>
                      <label
                        className="text-[11px] font-medium mb-1 block"
                        style={{ color: "var(--color-text-secondary)" }}
                      >
                        {form.youtubeAdType === "infeed-watch-next"
                          ? "CTA 버튼 (관련동영상은 1개만)"
                          : "주 CTA (비우면 기본)"}
                      </label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder={
                          form.youtubeAdType === "infeed-watch-next"
                            ? "사이트 방문"
                            : "시작하기 / 사이트 방문 / 견적 받기"
                        }
                        value={form.infeedCtaPrimary}
                        onChange={(e) =>
                          setForm((prev) => ({
                            ...prev,
                            infeedCtaPrimary: e.target.value,
                          }))
                        }
                      />
                    </div>
                    {form.youtubeAdType !== "infeed-watch-next" && (
                      <div>
                        <label
                          className="text-[11px] font-medium mb-1 block"
                          style={{ color: "var(--color-text-secondary)" }}
                        >
                          보조 CTA (비우면 기본)
                        </label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="시청"
                          value={form.infeedCtaSecondary}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              infeedCtaSecondary: e.target.value,
                            }))
                          }
                        />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {isOptionPanelExpanded && isMobileNativeChannel && (
          <div className="mb-5 animate-fade-in">
            <div
              className="rounded-xl border p-4"
              style={{
                borderColor: "var(--color-border)",
                backgroundColor: "var(--color-bg-primary)",
              }}
            >
              <div className="flex items-center gap-2 mb-3">
                <span className="form-section-code">
                  {form.channel === "naver" ? "NV" : "KK"}
                </span>
                <p
                  className="text-sm font-semibold"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  모바일 광고 정보
                </p>
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded-full"
                  style={{
                    backgroundColor: "var(--color-bg-tertiary)",
                    color: "var(--color-text-muted)",
                  }}
                >
                  {detailOptionLabel[selectedOptionPreset] ?? selectedOptionPreset}
                </span>
              </div>
              <p className="form-helper mb-3">
                모바일 자동 합성 지면은 선택한 상품 surface에 맞춰 업로드 소재를 렌더링합니다.
                제목·스폰서·CTA는 비워도 기본값으로 캡처됩니다.
              </p>
              <div className="space-y-3">
                <div>
                  <label
                    className="text-[11px] font-medium mb-1 block"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    광고 제목
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="예: 지금 가장 많이 찾는 혜택"
                    value={form.instreamAdTitle}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        instreamAdTitle: e.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <label
                    className="text-[11px] font-medium mb-1 block"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    설명 텍스트
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="예: 모바일 피드에서 자연스럽게 노출되는 광고 메시지"
                    value={form.infeedDescription1}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        infeedDescription1: e.target.value,
                      }))
                    }
                  />
                </div>
                <div>
                  <label
                    className="text-[11px] font-medium mb-1 block"
                    style={{ color: "var(--color-text-secondary)" }}
                  >
                    스폰서/브랜드명
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="예: 시세이도코리아"
                    value={form.instreamDisplayUrl}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        instreamDisplayUrl: e.target.value,
                      }))
                    }
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label
                      className="text-[11px] font-medium mb-1 block"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      CTA
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="자세히 보기 / 바로가기"
                      value={form.infeedCtaPrimary}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          infeedCtaPrimary: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <div>
                    <label
                      className="text-[11px] font-medium mb-1 block"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      로고 이미지 URL
                    </label>
                    <input
                      type="text"
                      inputMode="url"
                      autoComplete="url"
                      className="form-input"
                      placeholder="https://..."
                      value={form.instreamLogoImageUrl}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          instreamLogoImageUrl: e.target.value,
                        }))
                      }
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===== 게재면 URL (멀티 선택) ===== */}
        {/* YouTube/Naver/Kakao 채널 선택 시 자동 게재면 안내 */}
        {isAutoPublisherChannel && (
          <div
            className="mb-5 rounded-xl border p-4 animate-fade-in"
            style={{
              borderColor: "var(--color-accent)",
              backgroundColor: "var(--color-accent-subtle)",
            }}
          >
            <div className="flex items-center gap-2">
              <span className="form-section-code">YT</span>
              <div>
                <p
                  className="text-sm font-semibold"
                  style={{ color: "var(--color-accent)" }}
                >
                  {isYouTubeChannel
                    ? "YouTube 자동 게재면"
                    : form.channel === "naver"
                      ? "Naver 모바일 자동 지면"
                      : "Kakao 모바일 자동 지면"}
                </p>
                <p
                  className="text-[11px] mt-0.5"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  {isMobileNativeChannel ? (
                    <>
                      모바일 상품은 선택한 매체의 네이티브 모바일 화면으로 합성 렌더링합니다.
                      별도 게재면 URL 선택 없이 소재 이미지와 광고 정보만 사용합니다.
                    </>
                  ) : isYoutubeInfeed ? (
                    <>
                      인피드 홈은 인기 피드에서, 검색·관련동영상은 각각 해당 URL에서
                      카드 UI를 합성합니다. 광고 영상 URL 또는 소재 이미지 중 하나는 필요합니다.
                    </>
                  ) : (
                    <>
                      YouTube 광고는 자동으로 YouTube 플레이어에서 캡처됩니다. 별도
                      게재면 선택이 필요 없습니다.
                    </>
                  )}
                </p>
              </div>
            </div>
          </div>
        )}
        <div className="mb-5" style={{ display: isAutoPublisherChannel ? "none" : undefined }}>
          <div className="flex items-center justify-between mb-2">
            <label className="form-label mb-0">
              게재면 (Publisher){" "}
              <span style={{ color: "var(--color-error)" }}>*</span>
              {form.selectedPublishers.length > 0 && (
                <span
                  className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold"
                  style={{
                    backgroundColor: "var(--color-accent)",
                    color: "white",
                  }}
                >
                  {form.selectedPublishers.length}개 선택
                </span>
              )}
            </label>
            {/* 모드 전환 탭 */}
            <div
              className="flex gap-1 rounded-lg p-0.5 border"
              style={{
                backgroundColor: "var(--color-bg-primary)",
                borderColor: "var(--color-border)",
              }}
            >
              <button
                type="button"
                onClick={() => setPublisherMode("preset")}
                className="px-2.5 py-1 rounded-md text-[11px] font-medium transition-all"
                style={{
                  backgroundColor:
                    publisherMode === "preset"
                      ? "var(--color-accent)"
                      : "transparent",
                  color:
                    publisherMode === "preset"
                      ? "white"
                      : "var(--color-text-muted)",
                }}
              >
                프리셋
              </button>
              <button
                type="button"
                onClick={() => setPublisherMode("custom")}
                className="px-2.5 py-1 rounded-md text-[11px] font-medium transition-all"
                style={{
                  backgroundColor:
                    publisherMode === "custom"
                      ? "var(--color-accent)"
                      : "transparent",
                  color:
                    publisherMode === "custom"
                      ? "white"
                      : "var(--color-text-muted)",
                }}
              >
                직접 입력
              </button>
            </div>
          </div>

          {publisherMode === "preset" ? (
            /* 프리셋 모드 (멀티 선택) */
            <div className="animate-fade-in">
              {/* 카테고리 필터 */}
              <div className="flex gap-1.5 mb-3 flex-wrap">
                {PRESET_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => {
                      setPresetCategory(cat);
                      setShowAllPresets(false);
                    }}
                    className="px-2.5 py-1 rounded-full text-[11px] font-medium transition-all border"
                    style={{
                      borderColor:
                        presetCategory === cat
                          ? "var(--color-accent)"
                          : "var(--color-border)",
                      backgroundColor:
                        presetCategory === cat
                          ? "var(--color-accent-subtle)"
                          : "transparent",
                      color:
                        presetCategory === cat
                          ? "var(--color-accent)"
                          : "var(--color-text-muted)",
                    }}
                  >
                    {cat}
                  </button>
                ))}
                {/* 전체선택/해제 */}
                <button
                  type="button"
                  onClick={() => {
                    const allUrls = filteredPresets.map((p) => p.url);
                    const allSelected = allUrls.every((u) =>
                      form.selectedPublishers.includes(u),
                    );
                    setForm((prev) => ({
                      ...prev,
                      selectedPublishers: allSelected
                        ? prev.selectedPublishers.filter(
                            (u) => !allUrls.includes(u),
                          )
                        : [
                            ...new Set([
                              ...prev.selectedPublishers,
                              ...allUrls,
                            ]),
                          ],
                    }));
                  }}
                  className="px-2.5 py-1 rounded-full text-[11px] font-medium transition-all border ml-auto"
                  style={{
                    borderColor: "var(--color-accent)",
                    color: "var(--color-accent)",
                  }}
                >
                  {filteredPresets.every((p) =>
                    form.selectedPublishers.includes(p.url),
                  )
                    ? "✓ 전체 해제"
                    : "☐ 전체 선택"}
                </button>
              </div>

              {/* 프리셋 그리드 (체크박스 토글) */}
              <div className="grid grid-cols-2 gap-2">
                {visiblePresets.map((preset) => {
                  const isSelected = form.selectedPublishers.includes(
                    preset.url,
                  );
                  return (
                    <button
                      key={preset.url}
                      type="button"
                      onClick={() => togglePreset(preset)}
                      className="flex items-center gap-2.5 p-3 rounded-xl border text-left text-sm transition-all duration-200 cursor-pointer"
                      style={{
                        borderColor: isSelected
                          ? "var(--color-accent)"
                          : "var(--color-border)",
                        backgroundColor: isSelected
                          ? "var(--color-accent-subtle)"
                          : "transparent",
                      }}
                    >
                      {/* 체크박스 */}
                      <div
                        className="shrink-0 w-5 h-5 rounded flex items-center justify-center border-2 transition-all"
                        style={{
                          borderColor: isSelected
                            ? "var(--color-accent)"
                            : "var(--color-border)",
                          backgroundColor: isSelected
                            ? "var(--color-accent)"
                            : "transparent",
                        }}
                      >
                        {isSelected && (
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="white"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </div>
                      <span className="preset-code-chip shrink-0">
                        {preset.icon}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p
                          className="font-semibold text-xs truncate"
                          style={{
                            color: isSelected
                              ? "var(--color-accent)"
                              : "var(--color-text-primary)",
                          }}
                        >
                          {preset.name}
                        </p>
                        <p
                          className="text-[10px]"
                          style={{ color: "var(--color-text-muted)" }}
                        >
                          {preset.description}
                        </p>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {preset.adSizes.map((s) => (
                            <span
                              key={s}
                              className="text-[9px] px-1.5 py-0.5 rounded"
                              style={{
                                backgroundColor: "var(--color-bg-tertiary)",
                                color: "var(--color-text-muted)",
                              }}
                            >
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {filteredPresets.length > 6 && (
                <button
                  type="button"
                  onClick={() => setShowAllPresets(!showAllPresets)}
                  className="mt-2 w-full text-center text-xs py-1"
                  style={{ color: "var(--color-accent)" }}
                >
                  {showAllPresets
                    ? "접기 ▲"
                    : `더 보기 (${filteredPresets.length - 6}개) ▼`}
                </button>
              )}
            </div>
          ) : (
            /* 직접 입력 모드 */
            <div className="animate-fade-in">
              <div className="flex gap-2">
                <input
                  type="url"
                  className="form-input flex-1"
                  placeholder="https://www.example.com/article/12345"
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCustomUrl();
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={addCustomUrl}
                  disabled={!customUrl || !isValidUrl(customUrl)}
                  className="btn btn-primary px-4 text-sm shrink-0"
                  style={{
                    opacity: !customUrl || !isValidUrl(customUrl) ? 0.5 : 1,
                  }}
                >
                  + 추가
                </button>
              </div>
              <p className="form-helper">
                URL을 입력 후 추가 버튼으로 여러 사이트를 등록하세요
              </p>
              {customUrl && !isValidUrl(customUrl) && (
                <p
                  className="text-xs mt-1"
                  style={{ color: "var(--color-error)" }}
                >
                  올바른 URL 형식을 입력해주세요
                </p>
              )}
            </div>
          )}

          {/* 선택된 게재면 목록 */}
          {form.selectedPublishers.length > 0 && (
            <div
              className="mt-3 px-3 py-2.5 rounded-lg border"
              style={{
                backgroundColor: "var(--color-bg-primary)",
                borderColor: "var(--color-border)",
              }}
            >
              <p
                className="text-[11px] mb-2 font-semibold"
                style={{ color: "var(--color-text-muted)" }}
              >
                선택된 게재면 ({form.selectedPublishers.length}개)
              </p>
              <div className="flex flex-wrap gap-1.5">
                {form.selectedPublishers.map((url) => (
                  <span
                    key={url}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border"
                    style={{
                      borderColor: "var(--color-accent)",
                      backgroundColor: "var(--color-accent-subtle)",
                      color: "var(--color-accent)",
                    }}
                  >
                    {getPresetName(url)}
                    <button
                      type="button"
                      onClick={() => removePublisher(url)}
                      className="ml-0.5 hover:opacity-70 transition-opacity"
                      aria-label="제거"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ===== 소재 이미지 (인스트림 모드일 때에는 숨김) ===== */}
        {!isYoutubeInstream && (
        <div className="mb-5">
          <div className="flex items-center justify-between mb-2">
            <label className="form-label mb-0">
              소재 이미지{" "}
              {isYoutubeInfeed ? (
                <span className="text-[10px] font-normal" style={{ color: "var(--color-text-muted)" }}>
                  (선택 — 광고 영상 URL만으로도 가능)
                </span>
              ) : (
                <span style={{ color: "var(--color-error)" }}>*</span>
              )}
            </label>
            {/* 모드 전환 탭 */}
            <div
              className="flex gap-1 rounded-lg p-0.5 border"
              style={{
                backgroundColor: "var(--color-bg-primary)",
                borderColor: "var(--color-border)",
              }}
            >
              <button
                type="button"
                onClick={() => setUploadMode("upload")}
                className="px-2.5 py-1 rounded-md text-[11px] font-medium transition-all"
                style={{
                  backgroundColor:
                    uploadMode === "upload"
                      ? "var(--color-accent)"
                      : "transparent",
                  color:
                    uploadMode === "upload"
                      ? "white"
                      : "var(--color-text-muted)",
                }}
              >
                파일 업로드
              </button>
              <button
                type="button"
                onClick={() => setUploadMode("url")}
                className="px-2.5 py-1 rounded-md text-[11px] font-medium transition-all"
                style={{
                  backgroundColor:
                    uploadMode === "url"
                      ? "var(--color-accent)"
                      : "transparent",
                  color:
                    uploadMode === "url" ? "white" : "var(--color-text-muted)",
                }}
              >
                URL 입력
              </button>
            </div>
          </div>

          {uploadMode === "upload" ? (
            /* 파일 업로드 모드 */
            <div className="animate-fade-in">
              {!uploadedFile ? (
                /* 드래그&드롭 영역 */
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className="relative flex flex-col items-center justify-center gap-3 p-6 rounded-xl border-2 border-dashed cursor-pointer transition-all duration-200"
                  style={{
                    borderColor: isDragOver
                      ? "var(--color-accent)"
                      : "var(--color-border)",
                    backgroundColor: isDragOver
                      ? "var(--color-accent-subtle)"
                      : "var(--color-bg-primary)",
                  }}
                >
                  <div className="upload-drop-code">IMG</div>
                  <div className="text-center">
                    <p
                      className="text-sm font-medium"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      {isDragOver
                        ? "여기에 놓으세요!"
                        : "이미지를 드래그하거나 클릭하여 업로드"}
                    </p>
                    <p
                      className="text-xs mt-1"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      PNG, JPG, WebP, GIF · 최대 10MB
                    </p>
                    <p
                      className="text-[10px] mt-0.5"
                      style={{ color: "var(--color-accent)" }}
                    >
                      안내: 어떤 사이즈든 광고 슬롯에 자동 맞춤됩니다
                    </p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </div>
              ) : (
                /* 업로드 완료 / 업로드 중 */
                <div
                  className="rounded-xl border overflow-hidden"
                  style={{
                    borderColor: "var(--color-border)",
                    backgroundColor: "var(--color-bg-primary)",
                  }}
                >
                  {/* 이미지 프리뷰 */}
                  <div
                    className="relative aspect-video flex items-center justify-center"
                    style={{ backgroundColor: "var(--color-bg-secondary)" }}
                  >
                    <img
                      src={uploadedFile.preview}
                      alt="소재 미리보기"
                      className="max-w-full max-h-full object-contain"
                    />
                    {isUploading && (
                      <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                        <div className="flex flex-col items-center gap-2">
                          <div className="spinner spinner-lg" />
                          <p className="text-xs text-white font-medium">
                            업로드 중...
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                  {/* 파일 정보 */}
                  <div className="flex items-center justify-between p-3">
                    <div className="min-w-0">
                      <p
                        className="text-xs font-medium truncate"
                        style={{ color: "var(--color-text-primary)" }}
                      >
                        {uploadedFile.name}
                      </p>
                      <p
                        className="text-[11px]"
                        style={{ color: "var(--color-text-muted)" }}
                      >
                        {formatFileSize(uploadedFile.size)}
                        {uploadedFile.width && uploadedFile.height && (
                          <span
                            className="ml-1"
                            style={{ color: "var(--color-accent)" }}
                          >
                            · {uploadedFile.width}×{uploadedFile.height}
                          </span>
                        )}
                        {!isUploading && form.creativeUrl && (
                          <span
                            className="ml-2"
                            style={{ color: "var(--color-success)" }}
                          >
                            ✓ 업로드 완료
                          </span>
                        )}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={removeUploadedFile}
                      className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg transition-all"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* URL 입력 모드 */
            <div className="animate-fade-in">
              <input
                type="url"
                className="form-input"
                placeholder={
                  isMobileNativeChannel
                    ? "https://via.placeholder.com/1200x628.png"
                    : isGdnMobileSurface
                    ? "https://via.placeholder.com/320x100.png"
                    : "https://via.placeholder.com/300x250.png"
                }
                value={form.creativeUrl}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, creativeUrl: e.target.value }))
                }
                required
              />
              <p className="form-helper">
                {isMobileNativeChannel
                  ? "모바일 네이티브 카드에 사용할 이미지 URL (16:9 또는 1.91:1 권장)"
                  : isGdnMobileSurface
                  ? "광고 슬롯에 교체할 이미지 URL (모바일: 320×100 또는 300×250 권장)"
                  : "광고 슬롯에 교체할 이미지 URL (300×250 권장)"}
              </p>
              {form.creativeUrl && !isValidUrl(form.creativeUrl) && (
                <p
                  className="text-xs mt-1"
                  style={{ color: "var(--color-error)" }}
                >
                  올바른 URL 형식을 입력해주세요
                </p>
              )}
            </div>
          )}

          {form.channel === "gdn" && (
            <>
              {/* ===== 광고 사이즈 선택 ===== */}
              <div
            className="mt-4 rounded-xl border p-4"
            style={{
              borderColor: "var(--color-border)",
              backgroundColor: "var(--color-bg-primary)",
            }}
              >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="form-section-code">SIZE</span>
                <p
                  className="text-sm font-semibold"
                  style={{ color: "var(--color-text-primary)" }}
                >
                  광고 사이즈
                </p>
                {form.adSizeMode === "manual" &&
                  form.targetAdSizes.length > 0 && (
                    <span
                      className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                      style={{
                        backgroundColor: "var(--color-accent)",
                        color: "white",
                      }}
                    >
                      {form.targetAdSizes.length}개 선택
                    </span>
                  )}
              </div>
              {/* 자동/수동 모드 전환 */}
              <div
                className="flex gap-1 rounded-lg p-0.5 border"
                style={{
                  backgroundColor: "var(--color-bg-secondary)",
                  borderColor: "var(--color-border)",
                }}
              >
                <button
                  type="button"
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      adSizeMode: "auto" as AdSizeMode,
                      targetAdSizes: [],
                    }))
                  }
                  className="px-2.5 py-1 rounded-md text-[11px] font-medium transition-all"
                  style={{
                    backgroundColor:
                      form.adSizeMode === "auto"
                        ? "var(--color-accent)"
                        : "transparent",
                    color:
                      form.adSizeMode === "auto"
                        ? "white"
                        : "var(--color-text-muted)",
                  }}
                >
                  자동 매칭
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      adSizeMode: "manual" as AdSizeMode,
                    }))
                  }
                  className="px-2.5 py-1 rounded-md text-[11px] font-medium transition-all"
                  style={{
                    backgroundColor:
                      form.adSizeMode === "manual"
                        ? "var(--color-accent)"
                        : "transparent",
                    color:
                      form.adSizeMode === "manual"
                        ? "white"
                        : "var(--color-text-muted)",
                  }}
                >
                  직접 선택
                </button>
              </div>
            </div>

            {form.adSizeMode === "auto" ? (
              <div className="space-y-2.5 animate-fade-in">
                {/* 자동 매칭 모드 설명 */}
                <div
                  className="flex items-start gap-2 p-2.5 rounded-lg"
                  style={{ backgroundColor: "var(--color-accent-subtle)" }}
                >
                  <span className="form-section-code">AUTO</span>
                  <div>
                    <p
                      className="text-xs font-semibold"
                      style={{ color: "var(--color-accent)" }}
                    >
                      자동 사이즈 매핑
                    </p>
                    <p
                      className="text-[11px] mt-0.5"
                      style={{ color: "var(--color-text-secondary)" }}
                    >
                      {uploadedFile?.width && uploadedFile?.height ? (
                        <>
                          업로드한{" "}
                          <strong>
                            {uploadedFile.width}×{uploadedFile.height}
                          </strong>{" "}
                          이미지와 가장 유사한 슬롯을 자동으로 우선 선택합니다.
                        </>
                      ) : (
                        <>
                          소재 이미지를 업로드하면, 해당 크기와 가장 유사한 광고
                          슬롯에 우선 배치됩니다.
                        </>
                      )}
                    </p>
                  </div>
                </div>

                {/* 슬롯 내 소재 맞춤 방식 */}
                <div
                  className="rounded-lg border p-2.5"
                  style={{
                    borderColor: "var(--color-border)",
                    backgroundColor: "var(--color-bg-secondary)",
                  }}
                >
                  <p
                    className="text-[11px] font-semibold mb-2"
                    style={{ color: "var(--color-text-primary)" }}
                  >
                    슬롯 안에 소재 넣는 방식
                  </p>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        setForm((prev) => ({
                          ...prev,
                          creativeObjectFit: "contain",
                        }))
                      }
                      className="flex-1 px-2 py-1.5 rounded-md text-[11px] font-medium transition-all border"
                      style={{
                        borderColor:
                          form.creativeObjectFit === "contain"
                            ? "var(--color-accent)"
                            : "var(--color-border)",
                        backgroundColor:
                          form.creativeObjectFit === "contain"
                            ? "var(--color-accent-subtle)"
                            : "transparent",
                        color:
                          form.creativeObjectFit === "contain"
                            ? "var(--color-accent)"
                            : "var(--color-text-muted)",
                      }}
                    >
                      비율 유지
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setForm((prev) => ({
                          ...prev,
                          creativeObjectFit: "cover",
                        }))
                      }
                      className="flex-1 px-2 py-1.5 rounded-md text-[11px] font-medium transition-all border"
                      style={{
                        borderColor:
                          form.creativeObjectFit === "cover"
                            ? "var(--color-accent)"
                            : "var(--color-border)",
                        backgroundColor:
                          form.creativeObjectFit === "cover"
                            ? "var(--color-accent-subtle)"
                            : "transparent",
                        color:
                          form.creativeObjectFit === "cover"
                            ? "var(--color-accent)"
                            : "var(--color-text-muted)",
                      }}
                    >
                      슬롯 꽉 채움
                    </button>
                  </div>
                  <p
                    className="text-[10px] mt-2 leading-relaxed"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    {form.creativeObjectFit === "contain"
                      ? "원본 비율을 유지한 채 슬롯 안에 맞춥니다. 슬롯 비율과 다르면 좌우·상하에 빈 여백이 생길 수 있습니다."
                      : "슬롯을 가득 채우도록 맞추며, 비율 차이는 잘림으로 처리됩니다. 이미지 가장자리가 잘려 보일 수 있습니다."}
                  </p>
                </div>
              </div>
            ) : (
              /* 수동 선택 모드 — 멀티 체크박스 */
              <div className="animate-fade-in">
                <p
                  className="text-[11px] mb-2.5"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  {isGdnMobileSurface
                    ? "모바일 지면에서는 아래 모바일 단위 사이즈만 선택할 수 있습니다. 선택한 슬롯만 타겟팅합니다."
                    : "원하는 광고 사이즈를 선택해주세요. 선택한 사이즈의 슬롯만 타겟팅합니다."}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {gdnAdSizeCatalog.map((ad) => {
                    const sizeKey = `${ad.width}x${ad.height}`;
                    const isSelected = form.targetAdSizes.includes(sizeKey);
                    // 업로드한 이미지 사이즈와 비교
                    const isRecommended =
                      uploadedFile?.width && uploadedFile?.height
                        ? Math.abs(uploadedFile.width - ad.width) <= 50 &&
                          Math.abs(uploadedFile.height - ad.height) <= 50
                        : false;
                    const isExactMatch =
                      uploadedFile?.width === ad.width &&
                      uploadedFile?.height === ad.height;

                    return (
                      <button
                        key={sizeKey}
                        type="button"
                        onClick={() => {
                          setForm((prev) => ({
                            ...prev,
                            targetAdSizes: isSelected
                              ? prev.targetAdSizes.filter((s) => s !== sizeKey)
                              : [...prev.targetAdSizes, sizeKey],
                          }));
                        }}
                        className="flex items-center gap-2.5 p-2.5 rounded-xl border text-left transition-all duration-200"
                        style={{
                          borderColor: isSelected
                            ? "var(--color-accent)"
                            : isRecommended
                              ? "rgba(251,191,36,0.5)"
                              : "var(--color-border)",
                          backgroundColor: isSelected
                            ? "var(--color-accent-subtle)"
                            : "transparent",
                        }}
                      >
                        {/* 체크박스 */}
                        <div
                          className="shrink-0 w-4.5 h-4.5 rounded flex items-center justify-center border-2 transition-all"
                          style={{
                            width: 18,
                            height: 18,
                            borderColor: isSelected
                              ? "var(--color-accent)"
                              : "var(--color-border)",
                            backgroundColor: isSelected
                              ? "var(--color-accent)"
                              : "transparent",
                          }}
                        >
                          {isSelected && (
                            <svg
                              width="10"
                              height="10"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="white"
                              strokeWidth="3"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </div>
                        {/* 사이즈 비주얼 */}
                        <div className="shrink-0 w-8 h-8 flex items-center justify-center">
                          <div
                            className="rounded-sm"
                            style={{
                              width: Math.min(
                                32,
                                ad.width / (Math.max(ad.width, ad.height) / 32),
                              ),
                              height: Math.min(
                                32,
                                ad.height /
                                  (Math.max(ad.width, ad.height) / 32),
                              ),
                              border: `1.5px solid ${isSelected ? "var(--color-accent)" : "var(--color-border)"}`,
                              backgroundColor: isSelected
                                ? "var(--color-accent-subtle)"
                                : "var(--color-bg-tertiary)",
                            }}
                          />
                        </div>
                        {/* 정보 */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span
                              className="text-xs font-bold"
                              style={{
                                color: isSelected
                                  ? "var(--color-accent)"
                                  : "var(--color-text-primary)",
                              }}
                            >
                              {ad.size}
                            </span>
                            {isExactMatch && (
                              <span
                                className="text-[9px] px-1.5 py-0.5 rounded-full font-bold"
                                style={{
                                  backgroundColor: "rgba(34,197,94,0.15)",
                                  color: "var(--color-success)",
                                  border: "1px solid rgba(34,197,94,0.3)",
                                }}
                              >
                                ✓ 일치
                              </span>
                            )}
                            {isRecommended && !isExactMatch && (
                              <span
                                className="text-[9px] px-1.5 py-0.5 rounded-full font-bold"
                                style={{
                                  backgroundColor: "rgba(251,191,36,0.15)",
                                  color: "#d97706",
                                  border: "1px solid rgba(251,191,36,0.3)",
                                }}
                              >
                                추천
                              </span>
                            )}
                            {ad.popularity === "높음" && (
                              <span
                                className="text-[9px] px-1 py-0.5 rounded-full"
                                style={{
                                  backgroundColor: "var(--color-bg-tertiary)",
                                  color: "var(--color-text-muted)",
                                }}
                              >
                                인기
                              </span>
                            )}
                          </div>
                          <p
                            className="text-[10px] leading-tight"
                            style={{ color: "var(--color-text-muted)" }}
                          >
                            {ad.name} · {ad.usage}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
                {/* 선택 요약 */}
                {form.targetAdSizes.length > 0 && (
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    <span
                      className="text-[10px]"
                      style={{ color: "var(--color-text-muted)" }}
                    >
                      선택됨:
                    </span>
                    {form.targetAdSizes.map((size) => (
                      <span
                        key={size}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border"
                        style={{
                          borderColor: "var(--color-accent)",
                          backgroundColor: "var(--color-accent-subtle)",
                          color: "var(--color-accent)",
                        }}
                      >
                        {size}
                        <button
                          type="button"
                          onClick={() =>
                            setForm((prev) => ({
                              ...prev,
                              targetAdSizes: prev.targetAdSizes.filter(
                                (s) => s !== size,
                              ),
                            }))
                          }
                          className="hover:opacity-70"
                          aria-label="제거"
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                  </div>
                )}
                {form.targetAdSizes.length === 0 && (
                  <p
                    className="mt-2 text-[10px] text-center py-1"
                    style={{ color: "var(--color-warning, #d97706)" }}
                  >
                    주의: 사이즈를 선택하지 않으면 자동 매칭으로 동작합니다
                  </p>
                )}
              </div>
            )}
              </div>
            </>
          )}
        </div>
        )}

        {/* Google Ads만: 구분선 + 고급 옵션 (YouTube는 GDN 슬롯/랜딩 옵션 비적용) */}
        {form.channel === "gdn" && (
          <>
        {/* 구분선 */}
        <div
          className="my-5"
          style={{ borderTop: "1px solid var(--color-border)" }}
        />

        {/* ===== 고급 옵션 ===== */}
        <div className="space-y-4">
          <p
            className="text-xs font-semibold uppercase tracking-wider"
            style={{ color: "var(--color-text-muted)" }}
          >
            고급 옵션
          </p>

          {/* 인젝션 모드 선택 */}
          <div>
            <p
              className="text-sm font-medium mb-2"
              style={{ color: "var(--color-text-primary)" }}
            >
              광고 슬롯 교체 방식
            </p>
            <div className="grid grid-cols-3 gap-2">
              {INJECTION_MODES.map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  onClick={() =>
                    setForm((prev) => ({ ...prev, injectionMode: mode.value }))
                  }
                  className="flex flex-col items-center gap-1.5 p-3 rounded-xl border text-center transition-all duration-200"
                  style={{
                    borderColor:
                      form.injectionMode === mode.value
                        ? "var(--color-accent)"
                        : "var(--color-border)",
                    backgroundColor:
                      form.injectionMode === mode.value
                        ? "var(--color-accent-subtle)"
                        : "transparent",
                  }}
                >
                  <span className="text-lg">{mode.icon}</span>
                  <span
                    className="text-xs font-semibold"
                    style={{
                      color:
                        form.injectionMode === mode.value
                          ? "var(--color-accent)"
                          : "var(--color-text-primary)",
                    }}
                  >
                    {mode.label}
                  </span>
                  <span
                    className="text-[10px] leading-tight"
                    style={{ color: "var(--color-text-muted)" }}
                  >
                    {mode.description}
                  </span>
                </button>
              ))}
            </div>

            {/* 직접 지정 슬롯 수 */}
            {form.injectionMode === "custom" && (
              <div className="mt-3 flex items-center gap-3 animate-fade-in">
                <label
                  className="text-xs font-medium"
                  style={{ color: "var(--color-text-secondary)" }}
                >
                  교체할 슬롯 수:
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        slotCount: Math.max(1, prev.slotCount - 1),
                      }))
                    }
                    className="w-7 h-7 rounded-lg border flex items-center justify-center text-sm font-bold transition-all"
                    style={{
                      borderColor: "var(--color-border)",
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    −
                  </button>
                  <span
                    className="w-8 text-center text-sm font-bold"
                    style={{ color: "var(--color-accent)" }}
                  >
                    {form.slotCount}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        slotCount: Math.min(10, prev.slotCount + 1),
                      }))
                    }
                    className="w-7 h-7 rounded-lg border flex items-center justify-center text-sm font-bold transition-all"
                    style={{
                      borderColor: "var(--color-border)",
                      color: "var(--color-text-secondary)",
                    }}
                  >
                    +
                  </button>
                </div>
                <span
                  className="text-[10px]"
                  style={{ color: "var(--color-text-muted)" }}
                >
                  개 (1~10)
                </span>
              </div>
            )}
          </div>

          {/* 랜딩 페이지 캡처 토글 */}
          <div className="flex items-center justify-between">
            <div>
              <p
                className="text-sm font-medium"
                style={{ color: "var(--color-text-primary)" }}
              >
                랜딩 페이지 캡처
              </p>
              <p
                className="text-xs"
                style={{ color: "var(--color-text-muted)" }}
              >
                광고 클릭 후 이동하는 페이지도 함께 캡처
              </p>
            </div>
            <div
              className={`toggle-switch ${form.captureLanding ? "active" : ""}`}
              onClick={() =>
                setForm((prev) => ({
                  ...prev,
                  captureLanding: !prev.captureLanding,
                }))
              }
              role="switch"
              aria-checked={form.captureLanding}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setForm((prev) => ({
                    ...prev,
                    captureLanding: !prev.captureLanding,
                  }));
                }
              }}
            />
          </div>

          {/* 클릭 URL */}
          {form.captureLanding && (
            <div className="animate-fade-in">
              <label className="form-label" htmlFor="clickUrl">
                클릭 URL (랜딩 페이지)
              </label>
              <input
                id="clickUrl"
                type="url"
                className="form-input"
                placeholder="https://landing.example.com"
                value={form.clickUrl}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, clickUrl: e.target.value }))
                }
              />
              <p className="form-helper">광고 클릭 시 이동할 랜딩 페이지 URL</p>
            </div>
          )}
        </div>
          </>
        )}

        {/* ===== 제출 버튼 ===== */}
        <div className="mt-6">
          <button
            type="submit"
            className="btn btn-primary btn-lg w-full"
            disabled={!isFormValid || isSubmitting || isUploading}
          >
            {isSubmitting ? (
              <>
                <span className="spinner" />
                캡처 요청 중...
              </>
            ) : (
              <>
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
                {isYouTubeChannel
                  ? "YouTube 캡처 시작"
                  : isMobileNativeChannel
                    ? `${form.channel === "naver" ? "Naver" : "Kakao"} 모바일 캡처 시작`
                  : form.selectedPublishers.length > 1
                  ? `${form.selectedPublishers.length}개 사이트 캡처 시작`
                  : "캡처 요청 시작"}
              </>
            )}
          </button>
        </div>
      </form>

      {/* Toast */}
      {toast && (
        <div className={`toast toast-${toast.type}`}>
          {toast.type === "success" && "완료: "}
          {toast.type === "error" && "오류: "}
          {toast.type === "info" && "안내: "}
          {toast.message}
        </div>
      )}
    </>
  );
}

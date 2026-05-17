"use client";

import { useState, useEffect, useCallback, useRef, type ReactNode } from "react";
import {
  buildLensLoginPath,
  isLensAuthRequiredResponse,
  LENS_AUTH_EXPIRED_MESSAGE,
} from "@/lib/auth/lens-session-client";

/** 캡처 레코드 타입 */
interface CaptureRecord {
  id: string;
  status: "pending" | "processing" | "completed" | "failed";
  channel: string;
  source_url: string | null;
  creative_url: string;
  placement_image_url: string | null;
  landing_image_url: string | null;
  landing_final_url: string | null;
  screenshot_storage_path?: string | null;
  error_message: string | null;
  capture_landing: boolean;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at?: string;
}

interface CaptureListProps {
  /** 외부에서 추가된 캡처를 받아들이기 위한 트리거 */
  refreshTrigger?: number;
}

interface CaptureListResponse {
  data?: CaptureRecord[];
  fixture?: boolean;
  error?: string;
}

type CaptureDisplayStatus = CaptureRecord["status"] | "cancel-requested" | "canceled";
type StatusDescriptor = { label: string; class: string; icon: string };

const USER_CANCELLED_CAPTURE_MESSAGE = "사용자가 캡처를 중단했습니다.";

/** 상태 라벨 매핑 */
const STATUS_LABELS: Record<CaptureDisplayStatus, StatusDescriptor> = {
  pending: { label: "대기중", class: "badge-pending", icon: "•" },
  processing: { label: "처리중", class: "badge-processing", icon: "•" },
  "cancel-requested": { label: "중단 요청됨", class: "badge-processing", icon: "•" },
  canceled: { label: "운영자 중단", class: "badge-canceled", icon: "•" },
  completed: { label: "완료", class: "badge-completed", icon: "•" },
  failed: { label: "실패", class: "badge-failed", icon: "•" },
};

const CAPTURE_EVIDENCE_RAIL = ["원본 접수", "렌더 증빙", "QA 게이트", "보존 이력"] as const;

/** 채널 라벨 */
const CHANNEL_LABELS: Record<string, string> = {
  gdn: "GDN",
  youtube: "YouTube",
  meta: "Meta",
  naver: "Naver",
  kakao: "Kakao",
};

const NAVER_SURFACE_LABELS: Record<string, string> = {
  "naver-smart-channel-mobile": "Naver · 스마트채널",
  "naver-feed-mobile": "Naver · 피드 광고",
  "naver-mobile-feed": "Naver · 피드 광고",
  "naver-native-banner-feed": "Naver · 네이티브 배너",
  "naver-image-banner-mobile": "Naver · 이미지 배너",
};

const KAKAO_SURFACE_LABELS: Record<string, string> = {
  "kakao-bizboard": "Kakao · 비즈보드",
  "kakao-display-native": "Kakao · 디스플레이 네이티브",
  "kakao-mobile-feed": "Kakao · 디스플레이 네이티브",
  "kakao-display-catalog": "Kakao · 디스플레이 카탈로그",
  "kakao-product-catalog": "Kakao · 상품 카탈로그",
};

const CAPTURE_DELETE_ENABLED =
  process.env.NEXT_PUBLIC_ENABLE_CAPTURE_DELETE === "true";

/** 날짜 포맷 */
function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${month}/${day} ${hours}:${minutes}`;
}

/** URL 줄임 */
function truncateUrl(url: string, maxLength = 40): string {
  if (url.length <= maxLength) return url;
  return url.substring(0, maxLength) + "…";
}

function isUserCancelledCapture(capture: CaptureRecord): boolean {
  return (
    capture.status === "failed" &&
    capture.error_message?.trim() === USER_CANCELLED_CAPTURE_MESSAGE
  );
}

function getCaptureDisplayStatus(
  capture: CaptureRecord,
  isCancelling = false,
): CaptureDisplayStatus {
  if (isCancelling) return "cancel-requested";
  if (isUserCancelledCapture(capture)) return "canceled";
  return capture.status;
}

function getCaptureStatusDescriptor(
  capture: CaptureRecord,
  isCancelling = false,
): StatusDescriptor {
  return STATUS_LABELS[getCaptureDisplayStatus(capture, isCancelling)];
}

function getCancelButtonLabel(capture: CaptureRecord, isCancelling: boolean): string {
  if (isCancelling) return "중단 요청 중...";
  if (capture.status === "pending") return "대기 취소";
  return "중단 요청";
}

function getCancelButtonAriaLabel(capture: CaptureRecord, isCancelling: boolean): string {
  if (isCancelling) return "중단 요청 처리 중";
  if (capture.status === "pending") return "대기 중인 캡처 취소";
  return "처리 중인 캡처에 중단 요청";
}

function getActiveCaptureHelper(capture: CaptureRecord): string {
  if (capture.status === "pending") {
    return "아직 브라우저 작업이 시작되지 않은 대기 항목입니다.";
  }
  return "중단 요청 후에도 현재 브라우저 작업이 잠시 이어질 수 있습니다.";
}

function getDurationMs(metadata: Record<string, unknown> | null): number | null {
  if (!metadata) return null;
  const direct = metadata.durationMs;
  if (typeof direct === "number") return direct;
  if (typeof direct === "string" && !Number.isNaN(Number(direct))) return Number(direct);
  const runtime = metadata.runtime as Record<string, unknown> | undefined;
  const nested = runtime?.durationMs;
  if (typeof nested === "number") return nested;
  if (typeof nested === "string" && !Number.isNaN(Number(nested))) return Number(nested);
  return null;
}

function getYoutubeMeta(metadata: Record<string, unknown> | null): {
  adType?: string;
  captureSecond?: number;
} {
  if (!metadata) return {};
  const adType = typeof metadata.youtubeAdType === "string" ? metadata.youtubeAdType : undefined;
  const instreamOpts = metadata.instreamOpts as Record<string, unknown> | undefined;
  const captureSecondRaw = instreamOpts?.skipSeconds;
  const captureSecond =
    typeof captureSecondRaw === "number"
      ? captureSecondRaw
      : typeof captureSecondRaw === "string" && !Number.isNaN(Number(captureSecondRaw))
        ? Number(captureSecondRaw)
        : undefined;
  return { adType, captureSecond };
}

function getYoutubeAdTypeLabel(adType?: string): string | null {
  if (!adType) return null;
  if (adType === "preroll") return "인스트림";
  if (adType === "bumper") return "범퍼";
  if (adType === "mobile-preroll-aos") return "AOS 인스트림";
  if (adType === "mobile-preroll-ios") return "iOS 인스트림";
  if (adType === "mobile-bumper-aos") return "AOS 범퍼";
  if (adType === "mobile-bumper-ios") return "iOS 범퍼";
  if (adType === "shorts-feed") return "Shorts 피드";
  if (adType === "masthead-home") return "Masthead 홈";
  if (adType === "display") return "디스플레이(레거시)";
  if (adType === "overlay") return "오버레이(레거시)";
  if (adType === "infeed-home") return "인피드 · PC 홈";
  if (adType === "mobile-infeed-home") return "인피드 · 모바일 홈";
  if (adType === "infeed-search") return "인피드 · 검색";
  if (adType === "infeed-watch-next") return "인피드 · 관련동영상";
  return null;
}

function getCaptureChannelLabel(capture: CaptureRecord): string {
  const metadata = capture.metadata;
  if (
    metadata &&
    typeof metadata === "object" &&
    metadata.productFamily === "demand-gen"
  ) {
    return "Google Ads";
  }
  return CHANNEL_LABELS[capture.channel] || capture.channel;
}

function getProductMetaLabel(metadata: Record<string, unknown> | null): string | null {
  if (!metadata) return null;
  const surface = metadata.productSurface;
  if (metadata.productFamily === "demand-gen") {
    if (surface === "youtube-shorts") return "Demand Gen · YouTube Shorts";
    if (surface === "youtube-feed") return "Demand Gen · YouTube Feed";
    return "Demand Gen";
  }
  if (metadata.productFamily === "naver") {
    return typeof surface === "string"
      ? NAVER_SURFACE_LABELS[surface] || "Naver · 디스플레이 광고"
      : "Naver · 디스플레이 광고";
  }
  if (metadata.productFamily === "kakao") {
    return typeof surface === "string"
      ? KAKAO_SURFACE_LABELS[surface] || "Kakao · 성과형 광고"
      : "Kakao · 성과형 광고";
  }
  return null;
}

function getResultCategoryLabel(metadata: Record<string, unknown> | null): string | null {
  const code = typeof metadata?.resultCategory === "string" ? metadata.resultCategory : null;
  if (!code) return null;
  if (code === "ad_capture_ok") return "광고 캡처 정상";
  if (code === "ad_capture_review_needed") return "검수 필요";
  if (code === "ad_area_not_found") return "광고 캡처 영역 없음";
  if (code === "ad_out_of_viewport") return "광고영역 하단(상단 미포함)";
  return null;
}

function getQualityReviewLabel(metadata: Record<string, unknown> | null): string | null {
  const diagnostics = metadata?.diagnostics as Record<string, unknown> | undefined;
  const quality = diagnostics?.captureQuality as
    | { flags?: unknown; score?: unknown }
    | undefined;
  const flags = Array.isArray(quality?.flags) ? quality.flags : [];
  if (flags.includes("footer_or_sticky_ad_position")) return "푸터/스티키 위치 확인";
  if (flags.includes("ad_near_viewport_edge")) return "광고 위치 확인";
  if (flags.includes("mobile_ad_too_small")) return "모바일 광고 크기 확인";
  if (flags.includes("creative_slot_aspect_mismatch")) return "소재 비율 확인";
  if (flags.includes("ad_small_in_report_view")) return "광고 크기 확인";
  if (flags.includes("ad_partially_out_of_view")) return "광고 위치 확인";
  if (flags.includes("injected_ad_not_measured")) return "광고 측정 확인";
  return null;
}

function getFailureCategoryLabel(metadata: Record<string, unknown> | null): string | null {
  const code = typeof metadata?.failureCode === "string" ? metadata.failureCode : null;
  if (!code) return null;
  if (code === "hard_blocked_by_site") return "사이트 강차단";
  if (code === "browser_session_closed") return "브라우저 세션 종료";
  if (code === "capture_timeout") return "처리 타임아웃";
  return "실행 오류";
}

function getQualityStateLabel(metadata: Record<string, unknown> | null): string | null {
  const resultLabel = getResultCategoryLabel(metadata);
  const reviewLabel = getQualityReviewLabel(metadata);
  if (resultLabel && reviewLabel) return `${resultLabel} · ${reviewLabel}`;
  if (resultLabel) return resultLabel;
  return getFailureCategoryLabel(metadata);
}

function getQualityFlagCountLabel(metadata: Record<string, unknown> | null): string | null {
  const diagnostics = metadata?.diagnostics as Record<string, unknown> | undefined;
  const quality = diagnostics?.captureQuality as { flags?: unknown } | undefined;
  const flags = Array.isArray(quality?.flags) ? quality.flags : null;
  if (!flags) return null;
  return flags.length > 0 ? `검수 플래그 ${flags.length}개` : "검수 플래그 없음";
}

function getRuntimeProviderLabel(metadata: Record<string, unknown> | null): string | null {
  if (!metadata) return null;
  const runtime = metadata.runtime as Record<string, unknown> | undefined;
  const provider =
    typeof runtime?.provider === "string"
      ? runtime.provider
      : typeof metadata.runtimeProvider === "string"
        ? metadata.runtimeProvider
        : null;
  if (!provider) return null;
  if (provider === "vercel-chromium") return "Vercel Chromium";
  if (provider === "browserbase") return "Browserbase";
  return provider;
}

function isLocalFixtureRuntime(metadata: Record<string, unknown> | null): boolean {
  if (!metadata) return false;
  const runtime = metadata.runtime as Record<string, unknown> | undefined;
  return runtime?.provider === "local-fixture" || metadata.runtimeProvider === "local-fixture";
}

function isLocalFixtureCapture(capture: CaptureRecord): boolean {
  const metadata = capture.metadata && typeof capture.metadata === "object" ? capture.metadata : null;
  return isLocalFixtureRuntime(metadata);
}

function getMetadataSurfaceCode(metadata: Record<string, unknown> | null): string | null {
  if (!metadata) return null;
  const family = typeof metadata.productFamily === "string" ? metadata.productFamily : null;
  const surface = typeof metadata.productSurface === "string" ? metadata.productSurface : null;
  const youtubeAdType = typeof metadata.youtubeAdType === "string" ? metadata.youtubeAdType : null;
  const gdnViewportMode = typeof metadata.gdnViewportMode === "string" ? metadata.gdnViewportMode : null;
  if (family && surface) return `${family} / ${surface}`;
  if (surface) return surface;
  if (youtubeAdType) return `youtube / ${youtubeAdType}`;
  if (gdnViewportMode) return `gdn / ${gdnViewportMode}`;
  return null;
}

function getMetadataEventTime(metadata: Record<string, unknown> | null): string | null {
  if (!metadata) return null;
  const value =
    typeof metadata.capturedAt === "string"
      ? metadata.capturedAt
      : typeof metadata.failedAt === "string"
        ? metadata.failedAt
        : null;
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return formatDate(value);
}

function formatDurationLabel(durationMs: number | null): string | null {
  if (durationMs === null) return null;
  if (durationMs < 1000) return `${durationMs}ms`;
  return `${(durationMs / 1000).toFixed(1)}초`;
}

function getHostnameLabel(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return truncateUrl(url, 42);
  }
}

function getDiagnosticsSummary(metadata: Record<string, unknown> | null): {
  hasDiagnostics: boolean;
  flagCount: number | null;
  score: number | null;
  needsReview: boolean | null;
  screenshotMode: string | null;
  topIssue: string | null;
  slotSummary: string | null;
} {
  const diagnostics = metadata?.diagnostics as Record<string, unknown> | undefined;
  const quality = diagnostics?.captureQuality as
    | { flags?: unknown; score?: unknown; needsReview?: unknown }
    | undefined;
  const flags = Array.isArray(quality?.flags)
    ? quality.flags.filter((flag): flag is string => typeof flag === "string")
    : null;
  const score =
    typeof quality?.score === "number"
      ? quality.score
      : typeof quality?.score === "string" && !Number.isNaN(Number(quality.score))
        ? Number(quality.score)
        : null;
  const needsReview =
    typeof quality?.needsReview === "boolean" ? quality.needsReview : null;
  const screenshotMode =
    typeof diagnostics?.screenshotMode === "string" ? diagnostics.screenshotMode : null;
  const slotsDetected =
    typeof diagnostics?.slotsDetected === "number" ? diagnostics.slotsDetected : null;
  const slotsInjected =
    typeof diagnostics?.slotsInjected === "number" ? diagnostics.slotsInjected : null;
  const slotSummary =
    slotsDetected !== null || slotsInjected !== null
      ? `${slotsInjected ?? "-"} / ${slotsDetected ?? "-"}`
      : null;

  return {
    hasDiagnostics: Boolean(diagnostics),
    flagCount: flags ? flags.length : null,
    score,
    needsReview,
    screenshotMode,
    topIssue: getQualityReviewLabel(metadata),
    slotSummary,
  };
}

type DiagnosticsSummary = ReturnType<typeof getDiagnosticsSummary>;

function getDimensionLabel(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const width = Number(record.width);
  const height = Number(record.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  return `${Math.round(width)}×${Math.round(height)}`;
}

function getTargetAdSizeLabel(metadata: Record<string, unknown> | null): string | null {
  const targetAdSizes = metadata?.targetAdSizes;
  if (!Array.isArray(targetAdSizes)) return null;
  const labels = targetAdSizes
    .map((size) => (typeof size === "string" ? size : getDimensionLabel(size)))
    .filter((label): label is string => Boolean(label));
  if (labels.length === 0) return null;
  const preview = labels.slice(0, 3).join(", ");
  return labels.length > 3 ? `${preview} 외 ${labels.length - 3}` : preview;
}

function getOutputCoverageLabel(capture: CaptureRecord): string {
  if (capture.placement_image_url && capture.landing_image_url) return "게재면 + 랜딩";
  if (capture.placement_image_url) return "게재면";
  if (capture.landing_image_url) return "랜딩";
  return "이미지 대기";
}

function getProofDecisionLabel(
  capture: CaptureRecord,
  diagnostics: DiagnosticsSummary,
  isFixtureRecord: boolean,
  goldenCandidate: boolean,
): string {
  if (isFixtureRecord) return "Fixture 판독";
  if (goldenCandidate) return "Golden 후보";
  if (capture.status === "completed" && diagnostics.needsReview === false && diagnostics.flagCount === 0) {
    return "보존 가능";
  }
  if (capture.status === "completed" && diagnostics.needsReview === true) return "검수 필요";
  if (capture.status === "completed" && diagnostics.flagCount && diagnostics.flagCount > 0) return "플래그 확인";
  if (capture.status === "failed") return "실패 판정";
  if (capture.status === "processing") return "렌더링 중";
  return "접수 대기";
}

function getProofDecisionTone(
  capture: CaptureRecord,
  diagnostics: DiagnosticsSummary,
  isFixtureRecord: boolean,
  goldenCandidate: boolean,
): "ready" | "warning" | "muted" {
  if (isFixtureRecord || goldenCandidate) return "ready";
  if (capture.status === "failed" || diagnostics.needsReview === true || (diagnostics.flagCount ?? 0) > 0) {
    return "warning";
  }
  if (capture.status === "completed" && diagnostics.needsReview === false) return "ready";
  return "muted";
}

function getProofDecisionDetail(
  capture: CaptureRecord,
  diagnostics: DiagnosticsSummary,
  isFixtureRecord: boolean,
  goldenCandidate: boolean,
): string {
  if (isFixtureRecord) return "샘플 데이터 판독용이며 실제 캡처 실행이나 저장소 변경은 없습니다.";
  if (goldenCandidate) return "진단 플래그 없이 기준 점수를 통과해 보존 후보로 표시됩니다.";
  if (capture.status === "completed" && diagnostics.needsReview === false) {
    return "진단 기준상 추가 검수 없이 보존 가능한 완료 항목입니다.";
  }
  if (capture.status === "completed" && diagnostics.needsReview === true) {
    return "보존 전에 픽셀, CTA, 소재 비율을 다시 확인해야 합니다.";
  }
  if (capture.status === "failed") return "실패 사유와 재요청 가능성을 먼저 확인해야 합니다.";
  if (capture.status === "processing") return "브라우저 렌더링 결과가 도착하면 진단 요약이 갱신됩니다.";
  return "작업 큐에 올라가기 전 입력과 지면 조건을 확인하는 상태입니다.";
}

function getVisualInspectionDecision(
  capture: CaptureRecord,
  diagnostics: DiagnosticsSummary,
  hasActiveImage: boolean,
  isFixtureRecord: boolean,
  goldenCandidate: boolean,
): { label: string; detail: string; tone: "ready" | "warning" | "muted" } {
  if (isFixtureRecord) {
    return {
      label: "Fixture read-only",
      detail: "읽기 전용 샘플 판독이며 실제 저장소 변경이나 캡처 재실행은 없습니다.",
      tone: "ready",
    };
  }
  if (capture.status === "failed") {
    return {
      label: "실패 재요청",
      detail: "실패 사유와 참조 URL을 확인한 뒤 동일 조건으로 재요청할 수 있습니다.",
      tone: "warning",
    };
  }
  if (!hasActiveImage) {
    return {
      label: "렌더 결과 대기",
      detail: "viewer에 표시할 원본 이미지가 도착해야 픽셀 검수와 보존 판단이 가능합니다.",
      tone: capture.status === "pending" || capture.status === "processing" ? "muted" : "warning",
    };
  }
  if (diagnostics.needsReview === true || (diagnostics.flagCount ?? 0) > 0) {
    return {
      label: "재촬영 검토",
      detail: "픽셀, CTA, 슬롯 크기 또는 랜딩 증빙을 확인하고 필요하면 같은 조건으로 다시 캡처합니다.",
      tone: "warning",
    };
  }
  if (goldenCandidate || (capture.status === "completed" && diagnostics.needsReview === false)) {
    return {
      label: "보존 가능",
      detail: "현재 이미지와 진단 요약 기준으로 운영 증빙 보존 후보로 볼 수 있습니다.",
      tone: "ready",
    };
  }
  return {
    label: "시각 검수 대기",
    detail: "원본 이미지는 있으나 진단 플래그 또는 기준 점수 판정이 아직 충분하지 않습니다.",
    tone: "muted",
  };
}

function isGoldenCandidate(capture: CaptureRecord): boolean {
  if (capture.status !== "completed" || !capture.placement_image_url) return false;
  const diagnostics = capture.metadata?.diagnostics as Record<string, unknown> | undefined;
  const quality = diagnostics?.captureQuality as
    | { flags?: unknown; score?: unknown; needsReview?: unknown }
    | undefined;
  if (!quality) return false;
  const flags = Array.isArray(quality?.flags) ? quality.flags : null;
  const score =
    typeof quality?.score === "number"
      ? quality.score
      : typeof quality?.score === "string" && !Number.isNaN(Number(quality.score))
        ? Number(quality.score)
        : null;

  if (quality?.needsReview !== false) return false;
  if (flags && flags.length > 0) return false;
  if (score === null || score < 0.86) return false;
  return true;
}

function getGoldenCandidateReason(capture: CaptureRecord): string {
  const diagnostics = getDiagnosticsSummary(capture.metadata);
  if (diagnostics.score !== null) return `내부 점수 ${diagnostics.score}`;
  if (diagnostics.hasDiagnostics) return "진단 플래그 없음";
  return "완료 이미지 보존 가능";
}

function DetailInfoRow({
  label,
  children,
  mono = false,
}: {
  label: string;
  children: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="lens-detail-info-row flex min-w-0 items-start justify-between gap-4 text-sm">
      <span className="shrink-0 text-[var(--color-text-muted)]">{label}</span>
      <div
        className={`min-w-0 text-right text-[var(--color-text-secondary)] ${
          mono ? "font-mono text-xs break-all" : "break-words"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

export default function CaptureList({ refreshTrigger }: CaptureListProps) {
  const [captures, setCaptures] = useState<CaptureRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCapture, setSelectedCapture] = useState<CaptureRecord | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: "single" | "all"; id?: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [cancellingIds, setCancellingIds] = useState<Set<string>>(new Set());
  const [authExpiredMessage, setAuthExpiredMessage] = useState<string | null>(null);
  const [isLocalFixtureMode, setIsLocalFixtureMode] = useState(false);

  // 폴링 안정화를 위한 ref: captures 변경에 의한 무한 재렌더 방지
  const capturesRef = useRef<CaptureRecord[]>([]);
  capturesRef.current = captures;

  /** 캡처 목록 조회 (cache 비활성화로 항상 최신 데이터) */
  const fetchCaptures = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: "30", _t: String(Date.now()) });
      if (statusFilter !== "all") {
        params.set("status", statusFilter);
      }

      const res = await fetch(`/api/captures?${params.toString()}`, {
        cache: "no-store",
      });
      const result = (await res.json()) as CaptureListResponse;

      if (isLensAuthRequiredResponse(res, result)) {
        setAuthExpiredMessage(result?.error || LENS_AUTH_EXPIRED_MESSAGE);
        setIsLocalFixtureMode(false);
        setCaptures([]);
        setSelectedCapture(null);
        return;
      }

      if (res.ok && result.data) {
        setAuthExpiredMessage(null);
        setIsLocalFixtureMode(result.fixture === true);
        setCaptures(result.data);
      }
    } catch (err) {
      console.error("[CaptureList] 목록 조회 실패:", err);
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter]);

  /** 초기 로드 + refreshTrigger 변경 시 재조회 */
  useEffect(() => {
    fetchCaptures();
  }, [fetchCaptures, refreshTrigger]);

  /** 처리중인 캡처가 있으면 3초마다 폴링 (안정화) */
  useEffect(() => {
    const interval = setInterval(() => {
      if (authExpiredMessage) return;
      const hasActive = capturesRef.current.some(
        (c) => c.status === "pending" || c.status === "processing"
      );
      if (hasActive) {
        fetchCaptures();
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [authExpiredMessage, fetchCaptures]);

  /** 모달이 열린 상태에서 캡처 상태 변경 시 자동 동기화 */
  useEffect(() => {
    if (selectedCapture) {
      const updated = captures.find((c) => c.id === selectedCapture.id);
      if (updated && updated.status !== selectedCapture.status) {
        setSelectedCapture(updated);
      }
    }
  }, [captures, selectedCapture]);

  /** 필터링된 캡처 목록 */
  const filteredCaptures = captures;
  const activeCaptures = isLocalFixtureMode
    ? []
    : captures.filter((c) => c.status === "pending" || c.status === "processing");
  const activeCount = activeCaptures.length;
  const pendingCount = activeCaptures.filter((c) => c.status === "pending").length;
  const processingCount = activeCount - pendingCount;
  const fixtureSampleCount = captures.filter((capture) => isLocalFixtureMode || isLocalFixtureCapture(capture)).length;
  const latestCompleted = captures.find((c) => c.status === "completed" && !!c.placement_image_url) || null;
  const featuredProof = captures.find(isGoldenCandidate) || latestCompleted;
  const featuredProofIsGolden = featuredProof ? isGoldenCandidate(featuredProof) : false;
  const activeStageIndex = isLocalFixtureMode ? 2 : activeCount > 0 ? 1 : featuredProof ? 3 : 0;
  const isCaptureActive = (capture: CaptureRecord) =>
    !isLocalFixtureMode && (capture.status === "pending" || capture.status === "processing");
  const openCaptureDetail = useCallback((capture: CaptureRecord) => {
    setSelectedCapture(capture);
  }, []);
  const handleCaptureRowKeyDown = useCallback(
    (event: React.KeyboardEvent, capture: CaptureRecord) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openCaptureDetail(capture);
    },
    [openCaptureDetail],
  );

  /** 상태별 카운트 */
  const statusCounts = captures.reduce(
    (acc, c) => {
      acc[c.status] = (acc[c.status] || 0) + 1;
      acc.all = (acc.all || 0) + 1;
      return acc;
    },
    { all: 0 } as Record<string, number>
  );

  /** 개별 캡처 삭제 */
  const handleDelete = async (captureId: string) => {
    setIsDeleting(true);
    try {
      const res = await fetch("/api/captures", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: captureId }),
      });
      const result = await res.json().catch(() => null);
      if (isLensAuthRequiredResponse(res, result)) {
        setAuthExpiredMessage(result?.error || LENS_AUTH_EXPIRED_MESSAGE);
        setSelectedCapture(null);
        return;
      }
      if (res.ok) {
        setAuthExpiredMessage(null);
        setCaptures((prev) => prev.filter((c) => c.id !== captureId));
        setSelectedCapture(null);
      }
    } catch (err) {
      console.error("[CaptureList] 삭제 실패:", err);
    } finally {
      setIsDeleting(false);
      setDeleteConfirm(null);
    }
  };

  /** 전체 삭제 */
  const handleDeleteAll = async () => {
    setIsDeleting(true);
    try {
      const res = await fetch("/api/captures", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      const result = await res.json().catch(() => null);
      if (isLensAuthRequiredResponse(res, result)) {
        setAuthExpiredMessage(result?.error || LENS_AUTH_EXPIRED_MESSAGE);
        setSelectedCapture(null);
        return;
      }
      if (res.ok) {
        setAuthExpiredMessage(null);
        setCaptures([]);
        setSelectedCapture(null);
      }
    } catch (err) {
      console.error("[CaptureList] 전체 삭제 실패:", err);
    } finally {
      setIsDeleting(false);
      setDeleteConfirm(null);
    }
  };

  /** 대기 취소 또는 처리 중 캡처에 중단 요청 */
  const handleCancelCapture = async (captureId: string) => {
    setCancellingIds((prev) => new Set(prev).add(captureId));
    try {
      const res = await fetch("/api/captures", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel", ids: [captureId] }),
      });
      const result = await res.json().catch(() => null);
      if (isLensAuthRequiredResponse(res, result)) {
        setAuthExpiredMessage(result?.error || LENS_AUTH_EXPIRED_MESSAGE);
        setSelectedCapture(null);
        return;
      }
      if (!res.ok) {
        throw new Error(result?.error || "중단 요청에 실패했습니다.");
      }

      setAuthExpiredMessage(null);
      const cancelledCount =
        typeof result?.cancelled === "number" ? result.cancelled : 0;
      if (cancelledCount > 0) {
        const cancelledAt = new Date().toISOString();
        setCaptures((prev) =>
          prev.map((capture) =>
            capture.id === captureId
              ? {
                  ...capture,
                  status: "failed",
                  error_message: USER_CANCELLED_CAPTURE_MESSAGE,
                  updated_at: cancelledAt,
                }
              : capture,
          ),
        );
        setSelectedCapture((current) =>
          current?.id === captureId
            ? {
                ...current,
                status: "failed",
                error_message: USER_CANCELLED_CAPTURE_MESSAGE,
                updated_at: cancelledAt,
              }
            : current,
        );
      }
      await fetchCaptures();
    } catch (err) {
      console.error("[CaptureList] 중단 요청 실패:", err);
    } finally {
      setCancellingIds((prev) => {
        const next = new Set(prev);
        next.delete(captureId);
        return next;
      });
    }
  };

  return (
    <div className="lens-capture-list animate-fade-in delay-200">
      {authExpiredMessage && (
        <div className="mb-4 rounded-xl border border-[rgba(239,68,68,0.22)] bg-[rgba(239,68,68,0.08)] p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-[var(--color-error)]">결과 검수 세션 만료</p>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                {authExpiredMessage}
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                window.location.assign(buildLensLoginPath("/#result-review"))
              }
              className="inline-flex items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-tertiary)]"
            >
              다시 로그인
            </button>
          </div>
        </div>
      )}

      {/* 헤더 + 필터 */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="ops-icon-tile">QA</div>
          <div>
            <h2 className="ops-section-title">렌더 증빙 QA 이력</h2>
            <p className="text-xs text-[var(--color-text-muted)]">
              {isLocalFixtureMode ? `Fixture sample ${fixtureSampleCount}건` : `총 ${statusCounts.all || 0}건`}
              {!isLocalFixtureMode && captures.some((c) => c.status === "processing") && (
                <span className="text-[var(--color-accent)] ml-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-[var(--color-accent)] animate-pulse mr-1" />
                  실시간 갱신 중
                </span>
              )}
            </p>
            <p className="mt-1 text-[11px] leading-5 text-[var(--color-text-muted)]">
              최근 30개 전체 이력입니다. 같은 매체가 보여도 현재 배치 중복으로 단정하지 않습니다.
              원본 접수, 렌더 증빙, QA 게이트 이력을 같은 증거선으로 봅니다.
            </p>
          </div>
        </div>

        {/* 상태 필터 탭 */}
        <div
          className="flex gap-1 bg-[var(--color-bg-primary)] rounded-lg p-1 border border-[var(--color-border)]"
          role="group"
          aria-label="캡처 상태 필터"
        >
          {[
            { key: "all", label: "전체" },
            { key: "pending", label: "대기중" },
            { key: "processing", label: "처리중" },
            { key: "completed", label: "완료" },
            { key: "failed", label: "실패" },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setStatusFilter(tab.key)}
              aria-pressed={statusFilter === tab.key}
              aria-label={`${tab.label} 캡처 보기${statusCounts[tab.key] ? `, ${statusCounts[tab.key]}건` : ""}`}
              className={`
                px-3 py-1.5 rounded-md text-xs font-medium transition-all
                ${statusFilter === tab.key
                  ? "bg-[var(--color-accent)] text-white"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
                }
              `}
            >
              {tab.label}
              {statusCounts[tab.key] ? (
                <span className="ml-1 opacity-70">({statusCounts[tab.key]})</span>
              ) : null}
            </button>
          ))}
        </div>

        <span className="badge badge-pending">삭제 비활성</span>
        {isLocalFixtureMode && (
          <span className="lens-fixture-chip" aria-live="polite">
            Local fixture · 읽기 전용
          </span>
        )}
        {activeCount > 0 && (
          <span className="badge badge-processing" aria-live="polite">
            진행 {activeCount}건 · 중단 가능
          </span>
        )}

        {/* 전체 삭제 버튼 */}
        {CAPTURE_DELETE_ENABLED && captures.length > 0 && (
          <button
            type="button"
            onClick={() => setDeleteConfirm({ type: "all" })}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium
                       text-[var(--color-error)] hover:bg-[rgba(239,68,68,0.1)]
                       border border-[rgba(239,68,68,0.2)] transition-all"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            전체 삭제
          </button>
        )}
      </div>

      {isLocalFixtureMode && (
        <div className="lens-fixture-mode-strip mb-3" role="status" aria-live="polite">
          <div>
            <span>Local fixture QA</span>
            <strong>읽기 전용 샘플 모드</strong>
            <p>
              DB 저장, Storage 업로드, 실제 브라우저 캡처, 중단 요청은 API에서 차단됩니다.
              현재 화면은 디자인 QA와 증빙 검수 흐름 확인용 fixture 이력만 보여줍니다.
            </p>
          </div>
          <div className="lens-fixture-mode-strip__cells" aria-label="fixture 보호 경계">
            <span>Fixture {fixtureSampleCount}</span>
            <span>Mutation off</span>
            <span>Capture off</span>
          </div>
        </div>
      )}

      {activeCount > 0 && (
        <div
          className="mb-3 rounded-lg border border-[rgba(185,83,61,0.24)] bg-[rgba(254,242,241,0.5)] px-3 py-2 text-[11px] leading-5 text-[var(--color-text-secondary)]"
          role="status"
          aria-live="polite"
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p>
              진행 중인 캡처 {activeCount}건은 각 이력 행의 중단 버튼이나 상세 화면의 중단 버튼에서 요청할 수 있습니다.
              처리 중 캡처는 서버가 요청을 반영한 뒤 최종 상태로 갱신됩니다.
            </p>
            <span className="shrink-0 rounded-md border border-[rgba(185,83,61,0.22)] bg-white/70 px-2 py-1 font-medium text-[var(--color-text-primary)]">
              대기 {pendingCount} · 처리 {processingCount}
            </span>
          </div>
        </div>
      )}

      <div
        className={`lens-capture-stage-rail ${activeCount > 0 ? "lens-capture-stage-rail--active" : ""}`}
        aria-label="렌더 증빙 처리 단계"
      >
        {CAPTURE_EVIDENCE_RAIL.map((stage, index) => (
          <span key={stage} className={index === activeStageIndex ? "active" : undefined}>
            <em>{String(index + 1).padStart(2, "0")}</em>
            {stage}
          </span>
        ))}
      </div>

      {/* 렌더링 현황 + 최신 결과 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <div className="glass-card-static lens-capture-summary-card p-4 md:col-span-1">
          <p className="text-xs text-[var(--color-text-muted)] mb-1">
            {isLocalFixtureMode ? "Fixture samples" : "진행 중 렌더"}
          </p>
          <p className="text-2xl font-bold text-[var(--color-text-primary)]">
            {isLocalFixtureMode ? fixtureSampleCount : activeCount}
          </p>
          <p className="text-xs text-[var(--color-text-secondary)] mt-1">
            {isLocalFixtureMode
              ? "읽기 전용 QA 이력입니다"
              : activeCount > 0
                ? "렌더 증빙이 생성 중입니다"
                : "대기/진행 렌더 없음"}
          </p>
          <p className="mt-2 text-[11px] leading-5 text-[var(--color-text-muted)]">
            {isLocalFixtureMode ? "실제 캡처 작업으로 집계하지 않습니다." : "새 배치와 이전 이력이 함께 표시됩니다."}
          </p>
        </div>
        <div className="glass-card-static lens-capture-summary-card p-4 md:col-span-2">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <p className="text-xs text-[var(--color-text-muted)]">
              {featuredProofIsGolden ? "보존 후보 증빙" : "최신 렌더 증빙"}
            </p>
            {featuredProofIsGolden && <span className="lens-golden-candidate-badge">Golden 후보</span>}
          </div>
          {featuredProof?.placement_image_url ? (
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <img
                src={featuredProof.placement_image_url}
                alt={featuredProofIsGolden ? "보존 후보 렌더 증빙 이미지" : "최신 렌더 증빙 이미지"}
                className="h-20 w-full rounded-lg border border-[var(--color-border)] object-cover sm:h-16 sm:w-24"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-[var(--color-text-primary)] truncate">
                  {featuredProof.source_url ? truncateUrl(featuredProof.source_url, 56) : "URL 없음"}
                </p>
                <p className="text-xs text-[var(--color-text-muted)] mt-1">
                  {featuredProofIsGolden ? getGoldenCandidateReason(featuredProof) : formatDate(featuredProof.created_at)}
                </p>
                {featuredProofIsGolden && (
                  <p className="mt-1 text-[11px] leading-5 text-[var(--color-text-muted)]">
                    최신 순서보다 QA 판정과 보존 가능성을 우선해 노출합니다.
                  </p>
                )}
              </div>
              <a
                href={featuredProof.placement_image_url}
                download
                className="btn btn-primary text-xs px-3 py-2 whitespace-nowrap sm:self-auto"
              >
                다운로드
              </a>
            </div>
          ) : (
            <p className="text-xs text-[var(--color-text-muted)]">아직 완료된 증빙 이미지가 없습니다.</p>
          )}
        </div>
      </div>

      {/* 리스트 */}
      <div className="glass-card-static lens-capture-ledger overflow-hidden">
        {isLoading ? (
          /* 스켈레톤 로딩 */
          <div className="p-4 space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-4 p-4 rounded-xl bg-[var(--color-bg-primary)]">
                <div className="skeleton w-16 h-16 rounded-lg" />
                <div className="flex-1 space-y-2">
                  <div className="skeleton h-4 w-3/4 rounded" />
                  <div className="skeleton h-3 w-1/2 rounded" />
                </div>
                <div className="skeleton h-6 w-16 rounded-full" />
              </div>
            ))}
          </div>
        ) : filteredCaptures.length === 0 ? (
          /* 빈 상태 */
          <div className="empty-state py-16">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            <p className="text-base font-medium mb-1">아직 보존할 증빙 이력이 없습니다</p>
            <p className="text-sm">원본 접수 후 렌더 증빙과 QA 판정이 이곳에 쌓입니다.</p>
          </div>
        ) : (
          /* 캡처 리스트 */
          <div className="divide-y divide-[var(--color-border)]" role="list">
            {filteredCaptures.map((capture) => {
              const isCancelling = cancellingIds.has(capture.id);
              const status = getCaptureStatusDescriptor(capture, isCancelling);
              const displayStatus = getCaptureDisplayStatus(capture, isCancelling);
              const isActive = isCaptureActive(capture);
              const isCanceled = displayStatus === "canceled";
              const goldenCandidate = isGoldenCandidate(capture);
              const metadata = capture.metadata && typeof capture.metadata === "object" ? capture.metadata : null;
              const isFixtureRecord = isLocalFixtureMode || isLocalFixtureCapture(capture);
              const rowDiagnostics = getDiagnosticsSummary(metadata);
              const qualityStateLabel = getQualityStateLabel(metadata);
              const failureCategoryLabel = getFailureCategoryLabel(metadata);
              const cancelButtonLabel = getCancelButtonLabel(capture, isCancelling);

              return (
                <article
                  key={capture.id}
                  role="listitem"
                  className={`
                    lens-capture-row lens-capture-row--${displayStatus} ${goldenCandidate ? "lens-capture-row--golden" : ""} group flex flex-col gap-3 p-4 cursor-pointer transition-all duration-200 sm:flex-row sm:items-center sm:gap-4
                    hover:bg-[var(--color-bg-elevated)]
                    ${isActive ? "lens-capture-row--active" : ""}
                  `}
                >
                  <div
                    role="button"
                    tabIndex={0}
                    aria-label={`캡처 상세 열기: ${getCaptureChannelLabel(capture)} ${status.label}, ${capture.source_url ? truncateUrl(capture.source_url, 60) : "URL 없음"}`}
                    onClick={() => openCaptureDetail(capture)}
                    onKeyDown={(event) => handleCaptureRowKeyDown(event, capture)}
                    className="lens-capture-row-button flex min-w-0 flex-1 flex-col gap-3 rounded-md outline-none sm:flex-row sm:items-center sm:gap-4"
                  >
                    {/* 썸네일 / 상태 아이콘 */}
                    <div className="flex-shrink-0">
                      {capture.status === "completed" && capture.placement_image_url ? (
                        <div className="lens-capture-thumb w-16 h-16 rounded-lg overflow-hidden border border-[var(--color-border)] bg-[var(--color-bg-primary)]">
                          <img
                            src={capture.placement_image_url}
                            alt="캡처 결과"
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        </div>
                      ) : (
                        <div
                          className={`
                            lens-capture-status-tile w-16 h-16 rounded-lg flex items-center justify-center text-2xl
                            border border-[var(--color-border)] bg-[var(--color-bg-primary)]
                            ${isActive ? "animate-pulse" : ""}
                          `}
                        >
                          {status.icon}
                        </div>
                      )}
                    </div>

                    {/* 정보 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]">
                          {getCaptureChannelLabel(capture)}
                        </span>
                        <span className={`badge ${status.class}`} aria-live="polite">
                          {(isActive || displayStatus === "cancel-requested") && (
                            <span className="spinner" style={{ width: 10, height: 10, borderWidth: 1.5 }} />
                          )}
                          {status.label}
                        </span>
                        {goldenCandidate && (
                          <span className="lens-golden-candidate-badge" title={getGoldenCandidateReason(capture)}>
                            Golden 후보
                          </span>
                        )}
                        {isFixtureRecord && <span className="lens-fixture-chip">Fixture sample</span>}
                      </div>
                      <p className="text-sm text-[var(--color-text-primary)] truncate">
                        {capture.source_url ? truncateUrl(capture.source_url) : "URL 없음"}
                      </p>
                      <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                        {formatDate(capture.created_at)}
                        {capture.metadata && typeof capture.metadata === "object" && getDurationMs(capture.metadata) !== null && (
                          <span className="ml-2">
                            · 소요 {Math.round((getDurationMs(capture.metadata) || 0) / 1000)}초
                          </span>
                        )}
                      </p>
                      {capture.channel === "youtube" && metadata && (
                        <p className="text-[11px] text-[var(--color-text-muted)] mt-1">
                          {(() => {
                            const yt = getYoutubeMeta(metadata);
                            const productLabel = getProductMetaLabel(metadata);
                            const adLabel = getYoutubeAdTypeLabel(yt.adType);
                            if (productLabel) return productLabel;
                            if (!adLabel && yt.captureSecond === undefined) return null;
                            return `${adLabel || "YouTube"}${yt.captureSecond !== undefined ? ` · ${yt.captureSecond}초` : ""}`;
                          })()}
                        </p>
                      )}
                      {capture.status === "failed" && capture.error_message && (
                        <p className={`mt-1 truncate text-xs ${isCanceled ? "text-[var(--color-text-muted)]" : "text-[var(--color-error)]"}`}>
                          {capture.error_message}
                        </p>
                      )}
                      {isCanceled && (
                        <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                          실패 집계와 분리해 보는 운영자 중단 이력입니다.
                        </p>
                      )}
                      {isCancelling && (
                        <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                          요청을 보냈습니다. 목록 갱신 후 최종 상태를 확인합니다.
                        </p>
                      )}
                      {capture.status === "completed" && metadata && (
                        <div className="lens-row-proof-meta">
                          {qualityStateLabel && <span>{qualityStateLabel}</span>}
                          {rowDiagnostics.score !== null && (
                            <span className="lens-row-proof-chip">점수 {rowDiagnostics.score}</span>
                          )}
                          {rowDiagnostics.flagCount !== null && (
                            <span className={rowDiagnostics.flagCount > 0 ? "lens-row-proof-chip warning" : "lens-row-proof-chip ok"}>
                              {rowDiagnostics.flagCount > 0 ? `플래그 ${rowDiagnostics.flagCount}` : "플래그 없음"}
                            </span>
                          )}
                        </div>
                      )}
                      {capture.status === "failed" && !isCanceled && metadata && (
                        <p className="text-[11px] text-[var(--color-text-muted)] mt-1">
                          {failureCategoryLabel}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* 삭제 버튼 + 화살표 */}
                  <div className="flex w-full items-center justify-end gap-1 sm:w-auto sm:flex-shrink-0">
                    {isActive && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCancelCapture(capture.id);
                        }}
                        disabled={isCancelling}
                        aria-label={getCancelButtonAriaLabel(capture, isCancelling)}
                        aria-busy={isCancelling}
                        className="lens-stop-capture-button h-8 min-w-[6.5rem] px-2"
                        title={cancelButtonLabel}
                      >
                        {cancelButtonLabel}
                      </button>
                    )}
                    {CAPTURE_DELETE_ENABLED && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteConfirm({ type: "single", id: capture.id });
                        }}
                        className="w-8 h-8 flex items-center justify-center rounded-lg
                                   text-[var(--color-text-muted)] hover:text-[var(--color-error)]
                                   hover:bg-[rgba(239,68,68,0.1)] transition-all opacity-0 group-hover:opacity-100"
                        aria-label="캡처 삭제"
                        title="삭제"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    )}
                    <div className="text-[var(--color-text-muted)]">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {/* 상세 모달 */}
      {selectedCapture && (
        <CaptureDetailModal
          capture={selectedCapture}
          onClose={() => setSelectedCapture(null)}
          onDelete={(id) => setDeleteConfirm({ type: "single", id })}
          onCancel={handleCancelCapture}
          isCancelling={cancellingIds.has(selectedCapture.id)}
          isLocalFixtureMode={isLocalFixtureMode}
        />
      )}

      {/* 삭제 확인 다이얼로그 */}
      {deleteConfirm && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          onClick={() => !isDeleting && setDeleteConfirm(null)}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-sm glass-card-static p-6 animate-slide-up text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 rounded-full bg-[rgba(239,68,68,0.1)] flex items-center justify-center mx-auto mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-error)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <line x1="10" y1="11" x2="10" y2="17" />
                <line x1="14" y1="11" x2="14" y2="17" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-[var(--color-text-primary)] mb-2">
              {deleteConfirm.type === "all" ? "전체 삭제" : "캡처 삭제"}
            </h3>
            <p className="text-sm text-[var(--color-text-secondary)] mb-6">
              {deleteConfirm.type === "all"
                ? "모든 캡처 이력과 이미지가 영구 삭제됩니다. 계속하시겠습니까?"
                : "이 캡처 이력과 이미지가 영구 삭제됩니다. 계속하시겠습니까?"}
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => setDeleteConfirm(null)}
                disabled={isDeleting}
                className="btn btn-secondary px-6"
              >
                취소
              </button>
              <button
                onClick={() => {
                  if (deleteConfirm.type === "all") {
                    handleDeleteAll();
                  } else if (deleteConfirm.id) {
                    handleDelete(deleteConfirm.id);
                  }
                }}
                disabled={isDeleting}
                className="px-6 py-2 rounded-xl text-sm font-semibold text-white
                           bg-[var(--color-error)] hover:opacity-90 transition-all
                           disabled:opacity-50 flex items-center gap-2"
              >
                {isDeleting && <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} />}
                {isDeleting ? "삭제 중..." : "삭제"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** ============================
 * 캡처 상세 모달
 * ============================ */
function CaptureDetailModal({
  capture,
  onClose,
  onDelete,
  onCancel,
  isCancelling,
  isLocalFixtureMode,
}: {
  capture: CaptureRecord;
  onClose: () => void;
  onDelete: (id: string) => void;
  onCancel: (id: string) => void;
  isCancelling: boolean;
  isLocalFixtureMode: boolean;
}) {
  type OutputId = "placement" | "landing";

  const status = getCaptureStatusDescriptor(capture, isCancelling);
  const displayStatus = getCaptureDisplayStatus(capture, isCancelling);
  const isCanceled = displayStatus === "canceled";
  const cancelButtonLabel = getCancelButtonLabel(capture, isCancelling);
  const cancelButtonAriaLabel = getCancelButtonAriaLabel(capture, isCancelling);
  const metadata =
    capture.metadata && typeof capture.metadata === "object" ? capture.metadata : null;
  const isFixtureRecord = isLocalFixtureMode || isLocalFixtureRuntime(metadata);
  const isCancellableActive =
    !isFixtureRecord && (capture.status === "pending" || capture.status === "processing");
  const qualityStateLabel = getQualityStateLabel(metadata);
  const qualityFlagCountLabel = getQualityFlagCountLabel(metadata);
  const runtimeProviderLabel = getRuntimeProviderLabel(metadata);
  const metadataSurfaceCode = getMetadataSurfaceCode(metadata);
  const metadataEventTime = getMetadataEventTime(metadata);
  const durationLabel = formatDurationLabel(getDurationMs(metadata));
  const resultCategoryLabel = getResultCategoryLabel(metadata);
  const diagnosticsSummary = getDiagnosticsSummary(metadata);
  const goldenCandidate = isGoldenCandidate(capture);
  const [selectedOutputId, setSelectedOutputId] = useState<OutputId>(
    capture.placement_image_url ? "placement" : "landing",
  );
  const [zoomMode, setZoomMode] = useState<"fit" | "100" | "150" | "200">("fit");
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const productLabel =
    getProductMetaLabel(metadata) ??
    (() => {
      const yt = getYoutubeMeta(metadata);
      return getYoutubeAdTypeLabel(yt.adType);
    })();

  const outputs = [
    {
      id: "placement" as const,
      label: "게재면",
      description: "광고 게재 화면",
      url: capture.placement_image_url,
      storagePath: capture.screenshot_storage_path ?? null,
      referenceUrl: capture.source_url,
      alt: "게재면 캡처 이미지",
    },
    {
      id: "landing" as const,
      label: "랜딩",
      description: "랜딩 페이지 화면",
      url: capture.landing_image_url,
      storagePath: null,
      referenceUrl: capture.landing_final_url,
      alt: "랜딩 페이지 캡처 이미지",
    },
  ];
  const activeOutput =
    outputs.find((output) => output.id === selectedOutputId && output.url) ??
    outputs.find((output) => output.url) ??
    outputs[0];
  const activeUrl = activeOutput.url;
  const activeStoragePath = activeOutput.storagePath;
  const activeReferenceUrl = activeOutput.referenceUrl;
  const proofDecisionLabel = getProofDecisionLabel(
    capture,
    diagnosticsSummary,
    isFixtureRecord,
    goldenCandidate,
  );
  const proofDecisionTone = getProofDecisionTone(
    capture,
    diagnosticsSummary,
    isFixtureRecord,
    goldenCandidate,
  );
  const proofDecisionDetail = getProofDecisionDetail(
    capture,
    diagnosticsSummary,
    isFixtureRecord,
    goldenCandidate,
  );
  const visualInspectionDecision = getVisualInspectionDecision(
    capture,
    diagnosticsSummary,
    Boolean(activeUrl),
    isFixtureRecord,
    goldenCandidate,
  );
  const creativeDimensionLabel = getDimensionLabel(metadata?.creativeDimensions);
  const targetAdSizeLabel = getTargetAdSizeLabel(metadata);
  const proofIntegrityRows = [
    {
      label: "출력",
      value: getOutputCoverageLabel(capture),
      detail: activeUrl ? `${activeOutput.label} URL 확보` : "검수 이미지 생성 전",
      tone: activeUrl ? "ready" : "warning",
    },
    {
      label: "품질",
      value: qualityFlagCountLabel ?? (diagnosticsSummary.hasDiagnostics ? "진단 데이터 있음" : "진단 대기"),
      detail:
        diagnosticsSummary.score !== null
          ? `내부 점수 ${diagnosticsSummary.score}`
          : diagnosticsSummary.topIssue ?? "플래그와 점수 없음",
      tone:
        diagnosticsSummary.needsReview === true || (diagnosticsSummary.flagCount ?? 0) > 0
          ? "warning"
          : diagnosticsSummary.hasDiagnostics
            ? "ready"
            : "muted",
    },
    {
      label: "지면",
      value: productLabel ?? metadataSurfaceCode ?? getCaptureChannelLabel(capture),
      detail: metadataSurfaceCode ?? "채널 기준",
      tone: "muted",
    },
    {
      label: "규격",
      value: creativeDimensionLabel ?? targetAdSizeLabel ?? "미기록",
      detail: creativeDimensionLabel
        ? "소재 natural size"
        : targetAdSizeLabel
          ? "대상 슬롯 size"
          : "metadata에 규격 없음",
      tone: creativeDimensionLabel || targetAdSizeLabel ? "ready" : "muted",
    },
  ] as const;
  const pixelInspectionValue = goldenCandidate
    ? "기준 통과"
    : diagnosticsSummary.needsReview === true
      ? "재검수"
      : (diagnosticsSummary.flagCount ?? 0) > 0
        ? "플래그 확인"
        : diagnosticsSummary.needsReview === false
          ? "진단 통과"
          : "판정 대기";
  const visualInspectionRows = [
    {
      label: "이미지 판독",
      value: activeUrl ? `${activeOutput.label} 확보` : "이미지 없음",
      detail: activeUrl ? "원본 viewer 연결" : "렌더 결과 대기",
      tone: activeUrl ? "ready" : "warning",
    },
    {
      label: "픽셀 검수",
      value: pixelInspectionValue,
      detail:
        diagnosticsSummary.score !== null
          ? `검수 점수 ${diagnosticsSummary.score}`
          : diagnosticsSummary.topIssue ?? "golden pixel 기준 아님",
      tone:
        goldenCandidate || diagnosticsSummary.needsReview === false
          ? "ready"
          : diagnosticsSummary.needsReview === true || (diagnosticsSummary.flagCount ?? 0) > 0
            ? "warning"
            : "muted",
    },
    {
      label: "저장 추적",
      value: activeStoragePath ? "경로 확보" : isFixtureRecord ? "Fixture 경로" : "경로 대기",
      detail: activeStoragePath ? "내부 저장 경로 복사 가능" : "저장소 변경 없음",
      tone: activeStoragePath || isFixtureRecord ? "ready" : "muted",
    },
    {
      label: "운영 액션",
      value: visualInspectionDecision.label,
      detail: visualInspectionDecision.detail,
      tone: visualInspectionDecision.tone,
    },
  ] as const;
  const selectedZoomLabel =
    zoomMode === "fit" ? "맞춤" : zoomMode === "100" ? "100%" : zoomMode === "150" ? "150%" : "200%";
  const openActionLabel = isFixtureRecord ? "샘플 열기" : "원본 열기";
  const downloadActionLabel = isFixtureRecord ? "샘플 저장" : "다운로드";
  const urlCopyActionLabel = isFixtureRecord ? "샘플 URL 복사" : "URL 복사";
  const pathCopyActionLabel = isFixtureRecord ? "Fixture 경로 복사" : "경로 복사";
  const compactPathActionLabel = isFixtureRecord ? "Fixture 경로" : "경로";
  const imageCopyLabel = isFixtureRecord ? "샘플 이미지 URL" : "이미지 URL(복사용)";
  const storageCopyLabel = isFixtureRecord ? "Fixture 저장 경로" : "저장 경로(내부용)";
  const actionButtonClass =
    "inline-flex items-center justify-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-tertiary)] disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-[var(--color-bg-secondary)]";
  const primaryActionClass =
    "inline-flex items-center justify-center gap-1.5 rounded-md bg-[var(--color-text-primary)] px-3 py-1.5 text-xs font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45";

  useEffect(() => {
    setSelectedOutputId(capture.placement_image_url ? "placement" : "landing");
    setZoomMode("fit");
  }, [capture.id, capture.placement_image_url]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, [onClose]);

  const copyText = useCallback(async (value: string | null | undefined, label: string) => {
    if (!value) return;
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard API unavailable");
      }
      await navigator.clipboard.writeText(value);
      setCopiedLabel(`${label} 복사됨`);
    } catch {
      setCopiedLabel(`${label} 복사 실패`);
    }
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopiedLabel(null), 1800);
  }, []);

  const renderPreview = () => {
    if (isCancellableActive) {
      return (
        <div className="lens-proof-active-state flex h-full min-h-[320px] flex-col items-center justify-center p-8 text-center">
          <div className="spinner spinner-lg mb-4" />
          <p className="text-sm font-medium text-[var(--color-text-secondary)]">
            {isCancelling
              ? "중단 요청을 보내고 있습니다"
              : capture.status === "pending"
                ? "캡처 대기 중입니다"
                : "캡처를 처리하고 있습니다"}
          </p>
          <p className="mt-1 text-xs text-[var(--color-text-muted)]">
            {isCancelling ? "목록이 갱신되면 최종 상태를 확인할 수 있습니다." : getActiveCaptureHelper(capture)}
          </p>
          <div
            className="mt-4 grid w-full max-w-md grid-cols-1 gap-2 rounded-lg border border-[rgba(185,83,61,0.22)] bg-white/75 p-3 text-left sm:grid-cols-2"
            aria-label="진행 중 캡처 상태와 중단 위치"
          >
            <div>
              <p className="text-[10px] font-semibold uppercase text-[var(--color-text-muted)]">
                현재 상태
              </p>
              <p className="mt-1 text-xs font-semibold text-[var(--color-text-primary)]">{status.label}</p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase text-[var(--color-text-muted)]">
                중단 위치
              </p>
              <p className="mt-1 text-xs font-semibold text-[var(--color-text-primary)]">
                상세 패널 또는 이력 행
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onCancel(capture.id)}
            disabled={isCancelling}
            aria-label={cancelButtonAriaLabel}
            aria-busy={isCancelling}
            className="lens-stop-capture-button mt-4"
          >
            {cancelButtonLabel}
          </button>
        </div>
      );
    }

    if (!activeUrl) {
      return (
        <div className="flex h-full min-h-[320px] flex-col items-center justify-center p-8 text-center">
          <p className="text-sm font-semibold text-[var(--color-text-primary)]">표시할 이미지가 없습니다</p>
          <p className="mt-2 max-w-sm text-xs leading-5 text-[var(--color-text-muted)]">
            이미지가 아직 생성되지 않았거나 저장 URL을 확인할 수 없습니다. 메타데이터는 우측에서 계속 확인할 수 있습니다.
          </p>
        </div>
      );
    }

    return (
      <div
        className={
          zoomMode === "fit"
            ? "lens-proof-viewer flex h-full min-h-[320px] items-center justify-center overflow-hidden p-4"
            : "lens-proof-viewer h-full min-h-[320px] overflow-auto p-4"
        }
      >
        <img
          src={activeUrl}
          alt={activeOutput.alt}
          className={
            zoomMode === "fit"
              ? "max-h-full max-w-full object-contain"
              : "h-auto max-w-none object-contain"
          }
          style={
            zoomMode === "fit"
              ? undefined
              : {
                  width:
                    zoomMode === "100"
                      ? "auto"
                      : zoomMode === "150"
                        ? "150%"
                        : "200%",
                }
          }
        />
      </div>
    );
  };

  const renderInspectorContent = (compact = false) => (
    <div className={compact ? "space-y-5" : "space-y-6"}>
      <section className="lens-inspector-section space-y-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">상태</p>
          <span className={`badge ${status.class}`} aria-live="polite">
            {displayStatus === "cancel-requested" ? (
              <span className="spinner" style={{ width: 10, height: 10, borderWidth: 1.5 }} />
            ) : (
              status.icon
            )}
            {status.label}
          </span>
        </div>
        {qualityStateLabel && (
          <p className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-primary)] px-3 py-2 text-xs leading-5 text-[var(--color-text-secondary)]">
            {qualityStateLabel}
          </p>
        )}
        {goldenCandidate && (
          <div className="lens-golden-candidate-panel">
            <span>Golden 후보</span>
            <strong>{getGoldenCandidateReason(capture)}</strong>
            <p>게재면 이미지, 진단 플래그, 검수 필요 여부를 기준으로 보존 후보로 표시합니다.</p>
          </div>
        )}
        {isFixtureRecord && (
          <div className="lens-fixture-detail-panel">
            <span>Local fixture QA</span>
            <strong>읽기 전용 샘플</strong>
            <p>이 상세 화면은 fixture 데이터 판독용입니다. 실제 캡처 실행, 중단, 저장소 변경은 수행하지 않습니다.</p>
            <p>샘플 열기, 저장, URL 복사는 fixture 검수용 동작이며 기록 변경을 만들지 않습니다.</p>
          </div>
        )}
        {capture.status === "failed" && capture.error_message && (
          <div
            className={`rounded-lg border px-3 py-2 ${
              isCanceled
                ? "border-[var(--color-border)] bg-[var(--color-bg-primary)]"
                : "border-[rgba(239,68,68,0.2)] bg-[rgba(239,68,68,0.08)]"
            }`}
          >
            <p className={`text-xs font-semibold ${isCanceled ? "text-[var(--color-text-secondary)]" : "text-[var(--color-error)]"}`}>
              {isCanceled ? "운영자 중단" : "오류 발생"}
            </p>
            <p className="mt-1 text-xs leading-5 text-[var(--color-text-secondary)]">{capture.error_message}</p>
          </div>
        )}
      </section>

      <section className="lens-inspector-section space-y-3">
        <div className={`lens-proof-integrity-panel ${proofDecisionTone}`}>
          <span>Proof integrity</span>
          <strong>{proofDecisionLabel}</strong>
          <p>{proofDecisionDetail}</p>
        </div>
        <div className="lens-proof-integrity-grid" aria-label="증빙 신뢰 요약">
          {proofIntegrityRows.map((row) => (
            <div className={`lens-proof-integrity-cell ${row.tone}`} key={row.label}>
              <span>{row.label}</span>
              <strong>{row.value}</strong>
              <em>{row.detail}</em>
            </div>
          ))}
        </div>
      </section>

      <section className="lens-inspector-section space-y-3">
        <div className={`lens-visual-qa-gate ${visualInspectionDecision.tone}`}>
          <span>Visual QA gate</span>
          <strong>시각 검수 게이트 · {visualInspectionDecision.label}</strong>
          <p>{visualInspectionDecision.detail}</p>
        </div>
        <div className="lens-visual-qa-grid" aria-label="시각 검수 게이트 요약">
          {visualInspectionRows.map((row) => (
            <div className={`lens-visual-qa-cell ${row.tone}`} key={row.label}>
              <span>{row.label}</span>
              <strong>{row.value}</strong>
              <em>{row.detail}</em>
            </div>
          ))}
        </div>
      </section>

      <section className="lens-inspector-section space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">캡처 정보</p>
        <DetailInfoRow label="내부 캡처 ID" mono>{capture.id}</DetailInfoRow>
        <DetailInfoRow label="채널">{getCaptureChannelLabel(capture)}</DetailInfoRow>
        {productLabel && <DetailInfoRow label="상품 유형">{productLabel}</DetailInfoRow>}
        {metadataSurfaceCode && <DetailInfoRow label="내부 surface" mono>{metadataSurfaceCode}</DetailInfoRow>}
        <DetailInfoRow label="생성 시각">{formatDate(capture.created_at)}</DetailInfoRow>
        {metadataEventTime && <DetailInfoRow label="캡처 시각">{metadataEventTime}</DetailInfoRow>}
        {durationLabel && <DetailInfoRow label="소요 시간">{durationLabel}</DetailInfoRow>}
        {resultCategoryLabel && <DetailInfoRow label="결과 구분">{resultCategoryLabel}</DetailInfoRow>}
        <DetailInfoRow label="랜딩 캡처">{capture.capture_landing ? "예" : "아니오"}</DetailInfoRow>
      </section>

      <section className="lens-inspector-section space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">참조 URL</p>
        <DetailInfoRow label="게재면">
          {capture.source_url ? (
            <a href={capture.source_url} target="_blank" rel="noopener noreferrer" className="text-[var(--color-accent)] hover:underline">
              {getHostnameLabel(capture.source_url)}
            </a>
          ) : "-"}
        </DetailInfoRow>
        <DetailInfoRow label="소재">
          <a href={capture.creative_url} target="_blank" rel="noopener noreferrer" className="text-[var(--color-accent)] hover:underline">
            {getHostnameLabel(capture.creative_url) ?? truncateUrl(capture.creative_url, 35)}
          </a>
        </DetailInfoRow>
        <DetailInfoRow label="랜딩">
          {capture.landing_final_url ? (
            <a href={capture.landing_final_url} target="_blank" rel="noopener noreferrer" className="text-[var(--color-accent)] hover:underline">
              {getHostnameLabel(capture.landing_final_url)}
            </a>
          ) : "-"}
        </DetailInfoRow>
      </section>

      <section className="lens-inspector-section space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">선택 이미지</p>
        <DetailInfoRow label="출력">{activeOutput.description}</DetailInfoRow>
        <DetailInfoRow label={imageCopyLabel}>
          {activeUrl ? (
            <button
              type="button"
              onClick={() => copyText(activeUrl, imageCopyLabel)}
              className="break-all text-right text-[var(--color-accent)] hover:underline"
            >
              {getHostnameLabel(activeUrl) ?? "URL 복사"}
            </button>
          ) : "없음"}
        </DetailInfoRow>
        <DetailInfoRow label={storageCopyLabel} mono>
          {activeStoragePath ? (
            <button
              type="button"
              onClick={() => copyText(activeStoragePath, storageCopyLabel)}
              className="break-all text-right text-[var(--color-accent)] hover:underline"
            >
              {activeStoragePath}
            </button>
          ) : "확인 불가"}
        </DetailInfoRow>
      </section>

      <section className="lens-inspector-section space-y-2">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">진단 요약</p>
        <DetailInfoRow label="진단 데이터">{diagnosticsSummary.hasDiagnostics ? "있음" : "없음"}</DetailInfoRow>
        {qualityFlagCountLabel && <DetailInfoRow label="품질 플래그">{qualityFlagCountLabel}</DetailInfoRow>}
        {diagnosticsSummary.topIssue && <DetailInfoRow label="주요 확인">{diagnosticsSummary.topIssue}</DetailInfoRow>}
        {diagnosticsSummary.score !== null && <DetailInfoRow label="내부 검수 점수">{diagnosticsSummary.score}</DetailInfoRow>}
        {diagnosticsSummary.needsReview !== null && (
          <DetailInfoRow label="검수 필요">{diagnosticsSummary.needsReview ? "예" : "아니오"}</DetailInfoRow>
        )}
        {diagnosticsSummary.screenshotMode && <DetailInfoRow label="캡처 모드">{diagnosticsSummary.screenshotMode}</DetailInfoRow>}
        {diagnosticsSummary.slotSummary && <DetailInfoRow label="GDN 슬롯">{diagnosticsSummary.slotSummary}</DetailInfoRow>}
        {runtimeProviderLabel && <DetailInfoRow label="런타임">{runtimeProviderLabel}</DetailInfoRow>}
        <p className="pt-1 text-[11px] leading-5 text-[var(--color-text-muted)]">
          진단 정보는 운영 검수용 요약이며, golden sample 기반 픽셀 검증 결과가 아닙니다.
        </p>
      </section>
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-stretch justify-center lg:items-center lg:p-4"
      onClick={onClose}
      role="presentation"
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="capture-detail-title"
        className="lens-detail-shell relative z-10 flex h-[100dvh] w-full flex-col overflow-hidden bg-[var(--color-bg-secondary)] shadow-2xl animate-slide-up lg:h-[92vh] lg:max-h-[960px] lg:max-w-[1440px] lg:rounded-2xl lg:border lg:border-[var(--color-border)]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="lens-detail-header flex shrink-0 flex-wrap items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-3 lg:flex-nowrap lg:px-5">
          <button
            type="button"
            onClick={onClose}
            aria-label="상세 모달 닫기"
            className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-bg-tertiary)] hover:text-[var(--color-text-primary)]"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          <div className="min-w-0 flex-1">
            <div className="lens-detail-title-row flex flex-wrap items-center gap-2">
              <h2 id="capture-detail-title" className="truncate text-sm font-semibold text-[var(--color-text-primary)]">
                {activeOutput.description}
              </h2>
              <span className={`badge ${status.class}`}>{status.icon} {status.label}</span>
              {goldenCandidate && <span className="lens-golden-candidate-badge">Golden 후보</span>}
              {isFixtureRecord && <span className="lens-fixture-chip">Fixture sample</span>}
              <span className="rounded bg-[var(--color-bg-tertiary)] px-2 py-0.5 text-xs font-semibold text-[var(--color-text-secondary)]">
                {getCaptureChannelLabel(capture)}
              </span>
            </div>
            <p className="mt-0.5 truncate text-xs text-[var(--color-text-muted)]">
              {formatDate(capture.created_at)} · 보기 {selectedZoomLabel}
              {copiedLabel ? ` · ${copiedLabel}` : ""}
            </p>
          </div>
          <div className="lens-zoom-controls order-3 flex w-full items-center gap-1 overflow-x-auto lg:order-none lg:w-auto">
            {(["fit", "100", "150", "200"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setZoomMode(mode)}
                aria-pressed={zoomMode === mode}
                className={`shrink-0 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  zoomMode === mode
                    ? "bg-[var(--color-text-primary)] text-white"
                    : "border border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)]"
                }`}
              >
                {mode === "fit" ? "맞춤" : `${mode}%`}
              </button>
            ))}
          </div>
          <div className="ml-auto hidden items-center gap-2 lg:flex">
            {activeUrl ? (
              <a href={activeUrl} target="_blank" rel="noopener noreferrer" className={actionButtonClass}>
                {openActionLabel}
              </a>
            ) : (
              <button type="button" disabled className={actionButtonClass}>{openActionLabel}</button>
            )}
            {activeUrl ? (
              <a href={activeUrl} download className={primaryActionClass}>
                {downloadActionLabel}
              </a>
            ) : (
              <button type="button" disabled className={primaryActionClass}>{downloadActionLabel}</button>
            )}
            <button type="button" disabled={!activeUrl} onClick={() => copyText(activeUrl, imageCopyLabel)} className={actionButtonClass}>
              {urlCopyActionLabel}
            </button>
          </div>
        </header>

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px]">
          <section className="flex min-h-0 flex-col">
            <div className="lens-proof-output-tabs flex shrink-0 items-center gap-2 overflow-x-auto border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-2">
              {outputs.map((output) => {
                const isActive = output.id === activeOutput.id;
                const isAvailable = Boolean(output.url);
                return (
                  <button
                    key={output.id}
                    type="button"
                    disabled={!isAvailable}
                    onClick={() => setSelectedOutputId(output.id)}
                    aria-pressed={isActive}
                    className={`shrink-0 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-45 ${
                      isActive
                        ? "border-[var(--color-text-primary)] bg-[var(--color-text-primary)] text-white"
                        : "border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)]"
                    }`}
                  >
                    {output.label}
                    <span className="ml-1 font-normal opacity-75">{isAvailable ? "준비됨" : "없음"}</span>
                  </button>
                );
              })}
            </div>

            <div className="min-h-0 flex-1 bg-[var(--color-bg-primary)]">
              {renderPreview()}
            </div>
            <div className="lens-proof-viewer-note shrink-0 border-t border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-2 text-[11px] text-[var(--color-text-muted)]">
              이미지 표시는 검토용 viewer 상태입니다. 원본 PNG 파일은 crop, filter, overlay 없이 그대로 열기/다운로드됩니다.
              URL과 저장 경로는 운영 확인용 복사 정보입니다.
            </div>

            <div className="max-h-[38vh] overflow-y-auto border-t border-[var(--color-border)] bg-[var(--color-bg-secondary)] lg:hidden">
              <details open={!isFixtureRecord} className="border-b border-[var(--color-border)] px-4 py-3">
                <summary className="cursor-pointer text-sm font-semibold text-[var(--color-text-primary)]">메타데이터</summary>
                <div className="mt-3">{renderInspectorContent(true)}</div>
              </details>
            </div>
          </section>

          <aside className="hidden min-h-0 flex-col border-l border-[var(--color-border)] bg-[var(--color-bg-secondary)] lg:flex">
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {renderInspectorContent()}
            </div>
            <div className="space-y-2 border-t border-[var(--color-border)] p-4">
              <div className="grid grid-cols-2 gap-2">
                <button type="button" disabled={!activeUrl} onClick={() => copyText(activeUrl, imageCopyLabel)} className={actionButtonClass}>
                  {urlCopyActionLabel}
                </button>
                <button
                  type="button"
                  disabled={!activeStoragePath}
                  onClick={() => copyText(activeStoragePath, storageCopyLabel)}
                  className={actionButtonClass}
                >
                  {pathCopyActionLabel}
                </button>
                {activeUrl ? (
                  <a href={activeUrl} target="_blank" rel="noopener noreferrer" className={actionButtonClass}>
                    {openActionLabel}
                  </a>
                ) : (
                  <button type="button" disabled className={actionButtonClass}>{openActionLabel}</button>
                )}
                {activeUrl ? (
                  <a href={activeUrl} download className={primaryActionClass}>
                    {downloadActionLabel}
                  </a>
                ) : (
                  <button type="button" disabled className={primaryActionClass}>{downloadActionLabel}</button>
                )}
              </div>
              {activeReferenceUrl && (
                <button type="button" onClick={() => copyText(activeReferenceUrl, "참조 URL")} className={`${actionButtonClass} w-full`}>
                  참조 URL 복사
                </button>
              )}
              {isCancellableActive && (
                <button
                  type="button"
                  onClick={() => onCancel(capture.id)}
                  disabled={isCancelling}
                  aria-label={cancelButtonAriaLabel}
                  aria-busy={isCancelling}
                  className="lens-stop-capture-button w-full"
                >
                  {cancelButtonLabel}
                </button>
              )}
              {CAPTURE_DELETE_ENABLED && (
                <button
                  type="button"
                  onClick={() => onDelete(capture.id)}
                  className="w-full rounded-md border border-[rgba(239,68,68,0.2)] px-3 py-2 text-xs font-semibold text-[var(--color-error)] transition-colors hover:bg-[rgba(239,68,68,0.08)]"
                >
                  이 캡처 삭제
                </button>
              )}
            </div>
          </aside>
        </div>

        <div className="lens-detail-footer-actions grid shrink-0 grid-cols-2 gap-2 border-t border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-3 sm:grid-cols-4 lg:hidden">
          {activeUrl ? (
            <a href={activeUrl} download className={primaryActionClass}>
              {downloadActionLabel}
            </a>
          ) : (
            <button type="button" disabled className={primaryActionClass}>{downloadActionLabel}</button>
          )}
          <button type="button" disabled={!activeUrl} onClick={() => copyText(activeUrl, imageCopyLabel)} className={actionButtonClass}>
            {urlCopyActionLabel}
          </button>
          {activeUrl ? (
            <a href={activeUrl} target="_blank" rel="noopener noreferrer" className={actionButtonClass}>
              {openActionLabel}
            </a>
          ) : (
            <button type="button" disabled className={actionButtonClass}>{openActionLabel}</button>
          )}
          <button
            type="button"
            disabled={!activeStoragePath}
            onClick={() => copyText(activeStoragePath, storageCopyLabel)}
            className={actionButtonClass}
          >
            {compactPathActionLabel}
          </button>
          {isCancellableActive && (
            <button
              type="button"
              onClick={() => onCancel(capture.id)}
              disabled={isCancelling}
              aria-label={cancelButtonAriaLabel}
              aria-busy={isCancelling}
              className="lens-stop-capture-button col-span-2 sm:col-span-4"
            >
              {cancelButtonLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

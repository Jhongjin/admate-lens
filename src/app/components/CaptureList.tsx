"use client";

import { useState, useEffect, useCallback, useRef } from "react";

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

/** 상태 라벨 매핑 */
const STATUS_LABELS: Record<string, { label: string; class: string; icon: string }> = {
  pending: { label: "대기중", class: "badge-pending", icon: "•" },
  processing: { label: "처리중", class: "badge-processing", icon: "•" },
  completed: { label: "완료", class: "badge-completed", icon: "•" },
  failed: { label: "실패", class: "badge-failed", icon: "•" },
};

/** 채널 라벨 */
const CHANNEL_LABELS: Record<string, string> = {
  gdn: "GDN",
  youtube: "YouTube",
  meta: "Meta",
  naver: "Naver",
};

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

export default function CaptureList({ refreshTrigger }: CaptureListProps) {
  const [captures, setCaptures] = useState<CaptureRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCapture, setSelectedCapture] = useState<CaptureRecord | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: "single" | "all"; id?: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // 🔑 폴링 안정화를 위한 ref — captures 변경에 의한 무한 재렌더 방지
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
      const result = await res.json();

      if (res.ok && result.data) {
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
      const hasActive = capturesRef.current.some(
        (c) => c.status === "pending" || c.status === "processing"
      );
      if (hasActive) {
        fetchCaptures();
      }
    }, 3000);
    return () => clearInterval(interval);
  }, [fetchCaptures]);

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
  const activeCount = captures.filter((c) => c.status === "pending" || c.status === "processing").length;
  const latestCompleted = captures.find((c) => c.status === "completed" && !!c.placement_image_url) || null;

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
      if (res.ok) {
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
      if (res.ok) {
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

  return (
    <div className="animate-fade-in delay-200">
      {/* 헤더 + 필터 */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="ops-icon-tile">이력</div>
          <div>
            <h2 className="ops-section-title">캡처 이력</h2>
            <p className="text-xs text-[var(--color-text-muted)]">
              총 {statusCounts.all || 0}건
              {captures.some((c) => c.status === "processing") && (
                <span className="text-[var(--color-accent)] ml-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-[var(--color-accent)] animate-pulse mr-1" />
                  실시간 갱신 중
                </span>
              )}
            </p>
          </div>
        </div>

        {/* 상태 필터 탭 */}
        <div className="flex gap-1 bg-[var(--color-bg-primary)] rounded-lg p-1 border border-[var(--color-border)]">
          {[
            { key: "all", label: "전체" },
            { key: "completed", label: "완료" },
            { key: "processing", label: "처리중" },
            { key: "failed", label: "실패" },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setStatusFilter(tab.key)}
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

        {/* 전체 삭제 버튼 */}
        {captures.length > 0 && (
          <button
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

      {/* 렌더링 현황 + 최신 결과 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <div className="glass-card-static p-4 md:col-span-1">
          <p className="text-xs text-[var(--color-text-muted)] mb-1">렌더링 현황</p>
          <p className="text-2xl font-bold text-[var(--color-text-primary)]">{activeCount}</p>
          <p className="text-xs text-[var(--color-text-secondary)] mt-1">
            {activeCount > 0 ? "진행 중 작업이 있습니다" : "대기/진행 작업 없음"}
          </p>
        </div>
        <div className="glass-card-static p-4 md:col-span-2">
          <p className="text-xs text-[var(--color-text-muted)] mb-2">최신 렌더링 결과</p>
          {latestCompleted?.placement_image_url ? (
            <div className="flex items-center gap-3">
              <img
                src={latestCompleted.placement_image_url}
                alt="최신 렌더링"
                className="w-24 h-16 rounded-lg object-cover border border-[var(--color-border)]"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-[var(--color-text-primary)] truncate">
                  {latestCompleted.source_url ? truncateUrl(latestCompleted.source_url, 56) : "URL 없음"}
                </p>
                <p className="text-xs text-[var(--color-text-muted)] mt-1">
                  {formatDate(latestCompleted.created_at)}
                </p>
              </div>
              <a
                href={latestCompleted.placement_image_url}
                download
                className="btn btn-primary text-xs px-3 py-2 whitespace-nowrap"
              >
                다운로드
              </a>
            </div>
          ) : (
            <p className="text-xs text-[var(--color-text-muted)]">아직 완료된 렌더링 결과가 없습니다.</p>
          )}
        </div>
      </div>

      {/* 리스트 */}
      <div className="glass-card-static overflow-hidden">
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
            <p className="text-base font-medium mb-1">아직 캡처 기록이 없습니다</p>
            <p className="text-sm">위 폼에서 첫 번째 캡처를 요청해보세요!</p>
          </div>
        ) : (
          /* 캡처 리스트 */
          <div className="divide-y divide-[var(--color-border)]">
            {filteredCaptures.map((capture) => {
              const status = STATUS_LABELS[capture.status] || STATUS_LABELS.pending;
              const isActive = capture.status === "processing";

              return (
                <div
                  key={capture.id}
                  onClick={() => setSelectedCapture(capture)}
                  className={`
                    group flex items-center gap-4 p-4 cursor-pointer transition-all duration-200
                    hover:bg-[var(--color-bg-elevated)]
                    ${isActive ? "bg-[var(--color-accent-subtle)]" : ""}
                  `}
                >
                  {/* 썸네일 / 상태 아이콘 */}
                  <div className="flex-shrink-0">
                    {capture.status === "completed" && capture.placement_image_url ? (
                      <div className="w-16 h-16 rounded-lg overflow-hidden border border-[var(--color-border)] bg-[var(--color-bg-primary)]">
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
                          w-16 h-16 rounded-lg flex items-center justify-center text-2xl
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
                        {CHANNEL_LABELS[capture.channel] || capture.channel}
                      </span>
                      <span className={`badge ${status.class}`}>
                        {isActive && <span className="spinner" style={{ width: 10, height: 10, borderWidth: 1.5 }} />}
                        {status.label}
                      </span>
                    </div>
                    <p className="text-sm text-[var(--color-text-primary)] truncate">
                      {capture.source_url ? truncateUrl(capture.source_url) : "URL 없음"}
                    </p>
                    <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                      {formatDate(capture.created_at)}
                      {capture.metadata && typeof capture.metadata === "object" && getDurationMs(capture.metadata) !== null && (
                        <span className="ml-2">
                          ⏱ {Math.round((getDurationMs(capture.metadata) || 0) / 1000)}초
                        </span>
                      )}
                    </p>
                    {capture.channel === "youtube" && capture.metadata && typeof capture.metadata === "object" && (
                      <p className="text-[11px] text-[var(--color-text-muted)] mt-1">
                        {(() => {
                          const yt = getYoutubeMeta(capture.metadata);
                          const adLabel = getYoutubeAdTypeLabel(yt.adType);
                          if (!adLabel && yt.captureSecond === undefined) return null;
                          return `${adLabel || "YouTube"}${yt.captureSecond !== undefined ? ` · ${yt.captureSecond}초` : ""}`;
                        })()}
                      </p>
                    )}
                    {capture.status === "failed" && capture.error_message && (
                      <p className="text-xs text-[var(--color-error)] mt-1 truncate">
                        {capture.error_message}
                      </p>
                    )}
                    {capture.status === "completed" && capture.metadata && typeof capture.metadata === "object" && (
                      <p className="text-[11px] text-[var(--color-text-muted)] mt-1">
                        {getResultCategoryLabel(capture.metadata)}
                        {getQualityReviewLabel(capture.metadata)
                          ? ` · ${getQualityReviewLabel(capture.metadata)}`
                          : ""}
                      </p>
                    )}
                    {capture.status === "failed" && capture.metadata && typeof capture.metadata === "object" && (
                      <p className="text-[11px] text-[var(--color-text-muted)] mt-1">
                        {getFailureCategoryLabel(capture.metadata)}
                      </p>
                    )}
                  </div>

                  {/* 삭제 버튼 + 화살표 */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteConfirm({ type: "single", id: capture.id });
                      }}
                      className="w-8 h-8 flex items-center justify-center rounded-lg
                                 text-[var(--color-text-muted)] hover:text-[var(--color-error)]
                                 hover:bg-[rgba(239,68,68,0.1)] transition-all opacity-0 group-hover:opacity-100"
                      title="삭제"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                    <div className="text-[var(--color-text-muted)]">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                    </div>
                  </div>
                </div>
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
}: {
  capture: CaptureRecord;
  onClose: () => void;
  onDelete: (id: string) => void;
}) {
  const status = STATUS_LABELS[capture.status] || STATUS_LABELS.pending;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* 오버레이 */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* 모달 */}
      <div
        className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto glass-card-static p-6 animate-slide-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 닫기 버튼 */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg
                     text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]
                     hover:bg-[var(--color-bg-tertiary)] transition-all"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        {/* 헤더 */}
        <div className="flex items-center gap-3 mb-6">
          <span className={`badge ${status.class}`}>
            {status.icon} {status.label}
          </span>
          <span className="text-xs font-semibold px-2 py-0.5 rounded bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]">
            {CHANNEL_LABELS[capture.channel] || capture.channel}
          </span>
          <span className="text-xs text-[var(--color-text-muted)]">
            {formatDate(capture.created_at)}
          </span>
        </div>

        {/* 캡처 결과 이미지 */}
        {capture.status === "completed" && capture.placement_image_url && (
          <div className="mb-6">
            <p className="form-label mb-2">게재면 스크린샷</p>
            <div className="rounded-xl overflow-hidden border border-[var(--color-border)] bg-[var(--color-bg-primary)] flex justify-center">
              <img
                src={capture.placement_image_url}
                alt="게재면 캡처"
                className={
                  capture.channel === "youtube"
                    ? "w-full max-w-[1920px] h-auto object-contain"
                    : "w-full h-auto"
                }
              />
            </div>
            <div className="mt-2 flex gap-2">
              <a
                href={capture.placement_image_url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-sm btn-secondary"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
                새 탭에서 보기
              </a>
              <a
                href={capture.placement_image_url}
                download
                className="btn btn-sm btn-ghost"
              >
                ⬇️ 다운로드
              </a>
            </div>
          </div>
        )}

        {/* 랜딩 페이지 캡처 */}
        {capture.status === "completed" && capture.landing_image_url && (
          <div className="mb-6">
            <p className="form-label mb-2">랜딩 페이지 스크린샷</p>
            <div className="rounded-xl overflow-hidden border border-[var(--color-border)] bg-[var(--color-bg-primary)]">
              <img
                src={capture.landing_image_url}
                alt="랜딩 페이지 캡처"
                className="w-full h-auto"
              />
            </div>
            {capture.landing_final_url && (
              <p className="text-xs text-[var(--color-text-muted)] mt-2">
                최종 URL: <a href={capture.landing_final_url} target="_blank" rel="noopener noreferrer" className="text-[var(--color-accent)] hover:underline">{capture.landing_final_url}</a>
              </p>
            )}
          </div>
        )}

        {/* 에러 메시지 */}
        {capture.status === "failed" && capture.error_message && (
          <div className="mb-6 p-4 rounded-xl bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.2)]">
            <p className="text-sm font-semibold text-[var(--color-error)] mb-1">오류 발생</p>
            <p className="text-sm text-[var(--color-text-secondary)]">{capture.error_message}</p>
          </div>
        )}

        {/* 처리 중 */}
        {(capture.status === "pending" || capture.status === "processing") && (
          <div className="mb-6 flex flex-col items-center py-8">
            <div className="spinner spinner-lg mb-4" />
            <p className="text-sm text-[var(--color-text-secondary)]">
              {capture.status === "pending" ? "캡처 대기 중입니다..." : "캡처를 처리하고 있습니다..."}
            </p>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">보통 30초~2분 정도 소요됩니다</p>
          </div>
        )}

        {/* 상세 정보 */}
        <div className="border-t border-[var(--color-border)] pt-4">
          <p className="form-label mb-3">상세 정보</p>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-[var(--color-text-muted)]">캡처 ID</span>
              <span className="text-[var(--color-text-secondary)] font-mono text-xs">{capture.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--color-text-muted)]">게재면 URL</span>
              <a
                href={capture.source_url || "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--color-accent)] hover:underline text-xs max-w-[60%] truncate"
              >
                {capture.source_url || "-"}
              </a>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--color-text-muted)]">소재 URL</span>
              <a
                href={capture.creative_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--color-accent)] hover:underline text-xs max-w-[60%] truncate"
              >
                {truncateUrl(capture.creative_url, 35)}
              </a>
            </div>
            <div className="flex justify-between">
              <span className="text-[var(--color-text-muted)]">랜딩 캡처</span>
              <span className="text-[var(--color-text-secondary)]">{capture.capture_landing ? "예" : "아니오"}</span>
            </div>
            {capture.metadata && typeof capture.metadata === "object" && getDurationMs(capture.metadata) !== null && (
              <div className="flex justify-between">
                <span className="text-[var(--color-text-muted)]">소요 시간</span>
                <span className="text-[var(--color-text-secondary)]">
                  {((getDurationMs(capture.metadata) || 0) / 1000).toFixed(1)}초
                </span>
              </div>
            )}
            {capture.channel === "youtube" && capture.metadata && typeof capture.metadata === "object" && (
              <>
                <div className="flex justify-between">
                  <span className="text-[var(--color-text-muted)]">YouTube 유형</span>
                  <span className="text-[var(--color-text-secondary)]">
                    {(() => {
                      const yt = getYoutubeMeta(capture.metadata);
                      return getYoutubeAdTypeLabel(yt.adType) ?? "-";
                    })()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--color-text-muted)]">캡처 시점</span>
                  <span className="text-[var(--color-text-secondary)]">
                    {(() => {
                      const yt = getYoutubeMeta(capture.metadata);
                      return yt.captureSecond !== undefined ? `${yt.captureSecond}초` : "-";
                    })()}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* 삭제 버튼 */}
        <div className="border-t border-[var(--color-border)] mt-4 pt-4">
          <button
            onClick={() => onDelete(capture.id)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium
                       text-[var(--color-error)] hover:bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.2)] transition-all"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            이 캡처 삭제
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState, useCallback, useEffect } from "react";
import CaptureForm from "./components/CaptureForm";
import CaptureList from "./components/CaptureList";

type PrimaryNavId = "home" | "studio" | "review" | "campaigns" | "assets" | "coverage";

type CaptureSummaryRecord = {
  status?: string;
  metadata?: Record<string, unknown> | null;
};

const primaryNav = [
  { id: "home", label: "캡처 홈", targetId: "lens-home" },
  { id: "studio", label: "캡처 작업실", targetId: "capture-studio" },
  { id: "review", label: "결과 검수", targetId: "result-review" },
  { id: "campaigns", label: "캠페인", targetId: "campaign-review" },
  { id: "assets", label: "소재 라이브러리", targetId: "asset-library" },
  { id: "coverage", label: "커버리지", targetId: "coverage-matrix" },
] satisfies Array<{ id: PrimaryNavId; label: string; targetId: string }>;

const viewLabels: Record<PrimaryNavId, { title: string; status: string }> = {
  home: { title: "AdMate Lens", status: "캡처 홈" },
  studio: { title: "캡처 작업실", status: "요청 생성" },
  review: { title: "결과 검수", status: "결과 확인" },
  campaigns: { title: "캠페인", status: "검토 시작" },
  assets: { title: "소재 라이브러리", status: "검토 시작" },
  coverage: { title: "커버리지", status: "공개 범위" },
};

const campaignReviewRows = [
  {
    title: "캠페인 식별자",
    status: "부분 연결",
    description: "DB row의 campaign_id 컬럼은 존재하지만 요청 폼에서 캠페인 선택 UI는 아직 없습니다.",
  },
  {
    title: "상품/지면 metadata",
    status: "연결됨",
    description: "productFamily, productSurface 기준으로 YouTube, Demand Gen, Naver, Kakao 결과를 구분합니다.",
  },
  {
    title: "캠페인별 검수 묶음",
    status: "다음 작업",
    description: "동일 캠페인의 캡처 이력을 묶어 성공/실패/재요청 상태를 볼 수 있게 확장 가능합니다.",
  },
];

const assetReviewRows = [
  {
    title: "소재 입력",
    status: "연결됨",
    description: "이미지 URL, 영상 URL, companion, avatar, logo 입력은 현재 캡처 요청에 반영됩니다.",
  },
  {
    title: "업로드 API",
    status: "연결됨",
    description: "소재 업로드 후 URL을 캡처 요청에 사용하는 흐름은 유지됩니다.",
  },
  {
    title: "소재 라이브러리 저장소",
    status: "다음 작업",
    description: "별도 asset table/schema 없이 운영 UI만 먼저 열어두고, 영구 저장은 추후 설계가 필요합니다.",
  },
];

const productGroups = [
  {
    title: "YouTube In-stream / Bumper",
    status: "공개 구현",
    tone: "success",
    description: "PC, AOS, iOS의 Skip, Non-skip, Bumper 지면",
    items: ["PC Skip", "PC Non-skip", "AOS", "iOS", "Bumper"],
  },
  {
    title: "YouTube Feed Surfaces",
    status: "공개 구현",
    tone: "success",
    description: "Shorts, Masthead, In-feed 홈/검색/관련동영상",
    items: ["Shorts", "Masthead", "PC Home", "MO Home", "Search", "Watch Next"],
  },
  {
    title: "Demand Gen",
    status: "신규 공개",
    tone: "info",
    description: "Google Ads 상품 흐름에서 YouTube Feed/Shorts 증빙 생성",
    items: ["YouTube Feed", "YouTube Shorts", "metadata 분리"],
  },
  {
    title: "GDN Display",
    status: "공개 구현",
    tone: "success",
    description: "PC/MO 지면의 배너 삽입 및 랜딩 캡처",
    items: ["PC", "Mobile", "Auto slot", "Manual size"],
  },
  {
    title: "Naver / Kakao Mobile",
    status: "공개 구현",
    tone: "success",
    description: "국내 모바일 주요 지면의 네이티브/배너 증빙 생성",
    items: ["Naver 4종", "Kakao 4종", "모바일 지면"],
  },
];

const validationRules = [
  "실제 매체 화면과의 유사도를 최우선으로 검수합니다.",
  "픽셀, 레이아웃, CTA, 캡처 시점이 지면 기준과 맞는지 확인합니다.",
  "캡처 결과물 UI와 광고 미리보기는 AdMate 테마로 임의 변경하지 않습니다.",
  "AdMate/Openclaw 톤 적용은 운영자 UI와 작업 허브에만 한정합니다.",
];

const coverageRows = [
  {
    product: "YouTube In-stream / Bumper",
    surface: "PC, AOS, iOS · Skip/Non-skip/Bumper",
    status: "공개 구현",
    note: "Skip 버튼 노출 시점과 진행바 기준 검수",
  },
  {
    product: "YouTube Feed / Shorts / Masthead",
    surface: "Home, Search, Watch Next, Shorts, Masthead",
    status: "공개 구현",
    note: "Feed/Shorts 우선 운영, Masthead 홈 유지",
  },
  {
    product: "Demand Gen",
    surface: "Google Ads · YouTube Feed / Shorts",
    status: "공개 구현",
    note: "Google Ads 상품 흐름으로 metadata 분리",
  },
  {
    product: "GDN Display",
    surface: "PC / Mobile Display",
    status: "공개 구현",
    note: "실제 게재면 배너 삽입과 랜딩 캡처",
  },
  {
    product: "Naver / Kakao 모바일 지면",
    surface: "Naver 4종 / Kakao 4종",
    status: "공개 구현",
    note: "국내 모바일 네이티브/배너 지면 1차 구현",
  },
  {
    product: "YouTube Display / Overlay",
    surface: "Legacy 제외",
    status: "제외",
    note: "최신 YouTube UI 재구현 전 공개 금지",
  },
];

const studioSteps = [
  "상품 선택",
  "소재 입력",
  "지면 조건",
  "결과 검수",
];

const kpiCards = [
  { label: "공개 캡처 타입", value: "27", meta: "YouTube, Demand Gen, GDN, Naver, Kakao" },
  { label: "국내 모바일 지면", value: "8", meta: "Naver 4종 + Kakao 4종" },
  { label: "레거시 제외", value: "2", meta: "Display, Overlay" },
  { label: "삭제 정책", value: "Off", meta: "UI 기본 비활성" },
];

const homeActionCards = [
  {
    title: "새 캡처 만들기",
    description: "상품, 지면, 소재를 선택해 새 증빙 캡처를 생성합니다.",
    targetId: "capture-studio",
    tone: "primary",
  },
  {
    title: "최근 캡처 결과",
    description: "완료, 실패, 처리중 캡처 이력을 확인합니다.",
    targetId: "result-review",
    tone: "default",
  },
  {
    title: "검수 필요 결과",
    description: "품질 플래그와 실패 사유를 결과 목록에서 확인합니다.",
    targetId: "result-review",
    tone: "warning",
  },
  {
    title: "지원 지면 커버리지",
    description: "공개/제외 지면과 상품별 구현 상태를 봅니다.",
    targetId: "coverage-matrix",
    tone: "default",
  },
] as const;

const externalLinks = [
  {
    title: "접근 요청",
    href: "https://sentinel.admate.ai.kr/access-request",
    description: "권한과 운영 콘솔 접근은 Sentinel에서 요청합니다.",
  },
  {
    title: "AdMate 홈",
    href: "https://home.admate.ai.kr",
    description: "전체 AdMate 제품 링크 관문으로 이동합니다.",
  },
] as const;

const initialDashboardStats = {
  recent: "0",
  completed: "0",
  failed: "0",
  reviewNeeded: "0",
};

export default function Home() {
  /** 캡처 생성 시 리스트 갱신을 위한 트리거 */
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [activeNav, setActiveNav] = useState<PrimaryNavId>("home");
  const [dashboardStats, setDashboardStats] = useState(initialDashboardStats);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  /** 새 캡처가 생성되면 리스트 갱신 */
  const handleCaptureCreated = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  const scrollToSection = useCallback((targetId: string, navId?: PrimaryNavId) => {
    if (navId) setActiveNav(navId);
    document.getElementById(targetId)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, []);

  const handleNavClick = useCallback(
    (item: (typeof primaryNav)[number]) => {
      scrollToSection(item.targetId, item.id);
    },
    [scrollToSection],
  );

  const handleLogout = useCallback(async () => {
    setIsLoggingOut(true);
    setLogoutError(null);

    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
      });
      const payload = (await response.json().catch(() => null)) as
        | { success?: boolean }
        | null;
      if (!response.ok || payload?.success !== true) {
        throw new Error("로그아웃에 실패했습니다.");
      }
      window.location.assign("/login");
    } catch {
      setLogoutError("로그아웃 중 오류가 발생했습니다. 다시 시도해 주세요.");
    } finally {
      setIsLoggingOut(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    const isReviewNeeded = (capture: CaptureSummaryRecord) => {
      const metadata = capture.metadata;
      const diagnostics = metadata?.diagnostics as
        | { captureQuality?: { flags?: unknown[] } }
        | undefined;
      const flags = Array.isArray(diagnostics?.captureQuality?.flags)
        ? diagnostics.captureQuality.flags
        : [];
      return (
        metadata?.resultCategory === "ad_capture_review_needed" ||
        capture.status === "failed" ||
        flags.length > 0
      );
    };

    async function loadDashboardStats() {
      try {
        const res = await fetch(`/api/captures?limit=30&_t=${Date.now()}`, {
          cache: "no-store",
        });
        const result = (await res.json()) as { data?: CaptureSummaryRecord[] };
        const captures = Array.isArray(result.data) ? result.data : [];
        if (!isMounted) return;
        setDashboardStats({
          recent: String(captures.length),
          completed: String(captures.filter((capture) => capture.status === "completed").length),
          failed: String(captures.filter((capture) => capture.status === "failed").length),
          reviewNeeded: String(captures.filter(isReviewNeeded).length),
        });
      } catch {
        if (isMounted) setDashboardStats(initialDashboardStats);
      }
    }

    loadDashboardStats();
    return () => {
      isMounted = false;
    };
  }, [refreshTrigger]);

  return (
    <div className="ops-shell studio-shell">
      <aside className="ops-sidebar studio-sidebar" aria-label="운영 메뉴">
        <div className="ops-sidebar-inner">
          <div className="ops-sidebar-brand">
            <div className="ops-logo" aria-hidden="true">
              <img src="/brand/admate-lens-favicon-02.svg" alt="" />
            </div>
            <div>
              <h1 className="text-sm font-bold leading-tight text-[var(--color-text-primary)]">
                AdMate Lens
              </h1>
              <p className="text-xs leading-tight text-[var(--color-text-muted)]">
                Capture Automation
              </p>
            </div>
          </div>

          <nav className="ops-nav" aria-label="주요 화면">
            {primaryNav.map((item) => (
              <button
                key={item.label}
                type="button"
                className={`ops-nav-item ${activeNav === item.id ? "active" : ""}`}
                aria-current={activeNav === item.id ? "page" : undefined}
                onClick={() => handleNavClick(item)}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="studio-sidebar-panel">
            <p className="studio-eyebrow">오늘의 작업 기준</p>
            <div className="studio-sidebar-metric">
              <span>우선순위</span>
              <strong>캡처 성공률</strong>
            </div>
            <div className="studio-sidebar-metric">
              <span>검수 기준</span>
              <strong>픽셀 매칭</strong>
            </div>
            <div className="studio-sidebar-metric">
              <span>변경 금지</span>
              <strong>합성 결과물 UI</strong>
            </div>
          </div>
        </div>
      </aside>

      <div className="ops-main">
        <header className="ops-topbar studio-topbar">
          <div className="ops-topbar-inner">
            <div>
              <p className="text-[13px] font-semibold text-[var(--color-text-primary)]">
                {viewLabels[activeNav].title}
              </p>
              {logoutError && (
                <p className="mt-1 text-xs text-[var(--color-error)]">{logoutError}</p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="badge badge-completed">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-success)]" />
                엔진 정상
              </span>
              <span className="badge badge-processing">{viewLabels[activeNav].status}</span>
              <button
                type="button"
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="inline-flex items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-tertiary)] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLoggingOut ? "로그아웃 중..." : "로그아웃"}
              </button>
            </div>
          </div>
        </header>

        <main className="ops-content studio-content">
          <section id="lens-home" className="lens-home-hub" aria-label="AdMate Lens 캡처 홈">
            <div className="lens-home-copy">
              <p className="ops-kicker">lens.admate.ai.kr · Capture Home</p>
              <h2>AdMate Lens</h2>
              <p>
                광고 게재 화면과 보고서 증빙 이미지를 자동 생성하는 캡처 자동화 도구입니다.
                Lens는 캡처/증빙 생성 품질과 지면 커버리지를 담당하고, 접근 권한과 운영 기준은
                Sentinel/Openclaw 흐름을 따릅니다.
              </p>
              <div className="lens-home-actions" aria-label="주요 작업">
                <button
                  type="button"
                  className="lens-home-button primary"
                  onClick={() => scrollToSection("capture-studio", "studio")}
                >
                  새 캡처 만들기
                </button>
                <button
                  type="button"
                  className="lens-home-button"
                  onClick={() => scrollToSection("result-review", "review")}
                >
                  최근 결과 보기
                </button>
              </div>
            </div>

            <div className="lens-home-status" aria-label="운영 상태 요약">
              <article>
                <span>공개 캡처 타입</span>
                <strong>27</strong>
                <em>YouTube, Demand Gen, GDN, Naver, Kakao</em>
              </article>
              <article>
                <span>최근 캡처</span>
                <strong>{dashboardStats.recent}</strong>
                <em>최근 30건 기준</em>
              </article>
              <article>
                <span>완료 / 실패</span>
                <strong>{dashboardStats.completed} / {dashboardStats.failed}</strong>
                <em>결과 검수 상태</em>
              </article>
              <article>
                <span>검수 필요</span>
                <strong>{dashboardStats.reviewNeeded}</strong>
                <em>품질 플래그 또는 실패 포함</em>
              </article>
            </div>
          </section>

          <section className="lens-action-grid" aria-label="AdMate Lens 주요 작업 CTA">
            {homeActionCards.map((card) => (
              <button
                type="button"
                key={card.title}
                className={`lens-action-card ${card.tone}`}
                onClick={() =>
                  scrollToSection(
                    card.targetId,
                    card.targetId === "capture-studio"
                      ? "studio"
                      : card.targetId === "coverage-matrix"
                        ? "coverage"
                        : "review",
                  )
                }
              >
                <strong>{card.title}</strong>
                <span>{card.description}</span>
              </button>
            ))}
            {externalLinks.map((link) => (
              <a
                key={link.href}
                className="lens-action-card external"
                href={link.href}
                target="_blank"
                rel="noreferrer"
              >
                <strong>{link.title}</strong>
                <span>{link.description}</span>
              </a>
            ))}
          </section>

          <section className="lens-quality-panel" aria-label="AdMate Lens 품질 기준">
            <div>
              <p className="studio-eyebrow">Quality Standard</p>
              <h3>캡처 결과물과 운영자 UI의 경계</h3>
            </div>
            <ul>
              {validationRules.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ul>
          </section>

          <section id="capture-studio" className="studio-hero">
            <div>
              <p className="ops-kicker">Capture Studio · Powered by Openclaw Engine</p>
              <h2 className="studio-title">
                캡처 요청 생성
              </h2>
              <p className="studio-subtitle">
                기존 작업실은 root 안의 주요 작업 섹션으로 유지합니다. 상품, 지면,
                소재 정보를 입력하면 결과 검수 영역에서 증빙 이미지를 확인할 수 있습니다.
              </p>
            </div>
            <div className="studio-hero-actions" aria-label="작업 상태">
              <span className="studio-hero-stat">
                <strong>5</strong>
                <span>운영 매체</span>
              </span>
              <span className="studio-hero-stat">
                <strong>27</strong>
                <span>공개 타입</span>
              </span>
              <span className="studio-hero-stat">
                <strong>0</strong>
                <span>삭제 허용</span>
              </span>
            </div>
          </section>

          <section className="studio-kpi-grid" aria-label="운영 요약">
            {kpiCards.map((card) => (
              <article className="ops-kpi-card studio-kpi-card" key={card.label}>
                <p className="ops-kpi-label">{card.label}</p>
                <strong className="ops-kpi-value">{card.value}</strong>
                <span className="ops-kpi-meta">{card.meta}</span>
              </article>
            ))}
          </section>

          <section className="studio-workbench-grid" aria-label="캡처 워크벤치">
            <aside className="studio-panel studio-left-panel">
              <div className="studio-panel-header">
                <p className="studio-eyebrow">Product Coverage</p>
                <h3>캡처 상품 커버리지</h3>
              </div>

              <div className="studio-product-stack">
                {productGroups.map((group) => (
                  <article className="studio-product-card" key={group.title}>
                    <div className="studio-product-card-header">
                      <h4>{group.title}</h4>
                      <span className={`studio-status-pill ${group.tone}`}>
                        {group.status}
                      </span>
                    </div>
                    <p>{group.description}</p>
                    <div className="studio-chip-row">
                      {group.items.map((item) => (
                        <span className="studio-chip" key={item}>
                          {item}
                        </span>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </aside>

            <section className="studio-panel studio-form-panel">
              <div className="studio-panel-header horizontal">
                <div>
                  <p className="studio-eyebrow">Request Builder</p>
                  <h3>캡처 요청 생성</h3>
                </div>
                <div className="studio-stepper" aria-label="캡처 생성 단계">
                  {studioSteps.map((step, index) => (
                    <span key={step} className={index === 0 ? "active" : ""}>
                      {step}
                    </span>
                  ))}
                </div>
              </div>

              <CaptureForm onCaptureCreated={handleCaptureCreated} />
            </section>

            <aside className="studio-panel studio-right-panel">
              <div className="studio-panel-header">
                <p className="studio-eyebrow">Operator Guardrails</p>
                <h3>실행 가드레일</h3>
              </div>

              <ul className="studio-check-list">
                {validationRules.map((rule) => (
                  <li key={rule}>
                    <span aria-hidden="true" />
                    <p>{rule}</p>
                  </li>
                ))}
              </ul>

              <div className="studio-divider" />

              <div className="studio-panel-header compact">
                <p className="studio-eyebrow">Excluded Scope</p>
                <h3>공개 제외</h3>
              </div>
              <div className="studio-chip-row">
                <span className="studio-chip muted">Audio</span>
                <span className="studio-chip muted">YouTube TV</span>
                <span className="studio-chip muted">CTV</span>
                <span className="studio-chip muted">Pause Ads</span>
              </div>
            </aside>
          </section>

          <section id="result-review" className="studio-results-panel">
            <div className="studio-panel-header horizontal">
              <div>
                <p className="studio-eyebrow">Result Review</p>
                <h3>최근 캡처 결과 검수</h3>
              </div>
              <p className="studio-panel-note">
                완료, 실패, 처리중 결과를 확인합니다. 운영 UI에서는 삭제 대신
                보존과 재요청을 우선합니다.
              </p>
            </div>
            <CaptureList refreshTrigger={refreshTrigger} />
          </section>

          <section id="campaign-review" className="studio-samples-panel" aria-label="캠페인 기능 검토">
            <div className="studio-panel-header horizontal">
              <div>
                <p className="studio-eyebrow">Campaign Review</p>
                <h3>캠페인 메뉴 활성화 검토</h3>
              </div>
              <p className="studio-panel-note">
                DB schema 변경 없이 현재 캡처 metadata와 campaign_id 활용 가능 범위를 먼저 확인합니다.
              </p>
            </div>

            <div className="studio-review-grid">
              {campaignReviewRows.map((row) => (
                <article className="studio-review-card" key={row.title}>
                  <div className="studio-product-card-header">
                    <h4>{row.title}</h4>
                    <span
                      className={`studio-status-pill ${
                        row.status === "연결됨"
                          ? "success"
                          : row.status === "부분 연결"
                            ? "warning"
                            : "info"
                      }`}
                    >
                      {row.status}
                    </span>
                  </div>
                  <p>{row.description}</p>
                </article>
              ))}
            </div>
          </section>

          <section id="asset-library" className="studio-samples-panel" aria-label="소재 라이브러리 기능 검토">
            <div className="studio-panel-header horizontal">
              <div>
                <p className="studio-eyebrow">Asset Library</p>
                <h3>소재 라이브러리 메뉴 활성화 검토</h3>
              </div>
              <p className="studio-panel-note">
                실제 소재 파일과 URL은 캡처 결과 픽셀 매칭에 직접 영향을 주므로 저장/재사용 정책을 분리합니다.
              </p>
            </div>

            <div className="studio-review-grid">
              {assetReviewRows.map((row) => (
                <article className="studio-review-card" key={row.title}>
                  <div className="studio-product-card-header">
                    <h4>{row.title}</h4>
                    <span
                      className={`studio-status-pill ${
                        row.status === "연결됨" ? "success" : "info"
                      }`}
                    >
                      {row.status}
                    </span>
                  </div>
                  <p>{row.description}</p>
                </article>
              ))}
            </div>
          </section>

          <section id="coverage-matrix" className="studio-samples-panel" aria-label="캡처 커버리지 매트릭스">
            <div className="studio-panel-header horizontal">
              <div>
                <p className="studio-eyebrow">Coverage Matrix</p>
                <h3>캡처 지면 상태</h3>
              </div>
              <p className="studio-panel-note">
                공개 구현, 신규 공개, 제외 상태를 운영자가 한눈에 확인합니다.
              </p>
            </div>

            <div className="studio-coverage-table" role="table">
              <div className="studio-coverage-row head" role="row">
                <span role="columnheader">상품</span>
                <span role="columnheader">지면</span>
                <span role="columnheader">상태</span>
                <span role="columnheader">비고</span>
              </div>
              {coverageRows.map((row) => (
                <div className="studio-coverage-row" role="row" key={`${row.product}-${row.surface}`}>
                  <strong role="cell">{row.product}</strong>
                  <span role="cell">{row.surface}</span>
                  <span role="cell">
                    <em
                      className={`studio-status-pill ${
                        row.status === "제외"
                          ? "muted"
                          : row.status === "신규 공개"
                            ? "info"
                            : "success"
                      }`}
                    >
                      {row.status}
                    </em>
                  </span>
                  <span role="cell">{row.note}</span>
                </div>
              ))}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

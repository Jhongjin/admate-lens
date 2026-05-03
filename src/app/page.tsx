"use client";

import { useState, useCallback } from "react";
import CaptureForm from "./components/CaptureForm";
import CaptureList from "./components/CaptureList";

type PrimaryNavId = "studio" | "review" | "campaigns" | "assets" | "coverage";

const primaryNav = [
  { id: "studio", label: "캡처 작업실", targetId: "capture-studio" },
  { id: "review", label: "결과 검수", targetId: "result-review" },
  { id: "campaigns", label: "캠페인", targetId: "campaign-review" },
  { id: "assets", label: "소재 라이브러리", targetId: "asset-library" },
  { id: "coverage", label: "커버리지", targetId: "coverage-matrix" },
] satisfies Array<{ id: PrimaryNavId; label: string; targetId: string }>;

const viewLabels: Record<PrimaryNavId, { title: string; status: string }> = {
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
];

const validationRules = [
  "상품 선택 후 필요한 입력만 열어 입력 실수를 줄입니다.",
  "소재 비율, 지면, CTA, 캡처 시점을 요청 전 점검합니다.",
  "YouTube/GDN 결과물 UI는 실제 매체 화면 기준을 우선합니다.",
  "삭제 동작은 운영 UI에서 기본 비활성화하고 검수 이력은 보존합니다.",
];

const coverageRows = [
  {
    product: "PC In-stream Skip",
    surface: "YouTube PC Watch",
    status: "공개 구현",
    note: "Skip 버튼 5초 이후 노출 기준",
  },
  {
    product: "Mobile In-stream",
    surface: "AOS / iOS",
    status: "공개 구현",
    note: "모바일 뷰포트별 캡처",
  },
  {
    product: "YouTube Shorts",
    surface: "Shorts Feed",
    status: "공개 구현",
    note: "9:16 합성 렌더링",
  },
  {
    product: "YouTube In-feed",
    surface: "PC/MO Home, Search, Watch Next",
    status: "공개 구현",
    note: "PC 홈 공개화 포함",
  },
  {
    product: "Demand Gen",
    surface: "YouTube Feed / Shorts",
    status: "신규 공개",
    note: "Google Ads 상품 흐름으로 식별",
  },
  {
    product: "YouTube Display / Overlay",
    surface: "Legacy",
    status: "제외",
    note: "최신 UI 재검증 전 공개 금지",
  },
];

const studioSteps = [
  "상품 선택",
  "소재 입력",
  "지면 조건",
  "결과 검수",
];

const kpiCards = [
  { label: "공개 캡처 타입", value: "16", meta: "YouTube, Demand Gen, GDN" },
  { label: "신규 공개", value: "3", meta: "PC Home In-feed + Demand Gen 2종" },
  { label: "레거시 제외", value: "2", meta: "Display, Overlay" },
  { label: "삭제 정책", value: "Off", meta: "UI 기본 비활성" },
];

export default function Home() {
  /** 캡처 생성 시 리스트 갱신을 위한 트리거 */
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [activeNav, setActiveNav] = useState<PrimaryNavId>("studio");

  /** 새 캡처가 생성되면 리스트 갱신 */
  const handleCaptureCreated = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  const handleNavClick = useCallback((item: (typeof primaryNav)[number]) => {
    setActiveNav(item.id);
    document.getElementById(item.targetId)?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }, []);

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
            </div>

            <div className="flex items-center gap-2">
              <span className="badge badge-completed">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-success)]" />
                엔진 정상
              </span>
              <span className="badge badge-processing">{viewLabels[activeNav].status}</span>
            </div>
          </div>
        </header>

        <main className="ops-content studio-content">
          <section id="capture-studio" className="studio-hero">
            <div>
              <p className="ops-kicker">AdMate Lens · Powered by Openclaw Engine</p>
              <h2 className="studio-title">
                광고 게재면 캡처를 요청하고 검수하는 운영 콘솔
              </h2>
              <p className="studio-subtitle">
                YouTube, Demand Gen, GDN 캡처 상품을 상품-지면-소재 흐름으로
                정리하고 결과 검수까지 한 화면에서 처리합니다.
              </p>
            </div>
            <div className="studio-hero-actions" aria-label="작업 상태">
              <span className="studio-hero-stat">
                <strong>3</strong>
                <span>운영 매체</span>
              </span>
              <span className="studio-hero-stat">
                <strong>16</strong>
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

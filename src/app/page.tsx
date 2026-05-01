"use client";

import { useState, useCallback } from "react";
import CaptureForm from "./components/CaptureForm";
import CaptureList from "./components/CaptureList";

const primaryNav = [
  { label: "Capture Studio", active: true },
  { label: "Result Review", active: false },
  { label: "Campaigns", active: false },
  { label: "Asset Library", active: false },
  { label: "Coverage", active: false },
];

const productGroups = [
  {
    title: "YouTube Core",
    status: "구현됨",
    tone: "success",
    description: "In-stream, Bumper, Shorts, Masthead, In-feed 기본 캡처",
    items: ["In-stream", "Bumper", "Shorts", "Masthead", "In-feed"],
  },
  {
    title: "Demand Gen",
    status: "다음 구현",
    tone: "warning",
    description: "이미지, 캐러셀, 상품피드형 YouTube 표면 확장",
    items: ["Image", "Carousel", "Product Feed", "Shorts Image"],
  },
  {
    title: "GDN Display",
    status: "구현됨",
    tone: "success",
    description: "PC/MO 지면의 배너 삽입 및 랜딩 캡처",
    items: ["PC", "Mobile", "Auto slot", "Manual size"],
  },
];

const validationRules = [
  "광고상품을 먼저 고르면 필요한 입력만 노출합니다.",
  "소재 비율, 지면, CTA 조건을 캡처 전 단계에서 점검합니다.",
  "YouTube/GDN 네이티브 합성 결과물은 픽셀 매칭 영역으로 보호합니다.",
  "실패 원인은 운영자가 이해할 수 있는 한국어 문장으로 정리합니다.",
];

const samplePages = [
  {
    title: "Capture Studio",
    role: "메인 작업 화면",
    summary: "상품 선택, 소재 입력, 프리뷰, 요청 실행을 한 흐름으로 묶습니다.",
  },
  {
    title: "Result Review Queue",
    role: "결과 검수",
    summary: "썸네일 큐와 우측 상세 패널로 완료/실패 결과를 빠르게 판정합니다.",
  },
  {
    title: "Product Coverage Matrix",
    role: "상품 커버리지",
    summary: "구현됨, 다음 구현, 제외 상품을 matrix와 muted badge로 관리합니다.",
  },
  {
    title: "Campaign Workspace",
    role: "캠페인 단위 관리",
    summary: "브랜드, 캠페인, 소재, 캡처 결과를 하나의 작업 단위로 정리합니다.",
  },
  {
    title: "Asset Validation Library",
    role: "소재 검증",
    summary: "이미지, 영상, 로고, 상품피드의 사용 가능 상품을 사전에 점검합니다.",
  },
];

const studioSteps = [
  "상품 선택",
  "소재 입력",
  "지면 조건",
  "결과 검수",
];

export default function Home() {
  /** 캡처 생성 시 리스트 갱신을 위한 트리거 */
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  /** 새 캡처가 생성되면 리스트 갱신 */
  const handleCaptureCreated = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1);
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
              <span
                key={item.label}
                className={`ops-nav-item ${item.active ? "active" : ""}`}
              >
                {item.label}
              </span>
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
                AdMate Lens
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="badge badge-completed">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-success)]" />
                엔진 정상
              </span>
              <span className="badge badge-processing">Production Ready</span>
            </div>
          </div>
        </header>

        <main className="ops-content studio-content">
          <section className="studio-hero">
            <div>
              <p className="ops-kicker">AdMate Lens Operations Studio</p>
              <h2 className="studio-title">
                광고 게재 증빙을 만들고, 검수하고, 다시 실행하는 작업실
              </h2>
              <p className="studio-subtitle">
                YouTube/GDN 광고상품을 상품-지면-소재 흐름으로 정리해 입력
                오류를 줄이고, 결과물 검수까지 한 화면에서 이어갑니다.
              </p>
            </div>
            <div className="studio-hero-actions" aria-label="작업 상태">
              <span className="studio-hero-stat">
                <strong>2</strong>
                <span>운영 매체</span>
              </span>
              <span className="studio-hero-stat">
                <strong>14</strong>
                <span>구현 타입</span>
              </span>
              <span className="studio-hero-stat">
                <strong>5</strong>
                <span>다음 샘플</span>
              </span>
            </div>
          </section>

          <section className="studio-workbench-grid" aria-label="캡처 워크벤치">
            <aside className="studio-panel studio-left-panel">
              <div className="studio-panel-header">
                <p className="studio-eyebrow">Product Taxonomy</p>
                <h3>상품 선택 기준</h3>
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
                <h3>입력 검증 가이드</h3>
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
                <h3>이번 구현 제외</h3>
              </div>
              <div className="studio-chip-row">
                <span className="studio-chip muted">Audio</span>
                <span className="studio-chip muted">YouTube TV</span>
                <span className="studio-chip muted">CTV</span>
                <span className="studio-chip muted">Pause Ads</span>
              </div>
            </aside>
          </section>

          <section className="studio-results-panel">
            <div className="studio-panel-header horizontal">
              <div>
                <p className="studio-eyebrow">Result Review</p>
                <h3>최근 캡처 결과 검수</h3>
              </div>
              <p className="studio-panel-note">
                완료, 실패, 처리중 결과를 확인하고 필요하면 같은 조건으로 다시
                요청합니다.
              </p>
            </div>
            <CaptureList refreshTrigger={refreshTrigger} />
          </section>

          <section className="studio-samples-panel" aria-label="추천 샘플 화면">
            <div className="studio-panel-header horizontal">
              <div>
                <p className="studio-eyebrow">UI/UX Direction</p>
                <h3>Top 5 샘플 화면</h3>
              </div>
              <p className="studio-panel-note">
                이 다섯 화면을 기준으로 전체 운영 UI를 확장합니다.
              </p>
            </div>

            <div className="studio-sample-grid">
              {samplePages.map((page, index) => (
                <article className="studio-sample-card" key={page.title}>
                  <span className="studio-sample-index">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <p>{page.role}</p>
                    <h4>{page.title}</h4>
                    <span>{page.summary}</span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

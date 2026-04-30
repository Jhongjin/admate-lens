"use client";

import { useState, useCallback } from "react";
import CaptureForm from "./components/CaptureForm";
import CaptureList from "./components/CaptureList";

export default function Home() {
  /** 캡처 생성 시 리스트 갱신을 위한 트리거 */
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  /** 새 캡처가 생성되면 리스트 갱신 */
  const handleCaptureCreated = useCallback(() => {
    setRefreshTrigger((prev) => prev + 1);
  }, []);

  return (
    <div className="ops-shell">
      <aside className="ops-sidebar" aria-label="관리자 메뉴">
        <div className="ops-sidebar-inner">
          <div className="ops-sidebar-brand">
            <div className="ops-logo">AC</div>
            <div>
              <h1 className="text-sm font-bold leading-tight text-[var(--color-text-primary)]">
                AdMate Capture
              </h1>
              <p className="text-xs leading-tight text-[var(--color-text-muted)]">
                운영 콘솔
              </p>
            </div>
          </div>

          <nav className="ops-nav">
            <span className="ops-nav-item active">캡처</span>
            <span className="ops-nav-item">이력</span>
            <span className="ops-nav-item">캠페인</span>
            <span className="ops-nav-item">설정</span>
          </nav>
        </div>
      </aside>

      <div className="ops-main">
        <header className="ops-topbar">
          <div className="ops-topbar-inner">
            <div>
              <p className="text-[13px] font-semibold text-[var(--color-text-primary)]">
                광고 캡처 운영
              </p>
            </div>

            <div className="flex items-center gap-2">
              <span className="badge badge-completed">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-success)]" />
                엔진 정상
              </span>
              <span className="badge badge-processing">MVP v0.1</span>
            </div>
          </div>
        </header>

        <main className="ops-content">
          <div className="ops-page-header">
            <div>
              <p className="ops-kicker">AdMate Capture Pro</p>
              <h2 className="ops-title">캡처 요청 및 결과 이력</h2>
              <p className="ops-subtitle">
                YouTube/GDN 게재 화면 캡처 요청과 렌더링 결과를 관리합니다.
              </p>
            </div>
          </div>

          <div className="ops-summary-grid">
            <div className="ops-kpi-card">
              <p className="ops-kpi-label">지원 매체</p>
              <p className="ops-kpi-value">2</p>
              <p className="ops-kpi-meta">YouTube · GDN</p>
            </div>
            <div className="ops-kpi-card">
              <p className="ops-kpi-label">주요 작업</p>
              <p className="ops-kpi-value">캡처</p>
              <p className="ops-kpi-meta">요청 생성과 결과 확인</p>
            </div>
            <div className="ops-kpi-card">
              <p className="ops-kpi-label">렌더링 상태</p>
              <p className="ops-kpi-value">정상</p>
              <p className="ops-kpi-meta">서버리스 실행 준비</p>
            </div>
            <div className="ops-kpi-card">
              <p className="ops-kpi-label">결과 관리</p>
              <p className="ops-kpi-value">이미지</p>
              <p className="ops-kpi-meta">게재면/랜딩 결과 보관</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
            <div className="lg:col-span-2">
              <CaptureForm onCaptureCreated={handleCaptureCreated} />
            </div>

            <div className="lg:col-span-3">
              <CaptureList refreshTrigger={refreshTrigger} />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

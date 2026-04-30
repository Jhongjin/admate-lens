type MastheadAdData = {
  title: string;
  description: string;
  sponsorName: string;
  creativeDataUrl: string;
  avatarDataUrl: string;
  ctaText: string;
  displayUrl: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

export function generateYouTubeMastheadSyntheticHtml(ad: MastheadAdData): string {
  const title = escapeHtml(ad.title || "광고 제목");
  const description = escapeHtml(ad.description || "");
  const sponsorName = escapeHtml(ad.sponsorName || "brand.example");
  const ctaText = escapeHtml(ad.ctaText || "자세히 알아보기");
  const displayUrl = escapeHtml(ad.displayUrl || ad.sponsorName || "brand.example");
  const creative = escapeAttr(ad.creativeDataUrl);
  const avatar = escapeAttr(ad.avatarDataUrl);

  const organicCards = [
    ["오늘의 인기 영상", "조회수 32만회"],
    ["새로운 캠페인 인사이트", "조회수 8.4만회"],
    ["브랜드 스토리", "조회수 12만회"],
    ["실시간 트렌드", "조회수 5.7만회"],
  ]
    .map(
      ([cardTitle, meta], i) => `
        <div class="video-card">
          <div class="thumb thumb-${i + 1}"></div>
          <div class="video-meta">
            <div class="channel-dot"></div>
            <div>
              <div class="video-title">${cardTitle}</div>
              <div class="video-sub">YouTube 채널 · ${meta}</div>
            </div>
          </div>
        </div>
      `,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    * { box-sizing: border-box; }
    html, body {
      width: 100%;
      min-height: 100%;
      margin: 0;
      background: #fff;
      color: #0f0f0f;
      font-family: Roboto, "Noto Sans KR", Arial, sans-serif;
      overflow: hidden;
      -webkit-font-smoothing: antialiased;
    }
    .app {
      width: 100vw;
      height: 100vh;
      background: #fff;
      display: grid;
      grid-template-columns: 72px 1fr;
      grid-template-rows: 56px 1fr;
    }
    .topbar {
      grid-column: 1 / -1;
      height: 56px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 24px;
      border-bottom: 1px solid #eee;
      background: #fff;
      z-index: 5;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 18px;
      font-weight: 800;
      font-size: 20px;
      letter-spacing: -0.2px;
    }
    .hamburger {
      width: 22px;
      height: 14px;
      display: grid;
      gap: 4px;
    }
    .hamburger span {
      display: block;
      height: 2px;
      background: #0f0f0f;
      border-radius: 2px;
    }
    .logo-mark {
      width: 30px;
      height: 21px;
      border-radius: 6px;
      background: #ff0033;
      color: #fff;
      display: grid;
      place-items: center;
      font-size: 12px;
      margin-right: -10px;
    }
    .search {
      width: min(640px, 44vw);
      height: 40px;
      border: 1px solid #d9d9d9;
      border-radius: 20px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      color: #606060;
      padding: 0 14px 0 18px;
      font-size: 15px;
    }
    .top-actions {
      display: flex;
      align-items: center;
      gap: 18px;
      color: #0f0f0f;
      font-size: 20px;
    }
    .profile {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: #111;
      color: #fff;
      display: grid;
      place-items: center;
      font-size: 12px;
      font-weight: 700;
    }
    .sidebar {
      border-right: 1px solid #f1f1f1;
      padding-top: 12px;
      display: grid;
      align-content: start;
      gap: 18px;
      color: #0f0f0f;
      font-size: 10px;
      text-align: center;
    }
    .side-item {
      display: grid;
      justify-items: center;
      gap: 5px;
    }
    .side-icon {
      width: 24px;
      height: 24px;
      display: grid;
      place-items: center;
      font-size: 18px;
    }
    .content {
      overflow: hidden;
      padding: 0 32px 32px;
      background: #fff;
    }
    .chips {
      height: 56px;
      display: flex;
      align-items: center;
      gap: 10px;
      white-space: nowrap;
    }
    .chip {
      height: 32px;
      padding: 0 12px;
      border-radius: 8px;
      background: #f2f2f2;
      color: #0f0f0f;
      display: inline-flex;
      align-items: center;
      font-size: 14px;
      font-weight: 500;
    }
    .chip.active {
      background: #0f0f0f;
      color: #fff;
    }
    .masthead {
      position: relative;
      height: 420px;
      border-radius: 2px;
      overflow: hidden;
      background: #111;
      display: grid;
      grid-template-columns: minmax(390px, 34%) 1fr;
      isolation: isolate;
    }
    .hero {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: center;
      opacity: .95;
      z-index: -2;
    }
    .fallback-hero {
      position: absolute;
      inset: 0;
      background:
        radial-gradient(circle at 72% 40%, rgba(255,255,255,.18), transparent 0 26%, transparent 26%),
        linear-gradient(130deg, #151515 0%, #303030 44%, #070707 100%);
      z-index: -2;
    }
    .hero-mask {
      position: absolute;
      inset: 0;
      background:
        linear-gradient(to right, rgba(255,255,255,.98) 0%, rgba(255,255,255,.94) 30%, rgba(255,255,255,.26) 54%, rgba(255,255,255,0) 100%),
        linear-gradient(to top, rgba(0,0,0,.24), rgba(0,0,0,0) 38%);
      z-index: -1;
    }
    .masthead-copy {
      padding: 46px 0 42px 42px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      min-width: 0;
    }
    .sponsor-row {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 20px;
    }
    .avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      object-fit: cover;
      background: #f1f1f1;
      border: 1px solid rgba(0,0,0,.08);
    }
    .fallback-avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: #0f0f0f;
      color: #fff;
      display: grid;
      place-items: center;
      font-size: 12px;
      font-weight: 800;
    }
    .sponsor {
      font-size: 13px;
      line-height: 18px;
      color: #606060;
    }
    .sponsor strong {
      display: block;
      color: #0f0f0f;
      font-size: 14px;
      line-height: 20px;
    }
    .ad-label {
      display: inline-flex;
      height: 18px;
      align-items: center;
      padding: 0 6px;
      margin-left: 6px;
      border-radius: 4px;
      background: #e8e8e8;
      color: #303030;
      font-size: 11px;
      font-weight: 700;
    }
    .title {
      max-width: 480px;
      font-size: 42px;
      line-height: 48px;
      letter-spacing: -0.5px;
      font-weight: 800;
      color: #0f0f0f;
      margin: 0 0 14px;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .desc {
      max-width: 470px;
      color: #303030;
      font-size: 16px;
      line-height: 23px;
      margin-bottom: 24px;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .actions {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .cta {
      height: 42px;
      padding: 0 20px;
      border-radius: 21px;
      background: #0f0f0f;
      color: #fff;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      font-weight: 700;
    }
    .url {
      color: #606060;
      font-size: 13px;
      max-width: 240px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .video-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 18px;
      padding-top: 24px;
    }
    .thumb {
      aspect-ratio: 16/9;
      border-radius: 12px;
      background: linear-gradient(140deg, #e7e7e7, #bdbdbd);
    }
    .thumb-2 { background: linear-gradient(140deg, #dcd6cc, #9a9082); }
    .thumb-3 { background: linear-gradient(140deg, #d8e1e8, #8da3b2); }
    .thumb-4 { background: linear-gradient(140deg, #e5d8e4, #a48aa0); }
    .video-meta {
      display: grid;
      grid-template-columns: 36px 1fr;
      gap: 10px;
      padding-top: 10px;
    }
    .channel-dot {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: #e5e5e5;
    }
    .video-title {
      font-size: 14px;
      font-weight: 700;
      line-height: 20px;
    }
    .video-sub {
      margin-top: 2px;
      font-size: 12px;
      line-height: 17px;
      color: #606060;
    }
  </style>
</head>
<body>
  <div class="app">
    <header class="topbar">
      <div class="brand">
        <div class="hamburger"><span></span><span></span><span></span></div>
        <span class="logo-mark">▶</span>
        <span>YouTube</span>
      </div>
      <div class="search"><span>검색</span><span>⌕</span></div>
      <div class="top-actions"><span>⊕</span><span>🔔</span><div class="profile">AD</div></div>
    </header>
    <aside class="sidebar">
      <div class="side-item"><div class="side-icon">⌂</div><span>홈</span></div>
      <div class="side-item"><div class="side-icon">▶</div><span>Shorts</span></div>
      <div class="side-item"><div class="side-icon">▣</div><span>구독</span></div>
      <div class="side-item"><div class="side-icon">◷</div><span>시청기록</span></div>
    </aside>
    <main class="content">
      <div class="chips">
        <span class="chip active">전체</span>
        <span class="chip">음악</span>
        <span class="chip">뉴스</span>
        <span class="chip">라이브</span>
        <span class="chip">쇼핑</span>
      </div>
      <section class="masthead">
        ${creative ? `<img class="hero" src="${creative}" alt="" />` : `<div class="fallback-hero"></div>`}
        <div class="hero-mask"></div>
        <div class="masthead-copy">
          <div class="sponsor-row">
            ${avatar ? `<img class="avatar" src="${avatar}" alt="" />` : `<div class="fallback-avatar">AD</div>`}
            <div class="sponsor">
              <strong>${sponsorName}<span class="ad-label">광고</span></strong>
              스폰서 · ${displayUrl}
            </div>
          </div>
          <h1 class="title">${title}</h1>
          ${description ? `<div class="desc">${description}</div>` : ""}
          <div class="actions">
            <div class="cta">${ctaText}</div>
            <div class="url">${displayUrl}</div>
          </div>
        </div>
      </section>
      <section class="video-grid">${organicCards}</section>
    </main>
  </div>
</body>
</html>`;
}

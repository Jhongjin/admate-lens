type ShortsAdData = {
  title: string;
  description: string;
  sponsorName: string;
  avatarDataUrl: string;
  creativeDataUrl: string;
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

export function generateYouTubeShortsSyntheticHtml(ad: ShortsAdData): string {
  const title = escapeHtml(ad.title || "광고 제목");
  const description = escapeHtml(ad.description || "");
  const sponsorName = escapeHtml(ad.sponsorName || "brand.example");
  const ctaText = escapeHtml(ad.ctaText || "사이트 방문");
  const displayUrl = escapeHtml(ad.displayUrl || ad.sponsorName || "brand.example");
  const avatar = escapeAttr(ad.avatarDataUrl);
  const creative = escapeAttr(ad.creativeDataUrl);

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
  <style>
    * { box-sizing: border-box; }
    html, body {
      width: 100%;
      height: 100%;
      margin: 0;
      background: #000;
      color: #fff;
      font-family: Roboto, "Noto Sans KR", Arial, sans-serif;
      overflow: hidden;
      -webkit-font-smoothing: antialiased;
    }
    .screen {
      position: relative;
      width: 100vw;
      height: 100vh;
      background: #000;
      overflow: hidden;
    }
    .creative {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: center;
      background: linear-gradient(150deg, #111 0%, #303030 45%, #050505 100%);
    }
    .vignette {
      position: absolute;
      inset: 0;
      background:
        linear-gradient(to bottom, rgba(0,0,0,.34), rgba(0,0,0,0) 26%, rgba(0,0,0,.42) 72%, rgba(0,0,0,.92)),
        linear-gradient(to right, rgba(0,0,0,.36), rgba(0,0,0,0) 46%, rgba(0,0,0,.28));
      pointer-events: none;
    }
    .topbar {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 68px;
      padding: 16px 18px 0;
      display: flex;
      align-items: center;
      justify-content: space-between;
      color: #fff;
      text-shadow: 0 1px 2px rgba(0,0,0,.35);
      z-index: 5;
    }
    .top-title {
      font-size: 18px;
      font-weight: 700;
      letter-spacing: .1px;
    }
    .top-actions {
      display: flex;
      gap: 18px;
      align-items: center;
      font-size: 22px;
      font-weight: 700;
    }
    .right-rail {
      position: absolute;
      right: 10px;
      bottom: 142px;
      width: 54px;
      display: grid;
      gap: 18px;
      z-index: 5;
    }
    .rail-action {
      display: grid;
      justify-items: center;
      gap: 5px;
      color: #fff;
      font-size: 11px;
      font-weight: 500;
      text-shadow: 0 1px 2px rgba(0,0,0,.5);
    }
    .rail-icon {
      width: 46px;
      height: 46px;
      border-radius: 50%;
      background: rgba(255,255,255,.18);
      display: grid;
      place-items: center;
      backdrop-filter: blur(8px);
    }
    .bottom-copy {
      position: absolute;
      left: 16px;
      right: 72px;
      bottom: 86px;
      z-index: 6;
      text-shadow: 0 1px 2px rgba(0,0,0,.5);
    }
    .sponsor-row {
      display: flex;
      align-items: center;
      gap: 9px;
      min-width: 0;
    }
    .avatar {
      width: 34px;
      height: 34px;
      border-radius: 50%;
      border: 1px solid rgba(255,255,255,.32);
      object-fit: cover;
      background: rgba(255,255,255,.18);
      flex: 0 0 auto;
    }
    .fallback-avatar {
      width: 34px;
      height: 34px;
      border-radius: 50%;
      border: 1px solid rgba(255,255,255,.32);
      background: #fff;
      color: #0f0f0f;
      display: grid;
      place-items: center;
      font-size: 12px;
      font-weight: 800;
      flex: 0 0 auto;
    }
    .sponsor-text {
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 5px;
      font-size: 14px;
      font-weight: 700;
      white-space: nowrap;
    }
    .ad-pill {
      height: 18px;
      padding: 0 6px;
      border-radius: 4px;
      background: rgba(255,255,255,.2);
      color: #fff;
      font-size: 11px;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
    }
    .title {
      margin-top: 11px;
      font-size: 15px;
      line-height: 20px;
      font-weight: 600;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .description {
      margin-top: 5px;
      color: rgba(255,255,255,.88);
      font-size: 13px;
      line-height: 18px;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .display-url {
      margin-top: 7px;
      color: rgba(255,255,255,.82);
      font-size: 12px;
      line-height: 16px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .cta {
      position: absolute;
      left: 16px;
      right: 16px;
      bottom: 28px;
      height: 44px;
      border-radius: 22px;
      background: #fff;
      color: #0f0f0f;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      font-weight: 700;
      z-index: 7;
    }
    .bottom-nav-hint {
      position: absolute;
      left: 0;
      right: 0;
      bottom: 0;
      height: 4px;
      background: rgba(255,255,255,.72);
      border-radius: 4px 4px 0 0;
      margin: 0 118px;
      z-index: 8;
    }
  </style>
</head>
<body>
  <main class="screen">
    ${creative ? `<img class="creative" src="${creative}" alt="" />` : `<div class="creative"></div>`}
    <div class="vignette"></div>
    <header class="topbar">
      <div class="top-title">Shorts</div>
      <div class="top-actions">
        <span>⌕</span>
        <span>⋮</span>
      </div>
    </header>
    <aside class="right-rail" aria-hidden="true">
      <div class="rail-action"><div class="rail-icon">♡</div><span>좋아요</span></div>
      <div class="rail-action"><div class="rail-icon">▣</div><span>댓글</span></div>
      <div class="rail-action"><div class="rail-icon">↗</div><span>공유</span></div>
      <div class="rail-action"><div class="rail-icon">↺</div><span>리믹스</span></div>
    </aside>
    <section class="bottom-copy">
      <div class="sponsor-row">
        ${
          avatar
            ? `<img class="avatar" src="${avatar}" alt="" />`
            : `<div class="fallback-avatar">AD</div>`
        }
        <div class="sponsor-text">
          <span>${sponsorName}</span>
          <span class="ad-pill">광고</span>
        </div>
      </div>
      <div class="title">${title}</div>
      ${description ? `<div class="description">${description}</div>` : ""}
      <div class="display-url">스폰서 · ${displayUrl}</div>
    </section>
    <div class="cta">${ctaText}</div>
    <div class="bottom-nav-hint"></div>
  </main>
</body>
</html>`;
}

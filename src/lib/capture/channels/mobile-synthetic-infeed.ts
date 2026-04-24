import { SyntheticInfeedHomeItem } from "./youtube-capture";

export function generateMobileSyntheticInfeedHomeHtml(
  adData: {
    title: string;
    description: string;
    channel: string;
    channelAvatarUrl: string;
    adThumbUrl: string;
    ctaPrimary: string;
    ctaSecondary?: string;
  },
  organicItems: SyntheticInfeedHomeItem[]
): string {
  // 모바일 네이티브 스타일(Light 모드) SVG 아이콘들
  const iconBell = `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg>`;
  const iconSearch = `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M20.87 20.17l-5.59-5.59C16.35 13.35 17 11.75 17 10c0-3.87-3.13-7-7-7s-7 3.13-7 7 3.13 7 7 7c1.75 0 3.35-.65 4.58-1.71l5.59 5.59.7-.7zM10 16c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6z"/></svg>`;
  const iconMenuDots = `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 16.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5-1.5-.67-1.5-1.5.67-1.5 1.5-1.5zM10.5 12c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5-.67-1.5-1.5-1.5-1.5.67-1.5 1.5zm0-6c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5-.67-1.5-1.5-1.5-1.5.67-1.5 1.5z"/></svg>`;
  const iconCompass = `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="m14.94 9.06-7.07 1.99 1.99-7.07 7.07-1.99-1.99 7.07zm-2.07-5.06-4.5 1.25 1.25 4.5 4.5-1.25-1.25-4.5zM12 3c-4.96 0-9 4.04-9 9s4.04 9 9 9 9-4.04 9-9-4.04-9-9-9zM12 20c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/></svg>`;
  const iconHomeFill = `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M4 21V10.08l8-6.96 8 6.96V21h-6v-6h-4v6H4z"/></svg>`;
  const iconShortsOutline = `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M10 14.65v-5.3L15 12l-5 2.65zm7.77-4.33-1.2-.5L18 9.06c1.84-.85 2.56-3 1.62-4.72A3.525 3.525 0 0 0 14.87 2.74L6.33 6.69C4.49 7.54 3.77 9.7 4.71 11.42a3.524 3.524 0 0 0 2.22 1.83l1.2.5L6 14.94c-1.84.85-2.56 3-1.62 4.72a3.525 3.525 0 0 0 4.75 1.6l8.54-3.95c1.84-.85 2.56-3 1.62-4.72a3.524 3.524 0 0 0-1.52-2.27zM18.8 11.53l-8.54 3.95a2.525 2.525 0 0 1-3.39-1.14 2.524 2.524 0 0 1 1.14-3.39l1.9-.88-.41-.17a2.525 2.525 0 0 1-1.61-2.26 2.525 2.525 0 0 1 1.61-2.26l8.54-3.95a2.525 2.525 0 0 1 3.39 1.14 2.524 2.524 0 0 1-1.14 3.39l-1.9.88.41.17a2.525 2.525 0 0 1 1.61 2.26 2.525 2.525 0 0 1-1.61 2.26z"/></svg>`;
  const iconShortsLogo = `<svg viewBox="0 0 24 24" width="24" height="24" focusable="false" style="pointer-events: none; display: block; width: 100%; height: 100%;"><path d="M17.77,10.32l-1.2-.5L18,9.06c1.84-.85,2.56-3,1.62-4.72A3.525,3.525,0,0,0,14.87,2.74L6.33,6.69C4.49,7.54,3.77,9.7,4.71,11.42a3.524,3.524,0,0,0,2.22,1.83l1.2.5L6,14.94c-1.84.85-2.56,3-1.62,4.72a3.525,3.525,0,0,0,4.75,1.6l8.54-3.95c1.84-.85,2.56-3,1.62-4.72A3.524,3.524,0,0,0,17.77,10.32ZM10,14.65v-5.3L15,12Z" fill="#ff0000"></path></svg>`;
  const iconPlus = `<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.2"><circle cx="12" cy="12" r="10"/><path d="M12 7v10M7 12h10"/></svg>`;
  const iconSubs = `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M10 18v-6l5 3-5 3zm7-15H7v1h10V3zm3 3H4v1h16V6zm2 3H2v12h20V9zM3 10h18v10H3V10z"/></svg>`;

  const logoUrl = "https://upload.wikimedia.org/wikipedia/commons/b/b8/YouTube_Logo_2017.svg";

  const renderChips = () => {
    const chipsStr = ["전체", "새로운 맞춤 동영상", "뉴스", "음악", "라이브"]
      .map((c, i) => {
        const bg = i === 0 ? "#0f0f0f" : "#f2f2f2";
        const color = i === 0 ? "#fff" : "#0f0f0f";
        return `<div style="background:${bg};color:${color};padding:0 12px;height:32px;display:flex;align-items:center;border-radius:8px;font-size:14px;font-weight:${i === 0 ? 500 : 400};white-space:nowrap;flex-shrink:0;">${c}</div>`;
      })
      .join("");
    return `
      <div style="display:flex;gap:8px;padding:8px 16px 12px 16px;background:#ffffff;overflow:hidden;border-bottom:1px solid #e5e5e5;align-items:center;">
        <div style="background:#f2f2f2;padding:0 8px;height:32px;display:flex;align-items:center;border-radius:4px;flex-shrink:0;">
          ${iconCompass}
        </div>
        ${chipsStr}
      </div>
    `;
  };

  const adHtml = `
    <div style="width:100%;display:flex;flex-direction:column;margin-bottom:28px;">
      <!-- Thumbnail -->
      <div style="position:relative;width:100%;aspect-ratio:16/9;background:#e5e5e5;overflow:hidden;">
        <img src="${adData.adThumbUrl}" style="width:100%;height:100%;object-fit:cover;display:block;" onerror="this.src='https://via.placeholder.com/640x360.png?text=Preview+Image'" />
        <!-- Linkout Arrow overlay -->
        <div style="position:absolute;right:8px;bottom:8px;width:32px;height:32px;border-radius:50%;background:rgba(0,0,0,0.6);display:flex;justify-content:center;align-items:center;color:#fff;">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M18 6v6h-1.2V7.7L7.7 16.8l-.9-.8 9.1-9.1H9.6V5.7H18z"/></svg>
        </div>
      </div>
      <!-- Meta -->
      <div style="display:flex;padding:12px 16px 0 16px;gap:12px;align-items:flex-start;">
        <img src="${adData.channelAvatarUrl || "https://i.pravatar.cc/128?img=30"}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;" onerror="this.src='https://i.pravatar.cc/40'" />
        <div style="flex:1;display:flex;flex-direction:column;width:0;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;">
            <div class="text-ellipsis-2" style="font-size:16px;font-weight:500;color:#0f0f0f;line-height:20px;word-break:keep-all;">
              ${adData.title}
            </div>
            <div style="color:#0f0f0f;margin-left:8px;flex-shrink:0;margin-top:-2px;">${iconMenuDots}</div>
          </div>
          ${adData.description ? `
            <div style="font-size:14px;color:#606060;margin-top:2px;line-height:18px;" class="text-ellipsis-2">
              ${adData.description}
            </div>
          ` : ""}
          <div style="font-size:12px;color:#606060;margin-top:4px;display:flex;align-items:center;gap:4px;">
            <span style="font-weight:700;color:#0f0f0f;">스폰서</span> • <span>${adData.channel}</span>
          </div>
          
          <!-- CTA Action Row -->
          ${adData.ctaSecondary ? `
            <div style="display:flex;gap:8px;margin-top:12px;width:100%;">
              <div style="flex:1;height:36px;display:flex;align-items:center;justify-content:center;background:#f2f2f2;color:#0f0f0f;border-radius:18px;font-size:14px;font-weight:500;">${adData.ctaPrimary}</div>
              <div style="flex:1;height:36px;display:flex;align-items:center;justify-content:center;background:#0f0f0f;color:#ffffff;border-radius:18px;font-size:14px;font-weight:500;">${adData.ctaSecondary}</div>
            </div>
          ` : (adData.ctaPrimary ? `
            <div style="margin-top:8px;">
              <span style="color:#065fd4;font-size:14px;font-weight:500;">${adData.ctaPrimary}</span>
            </div>
          ` : "")}
        </div>
      </div>
    </div>
  `;

  // Organic items: Transform into a Shorts shelf matching Native iOS/AOS behaviour!
  const shortsHtml = `
    <div style="width:100%;display:flex;flex-direction:column;margin-bottom:28px;padding:0 16px;">
      <!-- Shelf Header -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="width:24px;height:24px;">${iconShortsLogo}</div>
          <span style="font-size:18px;font-weight:700;color:#0f0f0f;letter-spacing:-0.2px;">Shorts</span>
        </div>
        <div style="color:#0f0f0f;">${iconMenuDots}</div>
      </div>
      <!-- Shorts Container -->
      <div style="display:flex;gap:8px;width:100%;overflow:hidden;">
        ${organicItems.slice(0, 2).map((it) => {
          const fallbackThumb = `https://i.ytimg.com/vi_webp/${it.id}/maxresdefault.webp`;
          return `
            <div style="flex:1;position:relative;aspect-ratio:1/1.77;background:#e5e5e5;border-radius:12px;overflow:hidden;">
              <img src="${it.thumbUrl || fallbackThumb}" style="width:100%;height:100%;object-fit:cover;display:block;" onerror="this.src='https://i.ytimg.com/vi/${it.id}/hqdefault.jpg'" />
              <!-- Gradient -->
              <div style="position:absolute;bottom:0;left:0;right:0;height:60%;background:linear-gradient(to top, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0) 100%);pointer-events:none;"></div>
              <!-- Text -->
              <div style="position:absolute;bottom:12px;left:12px;right:12px;display:flex;flex-direction:column;gap:4px;">
                <span class="text-ellipsis-2" style="color:#fff;font-size:14px;font-weight:500;line-height:20px;text-shadow:0 1px 2px rgba(0,0,0,0.5);">${it.title || "Shorts 영상 제목"}</span>
                <span style="color:rgba(255,255,255,0.8);font-size:12px;font-weight:400;text-shadow:0 1px 2px rgba(0,0,0,0.5);">${it.viewText || "조회수 1.2만회"}</span>
              </div>
              <div style="position:absolute;top:8px;right:8px;color:#fff;">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" style="filter:drop-shadow(0 1px 2px rgba(0,0,0,0.5));"><path d="M12 16.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5-1.5-.67-1.5-1.5.67-1.5 1.5-1.5zM10.5 12c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5-.67-1.5-1.5-1.5-1.5.67-1.5 1.5zm0-6c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5-.67-1.5-1.5-1.5-1.5.67-1.5 1.5z"/></svg>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `;

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&family=Noto+Sans+KR:wght@400;500;700&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; }
    html, body {
      margin: 0; padding: 0;
      width: 100%; min-height: 100vh;
      background-color: #ffffff;
      color: #0f0f0f;
      font-family: 'Roboto', 'Noto Sans KR', sans-serif;
      overflow-x: hidden;
      -webkit-font-smoothing: antialiased;
    }
    .text-ellipsis-2 {
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  </style>
</head>
<body>
  <!-- Header -->
  <div style="display:flex;align-items:center;justify-content:space-between;padding:0 16px;height:48px;background:#ffffff;position:sticky;top:0;z-index:50;">
    <img src="${logoUrl}" style="height:20px;" />
    <div style="display:flex;align-items:center;gap:16px;color:#0f0f0f;">
      ${iconBell}
      ${iconSearch}
    </div>
  </div>

  <!-- Chips -->
  ${renderChips()}

  <!-- Feed -->
  <div style="display:flex;flex-direction:column;width:100%;padding-bottom:56px;">
    ${adHtml}
    ${shortsHtml}
  </div>

  <!-- Bottom Navigation -->
  <div style="position:fixed;bottom:0;left:0;width:100%;height:48px;background:#ffffff;border-top:1px solid #e5e5e5;display:flex;justify-content:space-around;align-items:center;padding:0 8px;z-index:50;">
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;color:#0f0f0f;flex:1;">
      ${iconHomeFill}
      <span style="font-size:10px;margin-top:2px;">홈</span>
    </div>
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;color:#0f0f0f;flex:1;">
      ${iconShortsOutline}
      <span style="font-size:10px;margin-top:2px;">Shorts</span>
    </div>
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;color:#0f0f0f;flex:1;">
      ${iconPlus}
    </div>
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;color:#0f0f0f;flex:1;">
      ${iconSubs}
      <span style="font-size:10px;margin-top:2px;">구독</span>
    </div>
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;color:#0f0f0f;flex:1;">
      <img src="https://i.pravatar.cc/128?img=12" style="width:24px;height:24px;border-radius:50%;object-fit:cover;margin-bottom:2px;" />
      <span style="font-size:10px;">내 페이지</span>
    </div>
  </div>
</body>
</html>`;
}

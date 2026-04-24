import { SyntheticInfeedHomeItem } from "./youtube-capture";

export function generateMobileSyntheticInfeedHomeHtml(
  adData: {
    title: string;
    description: string;
    channel: string;
    channelAvatarUrl: string;
    adThumbUrl: string;
    ctaPrimary: string;
  },
  organicItems: SyntheticInfeedHomeItem[]
): string {
  // 모바일 네이티브 스타일(Light 모드) SVG 아이콘들
  const iconSearch = `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M20.87 20.17l-5.59-5.59C16.35 13.35 17 11.75 17 10c0-3.87-3.13-7-7-7s-7 3.13-7 7 3.13 7 7 7c1.75 0 3.35-.65 4.58-1.71l5.59 5.59.7-.7zM10 16c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6z"/></svg>`;
  const iconMenuDots = `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 16.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5-1.5-.67-1.5-1.5.67-1.5 1.5-1.5zM10.5 12c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5-.67-1.5-1.5-1.5-1.5.67-1.5 1.5zm0-6c0 .83.67 1.5 1.5 1.5s1.5-.67 1.5-1.5-.67-1.5-1.5-1.5-1.5.67-1.5 1.5z"/></svg>`;
  const iconCompass = `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="m14.94 9.06-7.07 1.99 1.99-7.07 7.07-1.99-1.99 7.07zm-2.07-5.06-4.5 1.25 1.25 4.5 4.5-1.25-1.25-4.5zM12 3c-4.96 0-9 4.04-9 9s4.04 9 9 9 9-4.04 9-9-4.04-9-9-9zM12 20c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/></svg>`;
  const iconHomeFill = `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M4 21V10.08l8-6.96 8 6.96V21h-6v-6h-4v6H4z"/></svg>`;
  const iconShorts = `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M17.77 10.32l-1.2-.5L18 9.06c1.84-.85 2.56-3 1.62-4.72a3.525 3.525 0 0 0-4.75-1.6l-8.54 3.95c-1.84.85-2.56 3-1.62 4.72a3.524 3.524 0 0 0 2.22 1.83l1.2.5L6 14.94c-1.84.85-2.56 3-1.62 4.72a3.525 3.525 0 0 0 4.75 1.6l8.54-3.95c1.84-.85 2.56-3 1.62-4.72a3.524 3.524 0 0 0-1.52-2.27zM10 14.65v-5.3L15 12l-5 2.65z"/></svg>`;
  const iconPlus = `<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="1.2"><circle cx="12" cy="12" r="10"/><path d="M12 7v10M7 12h10"/></svg>`;
  const iconSubs = `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M10 18v-6l5 3-5 3zm7-15H7v1h10V3zm3 3H4v1h16V6zm2 3H2v12h20V9zM3 10h18v10H3V10z"/></svg>`;

  const logoUrl = "https://upload.wikimedia.org/wikipedia/commons/b/b8/YouTube_Logo_2017.svg";

  const renderChips = () => {
    const chipsStr = ["전체", "음악", "라이브", "팟캐스트", "게임"]
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
      </div>
      <!-- Meta -->
      <div style="display:flex;padding:12px 16px 0 16px;gap:12px;align-items:flex-start;">
        <img src="${adData.channelAvatarUrl || "https://i.pravatar.cc/128?img=30"}" style="width:40px;height:40px;border-radius:50%;object-fit:cover;" onerror="this.src='https://i.pravatar.cc/40'" />
        <div style="flex:1;display:flex;flex-direction:column;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;">
            <div class="text-ellipsis-2" style="font-size:16px;font-weight:500;color:#0f0f0f;line-height:20px;word-break:keep-all;">
              ${adData.title}
            </div>
            <div style="color:#0f0f0f;margin-left:8px;flex-shrink:0;">${iconMenuDots}</div>
          </div>
          ${adData.description ? `
            <div style="font-size:14px;color:#606060;margin-top:2px;line-height:18px;" class="text-ellipsis-2">
              ${adData.description}
            </div>
          ` : ""}
          <div style="font-size:12px;color:#606060;margin-top:4px;display:flex;align-items:center;gap:4px;">
            <span style="font-weight:700;color:#0f0f0f;">스폰서</span> • <span>${adData.channel}</span>
          </div>
          ${adData.ctaPrimary ? `
            <div style="margin-top:2px;">
              <span style="color:#065fd4;font-size:14px;font-weight:500;">${adData.ctaPrimary}</span>
            </div>
          ` : ""}
        </div>
      </div>
    </div>
  `;

  // Organic items (randomly map max 3 items to show under ad)
  const organicHtml = organicItems.slice(0, 3).map((it) => {
    const fallbackThumb = `https://i.ytimg.com/vi_webp/${it.id}/maxresdefault.webp`;
    const safeChannel = encodeURIComponent(it.channel || 'YT');
    return `
    <div style="width:100%;display:flex;flex-direction:column;margin-bottom:28px;">
      <div style="position:relative;width:100%;aspect-ratio:16/9;background:#e5e5e5;overflow:hidden;">
        <img src="${it.thumbUrl || fallbackThumb}" style="width:100%;height:100%;object-fit:cover;display:block;" onerror="this.src='https://i.ytimg.com/vi/${it.id}/hqdefault.jpg'" />
      </div>
      <div style="display:flex;padding:12px 16px 0 16px;gap:12px;align-items:flex-start;">
        <img src="${it.channelThumbUrl || `https://ui-avatars.com/api/?name=${safeChannel}&background=random`}" style="width:40px;height:40px;border-radius:50%;object-fit:cover;" />
        <div style="flex:1;display:flex;flex-direction:column;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;">
            <div class="text-ellipsis-2" style="font-size:16px;font-weight:500;color:#0f0f0f;line-height:20px;word-break:keep-all;">
              ${it.title || "동영상 제목"}
            </div>
            <div style="color:#0f0f0f;margin-left:8px;flex-shrink:0;">${iconMenuDots}</div>
          </div>
          <div style="font-size:12px;color:#606060;margin-top:4px;">
            ${it.channel || "채널명"} • ${it.viewText || "조회수 1.2만회"} • 2일 전
          </div>
        </div>
      </div>
    </div>
    `;
  }).join("");

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
    <div style="display:flex;align-items:center;color:#0f0f0f;">
      ${iconSearch}
    </div>
  </div>

  <!-- Chips -->
  ${renderChips()}

  <!-- Feed -->
  <div style="display:flex;flex-direction:column;width:100%;padding-bottom:56px;">
    ${adHtml}
    ${organicHtml}
  </div>

  <!-- Bottom Navigation -->
  <div style="position:fixed;bottom:0;left:0;width:100%;height:48px;background:#ffffff;border-top:1px solid #e5e5e5;display:flex;justify-content:space-around;align-items:center;padding:0 8px;z-index:50;">
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;color:#0f0f0f;flex:1;">
      ${iconHomeFill}
      <span style="font-size:10px;margin-top:2px;">홈</span>
    </div>
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;color:#0f0f0f;flex:1;">
      ${iconShorts}
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

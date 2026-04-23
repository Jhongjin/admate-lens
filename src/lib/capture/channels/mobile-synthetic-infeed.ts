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
  // 아이콘 SVG들 (모바일 네이티브 스타일)
  const iconCast = `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M21 3H3c-1.1 0-2 .9-2 2v3h2V5h18v14h-7v2h7c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM1 18v3h3c0-1.66-1.34-3-3-3zm0-4v2c2.76 0 5 2.24 5 5h2c0-3.87-3.13-7-7-7zm0-4v2c4.97 0 9 4.03 9 9h2c0-6.08-4.93-11-11-11z"/></svg>`;
  const iconBell = `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg>`;
  const iconSearch = `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M20.87 20.17l-5.59-5.59C16.35 13.35 17 11.75 17 10c0-3.87-3.13-7-7-7s-7 3.13-7 7 3.13 7 7 7c1.75 0 3.35-.65 4.58-1.71l5.59 5.59.7-.7zM10 16c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6z"/></svg>`;
  const iconMenuDots = `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>`;
  const logoUrl = "https://upload.wikimedia.org/wikipedia/commons/b/b8/YouTube_Logo_2017.svg";

  const renderChips = () => {
    const chipsStr = ["전체", "게임", "음악", "실시간", "뉴스", "믹스", "요리", "최근에 업로드된 동영상"]
      .map((c, i) => {
        const bg = i === 0 ? "#fff" : "#272727";
        const color = i === 0 ? "#0f0f0f" : "#fff";
        return `<div style="background:${bg};color:${color};padding:0 12px;height:32px;display:flex;align-items:center;border-radius:8px;font-size:14px;font-family:'Roboto','Noto Sans KR',sans-serif;font-weight:${i===0?500:400};white-space:nowrap;">${c}</div>`;
      })
      .join("");
    return `<div style="display:flex;gap:8px;padding:12px 16px;background:#0f0f0f;overflow:hidden">${chipsStr}</div>`;
  };

  const adHtml = `
    <div style="width:100%;display:flex;flex-direction:column;margin-bottom:24px;border-bottom:4px solid #272727;padding-bottom:12px;">
      <!-- Thumbnail -->
      <div style="position:relative;width:100%;aspect-ratio:16/9;background:#222;">
        <img src="${adData.adThumbUrl}" style="width:100%;height:100%;object-fit:cover;display:block;" />
        ${adData.ctaPrimary ? `
        <div style="position:absolute;bottom:0;left:0;width:100%;height:44px;background:rgba(0,0,0,0.6);display:flex;align-items:center;padding:0 16px;box-sizing:border-box;">
           <span style="color:#3EA6ff;font-size:14px;font-weight:500;">${adData.title}</span>
           <span style="flex:1;"></span>
           <span style="color:#fff;background:#065fd4;padding:6px 12px;border-radius:18px;font-size:14px;font-weight:500;">${adData.ctaPrimary}</span>
        </div>
        ` : ""}
      </div>
      <!-- Meta -->
      <div style="display:flex;padding:12px 16px 0 16px;gap:12px;align-items:flex-start;">
        <img src="${adData.channelAvatarUrl || "https://i.pravatar.cc/128?img=30"}" style="width:40px;height:40px;border-radius:50%;object-fit:cover;" />
        <div style="flex:1;display:flex;flex-direction:column;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;">
            <div style="font-size:16px;font-weight:500;color:#fff;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;line-height:20px;word-break:keep-all;">
              ${adData.title}
            </div>
            <div style="color:#aaa;margin-left:8px;margin-top:-2px;">${iconMenuDots}</div>
          </div>
          <div style="font-size:12px;color:#aaa;margin-top:4px;display:flex;align-items:center;gap:4px;">
            <span style="font-weight:700;color:#fff;">스폰서</span> • <span>${adData.channel}</span>
          </div>
        </div>
      </div>
    </div>
  `;

  // Organic items (randomly map max 3 items to show under ad)
  const organicHtml = organicItems.slice(0, 3).map((it) => {
    const fallbackThumb = `https://i.ytimg.com/vi_webp/${it.id}/maxresdefault.webp`;
    return `
    <div style="width:100%;display:flex;flex-direction:column;margin-bottom:24px;">
      <div style="position:relative;width:100%;aspect-ratio:16/9;background:#222;">
        <img src="${it.thumbUrl || fallbackThumb}" style="width:100%;height:100%;object-fit:cover;display:block;" onerror="this.src='https://i.ytimg.com/vi/${it.id}/hqdefault.jpg'" />
      </div>
      <div style="display:flex;padding:12px 16px 0 16px;gap:12px;align-items:flex-start;">
        <div style="width:40px;height:40px;border-radius:50%;background:#333;display:flex;align-items:center;justify-content:center;color:#aaa;font-weight:bold;font-size:16px;flex-shrink:0;">
          ${(it.channel || "채널").slice(0,1)}
        </div>
        <div style="flex:1;display:flex;flex-direction:column;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;">
            <div style="font-size:16px;font-weight:500;color:#fff;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;line-height:20px;word-break:keep-all;">
              ${it.title || "동영상 제목"}
            </div>
            <div style="color:#aaa;margin-left:8px;margin-top:-2px;">${iconMenuDots}</div>
          </div>
          <div style="font-size:12px;color:#aaa;margin-top:4px;">
            ${it.channel || "채널명"} • ${it.viewText || "조회수 1.2만회"} • 2일 전
          </div>
        </div>
      </div>
    </div>
    `;
  }).join("");

  return `
    <div style="width:100%;min-height:100vh;background:#0f0f0f;color:#fff;font-family:'Roboto','Noto Sans KR',sans-serif;margin:0;padding:0;">
      <!-- Header -->
      <div style="display:flex;align-items:center;justify-content:space-between;padding:0 16px;height:48px;background:#0f0f0f;position:sticky;top:0;z-index:50;">
        <img src="${logoUrl}" style="height:20px;" />
        <div style="display:flex;align-items:center;gap:16px;color:#fff;">
          ${iconCast}
          ${iconBell}
          ${iconSearch}
          <img src="https://i.pravatar.cc/128?img=12" style="width:24px;height:24px;border-radius:50%;object-fit:cover;" />
        </div>
      </div>
      <!-- Chips -->
      ${renderChips()}
      <!-- Feed -->
      <div style="display:flex;flex-direction:column;width:100%;">
        ${adHtml}
        ${organicHtml}
      </div>
    </div>
  `;
}

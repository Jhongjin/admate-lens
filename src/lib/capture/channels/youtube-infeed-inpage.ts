/**
 * YouTube 인피드 광고 UI 인젝션 (page.evaluate에 함수 참조로 전달)
 * 지면: 홈 그리드 카드 | 검색 결과 가로형 | 시청 페이지 관련동영상 사이드바
 */

export type InfeedSurface = "home" | "search" | "watch-next";

export interface InfeedInjectPagePayload {
  surface: InfeedSurface;
  thumbDataUrl: string;
  /** 채널 아이콘 URL 또는 채널 URL로 확보한 경우에만 채움; 없으면 스폰서 줄·홈 카드의 원형 아바타 숨김 */
  avatarDataUrl: string;
  showChannelAvatar: boolean;
  title: string;
  description1: string;
  description2: string;
  sponsorName: string;
  ctaPrimary: string;
  /** 비우면 보조 버튼 숨김 */
  ctaSecondary: string;
}

export function runInfeedInjectInPage(...args: unknown[]): boolean {
  /** page.evaluate로 전달될 때는 이 함수 본문만 브라우저에서 실행되므로 esc는 반드시 내부에 둡니다. */
  const esc = (s: string): string => {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  };
  const p = args[0] as InfeedInjectPagePayload;
  try {
    document.querySelectorAll('[data-injected="admate-youtube-infeed"]').forEach((el) => el.remove());

    const thumb = p.thumbDataUrl;
    const avatar = p.showChannelAvatar && p.avatarDataUrl ? p.avatarDataUrl : "";
    const title = p.title || "광고 제목";
    const d1 = p.description1 || "";
    const d2 = p.description2 || "";
    const sponsor = p.sponsorName || "brand.example";
    const ctaP = p.ctaPrimary || "시작하기";
    const ctaS = (p.ctaSecondary || "").trim();
    const showSecondary = ctaS.length > 0;

    const sponsorHtml = `<span style="font-weight:600;color:var(--yt-spec-text-primary,#0f0f0f)">스폰서</span><span style="margin:0 4px;color:var(--yt-spec-text-secondary,#606060)">·</span><span style="color:var(--yt-spec-text-secondary,#606060)">${esc(
      sponsor
    )}</span>`;

    const descBlock =
      p.surface === "watch-next" && (d1 || d2)
        ? `<div style="margin-top:4px;font-family:Roboto,'Noto Sans KR',Arial,sans-serif;font-size:1.2rem;line-height:1.45rem;color:var(--yt-spec-text-secondary,#606060);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${esc(
            [d1, d2].filter(Boolean).join(" ")
          )}</div>`
        : "";

    const menuBtn = `<button type="button" aria-label="메뉴" style="flex-shrink:0;background:none;border:none;padding:4px;cursor:default;color:var(--yt-spec-text-primary,#0f0f0f);border-radius:50%;width:40px;height:40px;display:flex;align-items:center;justify-content:center;margin:-4px -4px 0 0;"><svg height="24" viewBox="0 0 24 24" width="24"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" fill="currentColor"/></svg></button>`;
    const menuBtnSearch = `<button type="button" aria-label="메뉴" style="flex-shrink:0;background:rgba(255,255,255,0.96);border:none;padding:2px;cursor:default;color:var(--yt-spec-text-primary,#0f0f0f);border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 1px rgba(0,0,0,0.06);"><svg height="24" viewBox="0 0 24 24" width="24"><path d="M6 10a2 2 0 100 4 2 2 0 000-4Zm6 0a2 2 0 100 4 2 2 0 000-4Zm6 0a2 2 0 100 4 2 2 0 000-4Z" fill="currentColor"/></svg></button>`;

    /**
     * 데스크톱 웹 인피드 광고 CTA — yt-spec-button-shape-next--size-m 근접
     * 보조: 연한 회색 면 + 얇은 테두리 / 주: mono-filled (#0f0f0f)
     */
    const btnBase =
      "box-sizing:border-box;margin:0;border:none;cursor:default;font-family:Roboto,'Noto Sans KR',Arial,sans-serif;font-size:14px;line-height:36px;font-weight:500;height:36px;padding:0 16px;border-radius:18px;display:flex;align-items:center;justify-content:center;white-space:nowrap;letter-spacing:0.011px;";
    const btnRow = (compact: boolean) => {
      const gap = "8px";
      const sec = showSecondary
        ? `<button type="button" style="${btnBase}flex:1;min-width:0;background:#f2f2f2;color:#0f0f0f;border:1px solid #e5e5e5;">${esc(
            ctaS
          )}</button>`
        : "";
      const primW = showSecondary ? "flex:1" : "width:100%";
      return `<div style="display:flex;flex-direction:row;gap:${gap};margin-top:${compact ? "8px" : "10px"};align-items:center;width:100%;">${sec}<button type="button" style="${btnBase}${primW};min-width:0;background:#0f0f0f;color:#fff;border:1px solid #0f0f0f;">${esc(
        ctaP
      )}</button></div>`;
    };

    /**
     * 썸네일 우하단 — 실제 웹의 overlay-dark tonal 버튼과 동일 토큰
     * (rgba(0,0,0,0.3) + 흰 아이콘, yt-spec-button-shape-next--size-m 높이에 맞춘 원형)
     */
    const extIcon =
      '<span style="position:absolute;bottom:10px;right:10px;width:42px;height:42px;border-radius:999px;background:rgba(18,18,18,0.76);backdrop-filter:saturate(120%) blur(1px);display:flex;align-items:center;justify-content:center;box-sizing:border-box;color:#fff;border:1px solid rgba(255,255,255,0.16);"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M7 17L17 7M17 7H10M17 7V14" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round"/></svg></span>';

    const buildHomeFeedCard = (): HTMLElement => {
      const wrap = document.createElement("div");
      wrap.setAttribute("data-injected", "admate-youtube-infeed");
      wrap.style.cssText =
        "width:100%;box-sizing:border-box;font-family:Roboto,'Noto Sans KR',Arial,sans-serif;border-radius:12px;overflow:hidden;background:var(--yt-spec-base-background,#fff);border:1px solid var(--yt-spec-10-percent-layer,#e5e5e5);";
      const avatarCol =
        avatar &&
        `<div style="width:36px;height:36px;border-radius:50%;overflow:hidden;flex-shrink:0;background:#eee;">
              <img src="${avatar}" alt="" style="width:100%;height:100%;object-fit:cover;" />
            </div>`;
      wrap.innerHTML = `
        <div style="position:relative;width:100%;aspect-ratio:16/9;background:#000;">
          <img src="${thumb}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;" />
          ${extIcon}
        </div>
        <div style="padding:12px 12px 14px;">
          <div style="display:flex;gap:${avatar ? "12px" : "0"};align-items:flex-start;">
            ${avatarCol || ""}
            <div style="flex:1;min-width:0;">
              <div style="font-size:1.4rem;font-weight:500;line-height:2rem;color:var(--yt-spec-text-primary,#0f0f0f);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${esc(
                title
              )}</div>
              <div style="margin-top:6px;font-size:1.2rem;display:flex;align-items:center;flex-wrap:wrap;">${sponsorHtml}</div>
            </div>
          </div>
          ${btnRow(false)}
        </div>`;
      return wrap;
    };

    if (p.surface === "home") {
      const richItem = document.querySelector("ytd-rich-grid-renderer ytd-rich-item-renderer");
      if (richItem) {
        const host = (richItem.querySelector("#dismissable") as HTMLElement) || (richItem as HTMLElement);
        host.innerHTML = "";
        host.appendChild(buildHomeFeedCard());
        console.log("[admate infeed] home: 첫 rich-item 치환");
        return true;
      }

      const gridContents = document.querySelector("ytd-rich-grid-renderer #contents") as HTMLElement | null;
      if (gridContents) {
        const row = document.createElement("div");
        row.style.cssText =
          "display:block;padding:8px 16px 16px;box-sizing:border-box;max-width:420px;";
        row.appendChild(buildHomeFeedCard());
        gridContents.insertBefore(row, gridContents.firstChild);
        console.log("[admate infeed] home: 빈 그리드 #contents 상단 삽입");
        return true;
      }

      const primary =
        (document.getElementById("primary") as HTMLElement | null) ||
        (document.querySelector("ytd-browse[page-subtype='home'] #primary") as HTMLElement | null) ||
        (document.querySelector("ytd-two-column-browse-results-renderer #primary") as HTMLElement | null) ||
        (document.querySelector("ytd-app[layout] #primary") as HTMLElement | null) ||
        (document.querySelector("#columns #primary") as HTMLElement | null);
      if (primary) {
        const slot = document.createElement("div");
        slot.style.cssText =
          "padding:16px 24px 24px 36px;box-sizing:border-box;max-width:420px;";
        slot.appendChild(buildHomeFeedCard());
        const chipBar = primary.querySelector(
          "ytd-feed-filter-chip-bar-renderer, yt-chip-cloud-renderer, ytd-rich-grid-renderer"
        );
        if (chipBar && chipBar.parentNode === primary) {
          chipBar.insertAdjacentElement("afterend", slot);
        } else {
          primary.insertBefore(slot, primary.firstChild);
        }
        console.log("[admate infeed] home: #primary 폴백(빈 홈·검색 유도 화면)");
        return true;
      }

      const appContent =
        (document.querySelector("ytd-app #content") as HTMLElement | null) ||
        (document.querySelector("#content") as HTMLElement | null);
      if (appContent) {
        const slot = document.createElement("div");
        const ml = window.innerWidth >= 1312 ? "240px" : window.innerWidth >= 792 ? "72px" : "16px";
        slot.style.cssText =
          "box-sizing:border-box;padding:20px 16px 32px 16px;max-width:420px;margin-left:" +
          ml +
          ";margin-right:auto;";
        slot.appendChild(buildHomeFeedCard());
        const pm = appContent.querySelector("ytd-page-manager");
        const host = (pm as HTMLElement) || appContent;
        host.insertBefore(slot, host.firstChild);
        console.log("[admate infeed] home: ytd-app #content / page-manager 상단 삽입");
        return true;
      }

      const card = buildHomeFeedCard();
      const left = window.innerWidth >= 1312 ? "240px" : window.innerWidth >= 792 ? "88px" : "16px";
      card.style.setProperty("position", "fixed", "important");
      card.style.setProperty("z-index", "2147483000", "important");
      card.style.setProperty("top", "72px", "important");
      card.style.setProperty("left", left, "important");
      card.style.setProperty("width", "min(400px, calc(100vw - 48px))", "important");
      card.style.setProperty("box-shadow", "0 4px 24px rgba(0,0,0,0.15)", "important");
      document.body.appendChild(card);
      console.log("[admate infeed] home: body fixed 최종 폴백(헤드리스·빈 피드)");
      return true;
    }

    if (p.surface === "search") {
      const primaryContents =
        document.querySelector("ytd-two-column-search-results-renderer #primary ytd-section-list-renderer #contents") ||
        document.querySelector("ytd-two-column-search-results-renderer #primary #contents");
      if (!primaryContents) {
        console.warn("[admate infeed] search: primary #contents 없음");
        return false;
      }
      const wrap = document.createElement("div");
      wrap.setAttribute("data-injected", "admate-youtube-infeed");
      wrap.style.cssText =
        "display:block;margin:0 0 16px 0;padding:0 16px;box-sizing:border-box;font-family:Roboto,'Noto Sans KR',Arial,sans-serif;";
      const searchBtns = `<div style="display:flex;gap:8px;align-items:center;width:100%;max-width:420px;margin-top:12px;">
        ${
          showSecondary
            ? `<button type="button" style="${btnBase}flex:1;background:#f2f2f2;color:#0f0f0f;border:1px solid #e6e6e6;">${esc(
                ctaS
              )}</button>`
            : ""
        }
        <button type="button" style="${btnBase}${showSecondary ? "flex:1;" : "width:100%;"}background:#0f0f0f;color:#fff;border:1px solid #0f0f0f;">${esc(
          ctaP
        )}</button>
      </div>`;
      const firstShortWidth = (() => {
        const shorts = document.querySelector(
          "ytd-rich-shelf-renderer ytd-reel-item-renderer, ytd-reel-shelf-renderer ytd-reel-item-renderer"
        ) as HTMLElement | null;
        const w = shorts?.getBoundingClientRect().width || 0;
        return w > 40 ? Math.round(Math.max(450, Math.min(660, w * 2 + 44))) : 500;
      })();
      wrap.innerHTML = `
        <div style="display:flex;flex-direction:row;gap:16px;align-items:flex-start;width:100%;max-width:var(--ytd-grid-max-width,1284px);">
          <div style="position:relative;flex-shrink:0;width:${firstShortWidth}px;aspect-ratio:16/9;border-radius:12px;overflow:hidden;background:#000;">
            <img src="${thumb}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;" />
            ${extIcon}
          </div>
          <div style="flex:1 1 auto;min-width:0;padding-top:0;width:100%;max-width:none;">
            <div style="display:grid;grid-template-columns:minmax(0,1fr) 32px;align-items:start;column-gap:8px;min-height:50px;width:100%;">
              <div style="min-width:0;display:flex;flex-direction:column;gap:0;">
                <h3 style="margin:0;padding:0;font-size:max(1.8rem,calc(var(--ytd-metadata-line-title-font-size,1.4rem) * 1.22));font-weight:400;line-height:2.65rem;letter-spacing:0.2px;color:var(--yt-spec-text-primary,#0f0f0f);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;max-width:100%;">${esc(
                  title
                )}</h3>
                ${
                  d1
                    ? `<div style="margin-top:7px;padding:0;font-size:1.24rem;font-weight:400;line-height:1.78rem;color:var(--yt-spec-text-secondary,#606060);display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden;">${esc(
                        d1
                      )}</div>`
                    : ""
                }
              </div>
              <div style="justify-self:end;align-self:start;z-index:6;transform:translateX(2px);">${menuBtnSearch}</div>
            </div>
            <div style="margin-top:5px;display:flex;align-items:center;gap:${avatar ? "8px" : "0"};font-size:1.2rem;">
              ${
                avatar
                  ? `<div style="width:24px;height:24px;border-radius:50%;overflow:hidden;flex-shrink:0;background:#eee;">
                <img src="${avatar}" alt="" style="width:100%;height:100%;object-fit:cover;" />
              </div>`
                  : ""
              }
              <div style="min-width:0;line-height:1.8rem;flex:1;">${sponsorHtml}</div>
            </div>
            ${
              d2
                ? `<div style="margin-top:6px;font-size:1.2rem;line-height:1.8rem;color:var(--yt-spec-text-secondary,#606060);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${esc(
                    d2
                  )}</div>`
                : ""
            }
            ${searchBtns}
          </div>
        </div>`;
      primaryContents.insertBefore(wrap, primaryContents.firstChild);
      return true;
    }

    /* watch-next */
    const sidebarSelectors = ["#secondary-inner", "#secondary", "ytd-watch-next-secondary-results-renderer", "#related"];
    let sidebar: Element | null = null;
    for (const sel of sidebarSelectors) {
      const el = document.querySelector(sel);
      if (el) {
        const r = el.getBoundingClientRect();
        if (r.width > 50) {
          sidebar = el;
          break;
        }
      }
    }
    if (!sidebar) {
      console.warn("[admate infeed] watch-next: sidebar 없음");
      return false;
    }

    const chipContainer = sidebar.querySelector(
      "ytd-feed-filter-chip-bar-renderer, yt-chip-cloud-renderer, #chip-bar, iron-selector#chips"
    );

    const wrap = document.createElement("div");
    wrap.setAttribute("data-injected", "admate-youtube-infeed");
    wrap.style.cssText =
      "width:100%;max-width:100%;box-sizing:border-box;margin:0 0 12px 0;font-family:Roboto,'Noto Sans KR',Arial,sans-serif;";

    let alignW = 0;
    const firstVideo = sidebar.querySelector("ytd-compact-video-renderer");
    if (firstVideo) alignW = firstVideo.getBoundingClientRect().width;
    if (alignW < 120) alignW = sidebar.getBoundingClientRect().width;
    alignW = Math.round(alignW);

    wrap.style.width = alignW + "px";
    wrap.innerHTML = `
      <div style="display:flex;flex-direction:row;gap:8px;align-items:flex-start;width:100%;">
        <div style="position:relative;flex-shrink:0;width:168px;aspect-ratio:16/9;border-radius:8px;overflow:hidden;background:#000;">
          <img src="${thumb}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;" />
          ${extIcon}
        </div>
        <div style="flex:1;min-width:0;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:4px;">
            <div style="font-size:1.4rem;font-weight:500;line-height:2rem;color:var(--yt-spec-text-primary,#0f0f0f);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${esc(
              title
            )}</div>
            ${menuBtn}
          </div>
          ${descBlock}
          <div style="margin-top:6px;font-size:1.2rem;display:flex;align-items:center;flex-wrap:wrap;">${sponsorHtml}</div>
          ${btnRow(true)}
        </div>
      </div>`;

    if (chipContainer && chipContainer.parentNode) {
      chipContainer.parentNode.insertBefore(wrap, chipContainer.nextSibling);
    } else {
      sidebar.insertBefore(wrap, sidebar.firstChild);
    }
    return true;
  } catch (e) {
    console.error("[admate infeed]", e);
    return false;
  }
}

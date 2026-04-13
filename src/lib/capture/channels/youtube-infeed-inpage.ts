/**
 * YouTube 인피드 광고 UI 인젝션 (page.evaluate에 함수 참조로 전달)
 * 지면: 홈 그리드 카드 | 검색 결과 가로형 | 시청 페이지 관련동영상 사이드바
 */

export type InfeedSurface = "home" | "search" | "watch-next";

export interface InfeedInjectPagePayload {
  surface: InfeedSurface;
  thumbDataUrl: string;
  avatarDataUrl: string;
  title: string;
  description1: string;
  description2: string;
  sponsorName: string;
  ctaPrimary: string;
  /** 비우면 보조 버튼 숨김 */
  ctaSecondary: string;
}

function esc(s: string): string {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

export function runInfeedInjectInPage(...args: unknown[]): boolean {
  const p = args[0] as InfeedInjectPagePayload;
  try {
    document.querySelectorAll('[data-injected="admate-youtube-infeed"]').forEach((el) => el.remove());

    const thumb = p.thumbDataUrl;
    const avatar = p.avatarDataUrl || thumb;
    const title = p.title || "광고 제목";
    const d1 = p.description1 || "";
    const d2 = p.description2 || "";
    const sponsor = p.sponsorName || "brand.example";
    const ctaP = p.ctaPrimary || "시작하기";
    const ctaS = (p.ctaSecondary || "").trim();
    const showSecondary = ctaS.length > 0;

    const sponsorHtml = `<span style="font-weight:700;color:var(--yt-spec-text-primary,#0f0f0f)">스폰서</span><span style="margin:0 4px;color:var(--yt-spec-text-secondary,#606060)">·</span><span style="color:var(--yt-spec-text-secondary,#606060)">${esc(
      sponsor
    )}</span>`;

    const descBlock =
      p.surface === "watch-next" && (d1 || d2)
        ? `<div style="margin-top:4px;font-family:Roboto,'Noto Sans KR',Arial,sans-serif;font-size:1.2rem;line-height:1.45rem;color:var(--yt-spec-text-secondary,#606060);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${esc(
            [d1, d2].filter(Boolean).join(" ")
          )}</div>`
        : "";

    const menuBtn = `<button type="button" aria-label="메뉴" style="flex-shrink:0;background:none;border:none;padding:4px;cursor:default;color:var(--yt-spec-text-primary,#0f0f0f);border-radius:50%;width:40px;height:40px;display:flex;align-items:center;justify-content:center;margin:-4px -4px 0 0;"><svg height="24" viewBox="0 0 24 24" width="24"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" fill="currentColor"/></svg></button>`;

    const btnRow = (compact: boolean) => {
      const gap = compact ? "8px" : "10px";
      const sec = showSecondary
        ? `<button type="button" style="flex:1;min-width:0;height:36px;border-radius:18px;border:none;background:var(--yt-spec-badge-chip-background,rgba(0,0,0,0.05));color:var(--yt-spec-text-primary,#0f0f0f);font-family:Roboto,'Noto Sans KR',Arial,sans-serif;font-size:1.4rem;font-weight:500;cursor:default;">${esc(
            ctaS
          )}</button>`
        : "";
      const primW = showSecondary ? "flex:1" : "width:100%";
      return `<div style="display:flex;gap:${gap};margin-top:${compact ? "10px" : "12px"};align-items:center;">${sec}<button type="button" style="${primW};min-width:0;height:36px;border-radius:18px;border:none;background:var(--yt-spec-text-primary,#0f0f0f);color:var(--yt-spec-static-brand-white,#fff);font-family:Roboto,'Noto Sans KR',Arial,sans-serif;font-size:1.4rem;font-weight:500;cursor:default;">${esc(
        ctaP
      )}</button></div>`;
    };

    const extIcon =
      '<span style="position:absolute;bottom:8px;right:8px;width:28px;height:28px;border-radius:4px;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;"><svg width="14" height="14" viewBox="0 0 24 24" fill="#fff"><path d="M19 19H5V5h7V3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg></span>';

    const buildHomeFeedCard = (): HTMLElement => {
      const wrap = document.createElement("div");
      wrap.setAttribute("data-injected", "admate-youtube-infeed");
      wrap.style.cssText =
        "width:100%;box-sizing:border-box;font-family:Roboto,'Noto Sans KR',Arial,sans-serif;border-radius:12px;overflow:hidden;background:var(--yt-spec-base-background,#fff);border:1px solid var(--yt-spec-10-percent-layer,#e5e5e5);";
      wrap.innerHTML = `
        <div style="position:relative;width:100%;aspect-ratio:16/9;background:#000;">
          <img src="${thumb}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;" />
          ${extIcon}
        </div>
        <div style="padding:12px 12px 14px;">
          <div style="display:flex;gap:12px;align-items:flex-start;">
            <div style="width:36px;height:36px;border-radius:50%;overflow:hidden;flex-shrink:0;background:#eee;">
              <img src="${avatar}" alt="" style="width:100%;height:100%;object-fit:cover;" />
            </div>
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

      console.warn("[admate infeed] home: 삽입 앵커 없음");
      return false;
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
      wrap.innerHTML = `
        <div style="display:flex;flex-direction:row;gap:16px;align-items:flex-start;max-width:960px;">
          <div style="position:relative;flex-shrink:0;width:246px;aspect-ratio:16/9;border-radius:12px;overflow:hidden;background:#000;">
            <img src="${thumb}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;" />
            ${extIcon}
          </div>
          <div style="flex:1;min-width:0;padding-top:2px;">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
              <h3 style="margin:0;font-size:1.8rem;font-weight:400;line-height:2.6rem;color:var(--yt-spec-text-primary,#0f0f0f);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${esc(
                title
              )}</h3>
              ${menuBtn}
            </div>
            <div style="margin-top:8px;display:flex;align-items:center;gap:8px;font-size:1.2rem;">
              <div style="width:24px;height:24px;border-radius:50%;overflow:hidden;flex-shrink:0;background:#eee;">
                <img src="${avatar}" alt="" style="width:100%;height:100%;object-fit:cover;" />
              </div>
              <div style="min-width:0;">${sponsorHtml}</div>
            </div>
            ${btnRow(false)}
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

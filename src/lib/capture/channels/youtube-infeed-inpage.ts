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
  /** `search` 지면만. 기본 top — 첫 결과 위치 / feed 는 실제 검색 행 사이 */
  searchPlacement?: "top" | "feed";
  /** `feed` 일 때 삽입 기준: 이 인덱스(0부터)의 결과 행 **바로 뒤**에 광고 삽입 */
  searchFeedInsertAfterIndex?: number;
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
    const ctaRawP = (p.ctaPrimary || "").trim();
    const ctaS = (p.ctaSecondary || "").trim();
    const ctaP =
      p.surface === "search"
        ? ctaRawP
        : p.surface === "watch-next"
          ? ctaRawP || "사이트 방문"
          : ctaRawP || "시작하기";
    /** 관련동영상은 CTA 1개만(보조 CTA 무시) */
    const showSecondary = p.surface !== "watch-next" && ctaS.length > 0;
    const showSearchCtaRow = p.surface === "search" && (ctaP.length > 0 || showSecondary);

    const sponsorHtml = `<span style="font-weight:600;color:var(--yt-spec-text-primary,#0f0f0f)">스폰서</span><span style="margin:0 4px;color:var(--yt-spec-text-secondary,#606060)">·</span><span style="color:var(--yt-spec-text-secondary,#606060)">${esc(
      sponsor
    )}</span>`;

    const descBlockWatchNext =
      p.surface === "watch-next"
        ? (() => {
            const l1 = (d1 || "").trim();
            const l2 = (d2 || "").trim();
            let inner = "";
            if (!l1 && !l2) {
              inner =
                esc("번거롭고 어려운 의사 검색,굿닥터넷이") + "<br>" + esc("대신 해 드려요");
            } else if (l1 && l2) {
              inner = esc(l1) + "<br>" + esc(l2);
            } else if (l1.includes("\n")) {
              inner = l1
                .split(/\n/)
                .map((x) => x.trim())
                .filter(Boolean)
                .slice(0, 3)
                .map((x) => esc(x))
                .join("<br>");
            } else if (l1) {
              inner = esc(l1);
            } else {
              inner = esc(l2);
            }
            return `<div style="margin-top:6px;font-family:Roboto,'Noto Sans KR',Arial,sans-serif;font-size:1.2rem;line-height:1.5rem;color:var(--yt-spec-text-secondary,#606060);display:block;overflow:hidden;max-height:4.6rem;">${inner}</div>`;
          })()
        : "";

    const menuBtn =
      '<button type="button" aria-label="작업 더보기" style="flex-shrink:0;background:none;border:none;padding:3px;cursor:default;color:var(--yt-spec-text-primary,#0f0f0f);border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;margin:-3px -3px 0 0;"><svg width="18" height="18" viewBox="0 0 24 24" focusable="false" aria-hidden="true" style="display:block;"><path d="M5.5 12a2 2 0 114 0 2 2 0 01-4 0Zm4.5 0a2 2 0 114 0 2 2 0 01-4 0Zm4.5 0a2 2 0 114 0 2 2 0 01-4 0Z" fill="currentColor"/></svg></button>';
    const menuBtnSearch = "";

    /**
     * 데스크톱 웹 인피드 광고 CTA — yt-spec-button-shape-next--size-m 근접
     * 보조: 연한 회색 면 + 얇은 테두리 / 주: mono-filled (#0f0f0f)
     */
    const btnBase =
      "box-sizing:border-box;margin:0;border:none;cursor:default;font-family:Roboto,'Noto Sans KR',Arial,sans-serif;font-size:14px;line-height:36px;font-weight:500;height:36px;padding:0 16px;border-radius:18px;display:flex;align-items:center;justify-content:center;white-space:nowrap;letter-spacing:0.011px;";
    const btnRow = (
      compact: boolean,
      opts?: { primaryFitContent?: boolean; marginTop?: string }
    ) => {
      const gap = "8px";
      const primaryFit = opts?.primaryFitContent === true;
      const rowMt =
        opts?.marginTop !== undefined ? opts.marginTop : compact ? "8px" : "10px";
      const sec = showSecondary
        ? `<button type="button" style="${btnBase}flex:1;min-width:0;background:#f2f2f2;color:#0f0f0f;border:1px solid #e5e5e5;">${esc(
            ctaS
          )}</button>`
        : "";
      const primW = showSecondary
        ? "flex:1"
        : primaryFit
          ? "width:fit-content;max-width:100%;flex:0 0 auto;"
          : "width:100%";
      const primMin = primaryFit ? "" : "min-width:0;";
      const prim =
        ctaP.length > 0
          ? `<button type="button" style="${btnBase}${primW};${primMin}background:#0f0f0f;color:#fff;border:1px solid #0f0f0f;">${esc(
              ctaP
            )}</button>`
          : "";
      return `<div style="display:flex;flex-direction:row;gap:${gap};margin-top:${rowMt};align-items:center;width:100%;justify-content:flex-start;">${sec}${prim}</div>`;
    };

    /**
     * 썸네일 우하단 — 실제 웹의 overlay-dark tonal 버튼과 동일 토큰
     * (rgba(0,0,0,0.3) + 흰 아이콘, yt-spec-button-shape-next--size-m 높이에 맞춘 원형)
     */
    const extIcon =
      '<span style="position:absolute;bottom:10px;right:10px;width:36px;height:36px;border-radius:999px;background:rgba(18,18,18,0.72);display:flex;align-items:center;justify-content:center;box-sizing:border-box;color:#fff;border:1px solid rgba(255,255,255,0.14);"><svg width="16" height="16" viewBox="0 0 24 24" focusable="false" aria-hidden="true" style="display:block;pointer-events:none;fill:currentColor;"><path d="M19 5H8a1 1 0 000 2h7.586L5.293 17.293a1 1 0 101.414 1.414L17 8.414V16a1 1 0 002 0V5Z"></path></svg></span>';
    const thumbMenuBtn = "";

    const buildHomeFeedCard = (): HTMLElement => {
      const wrap = document.createElement("div");
      wrap.setAttribute("data-injected", "admate-youtube-infeed");
      wrap.style.cssText =
        "width:100%;box-sizing:border-box;font-family:Roboto,'Noto Sans KR',Arial,sans-serif;border:none;background:transparent;";
      const avatarCol =
        avatar &&
        `<div style="width:36px;height:36px;border-radius:50%;overflow:hidden;flex-shrink:0;background:#eee;">
              <img src="${avatar}" alt="" style="width:100%;height:100%;object-fit:cover;" />
            </div>`;
      wrap.innerHTML = `
        <div style="position:relative;width:100%;aspect-ratio:16/9;background:#000;border-radius:12px;overflow:hidden;">
          <img src="${thumb}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;" />
          ${extIcon}
          ${thumbMenuBtn}
        </div>
        <div style="padding:10px 0 0 0;">
          <div style="display:flex;gap:${avatar ? "12px" : "0"};align-items:flex-start;">
            ${avatarCol || ""}
            <div style="flex:1;min-width:0;display:flex;flex-direction:column;gap:8px;">
              <div style="display:flex;align-items:flex-start;gap:2px;width:100%;">
                <div style="min-width:0;flex:1;">
                  <div style="font-size:1.4rem;font-weight:500;line-height:2rem;color:var(--yt-spec-text-primary,#0f0f0f);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${esc(
                    title
                  )}</div>
                  <div style="margin-top:4px;font-size:1.2rem;line-height:1.6rem;display:flex;align-items:center;flex-wrap:wrap;color:var(--yt-spec-text-secondary,#606060);">${sponsorHtml}</div>
                </div>
                ${menuBtn}
              </div>
              ${(ctaP || ctaS) ? `<div style="width:100%;">${btnRow(false, { marginTop: "0px" })}</div>` : ""}
            </div>
          </div>
        </div>`;
      return wrap;
    };
    const buildHomeFeedCardFromTemplate = (templateItem: Element): HTMLElement | null => {
      const cloned = templateItem.cloneNode(true) as HTMLElement;
      cloned.setAttribute("data-injected", "admate-youtube-infeed");
      cloned.setAttribute("data-admate-home-native-like", "1");

      cloned.querySelectorAll("a[href]").forEach((a) => {
        a.setAttribute("href", "javascript:void(0)");
        a.removeAttribute("target");
        a.setAttribute("rel", "noopener noreferrer");
      });

      const thumbImg = cloned.querySelector(
        "#thumbnail img, ytd-thumbnail img, yt-image img"
      ) as HTMLImageElement | null;
      if (thumbImg) {
        thumbImg.src = thumb;
        thumbImg.removeAttribute("srcset");
      }

      const titleNode = cloned.querySelector(
        "#video-title, a#video-title, #video-title-link, h3 a"
      ) as HTMLElement | null;
      if (titleNode) titleNode.textContent = title;

      const channelNode = cloned.querySelector(
        "#channel-name #text, ytd-channel-name #text, #text.ytd-channel-name"
      ) as HTMLElement | null;
      if (channelNode) channelNode.textContent = sponsor;

      const metaSpans = cloned.querySelectorAll(
        "#metadata-line span, #metadata-line yt-formatted-string"
      );
      if (metaSpans[0]) (metaSpans[0] as HTMLElement).textContent = "광고";
      if (metaSpans[1]) (metaSpans[1] as HTMLElement).textContent = sponsor;

      const avatarImg = cloned.querySelector(
        "#avatar img, #avatar-link img, ytd-channel-name img"
      ) as HTMLImageElement | null;
      if (avatar && avatarImg) {
        avatarImg.src = avatar;
        avatarImg.removeAttribute("srcset");
      } else if (!avatar) {
        const avatarWrap = cloned.querySelector("#avatar, #avatar-link, #channel-avatar");
        if (avatarWrap) (avatarWrap as HTMLElement).style.display = "none";
      }

      const detailsHost =
        (cloned.querySelector("ytd-video-meta-block") as HTMLElement | null) ||
        (cloned.querySelector("#meta") as HTMLElement | null) ||
        (cloned.querySelector("#details") as HTMLElement | null) ||
        (cloned.querySelector("#metadata") as HTMLElement | null) ||
        (cloned.querySelector("#content") as HTMLElement | null);

      if (detailsHost) {
        // 기존 유기적 카드의 모든 기본 버튼을 무력화합니다.
        detailsHost.querySelectorAll("button, #buttons, ytd-button-renderer, ytd-toggle-button-renderer").forEach((el) => {
          const t = ((el as HTMLElement).textContent || "").trim();
          if (
            t.includes("시청") ||
            t.includes("시작하기") ||
            t.includes("사이트 방문") ||
            t.includes("Watch") ||
            t.includes("Visit")
          ) {
            (el as HTMLElement).style.display = "none";
          }
        });
        
        // 새로 전달받은 CTA 옵션을 삽입합니다.
        if (ctaP || ctaS) {
          const btnDiv = document.createElement("div");
          // 상단 여백을 없애 기존 타이틀/스폰서와의 간격을 네이티브와 똑같이 맞춥니다.
          btnDiv.style.cssText = "margin-top:8px;width:100%;";
          btnDiv.innerHTML = btnRow(false, { marginTop: "0px" });
          
          // 핵심: 버튼 컨테이너를 무조건 텍스트를 감싸는 컬럼 요소 내부에 넣어야 합니다. 
          // 만약 #details 에 넣으면 프로필 아바타 아래까지 폭격맞듯 침범하게 됩니다.
          const trueMetaContainer = 
              cloned.querySelector("#meta") || 
              cloned.querySelector("ytd-video-meta-block")?.parentElement ||
              detailsHost;

          trueMetaContainer.appendChild(btnDiv);
        }
      }

      return cloned;
    };

    if (p.surface === "home") {
      const synthRoot = document.querySelector("#primary [data-admate-synthetic-feed-root]");
      if (synthRoot) {
        synthRoot
          .querySelectorAll('[data-injected="admate-youtube-infeed"]')
          .forEach((el) => el.remove());
        const ad = buildHomeFeedCard();
        const grid = synthRoot.querySelector("[data-admate-synthetic-feed-grid]") as HTMLElement | null;
        if (grid) {
          const cell = document.createElement("div");
          cell.setAttribute("data-injected", "admate-youtube-infeed");
          cell.style.cssText = "border:none;background:transparent;";
          ad.style.border = "none";
          ad.style.borderRadius = "0";
          ad.style.maxWidth = "none";
          ad.style.margin = "0";
          cell.appendChild(ad);
          grid.insertBefore(cell, grid.firstChild);
          console.log("[admate infeed] home: 합성 그리드 첫 칸에 광고 삽입");
          return true;
        }
        ad.style.maxWidth = "420px";
        ad.style.marginBottom = "20px";
        synthRoot.insertBefore(ad, synthRoot.firstChild);
        console.log("[admate infeed] home: 합성 피드 루트 상단에 광고 삽입(폴백)");
        return true;
      }
      const richItem =
        document.querySelector(
          "#primary ytd-rich-grid-renderer ytd-rich-grid-row ytd-rich-item-renderer"
        ) ||
        document.querySelector("#primary ytd-rich-grid-renderer ytd-rich-item-renderer") ||
        document.querySelector("ytd-rich-grid-renderer ytd-rich-item-renderer");
      if (richItem) {
        const nativeLike = buildHomeFeedCardFromTemplate(richItem);
        if (nativeLike && richItem.parentElement) {
          richItem.parentElement.insertBefore(nativeLike, richItem);
          console.log("[admate infeed] home: 첫 rich-item 앞에 네이티브형 광고 삽입");
          return true;
        }
        const host = (richItem.querySelector("#dismissable") as HTMLElement) || (richItem as HTMLElement);
        host.innerHTML = "";
        host.appendChild(buildHomeFeedCard());
        console.log("[admate infeed] home: 첫 rich-item 치환(폴백)");
        return true;
      }

      const gridContents =
        (document.querySelector("#primary ytd-rich-grid-renderer #contents") as HTMLElement | null) ||
        (document.querySelector("ytd-rich-grid-renderer #contents") as HTMLElement | null);
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
      const placement = p.searchPlacement === "feed" ? "feed" : "top";
      const insertAfterIdx =
        typeof p.searchFeedInsertAfterIndex === "number" && !Number.isNaN(p.searchFeedInsertAfterIndex)
          ? Math.max(0, Math.min(12, Math.floor(p.searchFeedInsertAfterIndex)))
          : 1;
      const collectSearchResultRows = (container: Element): Element[] => {
        const rows: Element[] = [];
        const pushIfRow = (el: Element) => {
          const t = el.tagName;
          if (
            t === "YTD-VIDEO-RENDERER" ||
            t === "YTD-REEL-SHELF-RENDERER" ||
            t === "YTD-CHANNEL-RENDERER" ||
            t === "YTD-PLAYLIST-RENDERER" ||
            t === "YTD-RADIO-RENDERER"
          ) {
            rows.push(el);
          }
        };
        for (const child of Array.from(container.children)) {
          const t = child.tagName;
          if (
            t === "YTD-VIDEO-RENDERER" ||
            t === "YTD-REEL-SHELF-RENDERER" ||
            t === "YTD-CHANNEL-RENDERER" ||
            t === "YTD-PLAYLIST-RENDERER" ||
            t === "YTD-RADIO-RENDERER"
          ) {
            rows.push(child);
          } else if (t === "YTD-ITEM-SECTION-RENDERER") {
            const inner = child.querySelector(":scope #contents");
            if (inner) {
              for (const c2 of Array.from(inner.children)) pushIfRow(c2);
            }
          }
        }
        return rows;
      };
      /** PC 검색 피드 중간: 네이티브 행과 같은 #contents 폭·썸네일 열에 맞춤 */
      const rowsForFeed = placement === "feed" ? collectSearchResultRows(primaryContents) : [];
      let feedThumbW = 0;
      if (placement === "feed" && rowsForFeed.length > 0) {
        const anchorIdxPre = Math.min(insertAfterIdx, rowsForFeed.length - 1);
        const anchorEl = rowsForFeed[anchorIdxPre];
        const thumbEl =
          anchorEl.tagName === "YTD-VIDEO-RENDERER"
            ? (anchorEl.querySelector("#thumbnail") as HTMLElement | null)
            : (primaryContents.querySelector("ytd-video-renderer #thumbnail") as HTMLElement | null);
        const tw = thumbEl?.getBoundingClientRect().width || 0;
        if (tw > 80) feedThumbW = Math.round(tw);
      }
      const wrap = document.createElement("div");
      wrap.setAttribute("data-injected", "admate-youtube-infeed");
      wrap.setAttribute("data-admate-search-placement", placement);
      wrap.style.cssText =
        placement === "feed"
          ? "display:block;margin:16px 0 16px 0;padding:0;box-sizing:border-box;width:100%;font-family:Roboto,'Noto Sans KR',Arial,sans-serif;"
          : "display:block;margin:0 0 16px 0;padding:0 16px;box-sizing:border-box;font-family:Roboto,'Noto Sans KR',Arial,sans-serif;";
      const searchBtns = showSearchCtaRow
        ? `<div style="display:flex;gap:8px;align-items:center;width:100%;max-width:420px;margin-top:12px;">
        ${
          showSecondary
            ? `<button type="button" style="${btnBase}flex:1;background:#f2f2f2;color:#0f0f0f;border:1px solid #e6e6e6;">${esc(
                ctaS
              )}</button>`
            : ""
        }
        ${
          ctaP.length > 0
            ? `<button type="button" style="${btnBase}${showSecondary ? "flex:1;" : "width:100%;"}background:#0f0f0f;color:#fff;border:1px solid #0f0f0f;">${esc(
                ctaP
              )}</button>`
            : ""
        }
      </div>`
        : "";
      const sponsorSearchMarginTop = !d1 && !showSearchCtaRow ? "0px" : "2px";
      const firstShortWidth = (() => {
        if (placement === "feed" && feedThumbW > 80) return feedThumbW;
        if (placement === "feed") {
          const anyThumb = primaryContents.querySelector("ytd-video-renderer #thumbnail") as HTMLElement | null;
          const fw = anyThumb?.getBoundingClientRect().width || 0;
          if (fw > 80) return Math.round(fw);
          return 360;
        }
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
            <div style="display:grid;grid-template-columns:minmax(0,1fr) 32px;align-items:start;column-gap:8px;min-height:0;width:100%;">
              <div style="min-width:0;display:flex;flex-direction:column;gap:0;">
                <h3 style="margin:0;padding:0;font-size:max(1.8rem,calc(var(--ytd-metadata-line-title-font-size,1.4rem) * 1.22));font-weight:400;line-height:1.32;letter-spacing:0.2px;color:var(--yt-spec-text-primary,#0f0f0f);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;max-width:100%;">${esc(
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
            <div style="margin-top:${sponsorSearchMarginTop};display:flex;align-items:center;gap:${avatar ? "8px" : "0"};font-size:1.2rem;">
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
      let placed = false;
      let feedLog = "";
      if (placement === "feed") {
        const rows = rowsForFeed.length ? rowsForFeed : collectSearchResultRows(primaryContents);
        if (rows.length > 0) {
          const anchorIdx = Math.min(insertAfterIdx, rows.length - 1);
          const anchor = rows[anchorIdx];
          anchor.insertAdjacentElement("afterend", wrap);
          placed = !!wrap.parentElement;
          feedLog = "anchorIdx=" + anchorIdx + " rows=" + rows.length + " thumbW=" + firstShortWidth;
        }
        if (!placed) {
          primaryContents.insertBefore(wrap, primaryContents.firstChild);
          console.warn("[admate infeed] search: feed 삽입 실패 → 최상단 폴백");
        } else {
          console.log("[admate infeed] search: 피드 중간 삽입 " + feedLog);
        }
      } else {
        primaryContents.insertBefore(wrap, primaryContents.firstChild);
        console.log("[admate infeed] search: 최상단 삽입");
      }
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

    const firstVideo = sidebar.querySelector("ytd-compact-video-renderer") as HTMLElement | null;
    let compactThumbW = 168;
    const compactTh = firstVideo?.querySelector("#thumbnail") as HTMLElement | null;
    const ctw = compactTh?.getBoundingClientRect().width || 0;
    if (ctw > 80) compactThumbW = Math.round(ctw);

    const sponsorWatchMarginTop = "4px";

    const wrap = document.createElement("div");
    wrap.setAttribute("data-injected", "admate-youtube-infeed");
    wrap.setAttribute("data-admate-surface", "watch-next");
    wrap.style.cssText =
      "width:100%;max-width:100%;box-sizing:border-box;margin:12px 0 16px 0;font-family:Roboto,'Noto Sans KR',Arial,sans-serif;";

    let alignW = 0;
    if (firstVideo) alignW = firstVideo.getBoundingClientRect().width;
    if (alignW < 120) alignW = sidebar.getBoundingClientRect().width;
    alignW = Math.round(alignW);

    wrap.style.width = alignW + "px";
    wrap.innerHTML = `
      <div style="display:flex;flex-direction:row;gap:10px;align-items:stretch;width:100%;">
        <div style="position:relative;flex-shrink:0;width:${compactThumbW}px;height:${compactThumbW}px;border-radius:12px;overflow:hidden;background:#000;">
          <img src="${thumb}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;vertical-align:bottom;" />
        </div>
        <div style="flex:1;min-width:0;min-height:${compactThumbW}px;display:flex;flex-direction:column;padding-top:0;">
          <div style="flex:1;min-height:0;display:flex;flex-direction:column;">
            <div style="display:grid;grid-template-columns:minmax(0,1fr) 32px;align-items:start;column-gap:4px;min-height:0;width:100%;">
              <div style="min-width:0;display:flex;flex-direction:column;gap:0;">
                <h3 style="margin:0;padding:0;font-family:Roboto,'Noto Sans KR',Arial,sans-serif;font-size:14px;font-weight:500;line-height:20px;letter-spacing:0.25px;color:rgb(15,15,15);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${esc(
                  title
                )}</h3>
                ${descBlockWatchNext}
              </div>
              <div style="justify-self:end;align-self:start;z-index:2;transform:translateX(1px);">${menuBtnSearch}</div>
            </div>
            <div style="margin-top:${sponsorWatchMarginTop};display:flex;align-items:center;gap:${avatar ? "8px" : "0"};font-size:1.2rem;">
              ${
                avatar
                  ? `<div style="width:24px;height:24px;border-radius:50%;overflow:hidden;flex-shrink:0;background:#eee;">
              <img src="${avatar}" alt="" style="width:100%;height:100%;object-fit:cover;" />
            </div>`
                  : ""
              }
              <div style="min-width:0;line-height:1.65rem;flex:1;">${sponsorHtml}</div>
            </div>
          </div>
          <div style="margin-top:auto;align-self:stretch;width:100%;padding-top:6px;box-sizing:border-box;">
            ${btnRow(true, { primaryFitContent: true, marginTop: "0" })}
          </div>
        </div>
      </div>`;

    if (chipContainer && chipContainer.parentNode) {
      chipContainer.parentNode.insertBefore(wrap, chipContainer.nextSibling);
    } else {
      sidebar.insertBefore(wrap, sidebar.firstChild);
    }

    const roundSid = "admate-watch-next-compact-thumb-round";
    let stRound = document.getElementById(roundSid) as HTMLStyleElement | null;
    if (!stRound) {
      stRound = document.createElement("style");
      stRound.id = roundSid;
      document.head.appendChild(stRound);
    }
    stRound.textContent =
      "ytd-watch-next-secondary-results-renderer ytd-compact-video-renderer #thumbnail," +
      "#secondary-inner ytd-compact-video-renderer #thumbnail," +
      "#secondary ytd-compact-video-renderer #thumbnail{" +
      "border-radius:12px!important;overflow:hidden!important;}";
    return true;
  } catch (e) {
    console.error("[admate infeed]", e);
    return false;
  }
}

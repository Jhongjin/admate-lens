// @ts-nocheck
/**
 * Puppeteer page.evaluate()에 함수 참조로 전달되는 브라우저 측 프리롤 인젝션.
 * youtube-capture.ts 안의 거대한 백틱 문자열은 Next 번들·특수문자·<br/> 등으로 SyntaxError를 유발할 수 있어 분리함.
 */

export interface PrerollInjectPagePayload {
  imgUrl: string;
  isMobile: boolean;
  avatarImgUrl: string;
  domainText: string;
  sponsorDomainText: string;
  titleText: string;
  enableCtaText: boolean;
  ctaBtnText: string;
  progressFillPct: number;
  /** false면 데스크톱 우하단 건너뛰기 버튼 미노출(논스킵 인스트림) */
  showSkipButton?: boolean;
  /** Node에서 측정한 플레이어 박스(인페이지 재탐색과 불일치 시 흰 영역·찢어짐 방지) */
  serverPlayerBox?: { left: number; top: number; width: number; height: number };
}

export function runPrerollInjectInPage(...args: unknown[]): boolean {
  const p = args[0];
  try {
    const imgUrl = p.imgUrl;
    const isMobile = p.isMobile;
    const avatarImgUrl = p.avatarImgUrl;
    const domainText = p.domainText;
    const sponsorDomainText = p.sponsorDomainText;
    const titleText = p.titleText;
    const enableCtaText = p.enableCtaText;
    const ctaBtnText = p.ctaBtnText;
    const progressFillPct = p.progressFillPct;
    const showSkipButton = p.showSkipButton !== false;

    const playerSelectors = [
      "#yt-thumb-overlay",
      "#movie_player",
      "#player-container-inner",
      "#player-container-outer",
      "ytd-player",
      ".html5-video-player",
      "#player",
      "ytm-player-body",
      "ytm-player-section-renderer",
      "#player-container-id",
      ".player-container",
    ];

    const srv = p.serverPlayerBox;
    let px = 0;
    let py = 56;
    let pw = window.innerWidth * 0.7;
    let ph = window.innerHeight * 0.6;
    let playerRect: DOMRect | null = null;
    let usedMeasuredPlayer = false;

    if (srv && srv.width > 80 && srv.height > 80) {
      px = srv.left;
      py = srv.top;
      pw = srv.width;
      ph = srv.height;
      usedMeasuredPlayer = true;
    } else {
      const videoEl = document.querySelector("video");
      if (videoEl) {
        const r = videoEl.getBoundingClientRect();
        if (r.width > 50 && r.height > 50) playerRect = r;
      }
      if (!playerRect) {
        for (const sel of playerSelectors) {
          const el = document.querySelector(sel);
          if (el) {
            const r = el.getBoundingClientRect();
            if (r.width > 80 && r.height > 80) {
              playerRect = r;
              break;
            }
          }
        }
      }
      if (playerRect) {
        px = playerRect.left;
        py = playerRect.top;
        pw = playerRect.width;
        ph = playerRect.height;
        usedMeasuredPlayer = true;
      }
    }

    if (!isMobile) {
      const sidebarSelectors = [
        "#admate-watch-context-sidebar",
        "#secondary",
        "#secondary-inner",
        "#related",
        "ytd-watch-next-secondary-results-renderer",
      ];
      let sidebarRect: DOMRect | null = null;
      for (const sel of sidebarSelectors) {
        const el = document.querySelector(sel);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (
          r.width > 160 &&
          r.height > 80 &&
          r.left > Math.max(360, px + 320) &&
          r.left < window.innerWidth - 80
        ) {
          sidebarRect = r;
          break;
        }
      }

      const fallbackLeft = Math.max(24, Math.round(Math.min(86, window.innerWidth * 0.04)));
      const fallbackTop = Math.max(50, Math.round(Math.min(82, window.innerHeight * 0.09)));
      if (!usedMeasuredPlayer) {
        px = fallbackLeft;
        py = fallbackTop;
      }

      const safeRight = sidebarRect
        ? Math.min(window.innerWidth - 24, sidebarRect.left - 24)
        : window.innerWidth -
          (window.innerWidth >= 1600 ? 72 : 48) -
          Math.max(340, Math.min(402, Math.round(window.innerWidth * 0.22))) -
          24;
      const maxPlayerWidth = Math.floor(safeRight - px);
      const measuredTooNarrow = maxPlayerWidth >= 720 && pw < maxPlayerWidth * 0.82;
      if (maxPlayerWidth > 480 && (pw > maxPlayerWidth || measuredTooNarrow)) {
        if (measuredTooNarrow) {
          px = fallbackLeft;
          py = fallbackTop;
        }
        pw = maxPlayerWidth;
      }

      const aspectHeight = Math.round((pw * 9) / 16);
      const aspectRatio = pw / Math.max(ph, 1);
      const overlapsSidebar = sidebarRect ? px + pw > sidebarRect.left - 16 : false;
      if (
        !usedMeasuredPlayer ||
        measuredTooNarrow ||
        overlapsSidebar ||
        aspectRatio > 1.95 ||
        aspectRatio < 1.45 ||
        ph < 220 ||
        ph > window.innerHeight * 0.82
      ) {
        ph = aspectHeight;
      }
    }

    if (isMobile) {
      // 모바일은 플레이어 폭이 부분적으로 감지되는 경우가 많아
      // 오버레이를 항상 뷰포트 전체 폭에 정렬한다.
      const mobileVideoHeight = Math.round((window.innerWidth * 9) / 16);
      // 상단 검은 띠가 생기지 않도록 모바일은 항상 최상단부터 채운다.
      py = 0;
      px = 0;
      pw = window.innerWidth;
      // 실제 모바일 유튜브 플레이어 비율(16:9) 고정
      ph = Math.round((pw * 9) / 16);
    }

    // Bot-detection fallback can be rendered as an HTMLDialogElement top-layer.
    // Top-layer elements sit above every z-index, so close/remove them after
    // measuring the player and before drawing the real preroll UI.
    document
      .querySelectorAll("#admate-bot-cover-dialog")
      .forEach((el) => {
        try {
          if (typeof el.close === "function") el.close();
        } catch {}
        el.remove();
      });
    document
      .querySelectorAll(
        "#yt-thumb-overlay, #yt-thumb-overlay-fixed, #admate-dialog-backdrop-style, #admate-preroll-overlay, #admate-skip-btn"
      )
      .forEach((el) => el.remove());

    const playerRadius = isMobile ? "0px" : "12px";
    const overlay = document.createElement("div");
    overlay.id = "admate-preroll-overlay";
    overlay.setAttribute("data-injected", "admate-youtube-preroll");
    overlay.style.cssText = [
      "position: fixed",
      "top: " + py + "px",
      "left: " + px + "px",
      "width: " + pw + "px",
      "height: " + ph + "px",
      "z-index: 2147483647",
      "display: flex",
      "align-items: center",
      "justify-content: center",
      "overflow: hidden",
      "border-radius: " + playerRadius,
      "transform: translateZ(0)",
      "backface-visibility: hidden",
      "isolation: isolate",
    ].join(" !important;") + " !important";
    if (isMobile) {
      overlay.style.borderRadius = "0 !important";
    }

    if (imgUrl) {
      overlay.style.background = "#000 !important";
      const img = document.createElement("img");
      img.src = imgUrl;
      img.setAttribute("data-injected", "admate");
      const objectFit = isMobile ? "contain" : "cover";
      img.style.cssText =
        "width:calc(100% + 1px) !important;height:calc(100% + 1px) !important;object-fit:" +
        objectFit +
        " !important;display:block !important;position:absolute !important;top:-0.5px !important;left:-0.5px !important;z-index:1 !important;border-radius:" +
        (isMobile ? "0" : "inherit") +
        " !important;transform:translateZ(0) !important;backface-visibility:hidden !important;background:#000 !important";
      overlay.appendChild(img);
    } else {
      overlay.style.background = "transparent !important";
    }

    if (isMobile) {
      // 모바일 캡처는 실제 피드 중심으로 보이도록 상단 chrome/팝업류 제거
      document
        .querySelectorAll(
          "ytm-mobile-topbar-renderer, ytm-app-header, ytm-header, #header, .mobile-topbar-header-content, .ytm-header-bar"
        )
        .forEach((el) => (el.style.display = "none"));
      document
        .querySelectorAll(
          "ytm-popup-container, tp-yt-paper-dialog, ytm-confirm-dialog-renderer, ytm-single-option-survey-renderer"
        )
        .forEach((el) => el.remove());

      // 스폰서 배지 — .ytp-ad-badge--stark-clean-player / __text--clean-player 에 맞춤
      const adLabel = document.createElement("div");
      adLabel.setAttribute("data-injected", "admate-ytp-ad-badge");
      adLabel.style.cssText =
        "position:absolute;bottom:12px;left:18px;z-index:15;pointer-events:none;" +
        "color:#fff;opacity:1;font-size:12px;line-height:28px;letter-spacing:0.35px;" +
        'font-family:"YouTube Noto",Roboto,"Noto Sans KR",Arial,sans-serif;font-weight:600;' +
        "text-shadow:0 0 8px rgba(0,0,0,0.5),0 0 16px rgba(0,0,0,0.25);" +
        "display:flex;align-items:center;gap:5px;";
      adLabel.innerHTML =
        '<span style="font-weight:600">스폰서</span> <svg width="13" height="13" viewBox="0 0 16 16" fill="white" style="flex-shrink:0;opacity:0.95"><path d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14zm0 1A8 8 0 1 1 8 0a8 8 0 0 1 0 16z"/><path d="M8.93 6.588l-2.29.287-.082.38.45.083c.294.07.352.176.288.469l-.738 3.468c-.194.897.105 1.319.808 1.319.545 0 1.178-.252 1.465-.598l.088-.416c-.2.176-.492.246-.686.246-.275 0-.375-.193-.304-.533L8.93 6.588zM9 4.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0z"/></svg>';
      overlay.appendChild(adLabel);

      // 광고주 페이지 방문 — .ytp-ad-player-overlay-top-bar-gradients .ytp-ad-visit-advertiser-button
      const visitLabel = document.createElement("div");
      visitLabel.setAttribute("data-injected", "admate-ytp-visit-advertiser");
      visitLabel.style.cssText =
        "position:absolute;top:10px;right:11px;z-index:15;pointer-events:auto;" +
        "display:flex;align-items:center;gap:4px;margin:0;" +
        'font-family:"YouTube Noto",Roboto,"Noto Sans KR",Arial,sans-serif;' +
        "font-size:14px;font-weight:500;line-height:normal;color:#fff;" +
        "text-shadow:1px 1px 1px rgba(0,0,0,0.75);" +
        "padding:0 4px 5px 4px;box-sizing:border-box;";
      visitLabel.innerHTML =
        '<span style="padding:0 2px 0 0">광고주 페이지 방문</span><svg width="12" height="12" viewBox="0 0 24 24" fill="white" style="flex-shrink:0;opacity:0.95"><path d="M19 19H5V5h7V3H5a2 2 0 00-2 2v14a2 2 0 002 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>';
      overlay.appendChild(visitLabel);

      const timerBg = document.createElement("div");
      timerBg.style.cssText =
        "position:absolute;bottom:0;left:0;width:100%;height:3px;background:rgba(255,255,255,0.15);z-index:10;border-radius:0 0 12px 12px";
      overlay.appendChild(timerBg);
      const timerBar = document.createElement("div");
      const barRadius = progressFillPct >= 99.5 ? "0 0 12px 12px" : "0 0 0 12px";
      timerBar.style.cssText =
        "position:absolute;bottom:0;left:0;width:" +
        progressFillPct +
        "%;height:3px;background:#f2bc42;z-index:11;border-radius:" +
        barRadius;
      overlay.appendChild(timerBar);
    } else {
      const adLabel = document.createElement("div");
      adLabel.style.cssText =
        "position:absolute;top:10px;left:10px;color:rgba(255,255,255,0.5);font-size:10px;font-family:Roboto,Arial,sans-serif;font-weight:400;letter-spacing:0.2px;z-index:10";
      adLabel.textContent = "광고";
      overlay.appendChild(adLabel);
    }

    if (!isMobile) {
      const adLowerStack = document.createElement("div");
      adLowerStack.id = "admate-preroll-lower-stack";
      adLowerStack.setAttribute("data-injected", "admate-youtube-preroll");
      adLowerStack.style.cssText = [
        "position: absolute",
        "left: 16px",
        "bottom: 54px",
        "z-index: 20",
        "display: flex",
        "flex-direction: column",
        "align-items: flex-start",
        "justify-content: flex-end",
        "gap: 8px",
        "margin: 0",
        "padding: 0",
        "pointer-events: none",
      ].join(" !important;") + " !important";

      const ctaCard = document.createElement("div");
      ctaCard.id = "admate-preroll-sponsored-card";
      ctaCard.setAttribute("data-injected", "admate-youtube-preroll");
      ctaCard.style.cssText = [
        "position: relative",
        "display: flex",
        "align-items: center",
        "background: rgba(0,0,0,0.78)",
        "border: 1px solid rgba(255,255,255,0.12)",
        "border-radius: 8px",
        "padding: 8px 12px",
        "max-width: min(520px, calc(100vw - 560px))",
        "min-width: 300px",
        "box-shadow: 0 4px 18px rgba(0,0,0,0.32)",
        "z-index: 10",
        "overflow: hidden",
        "cursor: pointer",
        "pointer-events: auto",
        "flex-shrink: 0",
      ].join(" !important;") + " !important";

      if (avatarImgUrl) {
        const ctaIcon = document.createElement("img");
        ctaIcon.src = avatarImgUrl;
        ctaIcon.style.cssText =
          "width:38px !important;height:38px !important;border-radius:50% !important;object-fit:cover !important;flex-shrink:0 !important;margin-right:12px !important";
        ctaCard.appendChild(ctaIcon);
      } else {
        const ctaIconFallback = document.createElement("div");
        ctaIconFallback.style.cssText =
          "width:38px !important;height:38px !important;border-radius:50% !important;background:#555 !important;display:flex;align-items:center;justify-content:center;flex-shrink:0 !important;margin-right:12px !important;color:#fff;font-size:20px;";
        ctaIconFallback.textContent = titleText.charAt(0) || "선";
        ctaCard.appendChild(ctaIconFallback);
      }

      const ctaTextDiv = document.createElement("div");
      ctaTextDiv.style.cssText = "flex:1;min-width:0;margin-right:12px";
      ctaTextDiv.innerHTML = [
        '<div style="font-size:14px;font-weight:600;color:#fff;font-family:&quot;YouTube Noto&quot;,Roboto,Arial,Helvetica,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:20px;letter-spacing:normal;word-break:keep-all">' +
          titleText +
          "</div>",
        '<div style="font-size:12px;color:rgba(255,255,255,0.7);font-family:&quot;YouTube Noto&quot;,Roboto,Arial,Helvetica,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px;line-height:16px;letter-spacing:normal">' +
          "스폰서 · " +
          sponsorDomainText +
          "</div>",
      ].join("");
      ctaCard.appendChild(ctaTextDiv);

      if (enableCtaText) {
        const ctaBtn = document.createElement("div");
        ctaBtn.style.cssText =
          "background:#f1f1f1;color:rgb(15,15,15);font-size:14px;font-weight:500;line-height:36px;letter-spacing:normal;font-family:Roboto,Arial,sans-serif;padding:0 16px;border-radius:18px;height:36px;white-space:nowrap;cursor:pointer;flex-shrink:0;display:inline-flex;align-items:center";
        ctaBtn.textContent = ctaBtnText;
        ctaCard.appendChild(ctaBtn);
      }

      const sponsorText = document.createElement("div");
      sponsorText.id = "admate-preroll-sponsor";
      sponsorText.setAttribute("data-injected", "admate-youtube-preroll");
      sponsorText.style.cssText = [
        "position: relative",
        "display: flex",
        "align-items: center",
        "margin: 0",
        "padding: 0",
        "font-size: 13px",
        "font-weight: 700",
        "color: #ffffff",
        "filter: drop-shadow(0px 1px 2px rgba(0,0,0,0.75))",
        "-webkit-font-smoothing: antialiased",
        'font-family: "YouTube Noto", "Noto Sans KR", "Malgun Gothic", Roboto, Arial, sans-serif',
        "pointer-events: auto",
        "flex-shrink: 0",
        "box-sizing: border-box",
      ].join(" !important;") + " !important";
      sponsorText.innerHTML = [
        '<span style="margin-right:6px">스폰서</span>',
        '<svg width="13" height="13" viewBox="0 0 13 13" fill="none" xmlns="http://www.w3.org/2000/svg" style="margin-right:10px; flex-shrink: 0;"><circle cx="6.5" cy="6.5" r="5.5" stroke="white" stroke-width="1.2"/><rect x="5.9" y="3.3" width="1.2" height="1.2" fill="white"/><rect x="5.9" y="5.7" width="1.2" height="4.2" fill="white"/></svg>',
        '<span style="display:inline-block;max-width:280px;font-weight:500;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;vertical-align:bottom;">' +
          sponsorDomainText +
          "</span>",
      ].join("");
      adLowerStack.appendChild(ctaCard);
      adLowerStack.appendChild(sponsorText);
      overlay.appendChild(adLowerStack);

      const timerBg = document.createElement("div");
      timerBg.style.cssText =
        "position:absolute;bottom:0;left:0;width:100%;height:3px;background:rgba(255,255,255,0.15);z-index:10;border-radius:0 0 12px 12px";
      overlay.appendChild(timerBg);
      const timerBar = document.createElement("div");
      const barRadius2 = progressFillPct >= 99.5 ? "0 0 12px 12px" : "0 0 0 12px";
      timerBar.style.cssText =
        "position:absolute;bottom:0;left:0;width:" +
        progressFillPct +
        "%;height:3px;background:#f2bc42;z-index:11;border-radius:" +
        barRadius2;
      overlay.appendChild(timerBar);
    }

    document.body.appendChild(overlay);

    if (isMobile) {
      const mobileBar = document.createElement("div");
      mobileBar.id = "admate-mobile-preroll-cta-bar";
      mobileBar.setAttribute("data-injected", "admate-youtube-preroll");
      const topPx = Math.round(py + ph);
      mobileBar.style.cssText = [
        "position:fixed",
        "left:0",
        "top:" + topPx + "px",
        "width:100%",
        "box-sizing:border-box",
        "display:flex",
        "align-items:center",
        "justify-content:space-between",
        "background:#0f0f0f",
        "padding:12px 16px",
        "border-bottom:1px solid rgba(255,255,255,0.1)",
        "z-index:2147483646",
      ].join(";");

      const leftWrap = document.createElement("div");
      leftWrap.style.cssText =
        "display:flex;align-items:center;flex:1;min-width:0;margin-right:8px;";
      if (avatarImgUrl) {
        const av = document.createElement("img");
        av.src = avatarImgUrl;
        av.alt = "";
        av.style.cssText =
          "width:36px;height:36px;border-radius:50%;object-fit:cover;margin-right:12px;flex-shrink:0;";
        leftWrap.appendChild(av);
      } else {
        const phAv = document.createElement("div");
        phAv.style.cssText =
          "width:36px;height:36px;border-radius:50%;background:#555;margin-right:12px;flex-shrink:0;";
        leftWrap.appendChild(phAv);
      }
      const textCol = document.createElement("div");
      textCol.style.cssText = "display:flex;flex-direction:column;min-width:0;";
      const titleEl = document.createElement("div");
      titleEl.style.cssText =
        "color:#fff;font-size:14px;font-weight:500;line-height:1.35;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;font-family:Roboto,Arial,sans-serif;";
      titleEl.innerHTML = titleText;
      const subEl = document.createElement("div");
      subEl.style.cssText =
        "color:#aaa;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:Roboto,Arial,sans-serif;margin-top:2px;";
      subEl.textContent = "스폰서 · " + domainText;
      textCol.appendChild(titleEl);
      textCol.appendChild(subEl);
      leftWrap.appendChild(textCol);

      const rightWrap = document.createElement("div");
      rightWrap.style.cssText = "display:flex;align-items:center;flex-shrink:0;";
      const dots = document.createElement("div");
      dots.style.cssText =
        "cursor:pointer;padding:0 8px;" + (enableCtaText ? "margin-right:4px;" : "margin-right:0;");
      dots.innerHTML =
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>';
      rightWrap.appendChild(dots);
      if (enableCtaText) {
        const ctaPill = document.createElement("div");
        ctaPill.style.cssText =
          "background:#f1f1f1;color:#0f0f0f;font-size:14px;font-weight:500;padding:8px 16px;border-radius:18px;white-space:nowrap;font-family:Roboto,Arial,sans-serif;";
        ctaPill.textContent = ctaBtnText;
        rightWrap.appendChild(ctaPill);
      }

      mobileBar.appendChild(leftWrap);
      mobileBar.appendChild(rightWrap);
      document.body.appendChild(mobileBar);
    }

    // 스킵 가능: PC는 뷰포트 기준 고정, 모바일은 플레이어 오버레이 기준 우하단(노란 진행바 위)
    if (showSkipButton) {
      const skipBtn = document.createElement("div");
      skipBtn.id = "admate-skip-btn";
      skipBtn.className = "admate-ytp-skip-ad-button";
      skipBtn.setAttribute("data-injected", "admate-youtube-preroll");

      const skipText = document.createElement("div");
      skipText.className = "admate-ytp-skip-ad-button__text";
      const skipIcon = document.createElement("span");
      skipIcon.className = "admate-ytp-skip-ad-button__icon";

      if (isMobile) {
        // 모바일 건너뛰기 — .ytp-ad-skip-button-modern (유튜브 실측 CSS)
        skipBtn.className = "admate-ytp-skip-ad-button admate-ytp-ad-skip-button-modern";
        skipBtn.style.cssText = [
          "position: absolute",
          "right: 11px",
          "bottom: 12px",
          "left: auto",
          "top: auto",
          "transform: none",
          "box-sizing: content-box",
          "background: rgba(0,0,0,0.6)",
          "color: #fff",
          "direction: ltr",
          "height: 36px",
          "min-height: 36px",
          "padding: 0 6px 0 16px",
          "width: auto",
          "min-width: 0",
          "margin: 0",
          "border-radius: 18px",
          "border: none",
          "cursor: pointer",
          "display: flex",
          "flex-direction: row",
          "align-items: center",
          "justify-content: center",
          "gap: 6px",
          "z-index: 15",
          'font-family: Roboto, Arial, "Noto Sans KR", sans-serif',
          "font-size: 14px",
          "font-weight: 500",
          "line-height: normal",
          "letter-spacing: 0",
          "text-align: center",
          "pointer-events: auto",
        ].join(" !important;") + " !important";
        skipText.textContent = "건너뛰기";
        skipText.style.cssText = [
          "display: inline-block !important",
          "color: inherit !important",
          "font-size: inherit !important",
          "font-weight: inherit !important",
          "line-height: normal !important",
          "font-family: inherit !important",
          "white-space: nowrap !important",
        ].join(";");
        skipIcon.style.cssText =
          "display:inline-block !important;vertical-align:middle;line-height:0 !important;flex-shrink:0 !important";
        skipIcon.innerHTML =
          '<svg fill="none" height="20" viewBox="0 0 24 24" width="20" xmlns="http://www.w3.org/2000/svg" focusable="false" aria-hidden="true"><path d="M20 20C20.26 20 20.51 19.89 20.70 19.70C20.89 19.51 21 19.26 21 19V5C21 4.73 20.89 4.48 20.70 4.29C20.51 4.10 20.26 4 20 4C19.73 4 19.48 4.10 19.29 4.29C19.10 4.48 19 4.73 19 5V19C19 19.26 19.10 19.51 19.29 19.70C19.48 19.89 19.73 20 20 20ZM5.04 19.77L18 12L5.04 4.22C4.84 4.10 4.60 4.03 4.36 4.03C4.12 4.03 3.89 4.09 3.68 4.21C3.47 4.32 3.30 4.49 3.18 4.70C3.06 4.91 2.99 5.14 3 5.38V18.61C2.99 18.85 3.06 19.08 3.18 19.29C3.30 19.50 3.47 19.67 3.68 19.79C3.89 19.90 4.12 19.96 4.36 19.96C4.60 19.96 4.84 19.89 5.04 19.77Z" fill="white"/></svg>';
        skipBtn.appendChild(skipText);
        skipBtn.appendChild(skipIcon);
        overlay.appendChild(skipBtn);
      } else {
        skipBtn.style.cssText = [
          "position: absolute",
          "right: 16px",
          "bottom: 54px",
          "box-sizing: border-box",
          "background: rgba(28,28,28,0.8)",
          "color: #fff",
          "padding: 8px 16px",
          "min-height: 36px",
          "border-radius: 18px",
          "border: none",
          "cursor: pointer",
          "display: flex",
          "align-items: center",
          "flex-direction: row",
          "gap: 12px",
          "z-index: 30",
          "letter-spacing: 0",
          "backdrop-filter: blur(4px)",
        ].join(" !important;") + " !important";
        skipText.textContent = "건너뛰기";
        skipText.style.cssText =
          "color:#fff !important;font-size:15px !important;font-weight:500 !important;line-height:1 !important;font-family:'Noto Sans KR','Roboto',Arial,Helvetica,sans-serif !important;display:flex !important;align-items:center !important";
        skipIcon.style.cssText =
          "display:inline-flex !important;align-items:center !important;justify-content:center !important;line-height:0 !important;flex-shrink:0 !important";
        skipIcon.innerHTML =
          '<svg fill="none" height="24" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg" focusable="false" aria-hidden="true"><path d="M20 20C20.26 20 20.51 19.89 20.70 19.70C20.89 19.51 21 19.26 21 19V5C21 4.73 20.89 4.48 20.70 4.29C20.51 4.10 20.26 4 20 4C19.73 4 19.48 4.10 19.29 4.29C19.10 4.48 19 4.73 19 5V19C19 19.26 19.10 19.51 19.29 19.70C19.48 19.89 19.73 20 20 20ZM5.04 19.77L18 12L5.04 4.22C4.84 4.10 4.60 4.03 4.36 4.03C4.12 4.03 3.89 4.09 3.68 4.21C3.47 4.32 3.30 4.49 3.18 4.70C3.06 4.91 2.99 5.14 3 5.38V18.61C2.99 18.85 3.06 19.08 3.18 19.29C3.30 19.50 3.47 19.67 3.68 19.79C3.89 19.90 4.12 19.96 4.36 19.96C4.60 19.96 4.84 19.89 5.04 19.77Z" fill="white"/></svg>';
        skipBtn.appendChild(skipText);
        skipBtn.appendChild(skipIcon);
        overlay.appendChild(skipBtn);
      }
    }

    console.log(
      "[YouTube Inject] ✅ 프리롤 인젝션 성공 (" +
        Math.round(pw) +
        "x" +
        Math.round(ph) +
        (isMobile ? ", mobile" : "") +
        ")"
    );
    return true;
  } catch (err) {
    console.error("[YouTube Inject] ❌ 프리롤 인젝션 에러:", err);
    return false;
  }
}

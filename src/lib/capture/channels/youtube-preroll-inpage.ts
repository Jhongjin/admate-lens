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
  /** Node에서 측정한 플레이어 박스(인페이지 재탐색과 불일치 시 흰 영역·찢어짐 방지) */
  serverPlayerBox?: { left: number; top: number; width: number; height: number };
}

export function runPrerollInjectInPage(...args: unknown[]): boolean {
  const p = args[0] as PrerollInjectPagePayload;
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

    if (srv && srv.width > 80 && srv.height > 80) {
      px = srv.left;
      py = srv.top;
      pw = srv.width;
      ph = srv.height;
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
        .forEach((el) => ((el as HTMLElement).style.display = "none"));
      document
        .querySelectorAll(
          "ytm-popup-container, tp-yt-paper-dialog, ytm-confirm-dialog-renderer, ytm-single-option-survey-renderer"
        )
        .forEach((el) => el.remove());

      const adLabel = document.createElement("div");
      adLabel.style.cssText =
        "position:absolute;bottom:10px;left:10px;color:rgba(255,255,255,0.8);font-size:12px;font-family:Roboto,Arial,sans-serif;font-weight:500;z-index:10;display:flex;align-items:center;gap:4px;";
      adLabel.innerHTML =
        '스폰서 <svg width="12" height="12" viewBox="0 0 16 16" fill="white"><path d="M8 15A7 7 0 1 0 8 1a7 7 0 0 0 0 14zm0 1A8 8 0 1 1 8 0a8 8 0 0 1 0 16z"/><path d="M8.93 6.588l-2.29.287-.082.38.45.083c.294.07.352.176.288.469l-.738 3.468c-.194.897.105 1.319.808 1.319.545 0 1.178-.252 1.465-.598l.088-.416c-.2.176-.492.246-.686.246-.275 0-.375-.193-.304-.533L8.93 6.588zM9 4.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0z"/></svg>';
      overlay.appendChild(adLabel);

      const visitLabel = document.createElement("div");
      visitLabel.style.cssText =
        "position:absolute;top:10px;right:10px;color:rgba(255,255,255,0.9);font-size:12px;font-family:Roboto,Arial,sans-serif;font-weight:500;z-index:10;display:flex;align-items:center;gap:4px;text-shadow:0 1px 2px rgba(0,0,0,0.5);";
      visitLabel.innerHTML =
        '광고주 페이지 방문 <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><path d="M19 19H5V5h7V3H5a2 2 0 00-2 2v14a2 2 0 002 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>';
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
        "bottom: 16px",
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
      ctaCard.style.cssText = [
        "position: relative",
        "display: flex",
        "align-items: center",
        "background: rgba(0,0,0,0.65)",
        "border-radius: 8px",
        "padding: 8px 12px",
        "max-width: 100%",
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
        '<div style="font-size:14px;font-weight:500;color:#fff;font-family:&quot;YouTube Noto&quot;,Roboto,Arial,Helvetica,sans-serif;white-space:nowrap;line-height:20px;letter-spacing:normal;word-break:keep-all">' +
          titleText +
          "</div>",
        '<div style="font-size:12px;color:rgba(255,255,255,0.7);font-family:&quot;YouTube Noto&quot;,Roboto,Arial,Helvetica,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px;line-height:16px;letter-spacing:normal">' +
          domainText +
          "</div>",
      ].join("");
      ctaCard.appendChild(ctaTextDiv);

      const ctaBtn = document.createElement("div");
      ctaBtn.style.cssText =
        "background:#f1f1f1;color:rgb(15,15,15);font-size:14px;font-weight:500;line-height:36px;letter-spacing:normal;font-family:Roboto,Arial,sans-serif;padding:0 16px;border-radius:18px;height:36px;white-space:nowrap;cursor:pointer;flex-shrink:0;display:inline-flex;align-items:center";
      ctaBtn.textContent = ctaBtnText;
      ctaCard.appendChild(ctaBtn);

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
      if (enableCtaText) {
        adLowerStack.appendChild(ctaCard);
      }
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
      dots.style.cssText = "cursor:pointer;padding:0 8px;margin-right:4px;";
      dots.innerHTML =
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="#fff"><path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/></svg>';
      const ctaPill = document.createElement("div");
      ctaPill.style.cssText =
        "background:#f1f1f1;color:#0f0f0f;font-size:14px;font-weight:500;padding:8px 16px;border-radius:18px;white-space:nowrap;font-family:Roboto,Arial,sans-serif;";
      ctaPill.textContent = ctaBtnText;
      rightWrap.appendChild(dots);
      rightWrap.appendChild(ctaPill);

      mobileBar.appendChild(leftWrap);
      mobileBar.appendChild(rightWrap);
      document.body.appendChild(mobileBar);
    }

    if (!isMobile) {
      const skipTop = py + ph - 90;
      const skipBtn = document.createElement("div");
      skipBtn.id = "admate-skip-btn";
      skipBtn.className = "admate-ytp-skip-ad-button";
      skipBtn.setAttribute("data-injected", "admate-youtube-preroll");
      skipBtn.style.cssText = [
        "position: fixed",
        "top: " + skipTop + "px",
        "left: " + (px + pw - 24) + "px",
        "transform: translateX(-100%)",
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
        "z-index: 2147483647",
        "letter-spacing: 0",
        "backdrop-filter: blur(4px)",
      ].join(" !important;") + " !important";

      const skipText = document.createElement("div");
      skipText.className = "admate-ytp-skip-ad-button__text";
      skipText.style.cssText =
        "color:#fff !important;font-size:15px !important;font-weight:500 !important;line-height:1 !important;font-family:'Noto Sans KR','Roboto',Arial,Helvetica,sans-serif !important;display:flex !important;align-items:center !important";
      skipText.textContent = "건너뛰기";
      const skipIcon = document.createElement("span");
      skipIcon.className = "admate-ytp-skip-ad-button__icon";
      skipIcon.style.cssText =
        "display:inline-flex !important;align-items:center !important;justify-content:center !important;line-height:0 !important;flex-shrink:0 !important";
      skipIcon.innerHTML =
        '<svg fill="none" height="24" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg" focusable="false" aria-hidden="true"><path d="M20 20C20.26 20 20.51 19.89 20.70 19.70C20.89 19.51 21 19.26 21 19V5C21 4.73 20.89 4.48 20.70 4.29C20.51 4.10 20.26 4 20 4C19.73 4 19.48 4.10 19.29 4.29C19.10 4.48 19 4.73 19 5V19C19 19.26 19.10 19.51 19.29 19.70C19.48 19.89 19.73 20 20 20ZM5.04 19.77L18 12L5.04 4.22C4.84 4.10 4.60 4.03 4.36 4.03C4.12 4.03 3.89 4.09 3.68 4.21C3.47 4.32 3.30 4.49 3.18 4.70C3.06 4.91 2.99 5.14 3 5.38V18.61C2.99 18.85 3.06 19.08 3.18 19.29C3.30 19.50 3.47 19.67 3.68 19.79C3.89 19.90 4.12 19.96 4.36 19.96C4.60 19.96 4.84 19.89 5.04 19.77Z" fill="white"/></svg>';
      skipBtn.appendChild(skipText);
      skipBtn.appendChild(skipIcon);
      document.body.appendChild(skipBtn);
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

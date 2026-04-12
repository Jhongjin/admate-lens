/**
 * Creative Injector v3 — 탐지된 광고 슬롯에 소재 이미지를 강제 삽입
 *
 * 전략:
 * - 일반 요소: innerHTML 교체 후 img 삽입
 * - iframe 요소: 부모에서 iframe을 div+img로 완전 대체 (replaceWith)
 * - 폴백: 위치 기반 절대 좌표 오버레이
 * - data: URL 사용으로 CSP 우회
 * - 이미지 로드 완료 대기
 */

import type { IPageHandle } from "../engine/browser-engine";
import type { DetectedSlot } from "./ad-slot-detector";

export interface InjectionOptions {
  /** 소재 이미지 URL (또는 data: URL) */
  creativeUrl: string;
  /** 슬롯에 맞게 이미지 리사이즈 여부 */
  fitToSlot?: boolean;
  /** 방해요소(쿠키 배너, 팝업 등) 제거 여부 */
  removeObstructions?: boolean;
  /** 업로드 소재 원본 크기 (비율 기반 fit 판단용) */
  creativeDimensions?: { width: number; height: number };
  /** 슬롯 내 소재 표시: contain(여백 가능) | cover(크롭 가능) */
  objectFit?: "contain" | "cover";
}

/** 인젝션 결과 상세 */
export interface InjectionResult {
  success: boolean;
  method: "replace-content" | "replace-iframe" | "overlay" | "none";
  error?: string;
}

/**
 * 탐지된 슬롯에 소재 이미지를 인젝션합니다.
 * 여러 전략을 순차 시도합니다.
 */
export async function injectCreative(
  page: IPageHandle,
  slot: DetectedSlot,
  options: InjectionOptions
): Promise<InjectionResult> {
  const { creativeUrl, fitToSlot = true, removeObstructions = true, creativeDimensions } = options;
  const objectFitMode: "contain" | "cover" = options.objectFit === "cover" ? "cover" : "contain";

  if (removeObstructions) {
    await removePageObstructions(page);
  }

  // 인젝션 실행 — 요소 유형에 따라 전략 선택
  const result = await page.evaluate<InjectionResult>(
    `
    (async () => {
      const selector = ${JSON.stringify(slot.selector)};
      const imgUrl = ${JSON.stringify(creativeUrl)};
      const slotW = ${slot.width};
      const slotH = ${slot.height};
      const slotX = ${slot.x};
      const slotY = ${slot.y};
      const fit = ${fitToSlot};
      const tagName = ${JSON.stringify(slot.tagName)};
      const objectFitMode = ${JSON.stringify(objectFitMode)};

      console.log('[Injector] 인젝션 시도:', selector, tagName, slotW + 'x' + slotH);

      document.querySelectorAll('[data-admate-scroll-anchor="1"]').forEach(function (n) {
        n.removeAttribute('data-admate-scroll-anchor');
      });
      function markInjectScrollTarget(el) {
        if (el && el.setAttribute) el.setAttribute('data-admate-scroll-anchor', '1');
      }

      // 헬퍼: 이미지 엘리먼트 생성
      function createImgElement() {
        const img = document.createElement('img');
        img.src = imgUrl;
        img.crossOrigin = 'anonymous';
        img.setAttribute('data-injected', 'admate');
        img.style.cssText = [
          'display: block !important',
          fit ? 'width: 100% !important' : '',
          fit ? 'height: 100% !important' : '',
          'object-fit: ' + objectFitMode + ' !important',
          'object-position: center center !important',
          'background: transparent !important',
          'border: none !important',
          'margin: 0 !important',
          'padding: 0 !important',
          'max-width: none !important',
          'max-height: none !important',
          'opacity: 1 !important',
          'visibility: visible !important',
        ].filter(Boolean).join('; ');
        return img;
      }

      // 헬퍼: 컨테이너 래퍼 생성
      function createWrapper(useFixedSlotSize = false) {
        const wrapper = document.createElement('div');
        wrapper.setAttribute('data-injected', 'admate-wrapper');
        wrapper.style.cssText = [
          'overflow: hidden !important',
          'background: transparent !important',
          'border: none !important',
          'display: block !important',
          'visibility: visible !important',
          'opacity: 1 !important',
          'position: relative !important',
          'z-index: 10 !important',
          fit ? (useFixedSlotSize ? ('width: ' + slotW + 'px !important') : 'width: 100% !important') : '',
          fit ? (useFixedSlotSize ? ('height: ' + slotH + 'px !important') : 'height: 100% !important') : '',
          fit ? (useFixedSlotSize ? ('min-height: ' + slotH + 'px !important') : 'min-height: 100% !important') : '',
        ].filter(Boolean).join('; ');
        return wrapper;
      }

      // object-fit:contain + 레터박스일 때 배지를 '그려진 소재' 우상단에 붙임 (래퍼 모서리가 아님)
      function syncBadgeToCreativeCorner(host, img) {
        const badge = host.querySelector(':scope > [data-injected="admate-badge"]');
        if (!badge || !img || img.tagName !== 'IMG') return;
        const nw = img.naturalWidth, nh = img.naturalHeight;
        if (!nw || !nh) return;

        const fit = (getComputedStyle(img).objectFit || 'fill').toLowerCase();
        const edge = 4;
        if (fit !== 'contain') {
          badge.style.setProperty('top', '1px', 'important');
          badge.style.setProperty('right', edge + 'px', 'important');
          badge.style.setProperty('left', 'auto', 'important');
          badge.style.setProperty('bottom', 'auto', 'important');
          return;
        }

        const W = img.clientWidth, H = img.clientHeight;
        if (!W || !H) return;

        const scale = Math.min(W / nw, H / nh);
        const dw = nw * scale, dh = nh * scale;

        const op = (getComputedStyle(img).objectPosition || '50% 50%').trim().split(/\\s+/);
        const px = op[0] || '50%';
        const py = op[1] || op[0] || '50%';

        function align(pos, gap) {
          if (pos === 'left' || pos === 'top') return 0;
          if (pos === 'right' || pos === 'bottom') return Math.max(0, gap);
          if (pos === 'center') return gap / 2;
          if (pos.endsWith('%')) return gap * ((parseFloat(pos) || 50) / 100);
          return gap / 2;
        }

        const ox = align(px, W - dw);
        const oy = align(py, H - dh);

        const hr = host.getBoundingClientRect();
        const ir = img.getBoundingClientRect();
        const sx = ir.width / W || 1;
        const sy = ir.height / H || 1;
        const fitLeft = ir.left + ox * sx;
        const fitTop = ir.top + oy * sy;
        const fitW = dw * sx;

        const bw = badge.offsetWidth || 40;
        const left = fitLeft + fitW - bw - edge - hr.left;
        const top = fitTop + 1 - hr.top;

        badge.style.setProperty('top', top + 'px', 'important');
        badge.style.setProperty('left', left + 'px', 'important');
        badge.style.setProperty('right', 'auto', 'important');
        badge.style.setProperty('bottom', 'auto', 'important');
      }

      // AdChoices: Google AdChoices DOM — 우상단, 광고 박스에 더 붙이기 위해 right 소량(4px)
      function addAdBadge(container) {
        const uid = 'spr_' + Math.random().toString(16).slice(2);

        const badge = document.createElement('div');
        badge.setAttribute('data-injected', 'admate-badge');
        badge.setAttribute('aria-hidden', 'true');
        badge.setAttribute('dir', 'ltr');
        badge.className = 'abgc';
        badge.style.cssText = [
          'display: block !important',
          'height: 15px !important',
          'position: absolute !important',
          'right: 4px !important',
          'top: 1px !important',
          'text-rendering: geometricPrecision !important',
          'z-index: 2147483646 !important',
          'cursor: pointer !important',
          'padding: 0 !important',
          'margin: 0 !important',
          'border: none !important',
          'pointer-events: none !important',
          'user-select: none !important',
        ].join('; ');

        const ilWrap = document.createElement('span');
        ilWrap.className = 'il-wrap';
        ilWrap.setAttribute('data-injected', 'admate-badge-row');
        ilWrap.style.cssText = [
          'background-color: #ffffff !important',
          'height: 15px !important',
          'white-space: nowrap !important',
          'display: inline-flex !important',
          'align-items: center !important',
          'vertical-align: top !important',
          'padding: 0 !important',
          'margin: 0 !important',
          'gap: 2px !important',
        ].join('; ');

        const hidden = document.createElement('input');
        hidden.id = uid;
        hidden.type = 'checkbox';
        hidden.style.cssText = 'display:none !important';
        hidden.setAttribute('tabindex', '-1');

        const cellCss =
          'display:inline-flex !important;align-items:center !important;justify-content:center !important;' +
          'width:15px !important;height:15px !important;min-width:15px !important;min-height:15px !important;' +
          'padding:0 !important;margin:0 !important;line-height:0 !important;box-sizing:border-box !important;' +
          'background:#ffffff !important;background-color:#ffffff !important;border-radius:0 !important;' +
          'box-shadow:none !important;border:none !important;';

        const cellInfo = document.createElement('span');
        cellInfo.setAttribute('data-injected', 'admate-adchoices-cell');
        cellInfo.style.cssText = cellCss;

        const ilIconInfo = document.createElement('div');
        ilIconInfo.className = 'il-icon';
        ilIconInfo.style.cssText =
          'line-height:0 !important;display:inline-block !important;height:15px !important;width:auto !important;vertical-align:top !important;';
        ilIconInfo.innerHTML =
          '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 15 15" width="15" height="15">' +
            '<path fill="#00aecd" d="M7.5 1.5a6 6 0 100 12 6 6 0 100-12m0 1a5 5 0 110 10 5 5 0 110-10zM6.625 11h1.75V6.5h-1.75zM7.5 3.75a1 1 0 100 2 1 1 0 100-2z"></path>' +
          '</svg>';
        cellInfo.appendChild(ilIconInfo);

        const cbb = document.createElement('label');
        cbb.className = 'cbb';
        cbb.setAttribute('for', uid);
        cbb.id = uid + '_lbl';
        cbb.style.cssText = [
          'cursor: pointer !important',
          'height: 15px !important',
          'width: 15px !important',
          'z-index: 2147483646 !important',
          'background-color: #ffffff !important',
          'display: inline-flex !important',
          'position: relative !important',
          'padding: 0 !important',
          'margin: 0 !important',
          'line-height: 0 !important',
        ].join('; ');

        const ilIconMenu = document.createElement('div');
        ilIconMenu.className = 'il-icon';
        ilIconMenu.style.cssText =
          'line-height:0 !important;display:inline-block !important;height:15px !important;width:15px !important;vertical-align:top !important;position:relative !important;';
        ilIconMenu.innerHTML =
          '<svg fill="none" height="15" viewBox="0 0 15 15" width="15" xmlns="http://www.w3.org/2000/svg" ' +
            'style="position:absolute !important;top:0 !important;right:0 !important;height:15px !important;width:15px !important;">' +
            '<circle cx="7.5" cy="3.5" fill="#00aecd" r="1.5"></circle>' +
            '<circle cx="7.5" cy="7.5" fill="#00aecd" r="1.5"></circle>' +
            '<circle cx="7.5" cy="11.5" fill="#00aecd" r="1.5"></circle>' +
          '</svg>';
        cbb.appendChild(ilIconMenu);

        ilWrap.appendChild(cellInfo);
        ilWrap.appendChild(cbb);
        badge.appendChild(ilWrap);
        badge.appendChild(hidden);

        container.appendChild(badge);
      }

      // 이미지 로드 대기 함수
      function waitForImageLoad(img, timeoutMs = 8000) {
        return new Promise((resolve) => {
          if (img.complete && img.naturalWidth > 0) {
            resolve(true);
            return;
          }
          const timer = setTimeout(() => resolve(false), timeoutMs);
          img.onload = () => { clearTimeout(timer); resolve(true); };
          img.onerror = () => { clearTimeout(timer); resolve(false); };
        });
      }

      // selector가 비어있으면 querySelector에서 바로 SyntaxError가 나므로 선제 처리
      if (!selector || !selector.trim()) {
        console.warn('[Injector] 빈 selector 감지 — 위치 기반 오버레이 폴백');
        const overlay = createWrapper();
        overlay.style.position = 'absolute !important';
        overlay.style.left = slotX + 'px';
        overlay.style.top = slotY + 'px';
        overlay.style.zIndex = '99999';
        const img = createImgElement();
        overlay.appendChild(img);
        addAdBadge(overlay);
        document.body.appendChild(overlay);
        markInjectScrollTarget(overlay);
        await waitForImageLoad(img);
        syncBadgeToCreativeCorner(overlay, img);
        return { success: true, method: 'overlay', error: 'empty-selector-fallback' };
      }

      const el = document.querySelector(selector);
      if (!el) {
        console.warn('[Injector] 슬롯을 찾을 수 없음:', selector);

        // 폴백: 위치 기반 오버레이
        console.log('[Injector] 위치 기반 오버레이 폴백 시도');
        const overlay = createWrapper();
        overlay.style.position = 'absolute !important';
        overlay.style.left = slotX + 'px';
        overlay.style.top = slotY + 'px';
        overlay.style.zIndex = '99999';
        const img = createImgElement();
        overlay.appendChild(img);
        addAdBadge(overlay);
        document.body.appendChild(overlay);
        markInjectScrollTarget(overlay);

        await waitForImageLoad(img);
        syncBadgeToCreativeCorner(overlay, img);
        return { success: true, method: 'overlay', error: undefined };
      }

      // 전략 1: iframe → replaceWith
      if (tagName === 'iframe') {
        console.log('[Injector] iframe 대체 전략 사용');
        try {
          const wrapper = createWrapper(true);
          const img = createImgElement();
          wrapper.appendChild(img);
          addAdBadge(wrapper);

          el.replaceWith(wrapper);
          markInjectScrollTarget(wrapper);
          await waitForImageLoad(img);
          syncBadgeToCreativeCorner(wrapper, img);
          console.log('[Injector] iframe 대체 성공');
          return { success: true, method: 'replace-iframe', error: undefined };
        } catch (err) {
          console.error('[Injector] iframe 대체 실패:', err.message);
          // 폴백: 오버레이
          const overlay = createWrapper();
          overlay.style.position = 'absolute !important';
          overlay.style.left = slotX + 'px';
          overlay.style.top = slotY + 'px';
          overlay.style.zIndex = '99999';
          const img2 = createImgElement();
          overlay.appendChild(img2);
          addAdBadge(overlay);
          document.body.appendChild(overlay);
          markInjectScrollTarget(overlay);
          await waitForImageLoad(img2);
          syncBadgeToCreativeCorner(overlay, img2);
          return { success: true, method: 'overlay', error: err.message };
        }
      }

      // 전략 2: 일반 요소 → 내용 교체
      // width/height 100%만 주면 부모(메인 컬럼 등)가 늘어나며 뷰포트 전체를 덮는 사이트가 있음 → 탐지된 슬롯 픽셀로 고정
      console.log('[Injector] 내용 교체 전략 사용');
      try {
        // 슬롯 내용 비우기
        el.innerHTML = '';

        // 슬롯 스타일 강제 오버라이드
        el.style.cssText += ';' + [
          'overflow: hidden !important',
          'background: transparent !important',
          'border: none !important',
          'display: block !important',
          'visibility: visible !important',
          'opacity: 1 !important',
          'position: relative !important',
          'z-index: 10 !important',
          'box-sizing: border-box !important',
          fit ? ('width: ' + Math.max(1, Math.round(slotW)) + 'px !important') : '',
          fit ? ('height: ' + Math.max(1, Math.round(slotH)) + 'px !important') : '',
          fit ? ('max-width: ' + Math.max(1, Math.round(slotW)) + 'px !important') : '',
          fit ? ('max-height: ' + Math.max(1, Math.round(slotH)) + 'px !important') : '',
          'min-height: 0 !important',
        ].filter(Boolean).join('; ');

        const img = createImgElement();
        el.appendChild(img);
        addAdBadge(el);
        markInjectScrollTarget(el);

        await waitForImageLoad(img);
        syncBadgeToCreativeCorner(el, img);
        console.log('[Injector] 내용 교체 성공');
        return { success: true, method: 'replace-content', error: undefined };
      } catch (err) {
        console.error('[Injector] 내용 교체 실패:', err.message);
        return { success: false, method: 'none', error: err.message };
      }
    })()
  `
  );

  console.log(`[Injector] 결과: method=${result.method}, success=${result.success}${result.error ? ', error=' + result.error : ''}`);
  return result;
}

/**
 * 페이지 방해요소 제거 (v3 — 안전 모드)
 * 
 * v3 핵심 변경:
 * - remove() 대신 display:none으로 숨김 (레이아웃 붕괴 방지)
 * - 레이아웃 필수 요소(header, nav, main, article, section, footer) 보호
 * - 광고 슬롯/인젝션 요소 보호
 * - z-index 기준 대폭 상향 (100→9999) — 네비게이션 보존
 * - body.position 변경 제거 — 레이아웃 유지
 */
export async function removePageObstructions(page: IPageHandle): Promise<void> {
  await page.evaluate<void>(`
    (() => {
      let hiddenCount = 0;

      // 🔑 보호 대상 판별 함수: 레이아웃 필수 요소는 절대 건드리지 않음
      function isProtected(el) {
        // 1) 광고/인젝션 요소 보호
        if (el.classList?.contains('adsbygoogle') ||
            el.id?.includes('google_ads') ||
            el.id?.includes('ad-slot') ||
            el.id?.includes('ad_') ||
            el.id?.includes('div-gpt-ad') ||
            el.getAttribute('data-ad-slot') ||
            el.getAttribute('data-injected') ||
            el.getAttribute('data-google-query-id') ||
            el.tagName?.toLowerCase() === 'ins') {
          return true;
        }

        // 2) 레이아웃 필수 태그 보호
        const tag = el.tagName?.toLowerCase() || '';
        if (['header', 'nav', 'main', 'article', 'section', 'footer', 'aside'].includes(tag)) {
          return true;
        }

        // 3) 메인 콘텐츠 컨테이너 보호
        const cl = (el.className || '').toLowerCase();
        const id = (el.id || '').toLowerCase();
        const contentPatterns = ['content', 'article', 'news', 'story', 'post', 'main', 'wrapper', 'container', 'layout', 'page', 'body', 'site', 'gnb', 'lnb', 'menu', 'nav'];
        for (const p of contentPatterns) {
          if ((cl.includes(p) && !cl.includes('popup') && !cl.includes('modal') && !cl.includes('cookie')) ||
              (id.includes(p) && !id.includes('popup') && !id.includes('modal'))) {
            // 콘텐츠 영역 내부의 자식이 많으면 보호
            if (el.children?.length > 3) return true;
          }
        }

        // 4) 텍스트가 많은 요소 보호 (실제 콘텐츠)
        const textLen = (el.textContent || '').trim().length;
        if (textLen > 500) return true;

        return false;
      }

      // 안전하게 요소 숨기기 (remove 대신 display:none)
      function safeHide(el) {
        if (isProtected(el)) return false;
        el.style.setProperty('display', 'none', 'important');
        el.style.setProperty('visibility', 'hidden', 'important');
        el.style.setProperty('opacity', '0', 'important');
        hiddenCount++;
        return true;
      }

      // 1단계: 셀렉터 기반 숨김 (좁은 범위만)
      const obstructionSelectors = [
        // 쿠키/동의 (확실한 것만)
        '[class*="cookie-banner"]', '[id*="cookie-banner"]',
        '[class*="cookie-consent"]', '[id*="cookie-consent"]',
        '[class*="consent-banner"]', '[id*="consent-banner"]',
        '[class*="gdpr"]', '[id*="gdpr"]',
        '.cc-banner', '.cc-window',
        // 팝업/모달 (확실한 것만)
        '[class*="modal-overlay"]', '[class*="modal-backdrop"]',
        '[class*="popup-overlay"]', '[class*="popup-dimmed"]',
        '[class*="layer_popup"]', '[class*="layerPopup"]', '[class*="layer-popup"]',
        '[class*="dim_layer"]', '[class*="dimLayer"]', '[class*="dim-layer"]',
        // 구독/페이월 (확실한 것만)
        '[class*="paywall"]', '[id*="paywall"]',
        '[class*="payWall"]', '[id*="payWall"]',
        // 앱 설치 배너
        '[class*="app-banner"]', '[class*="appBanner"]', '[class*="app_banner"]',
        '[class*="smart-banner"]', '[class*="smartBanner"]',
        '[class*="app-install"]', '[class*="appInstall"]',
        // 로그인 유도
        '[class*="login-prompt"]', '[class*="loginPrompt"]',
        '[class*="signin-prompt"]',
      ];

      obstructionSelectors.forEach(sel => {
        try {
          document.querySelectorAll(sel).forEach(el => safeHide(el));
        } catch(e) {}
      });

      // 2단계: 전체 화면 딤/오버레이만 제거 (z-index 매우 높은 것만)
      document.querySelectorAll('*').forEach(el => {
        const style = window.getComputedStyle(el);
        const position = style.position;
        const zIndex = parseInt(style.zIndex) || 0;
        
        // z-index 9999 이상 && position:fixed인 것만 (확실한 모달/딤)
        if (position === 'fixed' && zIndex >= 9999) {
          safeHide(el);
        }
        
        // 전체 화면 커버 딤 레이어만 제거 (80% 이상 차지 + 반투명)
        if (position === 'fixed') {
          const bg = style.backgroundColor;
          const opacity = parseFloat(style.opacity);
          if (bg && bg.includes('rgba') && opacity < 0.9) {
            const rect = el.getBoundingClientRect();
            if (rect.width > window.innerWidth * 0.8 && rect.height > window.innerHeight * 0.8) {
              safeHide(el);
            }
          }
        }
      });

      // 3단계: body 스크롤 잠금만 해제 (position은 절대 변경 안 함)
      document.body.style.overflow = 'auto';
      document.body.style.overflowY = 'auto';
      document.documentElement.style.overflow = 'auto';
      document.documentElement.style.overflowY = 'auto';
      // ⚠️ body.position은 변경하지 않음 — 레이아웃 유지
      document.body.classList.remove('modal-open', 'no-scroll', 'scroll-lock', 'popup-open');
      
      console.log('[Obstruction v3] ' + hiddenCount + '개 방해요소 숨김 처리');
    })()
  `);
}

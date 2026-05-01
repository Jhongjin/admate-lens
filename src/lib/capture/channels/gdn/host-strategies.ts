/**
 * GDN 게재면(호스트)별 정책 — 분기는 이 파일과 `gdn-capture.ts`(페이지 DOM 전용)로 나눔.
 *
 * ## 신규 매체(게재면) 추가 체크리스트
 * 1. **UI 프리셋**: `src/app/components/CaptureForm.tsx` 의 `PUBLISHER_PRESETS` 에
 *    `name`, `url`, `category`, `icon`, `adSizes`, `description` 추가.
 * 2. **기본만으로 충분한 경우**: 이 파일 수정 없이도 동작할 수 있음(범용 슬롯 탐지·인젝션).
 * 3. **사이트 이슈가 있을 때만** 아래 훅을 선택적으로 추가(이미 있는 패턴 복붙 후 호스트만 교체).
 *    - `GDN_EXCLUDED_HOSTS`: 캡처 불가·정책 제외. API 배치에서 즉시 실패 처리(`isGdnExcludedHost`).
 *    - `getGdnLazyLoadMode` → `"light"`: 대형 뉴스지면에서 lazy 이미지 일괄 복원 시 Chromium OOM 방지.
 *    - 조선일보처럼 **모달이 광고를 가림**: `isChosunHost` 패턴으로 `gdn-capture.ts` 의 `dismissChosunPromoLayer` 호출 연결.
 *    - **인젝션은 됐는데 스샷이 어색**: `getGdnScreenshotPolicy` → `force_centered_viewport`(SBS·디지털데일리·ZDNet 참고).
 *    - **슬롯 오탐·우선순위**: `prioritizeGdnSlotsByHost`, `narrowGdnSlotsByHost` (MK·헤럴드biz·동아·중앙·연합·조선 등).
 * 4. **검증**: `npx tsc --noEmit` 후 커밋·`main` 푸시(프로젝트 Cursor 규칙).
 */

import type { DetectedSlot } from "@/lib/capture/injection/ad-slot-detector";

export type GdnScreenshotPolicy = "default" | "force_centered_viewport";

/** 슬롯 정렬·축소 시 모바일 뷰포트·조선 홈면 여부 */
export interface GdnSlotHostContext {
  mobileViewport?: boolean;
  /**
   * 조선 모바일 + 캡처 URL이 사이트 루트(`/`)일 때 true.
   * GAM iframe 경로에 `…/home/mh…`(예: 오늘의 핫뉴스 상단 336×280)이 붙는 슬롯을 가산한다.
   */
  chosunHomeSurface?: boolean;
}

/** Lazy-load 강제: full은 data-src 일괄 복원+스크롤, light는 loading만+짧은 스크롤(대형 뉴스지면 OOM 방지) */
export type GdnLazyLoadMode = "full" | "light";

// --- 정책 제외: 캡처 시도 안 함(API에서 즉시 failed, 직접 URL도 차단) ---
const GDN_EXCLUDED_HOSTS = new Set<string>([
  "news.kbs.co.kr",
  "mt.co.kr",
  "www.mt.co.kr",
  "m.mt.co.kr",
]);

// --- 호스트 감지(내부) ---

function isZdnetHost(host: string): boolean {
  return host === "zdnet.co.kr" || host === "www.zdnet.co.kr";
}

function isMkHost(host: string): boolean {
  const h = host.toLowerCase();
  return h === "www.mk.co.kr" || h === "mk.co.kr" || h === "m.mk.co.kr";
}

/** 헤럴드경제 등 biz.heraldcorp.com 계열 */
function isHeraldBizHost(host: string): boolean {
  const h = host.toLowerCase();
  return (
    h === "biz.heraldcorp.com" ||
    h === "www.biz.heraldcorp.com" ||
    h === "m.biz.heraldcorp.com"
  );
}

function isDongaHost(host: string): boolean {
  const h = host.toLowerCase();
  return h === "www.donga.com" || h === "donga.com" || h === "m.donga.com";
}

function isJoongangHost(host: string): boolean {
  const h = host.toLowerCase();
  return h === "www.joongang.co.kr" || h === "joongang.co.kr" || h === "m.joongang.co.kr";
}

function isBloterHost(host: string): boolean {
  const h = host.toLowerCase();
  return h === "www.bloter.net" || h === "bloter.net";
}

/** GAM/DFP DOM 힌트 — 조상 셀렉터에 #wrap 등이 있어도 iframe 경로에 google이 있으면 true */
function hasGoogleInventoryHint(sel: string): boolean {
  const s = sel.toLowerCase();
  return (
    s.includes("google_ads") ||
    s.includes("aswift") ||
    s.includes("div-gpt-ad") ||
    s.includes("adsbygoogle") ||
    s.includes("googlesyndication") ||
    s.includes("dfpad") ||
    s.includes("dfp-ad") ||
    s.includes("googletag")
  );
}

/** 연합뉴스 — 모바일 피드 MPU(약 361×280)가 GAM iframe(세로 과대)보다 실제 광고에 가깝다 */
function isYnaHost(host: string): boolean {
  const h = host.toLowerCase();
  return h === "www.yna.co.kr" || h === "yna.co.kr" || h === "m.yna.co.kr";
}

/** 조선일보: `gdn-capture.dismissChosunPromoLayer` 와 짝. 신규 사이트는 별도 `isXxxHost` + dismiss 연결. */
export function isChosunHost(host: string): boolean {
  const h = host.toLowerCase();
  return h === "www.chosun.com" || h === "chosun.com" || h === "m.chosun.com";
}

/** 모바일 + 조선 + URL 경로가 `/`(메인) — 홈 전용 GAM `…/home/mh…` 구간 */
export function isChosunMobileHomeSurface(
  host: string,
  publisherUrl: string,
  mobileViewport: boolean,
): boolean {
  if (!isChosunHost(host) || !mobileViewport) return false;
  try {
    const p = new URL(publisherUrl).pathname.replace(/\/+$/, "") || "/";
    return p === "/";
  } catch {
    return false;
  }
}

// --- Lazy-load (gdn-capture에서 evaluate 스크립트 분기) ---

export function getGdnLazyLoadMode(host: string): GdnLazyLoadMode {
  if (isMkHost(host)) return "light";
  // SBS는 광고 DOM이 무겁고 full lazy 복원이 길어져 목록 조회(오래된 processing 정리) 타이밍과 충돌하기 쉬움
  if (host === "news.sbs.co.kr") return "light";
  // Bloter는 이미지/스크립트가 많아 full lazy 복원 시 배치 후반 타임아웃이 잦음
  if (isBloterHost(host)) return "light";
  return "full";
}

export function isGdnExcludedHost(host: string): boolean {
  return GDN_EXCLUDED_HOSTS.has(host);
}

// --- 스크린샷(인젝션 후 뷰포트 정책, gdn-capture safeCaptureScreenshot 경로) ---

export function getGdnScreenshotPolicy(
  host: string,
  ctx?: { mobileViewport?: boolean },
): GdnScreenshotPolicy {
  const mobile = Boolean(ctx?.mobileViewport);
  if (host === "news.sbs.co.kr") return "force_centered_viewport";
  if (host === "www.ddaily.co.kr") return "force_centered_viewport";
  if (isZdnetHost(host)) return "force_centered_viewport";
  if (isDongaHost(host)) return "force_centered_viewport";
  if (isJoongangHost(host)) return "force_centered_viewport";
  if (isBloterHost(host)) return "force_centered_viewport";
  if (mobile && isMkHost(host)) return "force_centered_viewport";
  if (mobile && isHeraldBizHost(host)) return "force_centered_viewport";
  return "default";
}

// --- 슬롯 후보: 정렬(우선) / 필터(축소) — detectAdSlots 이후 gdn-capture에서 호출 ---

export function prioritizeGdnSlotsByHost(
  host: string,
  slots: DetectedSlot[],
  ctx?: GdnSlotHostContext,
): void {
  if (!host || slots.length <= 1) return;

  if (host === "news.sbs.co.kr") {
    slots.sort((a, b) => calcSbsSlotScore(b) - calcSbsSlotScore(a));
    console.log("[GDN] 🧭 SBS 전용 슬롯 우선순위 적용");
    return;
  }

  if (host === "www.ddaily.co.kr") {
    slots.sort((a, b) => calcDdailySlotScore(b) - calcDdailySlotScore(a));
    console.log("[GDN] 🧭 디지털데일리 전용 슬롯 우선순위 적용");
    return;
  }

  if (isZdnetHost(host)) {
    slots.sort((a, b) => calcZdnetSlotScore(b) - calcZdnetSlotScore(a));
    console.log("[GDN] 🧭 ZDNet 전용 슬롯 우선순위 적용");
    return;
  }

  if (isMkHost(host)) {
    slots.sort((a, b) => calcMkSlotScore(b, ctx) - calcMkSlotScore(a, ctx));
    console.log("[GDN] 🧭 매일경제(MK) 전용 슬롯 우선순위 적용");
    return;
  }

  if (isHeraldBizHost(host)) {
    slots.sort((a, b) => calcHeraldBizSlotScore(b, ctx) - calcHeraldBizSlotScore(a, ctx));
    console.log("[GDN] 🧭 헤럴드경제(biz) 전용 슬롯 우선순위 적용");
    return;
  }

  if (isDongaHost(host)) {
    slots.sort((a, b) => calcDongaSlotScore(b, ctx) - calcDongaSlotScore(a, ctx));
    console.log("[GDN] 🧭 동아일보 전용 슬롯 우선순위 적용");
    return;
  }

  if (isJoongangHost(host)) {
    slots.sort((a, b) => calcJoongangSlotScore(b, ctx) - calcJoongangSlotScore(a, ctx));
    console.log("[GDN] 🧭 중앙일보 전용 슬롯 우선순위 적용");
    return;
  }

  if (isYnaHost(host)) {
    slots.sort((a, b) => calcYnaSlotScore(b) - calcYnaSlotScore(a));
    console.log("[GDN] 🧭 연합뉴스 전용 슬롯 우선순위 적용");
    return;
  }

  if (isBloterHost(host)) {
    slots.sort((a, b) => calcBloterSlotScore(b) - calcBloterSlotScore(a));
    console.log("[GDN] 🧭 Bloter 전용 슬롯 우선순위 적용");
    return;
  }

  if (isChosunHost(host)) {
    const mobile = Boolean(ctx?.mobileViewport);
    const home = Boolean(ctx?.chosunHomeSurface);
    slots.sort(
      (a, b) => calcChosunSlotScore(b, ctx) - calcChosunSlotScore(a, ctx),
    );
    console.log(
      `[GDN] 🧭 조선일보 전용 슬롯 우선순위 적용${
        mobile ? (home ? " (모바일 홈·/home/mh… MPU)" : " (모바일·기사 등 MPU)") : ""
      }`,
    );
    return;
  }
}

export function narrowGdnSlotsByHost(
  host: string,
  slots: DetectedSlot[],
  ctx?: GdnSlotHostContext,
): void {
  if (!host || slots.length <= 1) return;

  if (host === "www.ddaily.co.kr") {
    const preferred = slots.filter((s) => {
      const sel = (s.selector || "").toLowerCase();
      const sizeNear300x250 = s.width >= 250 && s.width <= 340 && s.height >= 220 && s.height <= 340;
      return (
        sel.includes("ddaily_rightcontents2_ap_300_250") ||
        sel.includes("300_250") ||
        sizeNear300x250
      );
    });

    if (preferred.length > 0) {
      slots.length = 0;
      preferred.forEach((s) => slots.push(s));
      console.log(`[GDN] 🎯 디지털데일리 전용 후보 축소 적용: ${preferred.length}개`);
    }
  }

  if (isZdnetHost(host)) {
    const preferred = slots.filter((s) => {
      const sel = (s.selector || "").toLowerCase();
      const sizeNear300x250 = s.width >= 250 && s.width <= 340 && s.height >= 220 && s.height <= 340;
      const leaderboardish = s.width >= 680 && s.width <= 780 && s.height >= 80 && s.height <= 120;
      return (
        sel.includes("zc-banner") ||
        sel.includes("zdk") ||
        sel.includes("div-gpt-ad") ||
        sel.includes("google_ads_iframe") ||
        sel.includes("adsbygoogle") ||
        sizeNear300x250 ||
        leaderboardish
      );
    });

    if (preferred.length > 0) {
      slots.length = 0;
      preferred.forEach((s) => slots.push(s));
      console.log(`[GDN] 🎯 ZDNet 전용 후보 축소 적용: ${preferred.length}개`);
    }
  }

  if (isMkHost(host)) {
    const mobile = Boolean(ctx?.mobileViewport);
    const preferred = slots.filter((s) => {
      if (s.type === "gdn-iframe" && s.height > 820) return false;
      const sel = (s.selector || "").toLowerCase();
      const gam =
        sel.includes("google_ads") ||
        sel.includes("div-gpt-ad") ||
        sel.includes("adsbygoogle") ||
        sel.includes("googlesyndication");
      if (gam || s.type === "gdn-iframe") return s.width <= 1024 && s.height <= 520;
      const mpu = s.width >= 250 && s.width <= 400 && s.height >= 200 && s.height <= 340;
      const mobBand =
        mobile && s.width >= 280 && s.width <= 430 && s.height >= 44 && s.height <= 130;
      return mpu || mobBand;
    });
    if (preferred.length > 0) {
      slots.length = 0;
      preferred.forEach((s) => slots.push(s));
      console.log(`[GDN] 🎯 매일경제 후보 축소: ${preferred.length}개`);
    }
  }

  if (isHeraldBizHost(host)) {
    const mobile = Boolean(ctx?.mobileViewport);
    const preferred = slots.filter((s) => {
      const sel = (s.selector || "").toLowerCase();
      const gam =
        sel.includes("google_ads") ||
        sel.includes("div-gpt-ad") ||
        sel.includes("adsbygoogle") ||
        sel.includes("googlesyndication");
      if (gam || s.type === "gdn-iframe") {
        if (s.type === "gdn-iframe" && s.height > 720) return false;
        return s.width <= 1024 && s.height <= 520;
      }
      const mpu = s.width >= 250 && s.width <= 380 && s.height >= 220 && s.height <= 340;
      const lb = s.width >= 680 && s.width <= 1024 && s.height >= 180 && s.height <= 300;
      const mobBand =
        mobile && s.width >= 280 && s.width <= 430 && s.height >= 44 && s.height <= 130;
      return mpu || lb || mobBand;
    });
    if (preferred.length > 0) {
      slots.length = 0;
      preferred.forEach((s) => slots.push(s));
      console.log(`[GDN] 🎯 헤럴드경제(biz) 후보 축소: ${preferred.length}개`);
    }
  }

  if (isDongaHost(host)) {
    const mobile = Boolean(ctx?.mobileViewport);
    const selLo = (s: DetectedSlot) => (s.selector || "").toLowerCase();
    const hasMainMo = slots.some((s) => selLo(s).includes("main_mo_ad"));
    const preferred = slots.filter((s) => {
      const sel = selLo(s);
      if (mobile && hasMainMo) {
        if (sel.includes("main_mo_ad") || sel.includes("txtad")) return true;
        if (
          (sel.includes("aswift") ||
            sel.includes("google_ads_iframe") ||
            sel.includes("adsbygoogle")) &&
          s.width >= 260 &&
          s.width <= 400 &&
          s.height <= 360
        ) {
          return true;
        }
        return false;
      }
      const gam =
        sel.includes("google_ads") ||
        sel.includes("div-gpt-ad") ||
        sel.includes("adsbygoogle") ||
        sel.includes("googlesyndication");
      if (gam || s.type === "gdn-iframe") {
        if (s.type === "gdn-iframe" && s.height > 720) return false;
        return s.width <= 1024 && s.height <= 520;
      }
      const mpu = s.width >= 250 && s.width <= 380 && s.height >= 220 && s.height <= 340;
      const lb = s.width >= 700 && s.width <= 1024 && s.height >= 200 && s.height <= 280;
      const mobBand =
        mobile && s.width >= 280 && s.width <= 430 && s.height >= 44 && s.height <= 130;
      const reasonable = s.width <= 1024 && s.height <= 400;
      return ((mpu || lb) && reasonable) || mobBand;
    });
    if (preferred.length > 0) {
      slots.length = 0;
      preferred.forEach((s) => slots.push(s));
      console.log(
        `[GDN] 🎯 동아일보 후보 축소: ${preferred.length}개${
          mobile && hasMainMo ? " (main_mo_ad·모바일)" : ""
        }`,
      );
    }
  }

  if (isJoongangHost(host)) {
    const mobile = Boolean(ctx?.mobileViewport);
    const selLo = (s: DetectedSlot) => (s.selector || "").toLowerCase();
    const premium = slots.filter(
      (s) =>
        (selLo(s).includes("ad_wrap") && selLo(s).includes("ad_video")) ||
        selLo(s).includes("ampbjs") ||
        selLo(s).includes("admaru"),
    );
    if (premium.length > 0) {
      slots.length = 0;
      premium.forEach((s) => slots.push(s));
      console.log(`[GDN] 🎯 중앙일보 후보 축소(ad_wrap·Admaru): ${premium.length}개`);
    } else {
      const preferred = slots.filter((s) => {
        if (s.type === "gdn-iframe" && s.height > 720) return false;
        const sel = selLo(s);
        const gam =
          sel.includes("google_ads") ||
          sel.includes("div-gpt-ad") ||
          sel.includes("adsbygoogle") ||
          sel.includes("googlesyndication");
        if (gam || s.type === "gdn-iframe") return s.width <= 1024 && s.height <= 520;
        const mpu = s.width >= 250 && s.width <= 400 && s.height >= 220 && s.height <= 340;
        const mobBand =
          mobile && s.width >= 280 && s.width <= 430 && s.height >= 44 && s.height <= 130;
        return mpu || mobBand;
      });
      if (preferred.length > 0) {
        slots.length = 0;
        preferred.forEach((s) => slots.push(s));
        console.log(`[GDN] 🎯 중앙일보 후보 축소: ${preferred.length}개`);
      }
    }
  }

  if (isYnaHost(host)) {
    const preferred = slots.filter((s) => {
      if (s.type === "gdn-iframe" && s.height > 800) return false;
      const sel = (s.selector || "").toLowerCase();
      const gam =
        sel.includes("google_ads") ||
        sel.includes("div-gpt-ad") ||
        sel.includes("adsbygoogle") ||
        sel.includes("googlesyndication");
      const mpu =
        s.width >= 300 && s.width <= 400 && s.height >= 240 && s.height <= 320;
      const lb = s.width >= 680 && s.width <= 800 && s.height >= 80 && s.height <= 120;
      return (mpu || lb || (gam && s.height < 600)) && s.width <= 1024;
    });
    if (preferred.length > 0) {
      slots.length = 0;
      preferred.forEach((s) => slots.push(s));
      console.log(`[GDN] 🎯 연합뉴스 후보 축소: ${preferred.length}개 (모바일 MPU·GAM 위주)`);
    }
  }

  if (isBloterHost(host)) {
    const preferred = slots.filter((s) => {
      const sel = (s.selector || "").toLowerCase();
      const gam = hasGoogleInventoryHint(sel) || s.type === "gdn-iframe";
      if (gam && s.height > 720) return false;
      const mpu = s.width >= 250 && s.width <= 380 && s.height >= 220 && s.height <= 340;
      const leaderboard = s.width >= 680 && s.width <= 1024 && s.height >= 80 && s.height <= 280;
      return (gam || mpu || leaderboard) && s.width <= 1100 && s.height <= 520;
    });
    if (preferred.length > 0) {
      slots.length = 0;
      preferred.forEach((s) => slots.push(s));
      console.log(`[GDN] 🎯 Bloter 후보 축소: ${preferred.length}개`);
    }
  }

  if (isChosunHost(host)) {
    const mobile = Boolean(ctx?.mobileViewport);
    const chosunHome = Boolean(ctx?.chosunHomeSurface);
    const preferred = slots.filter((s) => {
      if (s.type === "gdn-iframe" && s.height > 780) return false;
      const sel = (s.selector || "").toLowerCase();
      const gam =
        sel.includes("google_ads") ||
        sel.includes("div-gpt-ad") ||
        sel.includes("adsbygoogle") ||
        sel.includes("googlesyndication");
      if (gam || s.type === "gdn-iframe") return s.width <= 1024 && s.height <= 520;
      const mpu =
        s.width >= 260 && s.width <= 400 && s.height >= 200 && s.height <= 340;
      const mobTopBanner =
        mobile &&
        s.width >= 300 &&
        s.width <= 400 &&
        s.height >= 44 &&
        s.height <= 130;
      return mpu || mobTopBanner;
    });
    if (preferred.length > 0) {
      slots.length = 0;
      preferred.forEach((s) => slots.push(s));
      console.log(
        `[GDN] 🎯 조선일보 후보 축소: ${preferred.length}개${
          mobile ? (chosunHome ? " (모바일 홈 GAM·핫뉴스 상단 등)" : " (모바일 GAM·본문 MPU)") : ""
        }`,
      );
    }
  }
}

function calcSbsSlotScore(slot: DetectedSlot): number {
  const sel = (slot.selector || "").toLowerCase();
  let score = slot.confidence;

  if (slot.type === "gdn-iframe") score += 120;
  if (sel.includes("google_ads_iframe")) score += 120;
  if (sel.includes("div-gpt-ad")) score += 100;
  if (sel.includes("adsbygoogle")) score += 90;
  if (sel.includes("ad_area") || sel.includes("ads-area") || sel.includes("banner")) score += 40;

  // SBS에서 자주 잡히는 콘텐츠 섹션형 오탐은 강하게 감점
  if (slot.type === "size-match" && (sel.includes("> section") || sel.includes("> article"))) score -= 120;
  if (sel.includes("#container > div:nth-child")) score -= 70;

  return score;
}

function calcDdailySlotScore(slot: DetectedSlot): number {
  const sel = (slot.selector || "").toLowerCase();
  let score = slot.confidence;
  const area = slot.width * slot.height;

  // Google/GAM 힌트 강한 슬롯 우선
  if (slot.type === "gdn-iframe") score += 110;
  if (sel.includes("google_ads_iframe")) score += 110;
  if (sel.includes("div-gpt-ad")) score += 90;
  if (sel.includes("adsbygoogle")) score += 80;
  if (sel.includes("mainadbanner")) score += 60;
  if (sel.includes("ddaily_rightcontents2_ap_300_250")) score += 180;
  if (sel.includes("300_250")) score += 120;

  // 표준 직사각형/스퀘어 사이즈 우선
  if ((slot.width >= 230 && slot.width <= 340) && (slot.height >= 230 && slot.height <= 340)) score += 55;

  // 과대 슬롯 감점 (실제 광고보다 과장된 헤더 영역 오탐 방지)
  if (slot.width >= 900 || area >= 180000) score -= 140;
  if (slot.width >= 1100 || area >= 240000) score -= 180;
  // ddaily에서는 상단 와이드 슬롯보다 300x250 실광고를 우선
  if (slot.width >= 700 && slot.height <= 120) score -= 220;
  if (slot.width >= 900 && slot.height <= 120) score -= 260;

  return score;
}

function calcZdnetSlotScore(slot: DetectedSlot): number {
  const sel = (slot.selector || "").toLowerCase();
  let score = slot.confidence;
  const area = slot.width * slot.height;

  if (slot.type === "gdn-iframe") score += 110;
  if (sel.includes("google_ads_iframe")) score += 110;
  if (sel.includes("div-gpt-ad")) score += 95;
  if (sel.includes("adsbygoogle")) score += 85;
  if (sel.includes("zc-banner") || sel.includes("zdk")) score += 100;

  if ((slot.width >= 230 && slot.width <= 340) && (slot.height >= 230 && slot.height <= 340)) score += 55;
  if (slot.width >= 680 && slot.width <= 780 && slot.height >= 80 && slot.height <= 120) score += 45;

  if (slot.width >= 900 || area >= 180000) score -= 140;
  if (slot.width >= 1100 || area >= 240000) score -= 180;
  if (slot.width >= 700 && slot.height <= 120) score -= 200;

  return score;
}

function calcHeraldBizSlotScore(slot: DetectedSlot, ctx?: GdnSlotHostContext): number {
  const sel = (slot.selector || "").toLowerCase();
  const mobile = Boolean(ctx?.mobileViewport);
  let score = slot.confidence;
  const area = slot.width * slot.height;
  const gam = hasGoogleInventoryHint(sel);

  if (slot.type === "gdn-iframe") score += 130;
  if (sel.includes("google_ads")) score += 130;
  if (sel.includes("div-gpt-ad")) score += 100;
  if (sel.includes("adsbygoogle")) score += 90;
  if (sel.includes("googlesyndication")) score += 85;

  if ((slot.width >= 250 && slot.width <= 360) && (slot.height >= 230 && slot.height <= 300)) score += 70;
  if (slot.width >= 680 && slot.width <= 1000 && slot.height >= 200 && slot.height <= 280) score += 55;

  const mobBand =
    mobile && slot.width >= 280 && slot.width <= 430 && slot.height >= 44 && slot.height <= 130;
  if (mobBand && gam) score += 145;
  else if (mobBand) score += 100;
  if (mobile && mobBand && !slot.isFixed && slot.y >= 80 && slot.y <= 720) score += 55;

  if (mobile && slot.height >= 480 && slot.height <= 900 && gam && slot.type === "gdn-iframe") score += 35;
  if (mobile && slot.height > 650 && !gam) score -= 260;

  if (slot.type === "size-match" && (sel.includes("> section") || sel.includes("> article"))) score -= 150;
  if (sel.includes("#container > div:nth-child")) score -= 80;
  if (slot.width >= 900 || area >= 200000) score -= 160;

  return score;
}

function calcDongaSlotScore(slot: DetectedSlot, ctx?: GdnSlotHostContext): number {
  const sel = (slot.selector || "").toLowerCase();
  const mobile = Boolean(ctx?.mobileViewport);
  let score = slot.confidence;
  const area = slot.width * slot.height;
  const gam = hasGoogleInventoryHint(sel);

  if (sel.includes("main_mo_ad") || sel.includes("txtad")) score += 175;
  if (slot.type === "gdn-iframe") score += 130;
  if (sel.includes("google_ads")) score += 130;
  if (sel.includes("div-gpt-ad")) score += 105;
  if (sel.includes("adsbygoogle")) score += 95;

  if ((slot.width >= 250 && slot.width <= 380) && (slot.height >= 220 && slot.height <= 320)) score += 65;
  if (slot.width >= 700 && slot.width <= 1024 && slot.height >= 200 && slot.height <= 280) score += 55;

  const mobBand =
    mobile && slot.width >= 280 && slot.width <= 430 && slot.height >= 44 && slot.height <= 130;
  if (mobBand && gam) score += 130;
  else if (mobBand) score += 88;
  if (mobile && !slot.isFixed && slot.width >= 300 && slot.width <= 400 && slot.height >= 250 && slot.height <= 310) {
    score += 40;
  }

  if (
    (sel.includes("#wrap") || sel.includes("#container") || sel.includes("main_content")) &&
    !gam
  ) {
    score -= 200;
  }
  if (slot.width >= 1100 || area >= 280000) score -= 220;
  if (slot.type === "ad-container" && !sel.includes("google") && !sel.includes("gpt") && area > 120000) {
    score -= 180;
  }

  if (slot.type === "gdn-iframe" && slot.height > 700) score -= 200;

  return score;
}

/** 매일경제: 모바일 이슈·댓글 사이 MPU, 상단 모바일 배너 등 */
function calcMkSlotScore(slot: DetectedSlot, ctx?: GdnSlotHostContext): number {
  const sel = (slot.selector || "").toLowerCase();
  const mobile = Boolean(ctx?.mobileViewport);
  let score = slot.confidence;
  const area = slot.width * slot.height;
  const gam = hasGoogleInventoryHint(sel);

  if (slot.type === "gdn-iframe") score += 125;
  if (sel.includes("google_ads")) score += 125;
  if (sel.includes("div-gpt-ad")) score += 102;
  if (sel.includes("adsbygoogle")) score += 95;
  if (sel.includes("googlesyndication")) score += 88;

  if ((slot.width >= 260 && slot.width <= 400) && (slot.height >= 220 && slot.height <= 330)) score += 82;
  const mobBand =
    mobile && slot.width >= 280 && slot.width <= 430 && slot.height >= 44 && slot.height <= 130;
  if (mobBand && gam) score += 120;
  else if (mobBand) score += 78;

  if (mobile && !slot.isFixed && slot.y >= 60 && slot.y <= 880) score += 35;
  if (slot.isFixed && slot.height <= 90) score -= 70;

  if (slot.type === "gdn-iframe" && slot.height > 780) score -= 340;
  if (slot.height > 2000 || area > 450000) score -= 400;

  return score;
}

/** 중앙일보: .ad_wrap.ad_video + Admaru(ampbjs) + MPU */
function calcJoongangSlotScore(slot: DetectedSlot, ctx?: GdnSlotHostContext): number {
  const sel = (slot.selector || "").toLowerCase();
  const mobile = Boolean(ctx?.mobileViewport);
  let score = slot.confidence;
  const area = slot.width * slot.height;
  const gam = hasGoogleInventoryHint(sel);

  if (sel.includes("ad_wrap") && sel.includes("ad_video")) score += 195;
  if (sel.includes("ampbjs") || sel.includes("admaru")) score += 170;

  if (slot.type === "gdn-iframe") score += 128;
  if (sel.includes("google_ads")) score += 128;
  if (sel.includes("div-gpt-ad")) score += 106;
  if (sel.includes("adsbygoogle")) score += 98;

  if ((slot.width >= 260 && slot.width <= 400) && (slot.height >= 220 && slot.height <= 330)) score += 80;
  const mobBand =
    mobile && slot.width >= 280 && slot.width <= 430 && slot.height >= 44 && slot.height <= 130;
  if (mobBand && gam) score += 125;
  else if (mobBand) score += 82;

  if (mobile && !slot.isFixed && slot.y >= 72 && slot.y <= 900) score += 42;
  if (slot.isFixed && slot.height <= 100 && slot.y > 350) score -= 75;

  if (
    (sel.includes("#wrap") || sel.includes("#container") || sel.includes("main_content")) &&
    !gam
  ) {
    score -= 190;
  }
  if (slot.type === "gdn-iframe" && slot.height > 700) score -= 210;
  if (slot.height > 2000 || area > 480000) score -= 420;

  return score;
}

/** 연합뉴스 모바일: 본문 피드 MPU(~361×280)가 세로 과대 GAM iframe보다 실제 인벤토리에 가깝다 */
function calcYnaSlotScore(slot: DetectedSlot): number {
  const sel = (slot.selector || "").toLowerCase();
  let score = slot.confidence;
  const area = slot.width * slot.height;

  if (sel.includes("google_ads") || sel.includes("div-gpt-ad") || sel.includes("adsbygoogle")) score += 95;
  if (slot.type === "gdn-iframe" && slot.height < 600) score += 70;
  if (slot.type === "gdn-iframe" && slot.height >= 800) score -= 400;

  if (slot.width >= 320 && slot.width <= 400 && slot.height >= 260 && slot.height <= 300) score += 90;
  if (slot.width >= 300 && slot.width <= 380 && slot.height >= 240 && slot.height <= 320) score += 75;

  if (slot.width >= 680 && slot.width <= 800 && slot.height >= 80 && slot.height <= 120) score += 50;

  if (slot.height > 2000 || area > 400000) score -= 500;
  if (slot.height > 600 && slot.type === "gdn-iframe") score -= 350;

  return score;
}

function calcBloterSlotScore(slot: DetectedSlot): number {
  const sel = (slot.selector || "").toLowerCase();
  let score = slot.confidence;
  const area = slot.width * slot.height;
  const gam = hasGoogleInventoryHint(sel);

  if (slot.type === "gdn-iframe") score += 125;
  if (sel.includes("google_ads")) score += 125;
  if (sel.includes("div-gpt-ad")) score += 105;
  if (sel.includes("adsbygoogle")) score += 95;
  if (sel.includes("googlesyndication")) score += 90;
  if (sel.includes("ad") || sel.includes("banner")) score += 30;

  if (slot.width >= 250 && slot.width <= 380 && slot.height >= 220 && slot.height <= 340) score += 85;
  if (slot.width >= 680 && slot.width <= 1024 && slot.height >= 90 && slot.height <= 280) score += 55;

  if (slot.type === "size-match" && (sel.includes("> section") || sel.includes("> article"))) score -= 140;
  if (!gam && area > 180000) score -= 160;
  if (slot.type === "gdn-iframe" && slot.height > 720) score -= 240;
  if (slot.height > 2000 || area > 480000) score -= 420;

  return score;
}

/**
 * 조선일보 모바일 MPU(336×280 등):
 * - **기사 URL**: 멤버십 바로 아래·제목 위 등 기사 플로우 인벤이 흔함.
 * - **메인(`/`)**: GAM 경로 `…/home/mh…`(팀장님 제공 iframe) = 오늘의 핫뉴스 바로 위 홈 슬롯.
 * 세로 과대 GAM iframe·하단 스티키보다 실제 게재면에 가깝게 점수화.
 */
function calcChosunSlotScore(slot: DetectedSlot, ctx?: GdnSlotHostContext): number {
  const mobileViewport = Boolean(ctx?.mobileViewport);
  const chosunHomeSurface = Boolean(ctx?.chosunHomeSurface);
  const sel = (slot.selector || "").toLowerCase();
  let score = slot.confidence;
  const area = slot.width * slot.height;

  if (slot.type === "gdn-iframe") score += 118;
  if (sel.includes("google_ads")) score += 118;
  if (sel.includes("div-gpt-ad")) score += 108;
  if (sel.includes("adsbygoogle")) score += 102;
  if (sel.includes("googlesyndication")) score += 92;

  const mpu =
    slot.width >= 280 &&
    slot.width <= 400 &&
    slot.height >= 220 &&
    slot.height <= 330;
  if (mpu) score += 88;

  if (slot.width >= 680 && slot.width <= 800 && slot.height >= 80 && slot.height <= 120) score += 48;

  if (chosunHomeSurface) {
    const homeGamPath =
      (sel.includes("google_ads") && (sel.includes("/home/") || sel.includes("home%2f"))) ||
      /\/home\/mh\d/i.test(sel) ||
      /\bmh\d[_-]/i.test(sel);
    if (homeGamPath) score += 125;
  }

  if (mobileViewport) {
    if (!slot.isFixed && mpu && slot.y >= 72 && slot.y <= 920) score += 95;
    if (slot.isFixed) score -= 58;
    if (slot.isFixed && slot.height <= 100 && slot.y > 380) score -= 85;
  } else {
    if (slot.isFixed) score -= 35;
  }

  if (slot.type === "gdn-iframe" && slot.height > 680) score -= 320;
  if (slot.height > 2000 || area > 480000) score -= 450;

  return score;
}

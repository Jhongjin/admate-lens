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
 *    - **슬롯 오탐·우선순위**: `prioritizeGdnSlotsByHost`, `narrowGdnSlotsByHost` 에 호스트 분기 + 점수 함수.
 * 4. **검증**: `npx tsc --noEmit` 후 커밋·`main` 푸시(프로젝트 Cursor 규칙).
 */

import type { DetectedSlot } from "@/lib/capture/injection/ad-slot-detector";

export type GdnScreenshotPolicy = "default" | "force_centered_viewport";

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

/** 조선일보: `gdn-capture.dismissChosunPromoLayer` 와 짝. 신규 사이트는 별도 `isXxxHost` + dismiss 연결. */
export function isChosunHost(host: string): boolean {
  const h = host.toLowerCase();
  return h === "www.chosun.com" || h === "chosun.com" || h === "m.chosun.com";
}

// --- Lazy-load (gdn-capture에서 evaluate 스크립트 분기) ---

export function getGdnLazyLoadMode(host: string): GdnLazyLoadMode {
  if (isMkHost(host)) return "light";
  return "full";
}

export function isGdnExcludedHost(host: string): boolean {
  return GDN_EXCLUDED_HOSTS.has(host);
}

// --- 스크린샷(인젝션 후 뷰포트 정책, gdn-capture safeCaptureScreenshot 경로) ---

export function getGdnScreenshotPolicy(host: string): GdnScreenshotPolicy {
  if (host === "news.sbs.co.kr") return "force_centered_viewport";
  if (host === "www.ddaily.co.kr") return "force_centered_viewport";
  if (isZdnetHost(host)) return "force_centered_viewport";
  return "default";
}

// --- 슬롯 후보: 정렬(우선) / 필터(축소) — detectAdSlots 이후 gdn-capture에서 호출 ---

export function prioritizeGdnSlotsByHost(host: string, slots: DetectedSlot[]): void {
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
}

export function narrowGdnSlotsByHost(host: string, slots: DetectedSlot[]): void {
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

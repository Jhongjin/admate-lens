import type { DetectedSlot } from "@/lib/capture/injection/ad-slot-detector";

export type GdnScreenshotPolicy = "default" | "force_centered_viewport";

const GDN_EXCLUDED_HOSTS = new Set<string>(["news.kbs.co.kr"]);

function isZdnetHost(host: string): boolean {
  return host === "zdnet.co.kr" || host === "www.zdnet.co.kr";
}

function isMoneyTodayHost(host: string): boolean {
  return host === "mt.co.kr" || host === "www.mt.co.kr" || host === "m.mt.co.kr";
}

function mtHasStrongAdHint(sel: string): boolean {
  return (
    sel.includes("div-gpt-ad") ||
    sel.includes("google_ads_iframe") ||
    sel.includes("googlesyndication") ||
    sel.includes("adsbygoogle") ||
    sel.includes("aswift")
  );
}

export function isGdnExcludedHost(host: string): boolean {
  return GDN_EXCLUDED_HOSTS.has(host);
}

export function getGdnScreenshotPolicy(host: string): GdnScreenshotPolicy {
  if (host === "news.sbs.co.kr") return "force_centered_viewport";
  if (host === "www.ddaily.co.kr") return "force_centered_viewport";
  if (isZdnetHost(host)) return "force_centered_viewport";
  if (isMoneyTodayHost(host)) return "force_centered_viewport";
  return "default";
}

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

  if (isMoneyTodayHost(host)) {
    slots.sort((a, b) => calcMoneyTodaySlotScore(b) - calcMoneyTodaySlotScore(a));
    console.log("[GDN] 🧭 머니투데이 전용 슬롯 우선순위 적용");
  }
}

/**
 * 탐지 시점의 뷰포트 폭 기준으로 슬롯 순서를 한 번 더 다듬습니다.
 * 머니투데이: 좌측 스카이스크래퍼보다 우측 MPU를 쓰도록 x 중심 가산.
 */
export function finalizeGdnSlotsForHost(host: string, slots: DetectedSlot[], viewportWidth: number): void {
  if (!isMoneyTodayHost(host) || slots.length <= 1) return;
  const vw = Math.max(320, viewportWidth || 1280);
  slots.sort((a, b) => {
    const sa = calcMoneyTodaySlotScore(a) + mtRightColumnBias(a, vw);
    const sb = calcMoneyTodaySlotScore(b) + mtRightColumnBias(b, vw);
    if (sb !== sa) return sb - sa;
    return b.x + b.width / 2 - (a.x + a.width / 2);
  });
  console.log("[GDN] 🧭 머니투데이 우측 광고 슬롯 보정 정렬");
}

function mtRightColumnBias(slot: DetectedSlot, vw: number): number {
  const cx = slot.x + slot.width / 2;
  let b = 0;
  if (cx >= vw * 0.38) b += 520;
  if (slot.width <= 200 && slot.height >= 400) b -= 450;
  if (cx < vw * 0.22 && slot.height >= 400) b -= 400;
  return b;
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

  if (isMoneyTodayHost(host)) {
    const preferred = slots.filter((s) => {
      const sel = (s.selector || "").toLowerCase();
      if (sel.includes("left-wing") || sel.includes("left_wing")) return false;
      const hint = mtHasStrongAdHint(sel);
      const sizeMpu = s.width >= 250 && s.width <= 380 && s.height >= 220 && s.height <= 360;
      const sizeHalf = s.width >= 250 && s.width <= 380 && s.height >= 430 && s.height <= 660;
      const sizeSky = s.width >= 120 && s.width <= 220 && s.height >= 450 && s.height <= 720;
      const leaderboardish = s.width >= 600 && s.width <= 800 && s.height >= 70 && s.height <= 130;
      const mtWingRight = sel.includes("right-wing") || sel.includes("right_wing");
      const mtAside = sel.includes("aside_ads") || sel.includes("dynamic-ad");
      const tallEmptyWrapper = s.width <= 420 && s.height > 720 && !hint && !sizeSky;
      if (tallEmptyWrapper) return false;
      return hint || sizeMpu || sizeHalf || sizeSky || leaderboardish || mtWingRight || mtAside;
    });

    if (preferred.length > 0) {
      slots.length = 0;
      preferred.forEach((s) => slots.push(s));
      console.log(`[GDN] 🎯 머니투데이 전용 후보 축소 적용: ${preferred.length}개`);
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

function calcMoneyTodaySlotScore(slot: DetectedSlot): number {
  const sel = (slot.selector || "").toLowerCase();
  let score = slot.confidence;
  const area = slot.width * slot.height;
  const hint = mtHasStrongAdHint(sel);
  const sizeSky = slot.width >= 120 && slot.width <= 220 && slot.height >= 450 && slot.height <= 720;

  if (sel.includes("right-wing") || sel.includes("right_wing")) score += 340;
  if (sel.includes("left-wing") || sel.includes("left_wing")) score -= 420;
  if (sel.includes("dynamic-ad") || sel.includes("aside_ads")) score += 120;

  if (slot.type === "gdn-iframe") score += 130;
  if (sel.includes("google_ads_iframe") || sel.includes("aswift")) score += 125;
  if (sel.includes("div-gpt-ad")) score += 105;
  if (sel.includes("adsbygoogle")) score += 95;

  if (slot.width >= 250 && slot.width <= 380 && slot.height >= 220 && slot.height <= 360) score += 75;
  if (slot.width >= 250 && slot.width <= 380 && slot.height >= 430 && slot.height <= 660) score += 60;
  if (sizeSky) score += 90;
  if (slot.width >= 600 && slot.width <= 800 && slot.height >= 70 && slot.height <= 130) score += 50;

  // 우측 사이드에 세로로 긴 빈 래퍼(소재보다 큰 박스) 오탐 — 실제 160×600 스카이는 제외
  if (slot.width <= 420 && slot.height > 520 && !hint && !sizeSky) score -= 230;
  if (slot.width <= 420 && slot.height > 680 && !sizeSky) score -= 280;
  if (slot.height > slot.width * 2.4 && slot.width < 420 && slot.type === "size-match" && !sizeSky) score -= 170;

  if (slot.width >= 900 || area >= 200000) score -= 150;
  if (slot.width >= 700 && slot.height <= 100) score -= 210;

  return score;
}

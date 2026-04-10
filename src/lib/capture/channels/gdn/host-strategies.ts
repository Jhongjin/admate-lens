import type { DetectedSlot } from "@/lib/capture/injection/ad-slot-detector";

export type GdnScreenshotPolicy = "default" | "force_centered_viewport";

const GDN_EXCLUDED_HOSTS = new Set<string>(["news.kbs.co.kr"]);

export function isGdnExcludedHost(host: string): boolean {
  return GDN_EXCLUDED_HOSTS.has(host);
}

export function getGdnScreenshotPolicy(host: string): GdnScreenshotPolicy {
  if (host === "news.sbs.co.kr") return "force_centered_viewport";
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

  // 표준 직사각형/스퀘어 사이즈 우선
  if ((slot.width >= 230 && slot.width <= 340) && (slot.height >= 230 && slot.height <= 340)) score += 55;

  // 과대 슬롯 감점 (실제 광고보다 과장된 헤더 영역 오탐 방지)
  if (slot.width >= 900 || area >= 180000) score -= 140;
  if (slot.width >= 1100 || area >= 240000) score -= 180;

  return score;
}

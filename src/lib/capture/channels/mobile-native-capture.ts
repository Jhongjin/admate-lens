import type { IBrowserEngine, IPageHandle } from "../engine/browser-engine";
import {
  MOBILE_AOS_VIEWPORT,
  UA_MOBILE_AOS,
} from "../engine/puppeteer-engine";
import { BaseChannel, type CaptureRequest } from "./base-channel";

type MobileNativePlatform = "naver" | "kakao";
type NaverMobileSurface =
  | "naver-smart-channel-mobile"
  | "naver-feed-mobile"
  | "naver-native-banner-feed"
  | "naver-image-banner-mobile"
  | "naver-mobile-feed";
type KakaoMobileSurface = "kakao-bizboard" | "kakao-mobile-feed";
type MobileNativeSurface =
  | NaverMobileSurface
  | KakaoMobileSurface;

const NAVER_SURFACES: readonly NaverMobileSurface[] = [
  "naver-smart-channel-mobile",
  "naver-feed-mobile",
  "naver-native-banner-feed",
  "naver-image-banner-mobile",
  "naver-mobile-feed",
];

function isNaverSurface(surface?: string): surface is NaverMobileSurface {
  return NAVER_SURFACES.includes(surface as NaverMobileSurface);
}

type MobileNativeOpts = {
  surface?: MobileNativeSurface;
  title?: string;
  description1?: string;
  description2?: string;
  sponsorName?: string;
  displayUrl?: string;
  ctaText?: string;
  logoImageUrl?: string;
};

type MobileNativeAdData = {
  platform: MobileNativePlatform;
  surface: MobileNativeSurface;
  title: string;
  description1: string;
  description2: string;
  sponsorName: string;
  displayUrl: string;
  ctaText: string;
  creativeDataUrl: string;
  logoDataUrl: string;
};

export interface MobileNativeDiagnostics {
  platform: MobileNativePlatform;
  surface: MobileNativeSurface;
  creativeDownloaded: boolean;
  creativeBase64Size: number;
  logoDownloaded: boolean;
  logoBase64Size: number;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function normalizePlainText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function injectKoreanFonts(page: IPageHandle): Promise<void> {
  try {
    const loaded = await page.evaluate<boolean>(`
      (async () => {
        const sample = '카카오 네이버 콘텐츠 광고 렌더링 확인';
        if (document.querySelector('#admate-mobile-native-font-style')) {
          await document.fonts.load("400 16px 'Noto Sans KR'", sample).catch(() => []);
          return document.fonts.check("400 16px 'Noto Sans KR'", sample);
        }

        const preconnect = document.createElement('link');
        preconnect.rel = 'preconnect';
        preconnect.href = 'https://fonts.gstatic.com';
        preconnect.crossOrigin = 'anonymous';
        document.head.appendChild(preconnect);

        const link = document.createElement('link');
        link.id = 'admate-mobile-native-fonts';
        link.rel = 'stylesheet';
        link.href = 'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;800;900&family=Roboto:wght@400;500;700;900&display=swap';
        const stylesheetReady = new Promise((resolve) => {
          link.onload = () => resolve(true);
          link.onerror = () => resolve(false);
          setTimeout(() => resolve(false), 7000);
        });
        document.head.appendChild(link);

        const style = document.createElement('style');
        style.id = 'admate-mobile-native-font-style';
        style.textContent = [
          '*, *::before, *::after {',
          "  font-family: 'Noto Sans KR', 'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif !important;",
          '}',
        ].join('\\n');
        document.head.appendChild(style);

        await stylesheetReady;
        await Promise.race([
          Promise.all([
            document.fonts.load("400 16px 'Noto Sans KR'", sample),
            document.fonts.load("700 16px 'Noto Sans KR'", sample),
            document.fonts.load("900 16px 'Noto Sans KR'", sample),
          ]),
          new Promise((resolve) => setTimeout(resolve, 7000)),
        ]).catch(() => []);
        await document.fonts.ready.catch(() => undefined);
        return document.fonts.check("400 16px 'Noto Sans KR'", sample);
      })()
    `);
    if (!loaded) {
      await new Promise((r) => setTimeout(r, 2500));
    }
  } catch {
    await new Promise((r) => setTimeout(r, 1000));
  }
}

function hostnameFromUrl(value: string | undefined): string {
  if (!value) return "";
  try {
    const url = new URL(value.startsWith("http") ? value : `https://${value}`);
    return url.hostname.replace(/^www\./, "");
  } catch {
    return value.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] ?? "";
  }
}

async function imageUrlToDataUrl(
  imageUrl: string,
  logPrefix: string,
): Promise<{ dataUrl: string; sizeKB: number; ok: boolean }> {
  try {
    console.log(`[${logPrefix}] 이미지 다운로드 시작: ${imageUrl}`);
    const response = await fetch(imageUrl, { cache: "no-store" as RequestCache });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const contentType = response.headers.get("content-type") || "image/png";
    const arrayBuffer = await response.arrayBuffer();
    const sizeKB = Math.round(arrayBuffer.byteLength / 1024);
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    return {
      dataUrl: `data:${contentType};base64,${base64}`,
      sizeKB,
      ok: true,
    };
  } catch (err) {
    console.error(`[${logPrefix}] 이미지 다운로드 실패:`, err);
    return { dataUrl: imageUrl, sizeKB: 0, ok: false };
  }
}

function fallbackLogoDataUrl(platform: MobileNativePlatform, sponsorName: string): string {
  const initial = escapeHtml((sponsorName || "AD").trim().slice(0, 1).toUpperCase() || "AD");
  const bg = platform === "naver" ? "#03c75a" : "#fee500";
  const fg = platform === "naver" ? "#ffffff" : "#191919";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" rx="24" fill="${bg}"/><text x="48" y="58" text-anchor="middle" font-family="Arial, sans-serif" font-size="34" font-weight="800" fill="${fg}">${initial}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function defaultSurface(platform: MobileNativePlatform, requested?: string): MobileNativeSurface {
  if (platform === "naver") {
    if (isNaverSurface(requested)) {
      return requested === "naver-mobile-feed" ? "naver-feed-mobile" : requested;
    }
    return "naver-smart-channel-mobile";
  }
  if (requested === "kakao-mobile-feed") return "kakao-mobile-feed";
  return "kakao-bizboard";
}

function buildAdData(
  platform: MobileNativePlatform,
  request: CaptureRequest,
  creativeDataUrl: string,
  logoDataUrl: string,
): MobileNativeAdData {
  const opts = (request.options?.mobileNativeOpts ?? {}) as MobileNativeOpts;
  const surface = defaultSurface(platform, opts.surface);
  const displayHost =
    normalizePlainText(opts.displayUrl) ||
    hostnameFromUrl(request.clickUrl) ||
    hostnameFromUrl(request.publisherUrl);
  const sponsorName =
    normalizePlainText(opts.sponsorName) ||
    (platform === "naver" ? "브랜드 스토어" : "브랜드 채널");
  const defaultTitle =
    platform === "naver"
      ? surface === "naver-smart-channel-mobile"
        ? "브랜드 소식과 혜택을 확인해보세요"
        : surface === "naver-image-banner-mobile"
          ? "모바일 배너 광고"
          : surface === "naver-native-banner-feed"
            ? "콘텐츠와 함께 보는 브랜드 소식"
            : "지금 가장 많이 찾는 혜택"
      : "오늘의 추천 브랜드 소식";
  const defaultDescription =
    platform === "naver"
      ? surface === "naver-smart-channel-mobile"
        ? "네이버 주요 서비스 상단에서 비즈니스 메시지를 전달합니다."
        : surface === "naver-image-banner-mobile"
          ? "네이버 모바일 지면에 노출되는 이미지 배너입니다."
          : surface === "naver-native-banner-feed"
            ? "이미지, 텍스트, CTA로 구성된 네이티브 배너입니다."
            : "모바일 피드에서 자연스럽게 노출되는 피드 광고입니다."
      : "카카오 모바일 지면에 맞춘 광고 메시지를 확인해보세요.";

  return {
    platform,
    surface,
    title: normalizePlainText(opts.title) || defaultTitle,
    description1: normalizePlainText(opts.description1) || defaultDescription,
    description2: normalizePlainText(opts.description2),
    sponsorName,
    displayUrl: displayHost || (platform === "naver" ? "brand.naver.com" : "brand.kakao.com"),
    ctaText:
      normalizePlainText(opts.ctaText) ||
      (surface === "kakao-bizboard" ? "바로가기" : "자세히 보기"),
    creativeDataUrl,
    logoDataUrl,
  };
}

function renderNaverMobileFeedHtml(ad: MobileNativeAdData): string {
  const title = escapeHtml(ad.title);
  const desc1 = escapeHtml(ad.description1);
  const desc2 = escapeHtml(ad.description2);
  const sponsor = escapeHtml(ad.sponsorName);
  const displayUrl = escapeHtml(ad.displayUrl);
  const cta = escapeHtml(ad.ctaText);
  const creative = escapeAttr(ad.creativeDataUrl);
  const logo = escapeAttr(ad.logoDataUrl);

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
  <style>
    * { box-sizing: border-box; }
    html, body {
      width: 100%;
      min-height: 100%;
      margin: 0;
      background: #f5f7f8;
      color: #101010;
      font-family: "Noto Sans KR", "Roboto", -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
    }
    .screen { width: 100vw; min-height: 100vh; background: #f5f7f8; overflow: hidden; }
    .top {
      padding: 10px 14px 8px;
      background: #fff;
      border-bottom: 1px solid rgba(0,0,0,.05);
    }
    .search {
      height: 46px;
      border: 2px solid #03c75a;
      border-radius: 24px;
      display: flex;
      align-items: center;
      padding: 0 14px;
      background: #fff;
      gap: 10px;
    }
    .n-logo { color: #03c75a; font-size: 22px; font-weight: 900; letter-spacing: -1px; }
    .placeholder { flex: 1; color: #8b8f93; font-size: 15px; }
    .icons { display: flex; gap: 13px; color: #30343a; }
    .ui-icon { position: relative; display: inline-block; width: 21px; height: 21px; flex: 0 0 auto; color: currentColor; }
    .ui-icon.magnify::before { content: ""; position: absolute; left: 3px; top: 2px; width: 11px; height: 11px; border: 2px solid currentColor; border-radius: 50%; }
    .ui-icon.magnify::after { content: ""; position: absolute; right: 1px; bottom: 4px; width: 8px; height: 2px; background: currentColor; border-radius: 2px; transform: rotate(45deg); transform-origin: center; }
    .ui-icon.circle::before { content: ""; position: absolute; inset: 2px; border: 2px solid currentColor; border-radius: 50%; }
    .shortcut-grid {
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      gap: 11px 8px;
      padding: 14px 16px 12px;
      background: #fff;
      border-bottom: 1px solid rgba(0,0,0,.06);
    }
    .shortcut { display: grid; justify-items: center; gap: 5px; color: #333; font-size: 11px; }
    .shortcut i { width: 38px; height: 38px; border-radius: 14px; background: #eef8f1; display: grid; place-items: center; color: #03c75a; font-style: normal; font-size: 17px; font-weight: 800; }
    .feed { padding: 10px 10px 80px; }
    .card {
      background: #fff;
      border: 1px solid rgba(0,0,0,.06);
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 1px 2px rgba(0,0,0,.03);
      margin-bottom: 10px;
    }
    .news { padding: 14px; }
    .news-kicker { color: #03a64a; font-size: 12px; font-weight: 800; }
    .news-title { margin-top: 6px; font-size: 16px; line-height: 22px; font-weight: 750; letter-spacing: -.2px; }
    .news-meta { margin-top: 7px; color: #8b8f93; font-size: 12px; }
    .ad-head {
      height: 42px;
      padding: 0 13px;
      display: flex;
      align-items: center;
      gap: 8px;
      color: #62676c;
      font-size: 12px;
      border-bottom: 1px solid rgba(0,0,0,.05);
    }
    .ad-label { border: 1px solid #d8dde3; border-radius: 4px; padding: 1px 4px; font-size: 10px; font-weight: 800; color: #7a8086; }
    .ad-image { width: 100%; aspect-ratio: 16 / 9; background: #e9ecef; display: block; object-fit: cover; }
    .ad-body { padding: 13px 13px 14px; }
    .brand-row { display: flex; align-items: center; gap: 9px; }
    .logo { width: 34px; height: 34px; border-radius: 10px; object-fit: cover; background: #eef1f3; }
    .brand { min-width: 0; flex: 1; }
    .brand strong { display: block; color: #1f2328; font-size: 13px; line-height: 16px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .brand span { display: block; color: #8b8f93; font-size: 11px; line-height: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .cta { min-width: 78px; height: 32px; border-radius: 16px; background: #03c75a; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 800; padding: 0 12px; }
    .ad-title { margin-top: 11px; color: #111; font-size: 17px; line-height: 23px; font-weight: 800; letter-spacing: -.3px; }
    .ad-desc { margin-top: 5px; color: #62676c; font-size: 13px; line-height: 19px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .bottom {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      height: 55px;
      background: rgba(255,255,255,.96);
      border-top: 1px solid rgba(0,0,0,.08);
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      align-items: center;
      color: #5d6369;
      font-size: 10px;
      z-index: 5;
    }
    .tab { display: grid; justify-items: center; gap: 2px; }
    .tab-icon { position: relative; display: block; width: 20px; height: 20px; color: #03c75a; }
    .tab .ui-icon { color: #03c75a; }
    .tab-icon.home::before { content: ""; position: absolute; left: 3px; top: 4px; width: 14px; height: 14px; border: 2px solid currentColor; border-top: 0; border-radius: 2px; }
    .tab-icon.home::after { content: ""; position: absolute; left: 4px; top: 2px; width: 12px; height: 12px; border-left: 2px solid currentColor; border-top: 2px solid currentColor; transform: rotate(45deg); border-radius: 2px 0 0 0; }
    .tab-icon.content::before { content: ""; position: absolute; inset: 3px; border: 2px solid currentColor; border-radius: 2px; }
    .tab-icon.content::after { content: ""; position: absolute; left: 7px; top: 6px; width: 7px; height: 7px; border-left: 2px solid currentColor; border-bottom: 2px solid currentColor; }
    .tab-icon.my::before { content: ""; position: absolute; left: 5px; top: 4px; width: 10px; height: 14px; border: 2px solid currentColor; border-top-color: transparent; border-left-color: transparent; border-radius: 10px 10px 4px 10px; transform: rotate(45deg); }
    .tab-icon.menu::before { content: ""; position: absolute; left: 4px; top: 5px; width: 12px; height: 2px; background: currentColor; border-radius: 2px; box-shadow: 0 5px 0 currentColor, 0 10px 0 currentColor; }
  </style>
</head>
<body>
  <main class="screen">
    <header class="top">
      <div class="search">
        <div class="n-logo">N</div>
        <div class="placeholder">검색어를 입력하세요</div>
        <div class="icons"><span class="ui-icon magnify" aria-hidden="true"></span><span class="ui-icon circle" aria-hidden="true"></span></div>
      </div>
    </header>
    <section class="shortcut-grid">
      <div class="shortcut"><i>뉴스</i><span>뉴스</span></div>
      <div class="shortcut"><i>쇼핑</i><span>쇼핑</span></div>
      <div class="shortcut"><i>페이</i><span>페이</span></div>
      <div class="shortcut"><i>지도</i><span>지도</span></div>
      <div class="shortcut"><i>웹툰</i><span>웹툰</span></div>
    </section>
    <section class="feed">
      <article class="card news">
        <div class="news-kicker">오늘의 주요 콘텐츠</div>
        <div class="news-title">지금 많이 본 소식과 관심사를 한 번에 확인해 보세요</div>
        <div class="news-meta">네이버 홈 · 방금 전</div>
      </article>
      <article class="card">
        <div class="ad-head"><span class="ad-label">AD</span><span>네이버 모바일 피드 광고</span></div>
        <img class="ad-image" src="${creative}" alt="" />
        <div class="ad-body">
          <div class="brand-row">
            <img class="logo" src="${logo}" alt="" />
            <div class="brand">
              <strong>${sponsor}</strong>
              <span>스폰서 · ${displayUrl}</span>
            </div>
            <div class="cta">${cta}</div>
          </div>
          <div class="ad-title">${title}</div>
          <div class="ad-desc">${desc1}${desc2 ? `<br />${desc2}` : ""}</div>
        </div>
      </article>
      <article class="card news">
        <div class="news-kicker">추천</div>
        <div class="news-title">사용자 관심사 기반으로 이어지는 콘텐츠 피드입니다</div>
        <div class="news-meta">콘텐츠 추천 · 3분 전</div>
      </article>
    </section>
    <nav class="bottom">
      <div class="tab"><i class="tab-icon home" aria-hidden="true"></i><span>홈</span></div>
      <div class="tab"><i class="ui-icon magnify" aria-hidden="true"></i><span>검색</span></div>
      <div class="tab"><i class="tab-icon content" aria-hidden="true"></i><span>콘텐츠</span></div>
      <div class="tab"><i class="tab-icon my" aria-hidden="true"></i><span>MY</span></div>
      <div class="tab"><i class="tab-icon menu" aria-hidden="true"></i><span>메뉴</span></div>
    </nav>
  </main>
</body>
</html>`;
}

function renderNaverSmartChannelHtml(ad: MobileNativeAdData): string {
  const title = escapeHtml(ad.title);
  const desc1 = escapeHtml(ad.description1);
  const sponsor = escapeHtml(ad.sponsorName);
  const displayUrl = escapeHtml(ad.displayUrl);
  const cta = escapeHtml(ad.ctaText);
  const creative = escapeAttr(ad.creativeDataUrl);
  const logo = escapeAttr(ad.logoDataUrl);

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
  <style>
    * { box-sizing: border-box; }
    html, body { width: 100%; min-height: 100%; margin: 0; background: #f4f6f8; color: #101010; font-family: "Noto Sans KR", "Roboto", -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", Arial, sans-serif; -webkit-font-smoothing: antialiased; }
    .screen { width: 100vw; min-height: 100vh; background: #f4f6f8; overflow: hidden; }
    .search { margin: 10px 14px 9px; height: 46px; border: 2px solid #03c75a; border-radius: 24px; background: #fff; display: flex; align-items: center; gap: 10px; padding: 0 14px; }
    .n-logo { color: #03c75a; font-size: 22px; font-weight: 900; letter-spacing: -1px; }
    .placeholder { flex: 1; color: #8b8f93; font-size: 15px; }
    .channel-tabs { height: 48px; display: grid; grid-template-columns: repeat(5, 1fr); align-items: center; background: #fff; border-top: 1px solid rgba(0,0,0,.04); border-bottom: 1px solid rgba(0,0,0,.06); color: #34383c; font-size: 13px; font-weight: 800; text-align: center; }
    .channel-tabs .active { color: #03c75a; }
    .smart { margin: 10px; border-radius: 17px; background: #fff; overflow: hidden; border: 1px solid rgba(0,0,0,.06); box-shadow: 0 1px 2px rgba(0,0,0,.04); }
    .smart-head { height: 31px; padding: 0 12px; display: flex; align-items: center; gap: 7px; color: #757b80; font-size: 11px; border-bottom: 1px solid rgba(0,0,0,.05); }
    .ad-badge { border: 1px solid #d8dde3; border-radius: 4px; padding: 1px 4px; color: #7a8086; font-size: 10px; font-weight: 800; }
    .smart-body { min-height: 118px; display: flex; align-items: stretch; background: linear-gradient(135deg, #f7fff9 0%, #ffffff 58%); }
    .copy { flex: 1; padding: 16px 8px 15px 14px; min-width: 0; }
    .brand { display: flex; align-items: center; gap: 7px; margin-bottom: 9px; color: #5d6369; font-size: 11px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .logo { width: 24px; height: 24px; border-radius: 8px; object-fit: cover; background: #eef1f3; }
    .title { font-size: 18px; line-height: 24px; font-weight: 900; letter-spacing: -.35px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .desc { margin-top: 5px; color: #676d72; font-size: 12px; line-height: 17px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .cta { margin-top: 10px; width: fit-content; height: 28px; padding: 0 12px; border-radius: 14px; background: #03c75a; color: #fff; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 850; }
    .thumb { width: 42%; min-height: 118px; object-fit: cover; display: block; background: #e9ecef; }
    .news { margin: 0 10px 10px; padding: 15px 14px; background: #fff; border: 1px solid rgba(0,0,0,.06); border-radius: 16px; }
    .news strong { display: block; font-size: 16px; line-height: 22px; }
    .news span { display: block; margin-top: 6px; color: #8b8f93; font-size: 12px; }
  </style>
</head>
<body>
  <main class="screen">
    <div class="search"><div class="n-logo">N</div><div class="placeholder">검색어를 입력하세요</div></div>
    <nav class="channel-tabs"><div class="active">뉴스</div><div>연예</div><div>스포츠</div><div>경제</div><div>쇼핑</div></nav>
    <article class="smart">
      <div class="smart-head"><span class="ad-badge">AD</span><span>스마트채널 · ${displayUrl}</span></div>
      <div class="smart-body">
        <div class="copy">
          <div class="brand"><img class="logo" src="${logo}" alt="" /><span>${sponsor}</span></div>
          <div class="title">${title}</div>
          <div class="desc">${desc1}</div>
          <div class="cta">${cta}</div>
        </div>
        <img class="thumb" src="${creative}" alt="" />
      </div>
    </article>
    <article class="news"><strong>지금 많이 본 소식</strong><span>네이버 주요 서비스 상단 콘텐츠 영역입니다</span></article>
    <article class="news"><strong>오늘의 추천 콘텐츠</strong><span>관심사 기반으로 이어지는 모바일 콘텐츠입니다</span></article>
  </main>
</body>
</html>`;
}

function renderNaverNativeBannerFeedHtml(ad: MobileNativeAdData): string {
  const title = escapeHtml(ad.title);
  const desc1 = escapeHtml(ad.description1);
  const sponsor = escapeHtml(ad.sponsorName);
  const displayUrl = escapeHtml(ad.displayUrl);
  const cta = escapeHtml(ad.ctaText);
  const creative = escapeAttr(ad.creativeDataUrl);
  const logo = escapeAttr(ad.logoDataUrl);

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
  <style>
    * { box-sizing: border-box; }
    html, body { width: 100%; min-height: 100%; margin: 0; background: #f5f7f8; color: #101010; font-family: "Noto Sans KR", "Roboto", -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", Arial, sans-serif; -webkit-font-smoothing: antialiased; }
    .screen { width: 100vw; min-height: 100vh; background: #f5f7f8; overflow: hidden; }
    .top { padding: 10px 14px 8px; background: #fff; border-bottom: 1px solid rgba(0,0,0,.05); }
    .search { height: 46px; border: 2px solid #03c75a; border-radius: 24px; display: flex; align-items: center; padding: 0 14px; background: #fff; gap: 10px; }
    .n-logo { color: #03c75a; font-size: 22px; font-weight: 900; letter-spacing: -1px; }
    .placeholder { flex: 1; color: #8b8f93; font-size: 15px; }
    .feed { padding: 10px 10px 80px; }
    .card { background: #fff; border: 1px solid rgba(0,0,0,.06); border-radius: 16px; overflow: hidden; box-shadow: 0 1px 2px rgba(0,0,0,.03); margin-bottom: 10px; }
    .news { padding: 14px; }
    .news-kicker { color: #03a64a; font-size: 12px; font-weight: 800; }
    .news-title { margin-top: 6px; font-size: 16px; line-height: 22px; font-weight: 800; }
    .native { padding: 12px 13px; display: grid; grid-template-columns: 1fr 118px; gap: 12px; align-items: center; }
    .brand { display: flex; align-items: center; gap: 7px; color: #747a80; font-size: 11px; margin-bottom: 7px; }
    .brand img { width: 24px; height: 24px; border-radius: 8px; object-fit: cover; background: #eef1f3; }
    .ad-badge { border: 1px solid #d8dde3; border-radius: 4px; padding: 1px 4px; color: #7a8086; font-size: 10px; font-weight: 800; }
    .title { font-size: 16px; line-height: 22px; font-weight: 900; letter-spacing: -.25px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .desc { margin-top: 4px; color: #687078; font-size: 12px; line-height: 17px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .meta { margin-top: 8px; display: flex; align-items: center; gap: 8px; color: #8b8f93; font-size: 11px; }
    .cta { height: 26px; padding: 0 10px; border-radius: 13px; background: #03c75a; color: #fff; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 850; }
    .thumb { width: 118px; height: 118px; object-fit: cover; border-radius: 13px; background: #e9ecef; }
  </style>
</head>
<body>
  <main class="screen">
    <header class="top"><div class="search"><div class="n-logo">N</div><div class="placeholder">검색어를 입력하세요</div></div></header>
    <section class="feed">
      <article class="card news"><div class="news-kicker">추천</div><div class="news-title">사용자 관심사 기반으로 이어지는 콘텐츠 피드입니다</div></article>
      <article class="card native">
        <div>
          <div class="brand"><img src="${logo}" alt="" /><span>${sponsor}</span><span class="ad-badge">AD</span></div>
          <div class="title">${title}</div>
          <div class="desc">${desc1}</div>
          <div class="meta"><span>스폰서 · ${displayUrl}</span><span class="cta">${cta}</span></div>
        </div>
        <img class="thumb" src="${creative}" alt="" />
      </article>
      <article class="card news"><div class="news-kicker">오늘의 주요 콘텐츠</div><div class="news-title">지금 많이 본 소식과 관심사를 한 번에 확인해 보세요</div></article>
    </section>
  </main>
</body>
</html>`;
}

function renderNaverImageBannerMobileHtml(ad: MobileNativeAdData): string {
  const title = escapeHtml(ad.title);
  const desc1 = escapeHtml(ad.description1);
  const sponsor = escapeHtml(ad.sponsorName);
  const displayUrl = escapeHtml(ad.displayUrl);
  const cta = escapeHtml(ad.ctaText);
  const creative = escapeAttr(ad.creativeDataUrl);

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
  <style>
    * { box-sizing: border-box; }
    html, body { width: 100%; min-height: 100%; margin: 0; background: #f5f7f8; color: #101010; font-family: "Noto Sans KR", "Roboto", -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", Arial, sans-serif; -webkit-font-smoothing: antialiased; }
    .screen { width: 100vw; min-height: 100vh; background: #f5f7f8; overflow: hidden; }
    .search { margin: 10px 14px; height: 46px; border: 2px solid #03c75a; border-radius: 24px; background: #fff; display: flex; align-items: center; gap: 10px; padding: 0 14px; }
    .n-logo { color: #03c75a; font-size: 22px; font-weight: 900; letter-spacing: -1px; }
    .placeholder { flex: 1; color: #8b8f93; font-size: 15px; }
    .section { padding: 0 10px 80px; }
    .card { background: #fff; border: 1px solid rgba(0,0,0,.06); border-radius: 16px; overflow: hidden; box-shadow: 0 1px 2px rgba(0,0,0,.03); margin-bottom: 10px; }
    .news { padding: 14px; }
    .news strong { display: block; font-size: 16px; line-height: 22px; }
    .news span { display: block; margin-top: 7px; color: #8b8f93; font-size: 12px; }
    .banner-head { height: 32px; padding: 0 12px; display: flex; align-items: center; gap: 7px; color: #70777d; font-size: 11px; border-bottom: 1px solid rgba(0,0,0,.05); }
    .ad-badge { border: 1px solid #d8dde3; border-radius: 4px; padding: 1px 4px; color: #7a8086; font-size: 10px; font-weight: 800; }
    .banner { position: relative; height: 132px; background: #0b1220; overflow: hidden; }
    .banner img { width: 100%; height: 100%; object-fit: cover; display: block; }
    .shade { position: absolute; inset: 0; background: linear-gradient(90deg, rgba(0,0,0,.58), rgba(0,0,0,.16) 58%, rgba(0,0,0,.02)); }
    .copy { position: absolute; left: 16px; top: 16px; right: 108px; color: #fff; }
    .title { font-size: 18px; line-height: 24px; font-weight: 900; letter-spacing: -.3px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .desc { margin-top: 5px; color: rgba(255,255,255,.86); font-size: 12px; line-height: 17px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .cta { position: absolute; left: 16px; bottom: 14px; height: 28px; padding: 0 12px; border-radius: 14px; background: #fff; color: #111; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 850; }
  </style>
</head>
<body>
  <main class="screen">
    <div class="search"><div class="n-logo">N</div><div class="placeholder">검색어를 입력하세요</div></div>
    <section class="section">
      <article class="card news"><strong>서비스 통합 주요 콘텐츠</strong><span>네이버 모바일 서비스 영역입니다</span></article>
      <article class="card">
        <div class="banner-head"><span class="ad-badge">AD</span><span>${sponsor} · ${displayUrl}</span></div>
        <div class="banner">
          <img src="${creative}" alt="" />
          <div class="shade"></div>
          <div class="copy"><div class="title">${title}</div><div class="desc">${desc1}</div></div>
          <div class="cta">${cta}</div>
        </div>
      </article>
      <article class="card news"><strong>관심사 기반 추천</strong><span>사용자 흐름 안에서 다음 콘텐츠가 이어집니다</span></article>
    </section>
  </main>
</body>
</html>`;
}

function renderNaverHtml(ad: MobileNativeAdData): string {
  if (ad.surface === "naver-smart-channel-mobile") return renderNaverSmartChannelHtml(ad);
  if (ad.surface === "naver-native-banner-feed") return renderNaverNativeBannerFeedHtml(ad);
  if (ad.surface === "naver-image-banner-mobile") return renderNaverImageBannerMobileHtml(ad);
  return renderNaverMobileFeedHtml(ad);
}

function renderKakaoBizboardHtml(ad: MobileNativeAdData): string {
  const title = escapeHtml(ad.title);
  const desc1 = escapeHtml(ad.description1);
  const sponsor = escapeHtml(ad.sponsorName);
  const displayUrl = escapeHtml(ad.displayUrl);
  const cta = escapeHtml(ad.ctaText);
  const creative = escapeAttr(ad.creativeDataUrl);
  const logo = escapeAttr(ad.logoDataUrl);

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
  <style>
    * { box-sizing: border-box; }
    html, body {
      width: 100%;
      height: 100%;
      margin: 0;
      background: #f2f2f2;
      color: #191919;
      font-family: "Noto Sans KR", "Roboto", -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", Arial, sans-serif;
      -webkit-font-smoothing: antialiased;
      overflow: hidden;
    }
    .screen { width: 100vw; height: 100vh; background: #f2f2f2; overflow: hidden; }
    .top {
      height: 70px;
      padding: 18px 18px 0;
      background: #fff;
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      border-bottom: 1px solid rgba(0,0,0,.05);
    }
    .title { font-size: 23px; font-weight: 800; letter-spacing: -.4px; }
    .top-icons { display: flex; gap: 18px; color: #222; }
    .k-icon { position: relative; display: inline-block; width: 23px; height: 23px; color: currentColor; flex: 0 0 auto; }
    .k-icon.magnify::before { content: ""; position: absolute; left: 3px; top: 2px; width: 12px; height: 12px; border: 2px solid currentColor; border-radius: 50%; }
    .k-icon.magnify::after { content: ""; position: absolute; right: 2px; bottom: 5px; width: 8px; height: 2px; background: currentColor; border-radius: 2px; transform: rotate(45deg); }
    .k-icon.plus::before,
    .k-icon.plus::after { content: ""; position: absolute; left: 4px; top: 10px; width: 15px; height: 2px; background: currentColor; border-radius: 2px; }
    .k-icon.plus::after { transform: rotate(90deg); }
    .k-icon.gear::before { content: ""; position: absolute; inset: 3px; border: 2px solid currentColor; border-radius: 50%; }
    .k-icon.gear::after { content: ""; position: absolute; left: 9px; top: 9px; width: 5px; height: 5px; background: currentColor; border-radius: 50%; box-shadow: 0 -8px 0 -2px currentColor, 0 8px 0 -2px currentColor, 8px 0 0 -2px currentColor, -8px 0 0 -2px currentColor; }
    .bizboard {
      margin: 10px 10px 8px;
      height: 108px;
      border-radius: 15px;
      background: #fee500;
      overflow: hidden;
      position: relative;
      box-shadow: 0 1px 2px rgba(0,0,0,.05);
      display: flex;
      align-items: stretch;
    }
    .biz-copy {
      width: 56%;
      padding: 13px 0 13px 14px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      z-index: 2;
    }
    .biz-copy .ad { width: fit-content; height: 18px; padding: 0 5px; border-radius: 4px; background: rgba(25,25,25,.15); display: flex; align-items: center; color: #333; font-size: 10px; font-weight: 800; }
    .biz-copy strong { margin-top: 7px; font-size: 16px; line-height: 20px; font-weight: 850; letter-spacing: -.3px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .biz-copy span { margin-top: 4px; color: rgba(25,25,25,.72); font-size: 11px; line-height: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .biz-img {
      position: absolute;
      right: 0;
      top: 0;
      bottom: 0;
      width: 48%;
      object-fit: cover;
      display: block;
    }
    .biz-cta {
      position: absolute;
      right: 10px;
      bottom: 10px;
      height: 28px;
      padding: 0 12px;
      border-radius: 14px;
      background: rgba(25,25,25,.82);
      color: #fff;
      display: flex;
      align-items: center;
      font-size: 11px;
      font-weight: 800;
      z-index: 3;
    }
    .ad-meta {
      margin: 0 10px 8px;
      min-height: 42px;
      display: flex;
      align-items: center;
      gap: 9px;
      color: #7c7c7c;
      font-size: 12px;
    }
    .logo { width: 28px; height: 28px; border-radius: 9px; object-fit: cover; }
    .tabs {
      height: 48px;
      padding: 0 12px;
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 6px;
      background: #fff;
      border-top: 1px solid rgba(0,0,0,.04);
      border-bottom: 1px solid rgba(0,0,0,.05);
      align-items: center;
    }
    .tab { height: 32px; border-radius: 16px; display: grid; place-items: center; color: #636363; font-size: 13px; font-weight: 700; }
    .tab.active { background: #191919; color: #fff; }
    .chat-list { background: #fff; }
    .chat {
      height: 72px;
      padding: 10px 16px;
      display: flex;
      gap: 12px;
      align-items: center;
      border-bottom: 1px solid rgba(0,0,0,.05);
    }
    .avatar { width: 48px; height: 48px; border-radius: 18px; background: #eef0f3; display: grid; place-items: center; color: #8b8b8b; font-size: 18px; font-weight: 800; }
    .chat-text { min-width: 0; flex: 1; }
    .chat-text strong { display: block; font-size: 15px; line-height: 20px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .chat-text span { display: block; margin-top: 2px; color: #8a8a8a; font-size: 12px; line-height: 16px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .time { color: #a3a3a3; font-size: 11px; align-self: flex-start; margin-top: 4px; }
    .bottom {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      height: 57px;
      background: #fff;
      border-top: 1px solid rgba(0,0,0,.07);
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      align-items: center;
      color: #777;
      font-size: 10px;
    }
    .nav { display: grid; justify-items: center; gap: 3px; }
    .nav-icon { position: relative; display: block; width: 20px; height: 20px; color: #191919; }
    .nav-icon.dot::before { content: ""; position: absolute; inset: 2px; background: currentColor; border-radius: 50%; }
    .nav-icon.circle::before { content: ""; position: absolute; inset: 2px; border: 2px solid currentColor; border-radius: 50%; }
    .nav-icon.square::before { content: ""; position: absolute; inset: 3px; border: 2px solid currentColor; border-radius: 2px; }
    .nav-icon.more::before { content: ""; position: absolute; left: 3px; top: 9px; width: 4px; height: 4px; background: currentColor; border-radius: 50%; box-shadow: 6px 0 0 currentColor, 12px 0 0 currentColor; }
  </style>
</head>
<body>
  <main class="screen">
    <header class="top">
      <div class="title">채팅</div>
      <div class="top-icons"><span class="k-icon magnify" aria-hidden="true"></span><span class="k-icon plus" aria-hidden="true"></span><span class="k-icon gear" aria-hidden="true"></span></div>
    </header>
    <section class="bizboard">
      <div class="biz-copy">
        <div class="ad">AD</div>
        <strong>${title}</strong>
        <span>${desc1 || `${sponsor} · ${displayUrl}`}</span>
      </div>
      <img class="biz-img" src="${creative}" alt="" />
      <div class="biz-cta">${cta}</div>
    </section>
    <div class="ad-meta">
      <img class="logo" src="${logo}" alt="" />
      <span><b style="color:#4d4d4d">${sponsor}</b> · 스폰서 · ${displayUrl}</span>
    </div>
    <nav class="tabs">
      <div class="tab active">전체</div>
      <div class="tab">안읽음</div>
      <div class="tab">즐겨찾기</div>
      <div class="tab">오픈채팅</div>
    </nav>
    <section class="chat-list">
      <div class="chat"><div class="avatar">나</div><div class="chat-text"><strong>나와의 채팅</strong><span>사진과 파일을 보관해보세요</span></div><div class="time">오전</div></div>
      <div class="chat"><div class="avatar">B</div><div class="chat-text"><strong>브랜드 소식</strong><span>이번 주 새 혜택을 확인해보세요</span></div><div class="time">어제</div></div>
      <div class="chat"><div class="avatar">C</div><div class="chat-text"><strong>캠페인 알림</strong><span>예약된 메시지가 정상 발송되었습니다</span></div><div class="time">화</div></div>
      <div class="chat"><div class="avatar">D</div><div class="chat-text"><strong>친구</strong><span>주말 일정 공유할게요</span></div><div class="time">월</div></div>
    </section>
    <nav class="bottom">
      <div class="nav"><i class="nav-icon dot" aria-hidden="true"></i><span>친구</span></div>
      <div class="nav"><i class="nav-icon dot" aria-hidden="true"></i><span>채팅</span></div>
      <div class="nav"><i class="nav-icon circle" aria-hidden="true"></i><span>오픈채팅</span></div>
      <div class="nav"><i class="nav-icon square" aria-hidden="true"></i><span>쇼핑</span></div>
      <div class="nav"><i class="nav-icon more" aria-hidden="true"></i><span>더보기</span></div>
    </nav>
  </main>
</body>
</html>`;
}

function renderKakaoMobileFeedHtml(ad: MobileNativeAdData): string {
  const title = escapeHtml(ad.title);
  const desc1 = escapeHtml(ad.description1);
  const desc2 = escapeHtml(ad.description2);
  const sponsor = escapeHtml(ad.sponsorName);
  const displayUrl = escapeHtml(ad.displayUrl);
  const cta = escapeHtml(ad.ctaText);
  const creative = escapeAttr(ad.creativeDataUrl);
  const logo = escapeAttr(ad.logoDataUrl);

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0" />
  <style>
    * { box-sizing: border-box; }
    html, body { width: 100%; min-height: 100%; margin: 0; background: #f4f4f4; color: #191919; font-family: "Noto Sans KR", "Roboto", -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", Arial, sans-serif; -webkit-font-smoothing: antialiased; }
    .screen { width: 100vw; min-height: 100vh; background: #f4f4f4; overflow: hidden; }
    .head { height: 58px; padding: 10px 14px; background: #fee500; display: flex; align-items: center; gap: 10px; }
    .k { font-size: 21px; font-weight: 900; letter-spacing: -.6px; }
    .search { flex: 1; height: 36px; border-radius: 18px; background: rgba(255,255,255,.78); display: flex; align-items: center; padding: 0 13px; color: #767676; font-size: 13px; }
    .head-more { position: relative; width: 24px; height: 24px; flex: 0 0 auto; }
    .head-more::before { content: ""; position: absolute; left: 2px; top: 10px; width: 4px; height: 4px; background: #191919; border-radius: 50%; box-shadow: 8px 0 0 #191919, 16px 0 0 #191919; }
    .feed { padding: 10px 10px 80px; }
    .card { background: #fff; border-radius: 15px; border: 1px solid rgba(0,0,0,.06); margin-bottom: 10px; overflow: hidden; box-shadow: 0 1px 2px rgba(0,0,0,.03); }
    .story { padding: 14px; }
    .story strong { display: block; font-size: 16px; line-height: 22px; letter-spacing: -.2px; }
    .story span { display: block; margin-top: 7px; color: #8c8c8c; font-size: 12px; }
    .ad-label { height: 36px; padding: 0 13px; display: flex; align-items: center; gap: 7px; color: #777; font-size: 12px; }
    .ad-label b { border: 1px solid #d5d5d5; color: #777; border-radius: 4px; padding: 1px 4px; font-size: 10px; }
    .ad-image { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; display: block; background: #e9e9e9; }
    .ad-body { padding: 13px; }
    .brand { display: flex; align-items: center; gap: 9px; }
    .logo { width: 34px; height: 34px; border-radius: 12px; object-fit: cover; background: #eef0f3; }
    .brand-copy { min-width: 0; flex: 1; }
    .brand-copy strong { display: block; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .brand-copy span { display: block; color: #858585; font-size: 11px; line-height: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .cta { height: 31px; min-width: 78px; border-radius: 16px; background: #191919; color: #fff; display: flex; align-items: center; justify-content: center; padding: 0 12px; font-size: 12px; font-weight: 800; }
    .ad-title { margin-top: 11px; font-size: 17px; line-height: 23px; font-weight: 850; letter-spacing: -.3px; }
    .ad-desc { margin-top: 5px; color: #606060; font-size: 13px; line-height: 19px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .bottom { position: fixed; left: 0; right: 0; bottom: 0; height: 57px; background: rgba(255,255,255,.96); border-top: 1px solid rgba(0,0,0,.08); display: grid; grid-template-columns: repeat(5, 1fr); align-items: center; color: #777; font-size: 10px; }
    .nav { display: grid; justify-items: center; gap: 3px; }
    .nav-icon { position: relative; display: block; width: 20px; height: 20px; color: #191919; }
    .nav-icon.home::before { content: ""; position: absolute; left: 3px; top: 5px; width: 14px; height: 12px; border: 2px solid currentColor; border-top: 0; border-radius: 2px; }
    .nav-icon.home::after { content: ""; position: absolute; left: 4px; top: 3px; width: 12px; height: 12px; border-left: 2px solid currentColor; border-top: 2px solid currentColor; transform: rotate(45deg); border-radius: 2px 0 0 0; }
    .nav-icon.channel::before { content: ""; position: absolute; inset: 3px; border: 2px solid currentColor; border-radius: 2px; }
    .nav-icon.channel::after { content: ""; position: absolute; left: 7px; top: 6px; width: 7px; height: 7px; border-left: 2px solid currentColor; border-bottom: 2px solid currentColor; }
    .nav-icon.plus::before,
    .nav-icon.plus::after { content: ""; position: absolute; left: 3px; top: 9px; width: 14px; height: 2px; background: currentColor; border-radius: 2px; }
    .nav-icon.plus::after { transform: rotate(90deg); }
    .nav-icon.my::before { content: ""; position: absolute; left: 5px; top: 4px; width: 10px; height: 14px; border: 2px solid currentColor; border-top-color: transparent; border-left-color: transparent; border-radius: 10px 10px 4px 10px; transform: rotate(45deg); }
    .nav-icon.menu::before { content: ""; position: absolute; left: 4px; top: 5px; width: 12px; height: 2px; background: currentColor; border-radius: 2px; box-shadow: 0 5px 0 currentColor, 0 10px 0 currentColor; }
  </style>
</head>
<body>
  <main class="screen">
    <header class="head"><div class="k">kakao</div><div class="search">관심있는 소식을 검색해보세요</div><div class="head-more" aria-hidden="true"></div></header>
    <section class="feed">
      <article class="card story"><strong>오늘의 발견</strong><span>관심사 기반으로 추천되는 콘텐츠입니다</span></article>
      <article class="card">
        <div class="ad-label"><b>AD</b><span>카카오 모바일 네이티브 광고</span></div>
        <img class="ad-image" src="${creative}" alt="" />
        <div class="ad-body">
          <div class="brand">
            <img class="logo" src="${logo}" alt="" />
            <div class="brand-copy"><strong>${sponsor}</strong><span>스폰서 · ${displayUrl}</span></div>
            <div class="cta">${cta}</div>
          </div>
          <div class="ad-title">${title}</div>
          <div class="ad-desc">${desc1}${desc2 ? `<br />${desc2}` : ""}</div>
        </div>
      </article>
      <article class="card story"><strong>추천 채널</strong><span>지금 확인하면 좋은 브랜드와 이슈</span></article>
    </section>
    <nav class="bottom">
      <div class="nav"><i class="nav-icon home" aria-hidden="true"></i><span>홈</span></div>
      <div class="nav"><i class="nav-icon channel" aria-hidden="true"></i><span>채널</span></div>
      <div class="nav"><i class="nav-icon plus" aria-hidden="true"></i><span>작성</span></div>
      <div class="nav"><i class="nav-icon my" aria-hidden="true"></i><span>MY</span></div>
      <div class="nav"><i class="nav-icon menu" aria-hidden="true"></i><span>메뉴</span></div>
    </nav>
  </main>
</body>
</html>`;
}

class MobileNativeCapture extends BaseChannel {
  private diagnostics: MobileNativeDiagnostics | null = null;

  constructor(
    private readonly platform: MobileNativePlatform,
    engine?: IBrowserEngine,
  ) {
    super(engine);
  }

  getDiagnostics(): MobileNativeDiagnostics | null {
    return this.diagnostics;
  }

  async captureAdPlacement(page: IPageHandle, request: CaptureRequest): Promise<Buffer> {
    const logPrefix = this.platform === "naver" ? "Naver" : "Kakao";
    console.log(`[${logPrefix}] ===== 모바일 네이티브 캡처 시작 =====`);
    await page.setViewport(MOBILE_AOS_VIEWPORT);
    await page.setUserAgent(UA_MOBILE_AOS);

    const opts = (request.options?.mobileNativeOpts ?? {}) as MobileNativeOpts;
    const surface = defaultSurface(this.platform, opts.surface);
    const creative = await imageUrlToDataUrl(request.creativeUrl, logPrefix);
    const logoUrl = normalizePlainText(opts.logoImageUrl);
    const logo = logoUrl
      ? await imageUrlToDataUrl(logoUrl, `${logPrefix} Logo`)
      : { dataUrl: fallbackLogoDataUrl(this.platform, normalizePlainText(opts.sponsorName)), sizeKB: 0, ok: false };

    this.diagnostics = {
      platform: this.platform,
      surface,
      creativeDownloaded: creative.ok,
      creativeBase64Size: creative.sizeKB,
      logoDownloaded: logo.ok,
      logoBase64Size: logo.sizeKB,
    };

    const ad = buildAdData(this.platform, request, creative.dataUrl, logo.dataUrl);
    const html =
      this.platform === "naver"
        ? renderNaverHtml(ad)
        : surface === "kakao-mobile-feed"
          ? renderKakaoMobileFeedHtml(ad)
          : renderKakaoBizboardHtml(ad);

    await page.goto("about:blank", { waitUntil: "load", timeout: 10000 });
    await page.evaluate<void>(`
      document.open();
      document.write(${JSON.stringify(html)});
      document.close();
      window.scrollTo(0, 0);
    `);
    await injectKoreanFonts(page);
    await new Promise((r) => setTimeout(r, 800));

    const screenshot = await page.screenshot({
      fullPage: false,
      type: "png",
      clip: {
        x: 0,
        y: 0,
        width: MOBILE_AOS_VIEWPORT.width,
        height: MOBILE_AOS_VIEWPORT.height,
      },
    });
    console.log(`[${logPrefix}] ===== 모바일 네이티브 캡처 완료 (${surface}) =====`);
    return screenshot;
  }
}

export class NaverCapture extends MobileNativeCapture {
  constructor(engine?: IBrowserEngine) {
    super("naver", engine);
  }
}

export class KakaoCapture extends MobileNativeCapture {
  constructor(engine?: IBrowserEngine) {
    super("kakao", engine);
  }
}

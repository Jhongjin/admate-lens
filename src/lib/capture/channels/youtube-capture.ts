/**
 * YouTube Capture v1 ??YouTube 愿묎퀬 罹≪쿂 紐⑤뱢
 *
 * 吏??愿묎퀬 ?좏삎:
 * 1. ?몄뒪?몃┝ (?꾨━濡? ???곸긽 ?뚮젅?댁뼱???꾨━濡?愿묎퀬 ?쒕??덉씠??
 * 2. ?붿뒪?뚮젅?????ъ씠?쒕컮 而댄뙣?덉뼵 諛곕꼫 ?곸뿭???몄젥??
 * 3. ?ㅻ쾭?덉씠 ???곸긽 ?뚮젅?댁뼱 ?섎떒 諛섑닾紐??ㅻ쾭?덉씠 諛곕꼫
 */

import type { IPageHandle } from "../engine/browser-engine";
import { BaseChannel, type CaptureRequest } from "./base-channel";

/** YouTube 愿묎퀬 ?좏삎 */
export type YouTubeAdType = "preroll" | "display" | "overlay";

/** YouTube 罹≪쿂 吏꾨떒 ?뺣낫 */
export interface YouTubeDiagnostics {
  adType: YouTubeAdType;
  playerFound: boolean;
  playerSize: { width: number; height: number };
  sidebarFound: boolean;
  injectionSuccess: boolean;
  creativeDownloaded: boolean;
  creativeBase64Size: number;
}

/**
 * ?대?吏 URL ??base64 data URL 蹂??(?쒕쾭 痢?
 */
async function imageUrlToDataUrl(imageUrl: string): Promise<{ dataUrl: string; sizeKB: number; ok: boolean }> {
  try {
    console.log(`[YouTube] ?뚯옱 ?대?吏 ?ㅼ슫濡쒕뱶 ?쒖옉: ${imageUrl}`);
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const contentType = response.headers.get("content-type") || "image/png";
    const arrayBuffer = await response.arrayBuffer();
    const sizeKB = Math.round(arrayBuffer.byteLength / 1024);
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const dataUrl = `data:${contentType};base64,${base64}`;
    console.log(`[YouTube] ?뚯옱 ?대?吏 蹂???꾨즺 (${contentType}, ${sizeKB}KB)`);
    return { dataUrl, sizeKB, ok: true };
  } catch (err) {
    console.error(`[YouTube] ?뚯옱 ?대?吏 ?ㅼ슫濡쒕뱶 ?ㅽ뙣:`, err);
    return { dataUrl: imageUrl, sizeKB: 0, ok: false };
  }
}

/** ?몄뒪?몃┝ 硫뷀??곗씠??(API쨌?쇱뿉??options.instreamOpts 濡??꾨떖) */
type InstreamOptsPayload = {
  videoUrl?: string;
  skipSeconds?: number;
  adTitle?: string;
  ctaText?: string;
  landingUrl?: string;
  companionImageUrl?: string;
};

/** YouTube URL?먯꽌 Video ID 異붿텧 */
function extractVideoId(url: string): string | null {
  try {
    const u = new URL(url.trim());
    if (u.hostname.includes("youtube.com") && u.pathname === "/watch") {
      return u.searchParams.get("v");
    }
    if (u.hostname === "youtu.be") {
      const id = u.pathname.replace(/^\//, "").split("/")[0]?.split("?")[0];
      return id || null;
    }
    if (u.pathname.startsWith("/embed/")) return u.pathname.split("/embed/")[1]?.split("?")[0] || null;
    if (u.pathname.startsWith("/live/")) return u.pathname.split("/live/")[1]?.split("?")[0] || null;
    return null;
  } catch {
    return null;
  }
}

/** YouTube ?몃꽕??URL ?앹꽦 (怨듦컻 API, ?몄쬆 遺덊븘?? */
function getThumbnailUrl(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
}

export class YouTubeCapture extends BaseChannel {
  private diagnostics: YouTubeDiagnostics | null = null;

  getDiagnostics(): YouTubeDiagnostics | null {
    return this.diagnostics;
  }

  async captureAdPlacement(page: IPageHandle, request: CaptureRequest): Promise<Buffer> {
    const adType = (request.options?.youtubeAdType as YouTubeAdType) || "preroll";
    console.log(`[YouTube] ===== 罹≪쿂 ?쒖옉 =====`);
    console.log(`[YouTube] ?곸긽 URL: ${request.publisherUrl}`);
    console.log(`[YouTube] 愿묎퀬 ?좏삎: ${adType}`);
    const instreamOpts = (request.options?.instreamOpts as InstreamOptsPayload | undefined) ?? {};
    /** ?꾨━濡? 罹≪쿂 ?쒖젏(珥? ??誘몄??빧룸퉬?뺤긽 ??5珥?*/
    const prerollCaptureSeconds: number | null =
      adType === "preroll"
        ? (() => {
            const s = instreamOpts.skipSeconds;
            if (typeof s === "number" && Number.isFinite(s) && s >= 0) return s;
            return 5;
          })()
        : null;

    console.log(`[YouTube] ?뚯옱(creative_url): ${request.creativeUrl || "(?놁쓬)"}`);
    if (adType === "preroll" && instreamOpts.videoUrl) {
      console.log(`[YouTube] ?몄뒪?몃┝ 愿묎퀬 ?숈쁺??URL: ${instreamOpts.videoUrl}`);
    }

    // 珥덇린??
    this.diagnostics = {
      adType,
      playerFound: false,
      playerSize: { width: 0, height: 0 },
      sidebarFound: false,
      injectionSuccess: false,
      creativeDownloaded: false,
      creativeBase64Size: 0,
    };

    // 1) ?뚯옱 ?대?吏 ??base64 data URL
    // ?몄뒪?몃┝? ?쇱뿉??creativeUrl ?놁씠 videoUrl留?蹂대궡??寃쎌슦媛 留롮쓬 ??愿묎퀬 ?숈쁺?곸쓽 ?몃꽕?쇱쓣 ?뚯옱濡??ъ슜
    const rawCreative = (request.creativeUrl || "").trim();
    let creativeFetchUrl = rawCreative;
    let prerollAdVideoId: string | null = null;
    if (instreamOpts.videoUrl?.trim()) {
      prerollAdVideoId = extractVideoId(instreamOpts.videoUrl.trim());
    }
    if (adType === "preroll") {
      if (rawCreative && /youtube\.com|youtu\.be/i.test(rawCreative)) {
        const id = extractVideoId(rawCreative);
        if (id) {
          creativeFetchUrl = getThumbnailUrl(id);
          prerollAdVideoId = prerollAdVideoId || id;
        }
      } else if (!rawCreative && prerollAdVideoId) {
        creativeFetchUrl = getThumbnailUrl(prerollAdVideoId);
      }
    }

    let { dataUrl: creativeDataUrl, sizeKB, ok } = creativeFetchUrl
      ? await imageUrlToDataUrl(creativeFetchUrl)
      : { dataUrl: "", sizeKB: 0, ok: false };
    if (adType === "preroll" && !ok && prerollAdVideoId) {
      const fb = await imageUrlToDataUrl(
        `https://img.youtube.com/vi/${prerollAdVideoId}/hqdefault.jpg`
      );
      if (fb.ok) {
        creativeDataUrl = fb.dataUrl;
        sizeKB = fb.sizeKB;
        ok = true;
      }
    }
    this.diagnostics.creativeDownloaded = ok;
    this.diagnostics.creativeBase64Size = sizeKB;
    if (adType === "preroll" && !ok) {
      console.error(
        `[YouTube] ?몄뒪?몃┝ ?뚯옱 ?대?吏 ?뺣낫 ?ㅽ뙣 ??creativeUrl쨌videoUrl???뺤씤?섏꽭??(fetch ?쒕룄: ${creativeFetchUrl || "(?놁쓬)"})`
      );
    }

    // 1.5) ?뼹截?鍮꾨뵒??ID 異붿텧 + ?몃꽕??以鍮?
    const videoId = extractVideoId(request.publisherUrl);
    let thumbnailDataUrl: string | null = null;
    if (videoId) {
      const thumbResult = await imageUrlToDataUrl(getThumbnailUrl(videoId));
      if (thumbResult.ok) {
        thumbnailDataUrl = thumbResult.dataUrl;
        console.log(`[YouTube] ?뼹截??몃꽕???ㅼ슫濡쒕뱶 ?깃났 (${thumbResult.sizeKB}KB)`);
      } else {
        // fallback: hqdefault
        const fallback = await imageUrlToDataUrl(`https://img.youtube.com/vi/${videoId}/hqdefault.jpg`);
        if (fallback.ok) {
          thumbnailDataUrl = fallback.dataUrl;
          console.log(`[YouTube] ?뼹截??몃꽕???대갚(hqdefault) ?깃났`);
        }
      }
    }

    // 2) ?뜧 荑좏궎 ?숈쓽 ?ъ쟾 泥섎━ ??CONSENT 荑좏궎 ?ㅼ젙
    console.log(`[YouTube] ?뜧 荑좏궎 ?숈쓽 ?ъ쟾 泥섎━ ?쒖옉`);
    try {
      // YouTube ?꾨찓?몄뿉 CONSENT 荑좏궎 ?ㅼ젙 (?숈쓽 ?꾨즺 ?곹깭)
      await page.setCookie({
        name: "CONSENT",
        value: "PENDING+987",
        domain: ".youtube.com",
        path: "/",
      });
      await page.setCookie({
        name: "CONSENT",
        value: "YES+cb.20210328-17-p0.en+FX+987",
        domain: ".youtube.com",
        path: "/",
      });
      // SOCS 荑좏궎???ㅼ젙 (Google ?듯빀 ?숈쓽)
      await page.setCookie({
        name: "SOCS",
        value: "CAISHAgBEhJnd3NfMjAyMzA4MTUtMF9SQzIaAmVuIAEaBgiA_LyaBg",
        domain: ".youtube.com",
        path: "/",
      });
      console.log(`[YouTube] ?뜧 CONSENT 荑좏궎 ?ㅼ젙 ?꾨즺`);
    } catch (cookieErr) {
      console.warn(`[YouTube] ?뜧 荑좏궎 ?ㅼ젙 ?ㅽ뙣 (吏꾪뻾 怨꾩냽):`, cookieErr);
    }

    // 3) YouTube ?섏씠吏 濡쒕뱶 ???뵎 embed-first ?꾨왂
    // YouTube /watch ?섏씠吏??遊?媛먯?媛 留ㅼ슦 媛뺣젰?섎?濡?
    // /embed/ URL濡?癒쇱? ?묎렐?섏뿬 遊?媛먯?瑜??고쉶
    const targetUrl =
      adType === "preroll" && instreamOpts.videoUrl?.trim()
        ? instreamOpts.videoUrl.trim()
        : request.publisherUrl;

    // ?벟 YouTube watch ?섏씠吏 濡쒕뱶 (?덉씠?꾩썐 ?뺣낫 紐⑹쟻)
    await page.goto(targetUrl, {
      waitUntil: "networkidle2",
      timeout: 45000,
    });

    // 3.3) ?뵥 ?쒓? ?고듃 二쇱엯 (Vercel ?쒕쾭由ъ뒪 Chromium?먮뒗 CJK ?고듃媛 ?놁쓬)
    await this.injectKoreanFonts(page);

    // 3.5) 荑좏궎 ?숈쓽 ?앹뾽 媛뺤젣 泥섎━
    await this.dismissYouTubeConsent(page);

    // 4) YouTube ?섏씠吏 ?덉젙???湲?
    await new Promise((r) => setTimeout(r, 3000));

    // 4.5) 荑좏궎 ?숈쓽 ?앹뾽???ъ쟾???덉쑝硫??ъ떆??
    const hasConsent = await page.evaluate<boolean>(`
      (() => {
        const consentDialog = document.querySelector(
          'ytd-consent-bump-v2-lightbox, tp-yt-iron-overlay-backdrop, ' +
          '[action*="consent"], #consent-bump, .consent-bump-v2-lightbox, ' +
          'ytd-enforcement-message-view-model'
        );
        return !!consentDialog;
      })()
    `);

    if (hasConsent) {
      console.log(`[YouTube] ?뜧 荑좏궎 ?숈쓽 ?앹뾽 ?ъ쟾??議댁옱 ??媛뺤젣 ?쒓굅 + ?섏씠吏 由щ줈??);
      await page.evaluate<void>(`
        (() => {
          const selectors = [
            'ytd-consent-bump-v2-lightbox',
            'tp-yt-iron-overlay-backdrop',
            '#consent-bump',
            '.consent-bump-v2-lightbox',
            'ytd-enforcement-message-view-model',
            'tp-yt-paper-dialog',
            'ytd-popup-container',
          ];
          selectors.forEach(sel => {
            document.querySelectorAll(sel).forEach(el => el.remove());
          });
          document.body.style.overflow = '';
          document.documentElement.style.overflow = '';
        })()
      `);
      await page.goto(targetUrl, { waitUntil: "networkidle2", timeout: 45000 });
      await new Promise((r) => setTimeout(r, 3000));
    }

    // ?뵎 4.7) 遊?媛먯? ?뺤씤 + 媛뺣젰???대갚 ?꾨왂
    const botDetected = await this.checkBotDetection(page);

    if (botDetected) {
      console.log("[YouTube] Bot detected - fallback: force thumbnail replacement");

      // ?뵎 ?듭떖 ?꾨왂: 遊?媛먯? ???뚮젅?댁뼱 ?곸뿭???꾩쟾????DOM?쇰줈 援먯껜
      // embed iframe? 遊?媛먯? ?곹깭?먯꽌???ㅽ뙣?????덉쑝誘濡?
      // 媛뺤젣濡?紐⑤뱺 遊?愿???붿냼瑜??쒓굅 + ?뚮젅?댁뼱瑜??몃꽕?쇰줈 ?꾩쟾 援먯껜
      
      // 1?④퀎: 遊?媛먯? 愿??紐⑤뱺 DOM ?붿냼瑜?媛뺣젰?섍쾶 ?쒓굅
      await this.nukeAllBotElements(page);
      await new Promise((r) => setTimeout(r, 500));

      // 2?④퀎: ?뚮젅?댁뼱 ?곸뿭???몃꽕?쇰줈 ?꾩쟾 援먯껜
      if (thumbnailDataUrl) {
        console.log("[YouTube] Replace player with thumbnail");
        await this.forceReplacePlayerWithThumbnail(page, thumbnailDataUrl);
        await new Promise((r) => setTimeout(r, 1000));
      }

      // 3?④퀎: ?뱀떆 ?⑥븘?덈뒗 遊?硫붿떆吏 ?띿뒪??理쒖쥌 ?쒓굅
      await this.nukeAllBotElements(page);
    }

    // 5) ?꾨━濡? 吏??珥덈줈 ?쒗겕 (?ㅼ젣 愿묎퀬 ?곸긽 ?대떦 ?쒖젏 罹≪쿂??
    if (prerollCaptureSeconds !== null) {
      console.log("[YouTube] Seek preroll video to " + prerollCaptureSeconds + "s");
      await page.evaluate((t) => {
        const v = document.querySelector("video.html5-main-video") as HTMLVideoElement | null;
        if (!v) return;
        try {
          v.pause();
          v.currentTime = Math.max(0, t);
        } catch (e) {
          console.error("[YouTube] Video seek failed", e);
        }
      }, prerollCaptureSeconds);
      await page.evaluate(
        () =>
          new Promise<void>((resolve) => {
            const v = document.querySelector("video.html5-main-video") as HTMLVideoElement | null;
            if (!v) {
              resolve();
              return;
            }
            const done = () => resolve();
            v.addEventListener("seeked", done, { once: true });
            setTimeout(done, 2500);
          })
      );
      await new Promise((r) => setTimeout(r, 500));
    }

    // 5.5) ?곸긽 ?쇱떆?뺤? (?쒗겕????꾨씪?몄? ?좎? ??currentTime=2 蹂댁젙 ?놁쓬)
    await this.pauseVideo(page, { preserveTimeline: prerollCaptureSeconds !== null });
    await new Promise((r) => setTimeout(r, 800));

    // 5.6) ?꾨━濡? ?대떦 ?쒖젏 鍮꾨뵒???꾨젅?????ㅻ쾭?덉씠 ?뚯옱 (?몃꽕?????
    let prerollOverlayDataUrl = creativeDataUrl;
    let prerollVideoDurationSec = 0;
    if (prerollCaptureSeconds !== null) {
      prerollVideoDurationSec = await page.evaluate<number>(() => {
        const v = document.querySelector("video.html5-main-video") as HTMLVideoElement | null;
        if (!v || !Number.isFinite(v.duration) || v.duration <= 0) return 0;
        return v.duration;
      });
      const frameShot = await page.screenshotElement?.("video.html5-main-video", {
        type: "jpeg",
        quality: 82,
      });
      if (frameShot && frameShot.length > 200) {
        prerollOverlayDataUrl = "data:image/jpeg;base64," + frameShot.toString("base64");
        console.log(
          "[YouTube] Use preroll frame at " +
            prerollCaptureSeconds +
            "s (" +
            Math.round(frameShot.length / 1024) +
            "KB)"
        );
      } else {
        console.warn(`[YouTube] ?좑툘 鍮꾨뵒???꾨젅??罹≪쿂 ?ㅽ뙣 ???몃꽕???뚯옱濡?吏꾪뻾`);
      }
    }

    const prerollProgressPercent =
      prerollCaptureSeconds !== null
        ? (() => {
            const denom =
              prerollVideoDurationSec > 0
                ? prerollVideoDurationSec
                : Math.max(15, prerollCaptureSeconds + 1);
            return Math.min(100, Math.max(0, (prerollCaptureSeconds / denom) * 100));
          })()
        : 33.33;

    // 6) ?뚮젅?댁뼱 ?뺣낫 ?섏쭛 (?뺤옣????됲꽣)
    const playerInfo = await page.evaluate<{ found: boolean; width: number; height: number; top: number; left: number; sidebarFound: boolean }>(`
      (() => {
        // ?ㅼ뼇????됲꽣濡??뚮젅?댁뼱 ?먯깋 (?곗꽑?쒖쐞 ??
        const playerSelectors = [
          '#movie_player',
          '#player-container-inner',
          '#player-container-outer',
          'ytd-player#ytd-player',
          'ytd-player',
          '.html5-video-player',
          '#player',
          '#ytd-player',
          'div.ytd-watch-flexy#player',
        ];

        let player = null;
        for (const sel of playerSelectors) {
          const el = document.querySelector(sel);
          if (el) {
            const rect = el.getBoundingClientRect();
            // ?ㅼ젣 ?ш린媛 ?덈뒗 ?붿냼留??ъ슜
            if (rect.width > 100 && rect.height > 100) {
              player = el;
              break;
            }
          }
        }

        const sidebar = document.querySelector('#secondary, #related, ytd-watch-next-secondary-results-renderer');
        
        if (!player) return { found: false, width: 0, height: 0, top: 0, left: 0, sidebarFound: !!sidebar };
        
        const rect = player.getBoundingClientRect();
        return {
          found: true,
          width: Math.round(rect.width),
          height: Math.round(rect.height),
          top: Math.round(rect.top),
          left: Math.round(rect.left),
          sidebarFound: !!sidebar
        };
      })()
    `);

    this.diagnostics.playerFound = playerInfo.found;
    this.diagnostics.playerSize = { width: playerInfo.width, height: playerInfo.height };
    this.diagnostics.sidebarFound = playerInfo.sidebarFound;
    console.log(`[YouTube] ?뚮젅?댁뼱: ${playerInfo.found ? `??${playerInfo.width}x${playerInfo.height}` : "??誘멸컧吏"}`);
    console.log(`[YouTube] ?ъ씠?쒕컮: ${playerInfo.sidebarFound ? "?? : "??}`);

    // 6.5) ?㏏ ?몄젥????諛⑺빐 ?붿냼 ?쒓굅 (援щ룆 ?앹뾽, 遊?媛먯?, ?숈쓽 ?앹뾽 ??
    await page.evaluate<void>(`
      (() => {
        // 1) "梨꾨꼸??援щ룆?섏떆寃좎뒿?덇퉴?" ?앹뾽 ?꾩쟾 ?쒓굅
        const popupSelectors = [
          'ytd-popup-container',
          'tp-yt-paper-dialog',
          'yt-confirm-dialog-renderer',
          'ytd-modal-with-title-and-button-renderer',
          'ytd-mealbar-promo-renderer',
          '#dialog',
        ];
        popupSelectors.forEach(sel => {
          document.querySelectorAll(sel).forEach(el => el.remove());
        });

        // 2) "濡쒓렇?명븯??遊뉗씠 ?꾨떂???뺤씤?섏꽭?? 硫붿떆吏 ?④?
        //    ?뚮젅?댁뼱 ?대????먮윭/?뺤씤 ?ㅻ쾭?덉씠瑜??④?
        const playerErrorSelectors = [
          '.ytp-error',
          '.ytp-error-content',
          '.ytp-error-content-wrap',
          '.ytp-error-content-wrap-reason',
          '.ytp-offline-slate',
          '.ytp-offline-slate-bar',
          'ytd-enforcement-message-view-model',
          '.ytp-pause-overlay',
          '#clarify-box',
          '.ytp-suggested-action',
          // 遊??뺤씤 硫붿떆吏 (濡쒓렇???꾨＼?꾪듃)
          '.ytp-error-content-wrap .ytp-error-content-wrap-reason',
        ];
        playerErrorSelectors.forEach(sel => {
          document.querySelectorAll(sel).forEach(el => {
            el.style.display = 'none !important';
            el.style.visibility = 'hidden !important';
            el.style.opacity = '0 !important';
          });
        });

        // 3) 荑좏궎 ?숈쓽 愿???붿냼 ?쒓굅
        const consentSelectors = [
          'ytd-consent-bump-v2-lightbox',
          'tp-yt-iron-overlay-backdrop',
          '#consent-bump',
          '.consent-bump-v2-lightbox',
        ];
        consentSelectors.forEach(sel => {
          document.querySelectorAll(sel).forEach(el => el.remove());
        });

        // 4) ?띿뒪??湲곕컲?쇰줈 "遊뉗씠 ?꾨떂" 硫붿떆吏媛 ?ы븿???붿냼 ?④?
        const allTexts = document.querySelectorAll('*');
        allTexts.forEach(el => {
          const text = el.textContent || '';
          if (
            (text.includes('遊뉗씠 ?꾨떂???뺤씤') || text.includes('confirm you') ||
             text.includes('Confirm your identity') || text.includes('濡쒓렇?명븯??)) &&
            el.closest('#movie_player, #player-container-inner, .html5-video-player')
          ) {
            el.style.display = 'none';
          }
        });

        // 5) body/html overflow 蹂듭썝 (紐⑤떖???ㅽ겕濡?留됰뒗 寃쎌슦)
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.documentElement.style.overflow = '';

        console.log('[YouTube Cleanup] ??諛⑺빐 ?붿냼 ?쒓굅 ?꾨즺');
      })()
    `);

    // 7) 愿묎퀬 ?좏삎蹂??몄젥??
    let injectionSuccess = false;

    switch (adType) {
      case "preroll": {
        const prerollUiOpts = {
          adTitle: instreamOpts.adTitle || "",
          ctaText: instreamOpts.ctaText || "",
          landingUrl: instreamOpts.landingUrl || request.clickUrl || "",
          companionImageUrl: instreamOpts.companionImageUrl || "",
          progressFillPercent: prerollProgressPercent,
        };
        console.log(
          `[YouTube] ?몄뒪?몃┝ ?듭뀡: title="${prerollUiOpts.adTitle}" cta="${prerollUiOpts.ctaText}" landing="${prerollUiOpts.landingUrl}" progress=${prerollProgressPercent.toFixed(1)}%`
        );

        injectionSuccess = await this.injectPrerollAd(page, prerollOverlayDataUrl, playerInfo, prerollUiOpts);
        // ?렞 而댄뙣?덉뼵 諛곕꼫 ?숈떆 ?쎌엯
        if (injectionSuccess) {
          const companionImg = prerollUiOpts.companionImageUrl || creativeDataUrl;
          const companionResult = await this.injectDisplayAd(page, companionImg);
          console.log(`[YouTube] 而댄뙣?덉뼵 諛곕꼫: ${companionResult ? '???깃났' : '?좑툘 ?ㅽ뙣'}`);
        }
        break;
      }
      case "display":
        injectionSuccess = await this.injectDisplayAd(page, creativeDataUrl);
        break;
      case "overlay":
        injectionSuccess = await this.injectOverlayAd(page, creativeDataUrl, playerInfo);
        break;
    }

    this.diagnostics.injectionSuccess = injectionSuccess;

    if (!injectionSuccess) {
      console.warn(`[YouTube] ?좑툘 湲곕낯 ?몄젥???ㅽ뙣 ???대갚: ?꾨━濡?媛뺤젣 ?ㅻ쾭?덉씠`);
      await this.injectPrerollAd(page, prerollOverlayDataUrl, playerInfo, {
        progressFillPercent: prerollProgressPercent,
      });
    }

    // 8) ?뚮뜑留??덉젙??
    await new Promise((r) => setTimeout(r, 2000));

    // 9) ?ㅽ겕濡?理쒖긽??蹂듭썝
    await page.evaluate<void>(`
      (() => {
        window.scrollTo({ top: 0, behavior: 'instant' });
        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
      })()
    `);
    await new Promise((r) => setTimeout(r, 1000));

    // 9.5) ?ㅼ씠?곕툕 video/canvas ?④? ??Headless?먯꽌 ?ъ깮 ?덉씠?닿? GPU濡??⑹꽦?섎ŉ
    //      ?몄젥?섑븳 愿묎퀬 ?대?吏蹂대떎 ?꾩뿉 洹몃젮???숈쁺???곸뿭留?鍮??? ?붾㈃?쇰줈 罹≪쿂?섎뒗 寃쎌슦媛 ?덉쓬
    await page.evaluate<void>(`
      (() => {
        const hide = (el) => {
          el.style.setProperty("visibility", "hidden", "important");
          el.style.setProperty("opacity", "0", "important");
          el.style.setProperty("pointer-events", "none", "important");
        };
        document.querySelectorAll("video").forEach(hide);
        document
          .querySelectorAll("#movie_player canvas, .html5-video-player canvas, ytd-player canvas")
          .forEach(hide);
      })()
    `);
    await new Promise((r) => setTimeout(r, 300));

    // 10) ?꾩껜 ?섏씠吏 ?ㅽ겕由곗꺑
    const screenshot = await page.screenshot({
      fullPage: false, // YouTube??酉고룷??罹≪쿂媛 ???곹빀
      type: "png",
    });

    console.log(`[YouTube] ===== 罹≪쿂 ?꾨즺 (${adType}) =====`);
    return screenshot;
  }

  /**
   * ?렗 ?몄뒪?몃┝ (?꾨━濡? 愿묎퀬 ?쒕??덉씠??
   * ?뱦 ?ㅼ젣 YouTube ?몄뒪?몃┝ 愿묎퀬 ?뺥깭瑜??뺥솗???ы쁽:
   *   - 醫뚯긽?? ?묒? "愿묎퀬" ?쇰꺼
   *   - 醫뚰븯?? 移대뱶??CTA (?몃꽕??+ ?곹뭹紐?+ CTA 踰꾪듉 + "?ㅽ룿??쨌 URL")
   *   - ?고븯?? "嫄대꼫?곌린 ??" 踰꾪듉
   *   - ?섎떒: ?몃????꾨줈洹몃젅??諛?
   */
  private async injectPrerollAd(
    page: IPageHandle,
    imgDataUrl: string,
    playerInfo: { found: boolean; width: number; height: number; top: number; left: number },
    instreamOpts: {
      adTitle?: string;
      ctaText?: string;
      landingUrl?: string;
      skipSeconds?: number;
      companionImageUrl?: string;
      progressFillPercent?: number;
    } = {}
  ): Promise<boolean> {
    console.log(`[YouTube] ?렗 ?꾨━濡?愿묎퀬 ?몄젥???쒖옉`);

    // ?쒕뵫 URL?먯꽌 ?꾨찓??異붿텧
    let landingDomain = 'advertiser.com';
    try {
      if (instreamOpts.landingUrl) {
        landingDomain = new URL(instreamOpts.landingUrl).hostname.replace('www.', '');
      }
    } catch { /* ignore */ }

    const adTitle = instreamOpts.adTitle || '愿묎퀬二??ъ씠??諛⑸Ц';
    const ctaText = instreamOpts.ctaText || '?먯꽭???뚯븘蹂닿린';
    const progressFill =
      typeof instreamOpts.progressFillPercent === "number" && Number.isFinite(instreamOpts.progressFillPercent)
        ? Math.min(100, Math.max(0, instreamOpts.progressFillPercent))
        : 33.33;

    const result = await page.evaluate<boolean>(`
      (() => {
        try {
          const progressFillPct = ${JSON.stringify(progressFill)};
          const imgUrl = ${JSON.stringify(imgDataUrl)};
          const domainText = ${JSON.stringify(landingDomain)};
          const titleText = ${JSON.stringify(adTitle)};
          const ctaBtnText = ${JSON.stringify(ctaText)};

          // ?뚮젅?댁뼱 醫뚰몴 ?섏쭛
          const playerSelectors = [
            '#movie_player', '#player-container-inner', '#player-container-outer',
            'ytd-player', '.html5-video-player', '#player',
          ];

          let playerRect = null;
          for (const sel of playerSelectors) {
            const el = document.querySelector(sel);
            if (el) {
              const r = el.getBoundingClientRect();
              if (r.width > 100 && r.height > 100) {
                playerRect = r;
                break;
              }
            }
          }

          const px = playerRect ? Math.round(playerRect.left) : 0;
          const py = playerRect ? Math.round(playerRect.top) : 56;
          const pw = playerRect ? Math.round(playerRect.width) : Math.round(window.innerWidth * 0.7);
          const ph = playerRect ? Math.round(playerRect.height) : Math.round(window.innerHeight * 0.6);

          // ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧??
          // 硫붿씤 ?ㅻ쾭?덉씠 (?뚮젅?댁뼱 ?꾩껜瑜???쓬 + ?쇱슫??
          // ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧??
          const overlay = document.createElement('div');
          overlay.id = 'admate-preroll-overlay';
          overlay.setAttribute('data-injected', 'admate-youtube-preroll');
          overlay.style.cssText = [
            'position: fixed',
            'top: ' + py + 'px',
            'left: ' + px + 'px',
            'width: ' + pw + 'px',
            'height: ' + ph + 'px',
            'z-index: 2147483647',
            'display: flex',
            'align-items: center',
            'justify-content: center',
            'overflow: hidden',
            'border-radius: 12px',
          ].join(' !important;') + ' !important';

          // ??? 愿묎퀬 ?뚯옱 ?대?吏 (議댁옱??寃쎌슦 ?붾㈃ 苑?梨꾩?) ???
          if (imgUrl) {
            overlay.style.background = '#000 !important';
            const img = document.createElement('img');
            img.src = imgUrl;
            img.setAttribute('data-injected', 'admate');
            img.style.cssText = 'width:100% !important;height:100% !important;object-fit:cover !important;display:block !important;position:absolute !important;top:0 !important;left:0 !important;z-index:1 !important';
            overlay.appendChild(img);
          } else {
            overlay.style.background = 'transparent !important';
          }

          // ??? 醫뚯긽?? "愿묎퀬" ?쇰꺼 (?ㅼ젣 YouTube泥섎읆 洹뱁엳 誘몄꽭?섍쾶) ???
          const adLabel = document.createElement('div');
          adLabel.style.cssText = "position:absolute;top:10px;left:10px;color:rgba(255,255,255,0.5);font-size:10px;font-family:'Roboto',Arial,sans-serif;font-weight:400;letter-spacing:0.2px;z-index:10";
          adLabel.textContent = '愿묎퀬';
          overlay.appendChild(adLabel);

          // ?먥븧??醫뚰븯?? CTA 移대뱶 ?먥븧??
          // ?뱦 YouTube ?ㅼ젣 CSS 洹몃?濡??곸슜 (DevTools 異붿텧):
          //   .ytp-ad-avatar-lockup-card { padding: 12px; max-width: 400px; }
          //   .ytp-delhi-modern .ytp-ad-avatar-lockup-card { background: rgba(0,0,0,.6); border-radius: 8px; }
          //   --yt-frosted-glass-backdrop-filter-override: none; ??blur ?놁쓬
          //   .ytp-ad-player-overlay-layout__player-card-container { bottom: 95px; left: 22px; }
          const ctaCard = document.createElement('div');
          ctaCard.style.cssText = [
            'position: absolute',
            'bottom: 95px',
            'left: 22px',
            'display: flex',
            'align-items: center',
            'background: rgba(0,0,0,0.6)',
            'border-radius: 8px',
            'padding: 12px',
            'max-width: 400px',
            'z-index: 10',
            'overflow: hidden',
            'cursor: pointer',
          ].join(' !important;') + ' !important';

          // ?먰삎 ?꾩씠肄?(ytp-ad-avatar--size-m = 40px)
          if (imgUrl) {
            const ctaIcon = document.createElement('img');
            ctaIcon.src = imgUrl;
            ctaIcon.style.cssText = 'width:40px !important;height:40px !important;border-radius:50% !important;object-fit:cover !important;flex-shrink:0 !important;margin-right:12px !important';
            ctaCard.appendChild(ctaIcon);
          } else {
            // ?대?吏媛 ?놁쑝硫?湲곕낯 ?꾩씠肄??쒖떆 (?ъ슜???꾨컮? ?먮굦)
            const ctaIconFallback = document.createElement('div');
            ctaIconFallback.style.cssText = 'width:40px !important;height:40px !important;border-radius:50% !important;background:#555 !important;display:flex;align-items:center;justify-content:center;flex-shrink:0 !important;margin-right:12px !important;color:#fff;font-size:20px;';
            ctaIconFallback.textContent = titleText.charAt(0) || '??;
            ctaCard.appendChild(ctaIconFallback);
          }

          // ?띿뒪???곸뿭 (愿묎퀬?쒕ぉ + ?꾨찓??
          const ctaTextDiv = document.createElement('div');
          ctaTextDiv.style.cssText = 'flex:1;min-width:0;margin-right:12px';
          ctaTextDiv.innerHTML = [
            '<div style="font-size:14px;font-weight:500;color:#fff;font-family:YouTube Noto,Roboto,Arial,Helvetica,sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:20px">' + titleText + '</div>',
            '<div style="font-size:12px;color:rgba(255,255,255,0.7);font-family:YouTube Noto,Roboto,Arial,Helvetica,sans-serif;margin-top:2px;line-height:16px">' + domainText + '</div>',
          ].join('');
          ctaCard.appendChild(ctaTextDiv);

          // ??CTA 踰꾪듉 (ytp-ad-button-vm--style-filled-white)
          // YouTube CSS: --yt-spec-white-3: #f1f1f1
          const ctaBtn = document.createElement('div');
          ctaBtn.style.cssText = "background:#f1f1f1;color:#0f0f0f;font-size:14px;font-weight:500;font-family:YouTube Noto,Roboto,Arial,Helvetica,sans-serif;padding:9px 16px;border-radius:18px;white-space:nowrap;cursor:pointer;flex-shrink:0";
          ctaBtn.textContent = ctaBtnText;
          ctaCard.appendChild(ctaBtn);

          overlay.appendChild(ctaCard);

          // ??? 醫뚰븯???섏쐞: "?ㅽ룿?????꾨찓?? ???
          // YouTube ?먮낯 DOM怨??숈씪?섍쾶 而щ윭(#fff), 洹몃┝?? margin ?곸슜
          const sponsorText = document.createElement('div');
          sponsorText.style.cssText = "position:absolute;bottom:68px;left:22px;font-size:13px;color:#fff;font-family:YouTube Noto,Roboto,Arial,Helvetica,sans-serif;z-index:10;display:flex;align-items:center;font-weight:500;text-shadow:0 0 2px rgba(0,0,0,0.5)";
          
          sponsorText.innerHTML = [
            '<span style="line-height:16px;">?ㅽ룿??/span>',
            '<span style="display:flex;align-items:center;margin:0 6px 0 4px;">',
              '<svg fill="#fff" height="14px" viewBox="0 -960 960 960" width="14px" style="filter:drop-shadow(0px 0px 2px rgba(0,0,0,0.5));">',
                '<path d="M430.09-270.8h101.34V-528H430.09v257.2Zm49.52-338.03q20.94 0 35.34-14.01 14.4-14.01 14.4-34.95 0-20.94-14.01-35.34-14.01-14.39-34.95-14.39-20.94 0-35.34 14.01-14.4 14.01-14.4 34.95 0 20.94 14.01 35.34 14.01 14.39 34.95 14.39Zm.67 548.18q-86.64 0-163.19-32.66-76.56-32.66-133.84-89.94t-89.94-133.8q-32.66-76.51-32.66-163.41 0-87.15 32.72-163.31t90.14-133.61q57.42-57.44 133.79-89.7 76.38-32.27 163.16-32.27 87.14 0 163.31 32.26 76.16 32.26 133.61 89.71 57.45 57.45 89.71 133.86 32.26 76.42 32.26 163.33 0 86.91-32.27 163.08-32.26 76.18-89.7 133.6-57.45 57.42-133.83 90.14-76.39 32.72-163.27 32.72Zm-.33-105.18q131.13 0 222.68-91.49 91.54-91.49 91.54-222.63 0-131.13-91.49-222.68-91.49-91.54-222.63-91.54-131.13 0-222.68 91.49-91.54 91.49-91.54 222.63 0 131.13 91.49 222.68 91.49 91.54 222.63 91.54ZM480-480Z"></path>',
              '</svg>',
            '</span>',
            '<span style="line-height:16px;">' + domainText + '</span>'
          ].join('');
          
          overlay.appendChild(sponsorText);

          // ??? ?섎떒: ?몃????꾨줈洹몃젅??諛????
          const timerBg = document.createElement('div');
          timerBg.style.cssText = 'position:absolute;bottom:0;left:0;width:100%;height:3px;background:rgba(255,255,255,0.15);z-index:10;border-radius:0 0 12px 12px';
          overlay.appendChild(timerBg);

          const timerBar = document.createElement('div');
          const barRadius = progressFillPct >= 99.5 ? '0 0 12px 12px' : '0 0 0 12px';
          timerBar.style.cssText = 'position:absolute;bottom:0;left:0;width:' + progressFillPct + '%;height:3px;background:#f2bc42;z-index:11;border-radius:' + barRadius;
          overlay.appendChild(timerBar);

          // body???ㅻ쾭?덉씠 異붽?
          document.body.appendChild(overlay);

          // ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧??
          // ?뵎 "嫄대꼫?곌린" 踰꾪듉 ???ㅼ젣 YouTube ?κ렐 ?뚯빟??(pill shape)
          //    body??fixed濡?諛곗튂 (?ㅻ쾭?덉씠 overflow:hidden ?뚰뵾)
          // ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧??
          const skipBtn = document.createElement('div');
          skipBtn.id = 'admate-skip-btn';
          skipBtn.className = 'admate-ytp-skip-ad-button';
          skipBtn.setAttribute('data-injected', 'admate-youtube-preroll');
          // ?덉씠?꾩썐? ?ㅼ젣 .ytp-skip-ad-button 怨??숈씪: flex + ?띿뒪??div + ?꾩씠肄?span(24px SVG)
          skipBtn.style.cssText = [
            'position: fixed',
            'top: ' + (py + ph - 90) + 'px',
            'left: ' + (px + pw - 24) + 'px',
            'transform: translateX(-100%)',
            'box-sizing: border-box',
            'background: rgba(28,28,28,0.8)',
            'color: #fff',
            'padding: 8px 16px',
            'min-height: 36px',
            'border-radius: 18px',
            'border: none',
            'cursor: pointer',
            'display: flex',
            'align-items: center',
            'flex-direction: row',
            'gap: 12px',
            'z-index: 2147483647',
            'letter-spacing: 0',
            'backdrop-filter: blur(4px)',
          ].join(' !important;') + ' !important';
          // SVG: ?좏뒠釉??뚮젅?댁뼱?먯꽌 蹂듭궗??skip ?꾩씠肄?path ?숈씪, 24횞24)
          skipBtn.innerHTML =
            '<div class="admate-ytp-skip-ad-button__text" style="color:#fff !important;font-size:15px !important;font-weight:500 !important;line-height:1 !important;font-family: \\'Noto Sans KR\\', \\'Roboto\\', Arial, Helvetica, sans-serif !important;display:flex !important;align-items:center !important">嫄대꼫?곌린</div>' +
            '<span class="admate-ytp-skip-ad-button__icon" style="display:inline-flex !important;align-items:center !important;justify-content:center !important;line-height:0 !important;flex-shrink:0 !important">' +
            '<svg fill="none" height="24" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg" focusable="false" aria-hidden="true">' +
            '<path d="M20 20C20.26 20 20.51 19.89 20.70 19.70C20.89 19.51 21 19.26 21 19V5C21 4.73 20.89 4.48 20.70 4.29C20.51 4.10 20.26 4 20 4C19.73 4 19.48 4.10 19.29 4.29C19.10 4.48 19 4.73 19 5V19C19 19.26 19.10 19.51 19.29 19.70C19.48 19.89 19.73 20 20 20ZM5.04 19.77L18 12L5.04 4.22C4.84 4.10 4.60 4.03 4.36 4.03C4.12 4.03 3.89 4.09 3.68 4.21C3.47 4.32 3.30 4.49 3.18 4.70C3.06 4.91 2.99 5.14 3 5.38V18.61C2.99 18.85 3.06 19.08 3.18 19.29C3.30 19.50 3.47 19.67 3.68 19.79C3.89 19.90 4.12 19.96 4.36 19.96C4.60 19.96 4.84 19.89 5.04 19.77Z" fill="white"/>' +
            '</svg></span>';
          document.body.appendChild(skipBtn);

          console.log('[YouTube Inject] ???꾨━濡??몄젥???깃났 (?ㅼ젣 YouTube ?뺥깭, ' + pw + 'x' + ph + ')');
          return true;
        } catch (err) {
          console.error('[YouTube Inject] ???꾨━濡??몄젥???먮윭:', err);
          return false;
        }
      })()
    `);

    console.log(`[YouTube] ?꾨━濡??몄젥?? ${result ? "???깃났" : "???ㅽ뙣"}`);
    return result;
  }

  /**
   * ?벟 ?붿뒪?뚮젅??(?ъ씠?쒕컮 而댄뙣?덉뼵) 愿묎퀬 ?몄젥??
   * ?ㅼ젣 YouTube ?붿뒪?뚮젅??愿묎퀬 ?뺥깭瑜??뺥솗???ы쁽:
   *   - "?ㅽ룿??愿묎퀬" ?ㅻ뜑 + ???꾩씠肄?+ X ?リ린 踰꾪듉
   *   - 300x250 諛곕꼫 ?대?吏 (?ъ씠?쒕컮 ?꾩껜 ?덈퉬)
   *   - [?뚮퉬肄? "愿묎퀬二??ъ씠??諛⑸Ц" + "Ad 쨌 Sponsored" ?명꽣
   *   - 移댄뀒怨좊━ 移??꾨옒, 異붿쿇 ?곸긽 由ъ뒪???꾩뿉 諛곗튂
   */
  private async injectDisplayAd(page: IPageHandle, imgDataUrl: string): Promise<boolean> {
    console.log(`[YouTube] ?벟 ?붿뒪?뚮젅??愿묎퀬 ?몄젥???쒖옉 (?ㅼ젣 YouTube 愿묎퀬 ?뺥깭)`);

    const result = await page.evaluate<boolean>(`
      (() => {
        const imgUrl = ${JSON.stringify(imgDataUrl)};

        // ?ъ씠?쒕컮 ?곸뿭 李얘린 (?ㅼ뼇????됲꽣)
        const sidebarSelectors = [
          '#secondary-inner',
          '#secondary',
          'ytd-watch-next-secondary-results-renderer',
          '#related',
        ];

        let sidebar = null;
        for (const sel of sidebarSelectors) {
          const el = document.querySelector(sel);
          if (el) {
            const r = el.getBoundingClientRect();
            if (r.width > 50) {
              sidebar = el;
              console.log('[YouTube Inject] ?ъ씠?쒕컮 諛쒓껄:', sel, Math.round(r.width) + 'px');
              break;
            }
          }
        }

        if (!sidebar) {
          console.warn('[YouTube Inject] ?ъ씠?쒕컮瑜?李얠쓣 ???놁뒿?덈떎');
          return false;
        }

        // ?ъ씠?쒕컮 ?ㅼ젣 ?덈퉬 痢≪젙 (蹂댄넻 402px @1920 / 336px @1440 ??
        const sidebarWidth = Math.round(sidebar.getBoundingClientRect().width);
        const adWidth = Math.min(sidebarWidth, 336); // YouTube ?붿뒪?뚮젅??愿묎퀬 理쒕? 336px

        // ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧??
        // ?꾩껜 愿묎퀬 而⑦뀒?대꼫 (?ㅼ젣 YouTube ?ㅽ???
        // ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧??
        const container = document.createElement('div');
        container.setAttribute('data-injected', 'admate-youtube-display');
        container.style.cssText = [
          'width: ' + adWidth + 'px !important',
          'margin: 0 0 16px 0 !important',
          'border-radius: 12px !important',
          'overflow: hidden !important',
          'box-shadow: 0 1px 2px rgba(0,0,0,0.1) !important',
          'background: #fff !important',
          'border: 1px solid #e5e5e5 !important',
          'position: relative !important',
        ].join(';');

        // ??? ?곷떒 ?ㅻ뜑 ?쒓굅: ?ㅼ젣 YouTube 而댄뙣?덉뼵 諛곕꼫?먮뒗 "?ㅽ룿??愿묎퀬" ?ㅻ뜑媛 ?놁쓬 ???

        // ??? 諛곕꼫 ?대?吏 (300x250 鍮꾩쑉) ???
        const imgEl = document.createElement('img');
        imgEl.src = imgUrl;
        imgEl.setAttribute('data-injected', 'admate');
        imgEl.style.cssText = [
          'display: block !important',
          'width: 100% !important',
          'height: auto !important',
          'aspect-ratio: 300/250 !important',
          'object-fit: cover !important',
        ].join(';');
        container.appendChild(imgEl);

        // ??? ?섎떒 ?명꽣: [?뚮퉬肄? "愿묎퀬二??ъ씠??諛⑸Ц" + "?ㅽ룿??쨌 domain" (?ㅼ젣 YouTube ?숈씪) ???
        const footer = document.createElement('div');
        footer.style.cssText = [
          'padding: 12px 12px !important',
          'display: flex !important',
          'align-items: center !important',
          'gap: 10px !important',
          'background: #fff !important',
        ].join(';');

        // ?뚮퉬肄?(?뚮????먰삎 ?꾩씠肄?
        const favicon = document.createElement('div');
        favicon.style.cssText = 'width:36px;height:36px;border-radius:50%;background:#065fd4;display:flex;align-items:center;justify-content:center;flex-shrink:0';
        favicon.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M19 19H5V5h7V3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/></svg>';

        // ?띿뒪???곸뿭 (?ㅼ젣 YouTube: "愿묎퀬二??ъ씠??諛⑸Ц" + "Ad 쨌 Sponsored")
        const textArea = document.createElement('div');
        textArea.style.cssText = 'flex:1;min-width:0';
        textArea.innerHTML = [
          "<div style=\\"font-size:14px;font-weight:400;color:#0f0f0f;font-family:Roboto,'Noto Sans KR',Arial,sans-serif;line-height:1.4\\">愿묎퀬二??ъ씠??諛⑸Ц</div>",
          "<div style=\\"font-size:12px;color:#606060;font-family:Roboto,Arial,sans-serif;margin-top:2px;\\">Ad 쨌 Sponsored</div>",
        ].join('');

        footer.appendChild(favicon);
        footer.appendChild(textArea);
        container.appendChild(footer);

        // ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧??
        // ?쎌엯 ?꾩튂: 移댄뀒怨좊━ 移??꾨옒, 異붿쿇 ?곸긽 由ъ뒪????
        // ?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧?먥븧??

        // 移댄뀒怨좊━ 移?而⑦뀒?대꼫 李얘린
        const chipContainer = sidebar.querySelector(
          'ytd-feed-filter-chip-bar-renderer, ' +
          'yt-chip-cloud-renderer, ' +
          '#chip-bar, ' +
          'iron-selector#chips'
        );

        if (chipContainer) {
          // 移?而⑦뀒?대꼫 諛붾줈 ?ㅼ쓬???쎌엯
          chipContainer.parentNode.insertBefore(container, chipContainer.nextSibling);
          console.log('[YouTube Inject] ???붿뒪?뚮젅??愿묎퀬 (移??꾨옒) ?쎌엯 ?깃났');
        } else {
          // 移⑹씠 ?놁쑝硫??ъ씠?쒕컮 理쒖긽?⑥뿉 ?쎌엯
          sidebar.insertBefore(container, sidebar.firstChild);
          console.log('[YouTube Inject] ???붿뒪?뚮젅??愿묎퀬 (理쒖긽?? ?쎌엯 ?깃났');
        }

        return true;
      })()
    `);

    console.log(`[YouTube] ?붿뒪?뚮젅???몄젥?? ${result ? "???깃났" : "???ㅽ뙣"}`);
    return result;
  }

  /**
   * ?렚 ?ㅻ쾭?덉씠 愿묎퀬 ?몄젥??
   * ?뱦 ?ㅼ젣 YouTube ?ㅻ쾭?덉씠 愿묎퀬 ?뺥깭:
   *   - ?뚮젅?댁뼱 ?섎떒??諛곗튂 (而⑦듃濡ㅻ컮 諛붾줈 ??
   *   - 468횞60 ?ъ씠利? ?뚮젅?댁뼱 以묒븰 ?뺣젹
   *   - 諛섑닾紐??대몢??諛곌꼍
   *   - ?곗긽?⑥뿉 X ?リ린 踰꾪듉
   */
  private async injectOverlayAd(
    page: IPageHandle,
    imgDataUrl: string,
    playerInfo: { found: boolean; width: number; height: number; top: number; left: number }
  ): Promise<boolean> {
    console.log(`[YouTube] ?렚 ?ㅻ쾭?덉씠 愿묎퀬 ?몄젥???쒖옉 (?ㅼ젣 YouTube ?뺥깭)`);

    const result = await page.evaluate<boolean>(`
      (() => {
        try {
          const imgUrl = ${JSON.stringify(imgDataUrl)};

          // ?뚮젅?댁뼱 醫뚰몴 ?섏쭛
          const playerSelectors = [
            '#movie_player', '#player-container-inner', '#player-container-outer',
            'ytd-player', '.html5-video-player', '#player',
          ];

          let playerRect = null;
          for (const sel of playerSelectors) {
            const el = document.querySelector(sel);
            if (el) {
              const r = el.getBoundingClientRect();
              if (r.width > 100 && r.height > 100) {
                playerRect = r;
                break;
              }
            }
          }

          // ?뚮젅?댁뼱 湲곗? 醫뚰몴 怨꾩궛
          const px = playerRect ? Math.round(playerRect.left) : 0;
          const py = playerRect ? Math.round(playerRect.top) : 56;
          const pw = playerRect ? Math.round(playerRect.width) : Math.round(window.innerWidth * 0.7);
          const ph = playerRect ? Math.round(playerRect.height) : Math.round(window.innerHeight * 0.6);

          // ?ㅻ쾭?덉씠 諛곕꼫 ?ш린 (?ㅼ젣 YouTube: 468x60, ?뚮젅?댁뼱 ?덈퉬???곕씪 議곗젙)
          const bannerW = Math.min(468, Math.round(pw * 0.55));
          const bannerH = 60;
          // ?뚮젅?댁뼱 ?섎떒?먯꽌 而⑦듃濡ㅻ컮(??48px) 諛붾줈 ?꾩뿉 諛곗튂
          const bannerTop = py + ph - bannerH - 48;
          const bannerLeft = px + Math.round((pw - bannerW) / 2);

          console.log('[YouTube Inject] ?ㅻ쾭?덉씠 ?꾩튂:', bannerLeft, bannerTop, bannerW, bannerH);

          // ?뱦 document.body??fixed ?ㅻ쾭?덉씠 ?앹꽦
          const overlay = document.createElement('div');
          overlay.id = 'admate-overlay-ad';
          overlay.setAttribute('data-injected', 'admate-youtube-overlay');
          overlay.style.cssText = [
            'position: fixed',
            'top: ' + bannerTop + 'px',
            'left: ' + bannerLeft + 'px',
            'width: ' + bannerW + 'px',
            'height: ' + bannerH + 'px',
            'z-index: 2147483647',
            'background: rgba(0,0,0,0.85)',
            'overflow: hidden',
            'display: flex',
            'align-items: stretch',
            'box-shadow: 0 2px 8px rgba(0,0,0,0.3)',
          ].join(' !important;') + ' !important';

          // 愿묎퀬 ?대?吏 (468x60 ?ш린??留욊쾶)
          const img = document.createElement('img');
          img.src = imgUrl;
          img.setAttribute('data-injected', 'admate');
          img.style.cssText = 'width:100% !important;height:100% !important;object-fit:cover !important;display:block !important';
          overlay.appendChild(img);

          // ?곗긽??X ?リ린 踰꾪듉 (?ㅼ젣 YouTube ?ㅽ???
          const closeBtn = document.createElement('div');
          closeBtn.style.cssText = [
            'position: absolute',
            'top: 0',
            'right: -24px',
            'width: 24px',
            'height: 24px',
            'background: rgba(0,0,0,0.75)',
            'display: flex',
            'align-items: center',
            'justify-content: center',
            'cursor: pointer',
            'z-index: 2147483647',
          ].join(' !important;') + ' !important';
          closeBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="white"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
          overlay.appendChild(closeBtn);

          // 醫뚰븯??"愿묎퀬" ?쇰꺼
          const adLabel = document.createElement('div');
          adLabel.style.cssText = 'position:absolute;bottom:2px;left:4px;font-size:10px;color:rgba(255,255,255,0.7);font-family:Roboto,Arial,sans-serif;letter-spacing:0.3px';
          adLabel.textContent = 'Ad';
          overlay.appendChild(adLabel);

          document.body.appendChild(overlay);

          console.log('[YouTube Inject] ???ㅻ쾭?덉씠 愿묎퀬 ?몄젥???깃났 (?ㅼ젣 YouTube ?뺥깭, ' + bannerW + 'x' + bannerH + ')');
          return true;
        } catch (err) {
          console.error('[YouTube Inject] ???ㅻ쾭?덉씠 ?몄젥???먮윭:', err);
          return false;
        }
      })()
    `);

    console.log(`[YouTube] ?ㅻ쾭?덉씠 ?몄젥?? ${result ? "???깃났" : "???ㅽ뙣"}`);
    return result;
  }

  /** YouTube ?숈쁺???쇱떆?뺤? */
  private async pauseVideo(page: IPageHandle, opts?: { preserveTimeline?: boolean }): Promise<void> {
    const preserve = opts?.preserveTimeline === true;
    await page.evaluate<void>(
      `
      (() => {
        const preserve = ${preserve};
        const video =
          document.querySelector('video.html5-main-video') ||
          document.querySelector('video');
        if (video) {
          video.pause();
          if (!preserve && video.currentTime === 0) {
            video.currentTime = 0.05;
          }
        }

        const player = document.querySelector('#movie_player');
        if (player && typeof player.pauseVideo === 'function') {
          player.pauseVideo();
        }

        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', code: 'KeyK' }));
      })()
    `
    );
    console.log(`[YouTube] ?몌툘 ?곸긽 ?쇱떆?뺤?${preserve ? " (??꾨씪???좎?)" : ""}`);
  }

  /** YouTube 荑좏궎 ?숈쓽 ?앹뾽 ?쒓굅 */
  private async dismissYouTubeConsent(page: IPageHandle): Promise<void> {
    const dismissed = await page.evaluate<boolean>(`
      (() => {
        // YouTube ?숈쓽 ?ㅼ씠?쇰줈洹??쒓굅
        const consentBtn = document.querySelector(
          'button[aria-label*="Accept"], button[aria-label*="?숈쓽"], ' +
          'tp-yt-paper-button.style-scope.ytd-consent-bump-v2-lightbox, ' +
          'button.yt-spec-button-shape-next--filled, ' +
          '[aria-label="Accept the use of cookies and other data for the purposes described"]'
        );
        if (consentBtn) {
          consentBtn.click();
          return true;
        }

        // ?숈쓽 ?ㅻ쾭?덉씠 吏곸젒 ?쒓굅
        const consentOverlays = document.querySelectorAll(
          'ytd-consent-bump-v2-lightbox, tp-yt-iron-overlay-backdrop, #consent-bump'
        );
        consentOverlays.forEach(el => el.remove());

        return consentOverlays.length > 0;
      })()
    `);

    if (dismissed) {
      console.log(`[YouTube] ?뜧 荑좏궎 ?숈쓽 ?앹뾽 ?쒓굅 ?꾨즺`);
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  /** ?뵥 ?쒓? ?고듃 二쇱엯 ??Vercel ?쒕쾭由ъ뒪 Chromium??CJK ?고듃 ?녿뒗 臾몄젣 ?닿껐 (媛뺥솕 v2) */
  private async injectKoreanFonts(page: IPageHandle): Promise<void> {
    try {
      await page.evaluate<void>(`
        (() => {
          // ?대? 二쇱엯?먯쑝硫??ㅽ궢
          if (document.querySelector('#admate-korean-fonts')) return;

          // 1) Google Fonts preconnect (?띾룄 ?μ긽)
          const preconnect = document.createElement('link');
          preconnect.rel = 'preconnect';
          preconnect.href = 'https://fonts.gstatic.com';
          preconnect.crossOrigin = 'anonymous';
          document.head.appendChild(preconnect);

          // 2) Google Fonts CSS 濡쒕뱶 (Noto Sans KR + Roboto)
          const link = document.createElement('link');
          link.id = 'admate-korean-fonts';
          link.rel = 'stylesheet';
          link.href = 'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700&family=Roboto:wght@300;400;500;700&display=swap';
          document.head.appendChild(link);

          // 3) ?꾩껜 ?섏씠吏???고듃 媛뺤젣 ?곸슜 (??怨듦꺽?곸씤 ??됲꽣)
          const style = document.createElement('style');
          style.id = 'admate-korean-fonts-style';
          style.textContent = [
            '*, *::before, *::after {',
            "  font-family: 'Noto Sans KR', 'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif !important;",
            '}',
            '/* YouTube 紐⑤뱺 ?띿뒪???붿냼 */',
            'ytd-watch-flexy, ytd-watch-flexy *, ytd-compact-video-renderer, ytd-compact-video-renderer *,',
            '#title, #video-title, #description, #info-contents, #info, #meta,',
            '.ytd-video-primary-info-renderer, .ytd-video-secondary-info-renderer,',
            '#content-text, yt-formatted-string, span.yt-core-attributed-string,',
            '#owner-name, #channel-name, #subscriber-count, .ytd-channel-name,',
            '#count .ytd-video-primary-info-renderer, #date,',
            'ytd-comment-renderer, #content-text.ytd-comment-renderer,',
            'h1.ytd-watch-metadata, h1 yt-formatted-string,',
            '#secondary *, ytd-compact-video-renderer .details *,',
            'ytd-video-renderer *, ytd-grid-video-renderer *,',
            '.ytp-videowall-still-info-content *, .ytp-ce-element *,',
            '#chat-messages *, yt-live-chat-text-message-renderer * {',
            "  font-family: 'Noto Sans KR', 'Roboto', sans-serif !important;",
            '}',
          ].join('\\n');
          document.head.appendChild(style);

          console.log('[YouTube Inject] ?뵥 ?쒓? ?고듃 CSS 二쇱엯 ?꾨즺');
        })()
      `);

      // 4) document.fonts.ready濡??뺤떎???고듃 濡쒕뱶 ?湲?(理쒕? 5珥?
      const fontLoaded = await page.evaluate<boolean>(`
        (() => {
          return new Promise((resolve) => {
            const timeout = setTimeout(() => resolve(false), 5000);
            document.fonts.ready.then(() => {
              clearTimeout(timeout);
              // 異붽?濡?Noto Sans KR??濡쒕뱶?먮뒗吏 ?뺤씤
              const loaded = document.fonts.check('16px Noto Sans KR');
              resolve(loaded);
            }).catch(() => resolve(false));
          });
        })()
      `);

      if (fontLoaded) {
        console.log(`[YouTube] ?뵥 ?쒓? ?고듃 濡쒕뱶 ?뺤씤 ?꾨즺 ??);
      } else {
        console.warn(`[YouTube] ?뵥 ?쒓? ?고듃 濡쒕뱶 ?湲???꾩븘????異붽? ?湲?3珥?);
        await new Promise((r) => setTimeout(r, 3000));
      }
    } catch (err) {
      console.warn(`[YouTube] ?뵥 ?쒓? ?고듃 ?몄젥???ㅽ뙣 (吏꾪뻾 怨꾩냽):`, err);
    }
  }

  /**
   * ?뮙 遊?媛먯? 愿??紐⑤뱺 DOM ?붿냼瑜??꾩쟾???뚭눼
   * YouTube媛 React/Polymer濡??щ젋?붾쭅?섍린 ?꾩뿉 紐⑤뱺 ?붿쟻???쒓굅
   */
  private async nukeAllBotElements(page: IPageHandle): Promise<void> {
    await page.evaluate<void>(`
      (() => {
        // 1) 遊?媛먯? ?꾩슜 ??而댄룷?뚰듃 ?꾩쟾 ?쒓굅
        const botSelectors = [
          'ytd-enforcement-message-view-model',
          'yt-player-error-message-renderer',
          'yt-playability-error-supported-renderers',
          '.ytp-error',
          '.ytp-error-content',
          '.ytp-error-content-wrap',
          '.ytp-error-content-wrap-reason',
          '.ytp-offline-slate',
          '.ytp-offline-slate-bar',
          'yt-confirm-dialog-renderer',
          '#error-screen',
          '.ytp-error-content-wrap-subreason',
        ];
        
        botSelectors.forEach(sel => {
          document.querySelectorAll(sel).forEach(el => {
            el.remove();
          });
        });

        // 2) 遊?愿???띿뒪?몃? ?ы븿?섎뒗 紐⑤뱺 ?붿냼 ?쒓굅/?④?
        const botTexts = [
          '遊뉗씠 ?꾨떂???뺤씤',
          '濡쒓렇?명븯??遊뉗씠 ?꾨떂',
          '遊뉗씠 ?꾨떂',
          'Confirm you\\'re not a bot',
          'confirm your identity',
          'Sign in to confirm',
          'confirm that you\\'re not',
        ];

        // TreeWalker濡??띿뒪???몃뱶 ?쒗쉶 (???⑥쑉??
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_ELEMENT,
          null
        );

        const toRemove = [];
        let node;
        while (node = walker.nextNode()) {
          const el = node;
          const text = el.textContent || '';
          const isSmallElement = text.length < 500; // ??而⑦뀒?대꼫??嫄대뱶由ъ? ?딆쓬
          
          if (isSmallElement) {
            for (const keyword of botTexts) {
              if (text.includes(keyword)) {
                toRemove.push(el);
                break;
              }
            }
          }
        }

        toRemove.forEach(el => {
          // ?뚮젅?댁뼱 ?대???遊?硫붿떆吏留??쒓굅 (?섏씠吏 ?꾩껜 ?쒓굅 諛⑹?)
          const inPlayer = el.closest(
            '#movie_player, #player-container-inner, ytd-player, .html5-video-player, #player, #player-container-outer'
          );
          if (inPlayer) {
            el.style.display = 'none';
            el.style.visibility = 'hidden';
            el.style.opacity = '0';
            el.style.position = 'absolute';
            el.style.pointerEvents = 'none';
            el.style.zIndex = '-1';
            // ?띿뒪?몃룄 鍮꾩?
            if (el.childElementCount === 0) {
              el.textContent = '';
            }
          }
        });

        // 3) 濡쒓렇??踰꾪듉 ?쒓굅
        document.querySelectorAll('a[href*="accounts.google.com"], button').forEach(el => {
          const text = (el.textContent || '').trim();
          if (text === '濡쒓렇?? || text === 'Sign in' || text === '濡쒓렇?명븯湲?) {
            const inPlayer = el.closest('#movie_player, #player-container-inner, ytd-player, .html5-video-player, #player');
            if (inPlayer) {
              el.style.display = 'none';
            }
          }
        });

        // 4) tp-yt-paper-dialog (?앹뾽 ?ㅼ씠?쇰줈洹? ?쒓굅
        document.querySelectorAll('tp-yt-paper-dialog, ytd-popup-container').forEach(el => {
          el.remove();
        });

        // 5) backdrop ?쒓굅
        document.querySelectorAll('tp-yt-iron-overlay-backdrop').forEach(el => {
          el.remove();
        });

        console.log('[YouTube] ?뮙 遊??붿냼 ?꾩쟾 ?쒓굅 ?꾨즺');
      })()
    `);
  }

  /**
   * ?뼹截??뚮젅?댁뼱瑜??몃꽕?쇰줈 媛뺤젣 ?꾩쟾 援먯껜 (遊?硫붿떆吏 ?꾩뿉 ??뼱?)
   * 湲곗〈 innerHTML ?쒓굅 諛⑹떇???ㅽ뙣?????덉쑝誘濡?
   * position:absolute濡?湲곗〈 ?댁슜 ?꾩뿉 ?꾩쟾????뼱?곌린
   */
  private async forceReplacePlayerWithThumbnail(page: IPageHandle, thumbnailDataUrl: string): Promise<void> {
    console.log(`[YouTube] ?뼹截??뚮젅?댁뼱瑜??몃꽕?쇰줈 媛뺤젣 援먯껜 以?..`);

    await page.evaluate<void>(`
      ((thumbSrc) => {
        // ?뚮젅?댁뼱 而⑦뀒?대꼫 李얘린 (媛?????붿냼 ?곗꽑)
        const playerSelectors = [
          '#movie_player',
          '#player-container-inner', 
          'ytd-player',
          '#player-container-outer',
          '.html5-video-player',
          '#player',
        ];

        let playerEl = null;
        for (const sel of playerSelectors) {
          const el = document.querySelector(sel);
          if (el) {
            const r = el.getBoundingClientRect();
            if (r.width > 100 && r.height > 100) {
              playerEl = el;
              break;
            }
          }
        }

        if (!playerEl) {
          console.warn('[YouTube] ?뚮젅?댁뼱瑜?李얠쓣 ???놁쓬 ??媛뺤젣 ?앹꽦');
          return;
        }

        const rect = playerEl.getBoundingClientRect();
        const w = Math.round(rect.width);
        const h = Math.round(rect.height);

        // ?뵎 ?듭떖: 湲곗〈 ?댁슜??innerHTML濡???젣?섏? ?딄퀬
        // position:absolute ?ㅻ쾭?덉씠濡??꾩쟾????뼱?
        // (YouTube??MutationObserver媛 innerHTML ??젣 ???щ젋?붾쭅?섎뒗 寃껋쓣 諛⑹?)
        
        // 湲곗〈 ?먯떇 ?붿냼?ㅼ쓽 visibility瑜?紐⑤몢 ?④?
        const allChildren = playerEl.querySelectorAll('*');
        allChildren.forEach(child => {
          child.style.visibility = 'hidden';
          child.style.opacity = '0';
        });

        // ?뚮젅?댁뼱 position 蹂댁옣
        const computedPos = window.getComputedStyle(playerEl).position;
        if (computedPos === 'static') {
          playerEl.style.position = 'relative';
        }

        // 湲곗〈 ?ㅻ쾭?덉씠 ?쒓굅 (以묐났 諛⑹?)
        const existing = playerEl.querySelector('#yt-thumb-overlay');
        if (existing) existing.remove();

        // ?몃꽕???ㅻ쾭?덉씠 而⑦뀒?대꼫 (z-index 理쒖긽??
        const overlay = document.createElement('div');
        overlay.id = 'yt-thumb-overlay';
        overlay.style.cssText = [
          'position: absolute',
          'top: 0',
          'left: 0',
          'width: 100%',
          'height: 100%',
          'z-index: 9999',
          'background: #000',
          'display: flex',
          'align-items: center',
          'justify-content: center',
          'overflow: hidden',
        ].join(';');

        // ?몃꽕???대?吏
        const img = document.createElement('img');
        img.src = thumbSrc;
        img.style.cssText = [
          'width: 100%',
          'height: 100%',
          'object-fit: cover',
          'display: block',
        ].join(';');
        overlay.appendChild(img);

        // ?섎떒 吏꾪뻾諛?(?곸긽 ?ъ깮 以묒씤 寃껋쿂??蹂댁씠寃?
        const progressBar = document.createElement('div');
        progressBar.style.cssText = [
          'position: absolute',
          'bottom: 0',
          'left: 0',
          'width: 100%',
          'height: 4px',
          'background: rgba(255,255,255,0.3)',
          'z-index: 10000',
        ].join(';');

        const progressFill = document.createElement('div');
        progressFill.style.cssText = [
          'width: 15%',
          'height: 100%',
          'background: #ff0000',
          'border-radius: 0 2px 2px 0',
        ].join(';');
        progressBar.appendChild(progressFill);
        overlay.appendChild(progressBar);

        // ?뚮젅?댁뼱???ㅻ쾭?덉씠 ?쎌엯
        playerEl.appendChild(overlay);

        console.log('[YouTube] ?뼹截??몃꽕???ㅻ쾭?덉씠 媛뺤젣 ?쎌엯 ?꾨즺 (' + w + 'x' + h + ')');
      })(${JSON.stringify(thumbnailDataUrl)})
    `);

    console.log(`[YouTube] ?뼹截?媛뺤젣 ?몃꽕??援먯껜 ?꾨즺`);
  }

  /**
   * ?쨼 遊?媛먯? 硫붿떆吏 議댁옱 ?щ? ?뺤씤
   * "濡쒓렇?명븯??遊뉗씠 ?꾨떂???뺤씤?섏꽭?? ?깆쓽 硫붿떆吏媛 ?덉쑝硫?true 諛섑솚
   */
  private async checkBotDetection(page: IPageHandle): Promise<boolean> {
    const result = await page.evaluate<{ detected: boolean; message: string }>(`
      (() => {
        // 1) YouTube 遊?媛먯? ?꾩슜 ?붿냼 ?뺤씤
        const enforcementMsg = document.querySelector('ytd-enforcement-message-view-model');
        if (enforcementMsg) {
          return { detected: true, message: 'ytd-enforcement-message-view-model 諛쒓껄' };
        }

        // 2) ?뚮젅?댁뼱 ?먮윭 ?붾㈃ ?뺤씤 (遊?媛먯? ???쒖떆??
        const playerError = document.querySelector('.ytp-error');
        if (playerError) {
          const errorText = playerError.textContent || '';
          if (errorText.includes('遊?) || errorText.includes('濡쒓렇??) ||
              errorText.includes('confirm') || errorText.includes('Sign in') ||
              errorText.includes('bot')) {
            return { detected: true, message: '?뚮젅?댁뼱 ?먮윭 (遊?媛먯?): ' + errorText.substring(0, 100) };
          }
        }

        // 3) ?띿뒪??湲곕컲 遊?媛먯? 硫붿떆吏 寃??
        const body = document.body?.innerText || '';
        const botKeywords = [
          '遊뉗씠 ?꾨떂???뺤씤',
          '濡쒓렇?명븯??遊뉗씠 ?꾨떂',
          'Confirm you\\'re not a bot',
          'confirm your identity',
          'Sign in to confirm you',
          'confirm that you\\'re not a bot',
        ];

        for (const keyword of botKeywords) {
          if (body.includes(keyword)) {
            return { detected: true, message: '?띿뒪??媛먯?: ' + keyword };
          }
        }

        // 4) video ?붿냼媛 ?덉?留??ъ깮 遺덇? ?곹깭?몄? ?뺤씤
        const video = document.querySelector('video');
        if (video) {
          const hasError = video.error !== null;
          const noSrc = !video.src && !video.currentSrc;
          if (hasError || noSrc) {
            const errorOverlay = document.querySelector(
              '.ytp-error-content, .ytp-error-content-wrap, .ytp-offline-slate'
            );
            if (errorOverlay) {
              return { detected: true, message: '鍮꾨뵒???뚯뒪 ?놁쓬 + ?먮윭 ?ㅻ쾭?덉씠 媛먯?' };
            }
          }
        }

        return { detected: false, message: 'OK' };
      })()
    `);

    if (result.detected) {
      console.log(`[YouTube] ?쨼 遊?媛먯? ?뺤씤: ${result.message}`);
    } else {
      console.log(`[YouTube] ??遊?媛먯? ?놁쓬 ???뺤긽 ?곹깭`);
    }

    return result.detected;
  }

  /**
   * ?봽 YouTube watch URL ??embed URL 蹂??
   * embed URL? 遊?媛먯?媛 ?⑥뵮 ?먯뒯??
   */
  private convertToEmbedUrl(watchUrl: string): string | null {
    try {
      const url = new URL(watchUrl);
      let videoId: string | null = null;

      if (url.hostname.includes('youtube.com') && url.pathname === '/watch') {
        videoId = url.searchParams.get('v');
      } else if (url.hostname === 'youtu.be') {
        videoId = url.pathname.slice(1);
      } else if (url.pathname.startsWith('/embed/')) {
        return watchUrl;
      }

      if (!videoId) return null;
      return `https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&rel=0&showinfo=0&controls=1`;
    } catch {
      return null;
    }
  }

  /**
   * ?뼹截?YouTube 鍮꾨뵒???뚮젅?댁뼱瑜??몃꽕???대?吏濡?援먯껜 (?덇굅??
   */
  private async replacePlayerWithThumbnail(page: IPageHandle, thumbnailDataUrl: string): Promise<void> {
    // forceReplacePlayerWithThumbnail?쇰줈 ?꾩엫
    await this.forceReplacePlayerWithThumbnail(page, thumbnailDataUrl);
  }

  /**
   * ?벟 YouTube ?뚮젅?댁뼱 ?곸뿭??embed iframe?쇰줈 援먯껜
   */
  private async replacePlayerWithEmbed(page: IPageHandle, embedUrl: string): Promise<void> {
    console.log(`[YouTube] ?벟 ?뚮젅?댁뼱瑜?embed iframe?쇰줈 援먯껜 以?..`);

    await page.evaluate<void>(`
      (() => {
        const embedSrc = ${JSON.stringify(embedUrl)};
        const playerSelectors = [
          '#movie_player',
          '#player-container-inner',
          'ytd-player',
          '.html5-video-player',
        ];

        let playerEl = null;
        for (const sel of playerSelectors) {
          const el = document.querySelector(sel);
          if (el) {
            const r = el.getBoundingClientRect();
            if (r.width > 100 && r.height > 100) {
              playerEl = el;
              break;
            }
          }
        }

        if (!playerEl) {
          console.warn('[YouTube Embed] ?뚮젅?댁뼱瑜?李얠쓣 ???놁쓬');
          return;
        }

        const rect = playerEl.getBoundingClientRect();
        const w = Math.round(rect.width);
        const h = Math.round(rect.height);

        playerEl.innerHTML = '';
        const iframe = document.createElement('iframe');
        iframe.src = embedSrc;
        iframe.width = String(w);
        iframe.height = String(h);
        iframe.frameBorder = '0';
        iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
        iframe.allowFullscreen = true;
        iframe.style.cssText = 'width:100%!important;height:100%!important;border:none!important;display:block!important';
        playerEl.appendChild(iframe);
        playerEl.style.overflow = 'hidden';
        playerEl.style.position = 'relative';

        // 遊?媛먯? ?ㅻ쾭?덉씠 ?쒓굅
        ['.ytp-error','.ytp-error-content','.ytp-error-content-wrap','ytd-enforcement-message-view-model','.ytp-offline-slate']
          .forEach(sel => document.querySelectorAll(sel).forEach(el => el.remove()));

        console.log('[YouTube Embed] ???뚮젅?댁뼱 embed 援먯껜 ?꾨즺 (' + w + 'x' + h + ')');
      })()
    `);

    await new Promise((r) => setTimeout(r, 3000));
    console.log(`[YouTube] ?벟 embed iframe 濡쒕뱶 ?꾨즺`);
  }
}










/**
 * Base Channel — 모든 매체 캡처 채널의 공통 베이스
 *
 * 공통 로직: 브라우저 초기화, 랜딩 캡처, 워터마크 적용
 * 매체별 채널은 이 클래스를 상속하여 captureAdPlacement()만 구현
 */

import type { IBrowserEngine, IPageHandle } from "../engine/browser-engine";
import {
  abortableDelay,
  CaptureAbortError,
  type CaptureAbortHandle,
  type CaptureAbortPhase,
} from "../abort-registry";
import { PuppeteerEngine } from "../engine/puppeteer-engine";

export interface CaptureResult {
  /** 광고 게재면 스크린샷 */
  placementScreenshot: Buffer;
  /** 랜딩 페이지 스크린샷 (있는 경우) */
  landingScreenshot?: Buffer;
  /** 캡처 시각 */
  capturedAt: string;
  /** 캡처된 URL */
  pageUrl: string;
  /** 랜딩 페이지 URL (리다이렉트 최종 URL) */
  landingUrl?: string;
  /** 추가 메타데이터 */
  metadata?: Record<string, unknown>;
}

export interface CaptureRequest {
  /** 퍼블리셔 URL (광고가 게재된 페이지) */
  publisherUrl: string;
  /** 소재 이미지 URL */
  creativeUrl: string;
  /** 랜딩 페이지 캡처 여부 */
  captureLanding?: boolean;
  /** 클릭 URL (랜딩 페이지) */
  clickUrl?: string;
  /** 추가 옵션 */
  options?: Record<string, unknown>;
}

export type CaptureAbortContext = CaptureAbortHandle;

export abstract class BaseChannel {
  protected engine: IBrowserEngine;
  /** 외부에서 전달된 공유 엔진 여부 (true면 자체 launch/close 안 함) */
  private isSharedEngine: boolean;

  constructor(engine?: IBrowserEngine) {
    this.isSharedEngine = !!engine;
    this.engine = engine ?? new PuppeteerEngine();
  }

  /** 매체별 캡처 실행 — 서브클래스에서 구현 */
  abstract captureAdPlacement(page: IPageHandle, request: CaptureRequest): Promise<Buffer>;

  /** 전체 캡처 파이프라인 실행 */
  async execute(
    request: CaptureRequest,
    abortContext?: CaptureAbortContext,
  ): Promise<CaptureResult> {
    // 공유 엔진이 아닌 경우에만 자체적으로 시작
    try {
      this.checkpointAbort(abortContext, "launching");
      if (!this.isSharedEngine) {
        await this.engine.launch();
      }
      this.checkpointAbort(abortContext, "launching");

      const page = await this.engine.newPage();
      abortContext?.attachPage(page);
      this.checkpointAbort(abortContext, "rendering");

      try {
        // 1) 광고 게재면 캡처
        this.checkpointAbort(abortContext, "rendering");
        const placementScreenshot = await this.captureAdPlacement(page, request);
        this.checkpointAbort(abortContext, "rendering");

        // 2) 랜딩 페이지 캡처 (옵션)
        let landingScreenshot: Buffer | undefined;
        let landingUrl: string | undefined;

        if (request.captureLanding && request.clickUrl) {
          this.checkpointAbort(abortContext, "navigating");
          const landingResult = await this.captureLanding(
            page,
            request.clickUrl,
            request,
            abortContext,
          );
          this.checkpointAbort(abortContext, "rendering");
          landingScreenshot = landingResult.screenshot;
          landingUrl = landingResult.finalUrl;
        }

        this.checkpointAbort(abortContext, "completed");
        return {
          placementScreenshot,
          landingScreenshot,
          capturedAt: new Date().toISOString(),
          pageUrl: request.publisherUrl,
          landingUrl,
        };
      } finally {
        // 페이지는 항상 닫기 (메모리 해제)
        await page.close().catch(() => {});
      }
    } catch (error) {
      if (!(error instanceof CaptureAbortError) && abortContext && !abortContext.signal.aborted) {
        abortContext.setPhase("failed");
      }
      throw error;
    } finally {
      // 공유 엔진이 아닌 경우에만 자체적으로 종료
      if (!this.isSharedEngine) {
        await this.engine.close();
      }
    }
  }

  /** 랜딩 페이지 캡처 (공통) */
  protected async captureLanding(
    page: IPageHandle,
    clickUrl: string,
    request?: CaptureRequest,
    abortContext?: CaptureAbortContext,
  ): Promise<{ screenshot: Buffer; finalUrl: string }> {
    const mobileGdn = request?.options?.gdnViewportMode === "mobile";
    // 모바일 지면: 게재면 이후 동일 탭에서 fullPage 랜딩 캡처 시 Chromium OOM·Target closed 빈발
    if (mobileGdn) {
      console.log(
        "[BaseChannel] 랜딩 캡처: MO 지면 → domcontentloaded + 뷰포트 스크린샷(fullPage 생략)",
      );
    }

    this.checkpointAbort(abortContext, "navigating");
    await page.goto(clickUrl, {
      waitUntil: mobileGdn ? "domcontentloaded" : "networkidle2",
      timeout: mobileGdn ? 45000 : 30000,
    });
    this.checkpointAbort(abortContext, "navigating");
    if (mobileGdn) {
      await this.delay(2500, abortContext);
      this.checkpointAbort(abortContext, "rendering");
    }

    // 쿠키 배너/팝업 제거
    const { removePageObstructions } = await import("../injection/creative-injector");
    this.checkpointAbort(abortContext, "rendering");
    await removePageObstructions(page);
    this.checkpointAbort(abortContext, "rendering");

    // 잠시 대기 (동적 컨텐츠 로드)
    await this.delay(mobileGdn ? 1500 : 2000, abortContext);
    this.checkpointAbort(abortContext, "writing");

    const screenshot = await page.screenshot({
      fullPage: !mobileGdn,
      type: "png",
    });
    this.checkpointAbort(abortContext, "writing");
    const finalUrl = page.url();

    return { screenshot, finalUrl };
  }

  private checkpointAbort(
    abortContext: CaptureAbortContext | undefined,
    phase: CaptureAbortPhase,
  ): void {
    if (!abortContext) return;
    abortContext.throwIfAborted();
    abortContext.setPhase(phase);
    abortContext.throwIfAborted();
  }

  private delay(
    ms: number,
    abortContext: CaptureAbortContext | undefined,
  ): Promise<void> {
    return abortContext
      ? abortableDelay(ms, abortContext.signal)
      : new Promise((resolve) => setTimeout(resolve, ms));
  }
}

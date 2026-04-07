/**
 * IBrowserEngine — 브라우저 엔진 추상화 인터페이스
 *
 * 현재: PuppeteerEngine (Vercel Function 내 실행)
 * 향후: 외부 워커 전환 시 동일 인터페이스 유지
 */

export interface IScreenshotOptions {
  fullPage?: boolean;
  quality?: number;
  type?: "png" | "jpeg" | "webp";
  clip?: { x: number; y: number; width: number; height: number };
}

export interface IViewport {
  width: number;
  height: number;
  deviceScaleFactor?: number;
  isMobile?: boolean;
}

export interface IPageHandle {
  goto(url: string, options?: { waitUntil?: "load" | "domcontentloaded" | "networkidle0" | "networkidle2"; timeout?: number }): Promise<void>;
  screenshot(options?: IScreenshotOptions): Promise<Buffer>;
  /** 요소가 없거나 캡처 실패 시 null (Puppeteer 전용) */
  screenshotElement?(
    selector: string,
    options?: { type?: "png" | "jpeg"; quality?: number }
  ): Promise<Buffer | null>;
  evaluate<T>(fn: string | ((...args: unknown[]) => T), ...args: unknown[]): Promise<T>;
  evaluateOnNewDocument(fn: string | ((...args: unknown[]) => void)): Promise<void>;
  click(selector: string): Promise<void>;
  waitForSelector(selector: string, options?: { timeout?: number; visible?: boolean }): Promise<void>;
  waitForNavigation(options?: { waitUntil?: string; timeout?: number }): Promise<void>;
  setViewport(viewport: IViewport): Promise<void>;
  setCookie(cookie: { name: string; value: string; domain?: string; path?: string }): Promise<void>;
  url(): string;
  close(): Promise<void>;
}

export interface IBrowserEngine {
  launch(): Promise<void>;
  newPage(): Promise<IPageHandle>;
  close(): Promise<void>;
}

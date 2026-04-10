/**
 * frame-composite.ts — 폰 프레임 합성 유틸
 *
 * 캡처된 YouTube 모바일 스크린샷을 실제 폰 목업 프레임 안에 합성합니다.
 *
 * - AOS: Google Pixel 8 프레임 (393×852 콘텐츠)
 * - iOS: iPhone 15 프레임 (390×844 콘텐츠)
 *
 * sharp는 Next.js에 내장된 이미지 처리 라이브러리입니다.
 */

import * as path from "path";
import * as fs from "fs";

/** 폰 프레임 메타데이터 */
interface PhoneFrameMeta {
  /** 프레임 PNG 파일 경로 */
  framePath: string;
  /** 콘텐츠가 위치할 프레임 내 좌표 및 크기 (픽셀) */
  contentArea: { left: number; top: number; width: number; height: number };
  /** 최종 출력 이미지 크기 */
  frameSize: { width: number; height: number };
}

const FRAME_META: Record<"aos" | "ios", PhoneFrameMeta> = {
  /** Pixel 8: 393×852 콘텐츠 스크린샷 → 프레임 합성 */
  aos: {
    framePath: path.join(process.cwd(), "public", "frames", "pixel8-frame.png"),
    contentArea: { left: 30, top: 50, width: 393, height: 852 },
    frameSize: { width: 453, height: 952 },
  },
  /** iPhone 15: 390×844 콘텐츠 스크린샷 → 프레임 합성 */
  ios: {
    framePath: path.join(process.cwd(), "public", "frames", "iphone15-frame.png"),
    contentArea: { left: 28, top: 48, width: 390, height: 844 },
    frameSize: { width: 446, height: 940 },
  },
};

/**
 * 캡처된 스크린샷을 폰 프레임 안에 합성합니다.
 *
 * @param screenshot 캡처된 YouTube 모바일 스크린샷 Buffer (PNG)
 * @param os "aos" | "ios"
 * @returns 폰 프레임이 합성된 최종 PNG Buffer
 */
export async function compositePhoneFrame(
  screenshot: Buffer,
  os: "aos" | "ios"
): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  const meta = FRAME_META[os];

  // 프레임 PNG 파일 존재 여부 확인
  if (!fs.existsSync(meta.framePath)) {
    console.warn(`[FrameComposite] 프레임 파일 없음: ${meta.framePath} — 원본 반환`);
    return screenshot;
  }

  // 콘텐츠 스크린샷을 콘텐츠 영역 크기에 맞게 리사이즈
  const resizedScreenshot = await sharp(screenshot)
    .resize(meta.contentArea.width, meta.contentArea.height, {
      fit: "cover",
      position: "top",
    })
    .png()
    .toBuffer();

  // 프레임 이미지 로드 → 최종 크기로 리사이즈
  const frameBuffer = await sharp(meta.framePath)
    .resize(meta.frameSize.width, meta.frameSize.height, { fit: "fill" })
    .png()
    .toBuffer();

  // 스크린샷을 프레임 콘텐츠 영역에 합성
  const composited = await sharp(frameBuffer)
    .composite([
      {
        input: resizedScreenshot,
        left: meta.contentArea.left,
        top: meta.contentArea.top,
        blend: "dest-over", // 프레임 위에 콘텐츠 배치 (프레임이 앞에 오도록)
      },
    ])
    .png()
    .toBuffer();

  return composited;
}

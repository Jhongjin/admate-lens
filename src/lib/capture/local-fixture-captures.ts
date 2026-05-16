type LocalFixtureCapture = {
  id: string;
  status: "pending" | "processing" | "completed" | "failed";
  channel: string;
  source_url: string | null;
  creative_url: string;
  placement_image_url: string | null;
  landing_image_url: string | null;
  landing_final_url: string | null;
  screenshot_storage_path: string | null;
  error_message: string | null;
  capture_landing: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

const svgDataUri = (label: string, accent: string) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360"><rect width="640" height="360" fill="#fffdf7"/><path d="M0 0h640v360H0z" fill="none" stroke="#d6ccb9" stroke-width="2"/><rect x="40" y="42" width="560" height="236" rx="18" fill="#f4f0e7" stroke="#d6ccb9"/><rect x="72" y="82" width="232" height="132" rx="12" fill="${accent}"/><rect x="330" y="90" width="206" height="16" rx="8" fill="#17211f" opacity=".88"/><rect x="330" y="122" width="174" height="12" rx="6" fill="#746a5b" opacity=".55"/><rect x="330" y="148" width="212" height="12" rx="6" fill="#746a5b" opacity=".35"/><rect x="330" y="190" width="112" height="34" rx="8" fill="#17211f"/><text x="320" y="312" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="#17211f">${label}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};

export const localFixtureCaptures: LocalFixtureCapture[] = [
  {
    id: "fixture-completed-youtube-feed",
    status: "completed",
    channel: "youtube",
    source_url: "https://www.youtube.com/",
    creative_url: "https://fixture.local/creative/youtube-feed.png",
    placement_image_url: svgDataUri("YouTube Feed fixture", "#0f766e"),
    landing_image_url: null,
    landing_final_url: null,
    screenshot_storage_path: "local-fixture/youtube-feed.png",
    error_message: null,
    capture_landing: false,
    metadata: {
      productFamily: "demand-gen",
      productSurface: "youtube-feed",
      youtubeAdType: "infeed-home",
      resultCategory: "ad_capture_ok",
      capturedAt: "2026-05-15T03:20:00.000Z",
      durationMs: 18400,
      runtime: { provider: "local-fixture" },
      diagnostics: {
        captureQuality: {
          needsReview: false,
          score: 94,
          flags: [],
        },
        slotsDetected: 1,
        slotsInjected: 1,
        screenshotMode: "fixture",
      },
    },
    created_at: "2026-05-15T03:20:00.000Z",
    updated_at: "2026-05-15T03:20:18.000Z",
  },
  {
    id: "fixture-review-gdn-mobile",
    status: "completed",
    channel: "gdn",
    source_url: "https://fixture.local/news/mobile",
    creative_url: "https://fixture.local/creative/gdn-300x250.png",
    placement_image_url: svgDataUri("GDN Mobile review fixture", "#d99a20"),
    landing_image_url: null,
    landing_final_url: null,
    screenshot_storage_path: "local-fixture/gdn-mobile.png",
    error_message: null,
    capture_landing: false,
    metadata: {
      productFamily: "gdn",
      productSurface: "mobile-display",
      gdnViewportMode: "mobile",
      resultCategory: "ad_capture_review_needed",
      capturedAt: "2026-05-15T03:16:00.000Z",
      durationMs: 32700,
      runtime: { provider: "local-fixture" },
      diagnostics: {
        captureQuality: {
          needsReview: true,
          score: 71,
          flags: ["cta_edge_close", "slot_margin_review"],
        },
        slotsDetected: 2,
        slotsInjected: 1,
        screenshotMode: "fixture",
      },
    },
    created_at: "2026-05-15T03:16:00.000Z",
    updated_at: "2026-05-15T03:16:33.000Z",
  },
  {
    id: "fixture-processing-naver",
    status: "processing",
    channel: "naver",
    source_url: "https://m.naver.com/",
    creative_url: "https://fixture.local/creative/naver-native.png",
    placement_image_url: null,
    landing_image_url: null,
    landing_final_url: null,
    screenshot_storage_path: null,
    error_message: null,
    capture_landing: false,
    metadata: {
      productFamily: "naver",
      productSurface: "naver-smart-channel-mobile",
      runtime: { provider: "local-fixture" },
    },
    created_at: "2026-05-15T03:12:00.000Z",
    updated_at: "2026-05-15T03:12:40.000Z",
  },
  {
    id: "fixture-failed-kakao",
    status: "failed",
    channel: "kakao",
    source_url: "https://m.daum.net/",
    creative_url: "https://fixture.local/creative/kakao-bizboard.png",
    placement_image_url: null,
    landing_image_url: null,
    landing_final_url: null,
    screenshot_storage_path: null,
    error_message: "Local fixture: CTA contrast review required.",
    capture_landing: false,
    metadata: {
      productFamily: "kakao",
      productSurface: "kakao-bizboard",
      failureCode: "local_fixture_quality_gate",
      failedAt: "2026-05-15T03:08:00.000Z",
      runtime: { provider: "local-fixture" },
    },
    created_at: "2026-05-15T03:08:00.000Z",
    updated_at: "2026-05-15T03:08:09.000Z",
  },
];

export function listLocalFixtureCaptures({
  status,
  limit,
  offset,
}: {
  status?: string | null;
  limit: number;
  offset: number;
}) {
  const filtered = status
    ? localFixtureCaptures.filter((capture) => capture.status === status)
    : localFixtureCaptures;
  const safeOffset = Math.max(0, offset);
  const safeLimit = Math.max(0, Math.min(limit, 100));

  return {
    data: filtered.slice(safeOffset, safeOffset + safeLimit),
    total: filtered.length,
    fixture: true,
  };
}

import type { NextConfig } from "next";

/**
 * Puppeteer/Chromium 경로에서 파일 트레이싱이 워크스페이스 루트(에이전트·스킬 저장소 등)까지
 * 끌어와 서버리스 함수가 300MB를 넘는 문제가 있어, 캡처 API에 한해 명시적으로 제외합니다.
 */
const CAPTURE_ROUTE_TRACE_EXCLUDES = [
  "./antigravity-awesome-skills/**/*",
  "./antigravity-awesome-skills.zip",
  "./agents/**/*",
  "./API_REFERENCE.md",
  "./README.md",
  "./pdf/**/*",
  "./supabase_migration.sql",
  "./tsconfig.tsbuildinfo",
];

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  serverExternalPackages: ["puppeteer-core", "@sparticuz/chromium-min"],
  outputFileTracingExcludes: {
    "/api/captures/execute": [...CAPTURE_ROUTE_TRACE_EXCLUDES],
    "/api/captures": [...CAPTURE_ROUTE_TRACE_EXCLUDES],
  },
};

export default nextConfig;

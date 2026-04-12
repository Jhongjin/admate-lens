import { NextResponse, type NextRequest } from "next/server";

/**
 * 메인 UI가 CDN/브라우저에 오래 캐시되면 옛 번들이 남아
 * 상세 옵션 등 클라이언트 컴포넌트가 갱신되지 않은 것처럼 보일 수 있어,
 * 루트 문서는 재검증하도록 안내합니다.
 */
export function middleware(_request: NextRequest) {
  const res = NextResponse.next();
  res.headers.set("Cache-Control", "no-store, must-revalidate");
  return res;
}

export const config = {
  matcher: ["/"],
};

import { NextResponse, type NextRequest } from "next/server";
import {
  applyLensSessionCookies,
  sanitizeLensNextPath,
  signInLensUser,
} from "@/lib/auth/lens-session";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as {
      email?: string;
      password?: string;
      next?: string;
    };

    const email = body.email?.trim() ?? "";
    const password = body.password ?? "";
    const nextPath = sanitizeLensNextPath(body.next);

    if (!email || !password) {
      return NextResponse.json(
        { error: "이메일과 비밀번호를 입력하세요." },
        { status: 400 }
      );
    }

    const { data, error } = await signInLensUser(email, password);

    if (error || !data.session) {
      return NextResponse.json(
        { error: "AdMate 계정 로그인에 실패했습니다." },
        { status: 401 }
      );
    }

    const response = NextResponse.json({
      success: true,
      next: nextPath,
    });
    applyLensSessionCookies(response, data.session);
    return response;
  } catch (error) {
    console.error("[LensAuth] login error:", error);
    return NextResponse.json(
      { error: "로그인 처리 중 오류가 발생했습니다." },
      { status: 500 }
    );
  }
}

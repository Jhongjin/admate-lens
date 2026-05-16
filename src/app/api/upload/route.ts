/**
 * POST /api/upload — 소재 이미지 업로드 API
 *
 * 이미지를 Supabase Storage에 업로드하고 공개 URL을 반환합니다.
 */

import { NextResponse, type NextRequest } from "next/server";
import { canUseLocalLensFixtureMode, requireLensSession } from "@/lib/auth/lens-session";
import { createServerClient } from "@/lib/supabase/client";
import {
  getStorageFilename,
  isAllowedImageMimeType,
  makeCreativeStoragePath,
  uploadStorageObject,
} from "@/lib/storage/capture-storage";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await requireLensSession(request);
  if ("response" in auth) {
    return auth.response;
  }

  if (canUseLocalLensFixtureMode()) {
    return NextResponse.json(
      {
        error: "Local fixture mode blocks storage uploads.",
        code: "local_fixture_read_only",
      },
      { status: 409 }
    );
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "파일이 필요합니다." }, { status: 400 });
    }

    // 파일 크기 제한 (10MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "파일 크기는 10MB 이하여야 합니다." }, { status: 400 });
    }

    // 허용 MIME 타입 검증
    if (!isAllowedImageMimeType(file.type)) {
      return NextResponse.json(
        { error: "PNG, JPG, WebP, GIF 형식만 지원합니다." },
        { status: 400 }
      );
    }

    const supabase = createServerClient();
    const storagePath = makeCreativeStoragePath(file.type);
    const filename = getStorageFilename(storagePath);

    // ArrayBuffer → Buffer 변환
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Supabase Storage 업로드
    const upload = await uploadStorageObject(supabase, storagePath, buffer, {
      contentType: file.type,
      label: "소재 이미지",
    });

    return NextResponse.json({
      success: true,
      url: upload.publicUrl,
      path: upload.path,
      filename,
      size: file.size,
      type: file.type,
    });
  } catch (err) {
    console.error("[Upload] 서버 오류:", err);
    return NextResponse.json({ error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

import { NextResponse, type NextRequest } from "next/server";
import { clearLensSessionCookies } from "@/lib/auth/lens-session";

export const dynamic = "force-dynamic";

export async function POST(_request: NextRequest) {
  const response = NextResponse.json({ success: true });
  clearLensSessionCookies(response);
  return response;
}

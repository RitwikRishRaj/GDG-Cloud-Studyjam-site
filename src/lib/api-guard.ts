import "server-only";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { sessionCookieName, verifySessionValue } from "@/lib/admin";

/**
 * Returns null when the request is authorized, else a 401 response.
 * Accepts an `Authorization: Bearer <token>` header (primary) or the
 * session cookie (fallback for direct top-level browsing).
 */
export async function adminGuard(req: NextRequest): Promise<NextResponse | null> {
  const auth = req.headers.get("authorization");
  if (auth) {
    const m = auth.match(/^Bearer\s+(.+)$/i);
    if (m && verifySessionValue(m[1].trim())) return null;
  }
  const store = await cookies();
  if (verifySessionValue(store.get(sessionCookieName)?.value)) return null;
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

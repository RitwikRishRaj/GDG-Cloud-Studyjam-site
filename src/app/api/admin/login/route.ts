import { NextRequest, NextResponse } from "next/server";
import {
  createSessionValue,
  sessionCookieName,
  verifyPassword,
} from "@/lib/admin";

export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = (await req.json()).password;
  } catch {
    raw = undefined;
  }
  const password = typeof raw === "string" ? raw.trim() : "";
  if (!password || !verifyPassword(password)) {
    return NextResponse.json(
      { ok: false, error: "Incorrect password." },
      { status: 401 }
    );
  }
  const token = createSessionValue();
  const prod = process.env.NODE_ENV === "production";
  const res = NextResponse.json({ ok: true, token });
  // SameSite=None+Secure lets the cookie survive embedded previews too,
  // but the Bearer token (localStorage) is the primary auth mechanism.
  res.cookies.set(sessionCookieName, token, {
    httpOnly: true,
    sameSite: prod ? "none" : "lax",
    secure: prod,
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });
  return res;
}

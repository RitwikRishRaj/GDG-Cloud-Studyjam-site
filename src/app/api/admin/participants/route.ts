import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { participants } from "@/db/schema";
import { adminGuard } from "@/lib/api-guard";
import { hueFromString, parseDateSmart } from "@/lib/format";

export async function POST(req: NextRequest) {
  const guard = await adminGuard(req);
  if (guard) return guard;

  try {
    const body = await req.json();
    const id = typeof body.id === "string" ? body.id : null;
    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "")
      .trim()
      .toLowerCase();
    const badgeCount = Math.max(0, parseInt(String(body.badgeCount ?? 0), 10) || 0);
    const iso = parseDateSmart(body.lastBadgeDate);
    const lastBadgeDate = iso ? new Date(iso) : null;
    const profileUrl = body.profileUrl ? String(body.profileUrl).trim() : null;

    if (!name || !email) {
      return NextResponse.json(
        { ok: false, error: "Name and email are required." },
        { status: 400 }
      );
    }

    if (id) {
      await db
        .update(participants)
        .set({
          name,
          email,
          profileUrl,
          badgeCount,
          lastBadgeDate,
          updatedAt: new Date(),
        })
        .where(eq(participants.id, id));
    } else {
      await db
        .insert(participants)
        .values({
          name,
          email,
          profileUrl,
          badgeCount,
          lastBadgeDate,
          avatarHue: hueFromString(email),
          badges: [],
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: participants.email,
          set: {
            name,
            profileUrl,
            badgeCount,
            lastBadgeDate,
            updatedAt: new Date(),
          },
        });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Save failed." },
      { status: 400 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  const guard = await adminGuard(req);
  if (guard) return guard;

  try {
    const body = await req.json();
    const id = String(body.id ?? "");
    if (!id) {
      return NextResponse.json(
        { ok: false, error: "Missing participant id." },
        { status: 400 }
      );
    }
    await db.delete(participants).where(eq(participants.id, id));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Delete failed." },
      { status: 400 }
    );
  }
}

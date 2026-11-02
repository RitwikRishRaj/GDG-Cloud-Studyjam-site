import { NextRequest, NextResponse } from "next/server";
import { refreshMilestoneData } from "@/lib/milestone-data";

export async function POST(request: NextRequest) {
  const secret = process.env.SNAPSHOT_REVALIDATE_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "Snapshot revalidation is not configured." },
      { status: 503 }
    );
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const snapshot = await refreshMilestoneData();
  if (!snapshot) {
    return NextResponse.json(
      { ok: false, error: "Leaderboard snapshot refresh failed." },
      { status: 503 }
    );
  }

  return NextResponse.json({
    ok: true,
    participants: snapshot.stats.total_participants,
    lastUpdated: snapshot.stats.last_updated,
  });
}

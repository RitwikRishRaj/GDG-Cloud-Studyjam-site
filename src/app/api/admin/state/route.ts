import { NextRequest, NextResponse } from "next/server";
import { adminGuard } from "@/lib/api-guard";
import {
  getSheetConfig,
  getRecentSyncs,
  getAllParticipantsForAdmin,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await adminGuard(req);
  if (guard) return guard;

  const [config, syncs, participants] = await Promise.all([
    getSheetConfig(),
    getRecentSyncs(10),
    getAllParticipantsForAdmin(),
  ]);

  return NextResponse.json({
    ok: true,
    config,
    syncs: syncs.map((s) => ({
      id: s.id,
      status: s.status,
      source: s.source,
      rowsProcessed: s.rowsProcessed,
      rowsAdded: s.rowsAdded,
      rowsUpdated: s.rowsUpdated,
      message: s.message,
      createdAt: s.createdAt.toISOString(),
    })),
    participants: participants.map((p) => ({
      id: p.id,
      name: p.name,
      email: p.email,
      profileUrl: p.profileUrl,
      badgeCount: p.badgeCount,
      lastBadgeDate: p.lastBadgeDate
        ? p.lastBadgeDate.toISOString().slice(0, 10)
        : null,
    })),
  });
}

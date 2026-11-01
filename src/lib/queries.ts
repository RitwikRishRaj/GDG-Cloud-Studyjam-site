import "server-only";
import { db } from "@/db";
import { participants, syncLogs, settings } from "@/db/schema";
import { desc, asc, sql } from "drizzle-orm";
import type { SheetConfig } from "@/lib/sheets";

export const BADGE_TARGET = 15;

export async function getLeaderboard() {
  return db
    .select()
    .from(participants)
    .orderBy(
      desc(participants.badgeCount),
      sql`${participants.lastBadgeDate} ASC NULLS LAST`,
      asc(participants.name)
    );
}

export async function getStats() {
  const [row] = await db
    .select({
      totalParticipants: sql<number>`count(*)`,
      totalBadges: sql<number>`coalesce(sum(${participants.badgeCount}), 0)`,
      finishers: sql<number>`count(*) filter (where ${participants.badgeCount} >= ${BADGE_TARGET})`,
      activeToday: sql<number>`count(*) filter (where ${participants.lastBadgeDate} >= now() - interval '7 days')`,
    })
    .from(participants);
  return (
    row ?? { totalParticipants: 0, totalBadges: 0, finishers: 0, activeToday: 0 }
  );
}

export async function getRecentSyncs(limit = 8) {
  return db
    .select()
    .from(syncLogs)
    .orderBy(desc(syncLogs.createdAt))
    .limit(limit);
}

export async function getSheetConfig(): Promise<SheetConfig | null> {
  const rows = await db
    .select()
    .from(settings)
    .where(sql`${settings.key} = 'sheetConfig'`)
    .limit(1);
  const value = rows[0]?.value as SheetConfig | undefined;
  if (!value || !value.sheetId || !value.mapping) return null;
  return value;
}

export async function saveSheetConfig(config: SheetConfig) {
  await db
    .insert(settings)
    .values({ key: "sheetConfig", value: config, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: config, updatedAt: new Date() },
    });
}

export async function getAllParticipantsForAdmin() {
  return db
    .select()
    .from(participants)
    .orderBy(desc(participants.badgeCount), asc(participants.name));
}


import "server-only";
import { pool } from "@/db";

export type MilestoneRow = {
  rank: number;
  name: string;
  badge_count: number;
  highest_milestone: 1 | 2 | 3;
  milestone_reached_on: string;
};

export type MilestoneStats = {
  total_participants: number;
  milestone_1_count: number;
  milestone_2_count: number;
  milestone_3_count: number;
  last_updated: string | null;
};

export async function getMilestoneData(): Promise<{
  rows: MilestoneRow[];
  stats: MilestoneStats;
} | null> {
  try {
    const [board, stats] = await Promise.all([
      pool.query<MilestoneRow>(`
        SELECT rank, name, badge_count, highest_milestone, milestone_reached_on
        FROM public.milestone_board
        ORDER BY rank, name, badge_count DESC, milestone_reached_on
      `),
      pool.query<MilestoneStats>(`
        SELECT total_participants, milestone_1_count, milestone_2_count,
          milestone_3_count, last_updated
        FROM public.milestone_stats
      `),
    ]);
    const totals = stats.rows[0];
    if (!totals) return null;

    return {
      rows: board.rows.map((row) => ({
        ...row,
        rank: Number(row.rank),
        badge_count: Number(row.badge_count),
        highest_milestone: Number(row.highest_milestone) as 1 | 2 | 3,
      })),
      stats: {
        total_participants: Number(totals.total_participants),
        milestone_1_count: Number(totals.milestone_1_count),
        milestone_2_count: Number(totals.milestone_2_count),
        milestone_3_count: Number(totals.milestone_3_count),
        last_updated: totals.last_updated
          ? new Date(totals.last_updated).toISOString()
          : null,
      },
    };
  } catch (error) {
    console.error(
      "Milestone board views are unavailable.",
      error instanceof Error ? error.message : "Unknown database error."
    );
    return null;
  }
}

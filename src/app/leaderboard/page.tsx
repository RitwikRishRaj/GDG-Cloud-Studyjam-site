import { Medal, RefreshCcw, Users } from "lucide-react";
import type { Metadata } from "next";
import { Footer } from "@/components/footer";
import { Leaderboard } from "@/components/leaderboard";
import { Podium } from "@/components/podium";
import { StudyMasthead } from "@/components/study-masthead";
import { getLeaderboard, getRecentSyncs, BADGE_TARGET } from "@/lib/queries";
import { formatDateTime } from "@/lib/format";
import type { LeaderboardRow } from "@/components/leaderboard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Leaderboard — Cloud Study Jam 2026",
  description:
    "Every participant, every skill badge, every completion date — straight from the official tracking sheet.",
};

export default async function LeaderboardPage() {
  const [all, syncs] = await Promise.all([getLeaderboard(), getRecentSyncs(1)]);
  const rows: LeaderboardRow[] = all.map((participant) => ({
    id: participant.id,
    name: participant.name,
    email: participant.email,
    profileUrl: participant.profileUrl,
    badgeCount: participant.badgeCount,
    lastBadgeDate: participant.lastBadgeDate
      ? participant.lastBadgeDate.toISOString().slice(0, 10)
      : null,
    avatarHue: participant.avatarHue,
    badges: participant.badges,
  }));
  const lastSync = syncs[0] ?? null;

  return (
    <div className="study-site">
      <div className="study-wrap">
        <StudyMasthead page="leaderboard" />

        <main className="study-content">
          <section className="study-hero study-board-hero" aria-labelledby="leaderboard-title">
            <span className="study-dots study-dots-blue" aria-hidden="true" />
            <span className="study-dots study-dots-green" aria-hidden="true" />
            <span className="study-mono">Google Cloud · Learn with Communities</span>
            <h1 id="leaderboard-title">Badge leaderboard</h1>
            <p className="study-lead">
              Follow every skill badge earned during the Cloud Study Jam. Rankings
              are based on the latest official sheet sync.
            </p>
            <div className="study-board-summary" aria-label="Leaderboard summary">
              <span className="study-board-summary-item">
                <Medal aria-hidden="true" />
                Target · {BADGE_TARGET} skill badges
              </span>
              <span className="study-board-summary-item">
                <Users aria-hidden="true" />
                {rows.length} participants
              </span>
              {lastSync && (
                <span
                  className="study-board-summary-item"
                  data-status={lastSync.status}
                >
                  <RefreshCcw aria-hidden="true" />
                  Last sync · {formatDateTime(lastSync.createdAt)} ·{" "}
                  {lastSync.status === "success" ? "Complete" : "Needs attention"}
                </span>
              )}
            </div>
          </section>

          {rows.length > 0 && (
            <section aria-labelledby="leaders-title">
              <div className="study-section-title">
                <span className="study-mono">Top performers</span>
                <h2 id="leaders-title">Leading the way.</h2>
                <p>Participants with the most skill badges so far.</p>
              </div>
              <Podium top={rows.slice(0, 3)} />
            </section>
          )}

          <section aria-labelledby="participants-title">
            <div className="study-section-title">
              <span className="study-mono">The full list</span>
              <h2 id="participants-title">All participants.</h2>
              <p>Search, sort, or open a row to see badge details and dates.</p>
            </div>
            <Leaderboard rows={rows} />
          </section>
        </main>

        <Footer />
      </div>
    </div>
  );
}

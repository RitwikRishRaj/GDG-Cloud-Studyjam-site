import { Medal } from "lucide-react";
import { formatDateShort } from "@/lib/format";
import type { LeaderboardRow } from "@/components/leaderboard";

export function Podium({ top }: { top: LeaderboardRow[] }) {
  if (top.length === 0) return null;

  return (
    <div className="study-podium">
      {top.slice(0, 3).map((participant, index) => {
        const rank = index + 1;
        return (
          <article
            key={participant.id}
            className="study-podium-card"
            data-rank={rank}
          >
            <div className="study-podium-rank">
              <span className="study-podium-medal">
                <Medal aria-hidden="true" />
              </span>
              <span>Rank {rank}</span>
            </div>
            <div>
              <h3>{participant.name}</h3>
              <div className="study-podium-score">
                <strong>{participant.badgeCount}</strong>
                <span>skill badges</span>
              </div>
              <p className="study-podium-date">
                Last badge · {participant.lastBadgeDate ? formatDateShort(participant.lastBadgeDate) : "—"}
              </p>
            </div>
          </article>
        );
      })}
    </div>
  );
}

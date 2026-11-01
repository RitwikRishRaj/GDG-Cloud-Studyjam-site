"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { MilestoneRow, MilestoneStats } from "@/lib/milestone-data";
import styles from "./milestone-board.module.css";

const PAGE_SIZE = 25;
const DOT_COLORS = ["#4285F4", "#EA4335", "#FBBC04", "#34A853"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const filters = [
  { value: "all", label: "All" },
  { value: "1", label: "M1" },
  { value: "2", label: "M2" },
  { value: "3", label: "M3" },
] as const;

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function avatarHue(name: string): number {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) >>> 0;
  }
  return hash % 360;
}

function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.slice(0, 10).split("-").map(Number);
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

function formatIST(timestamp: string | null): string {
  if (!timestamp) return "Not updated yet";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(timestamp));
}

export function MilestoneStats({ stats }: { stats: MilestoneStats }) {
  const total = stats.total_participants;
  const milestones = [
    {
      label: "Milestone 1",
      requirement: "3 badges",
      count: stats.milestone_1_count,
      note: "Progress milestone · no physical reward",
      color: "one",
    },
    {
      label: "Milestone 2",
      requirement: "5 badges",
      count: stats.milestone_2_count,
      note: "Official branded water bottle",
      color: "two",
    },
    {
      label: "Milestone 3",
      requirement: "10 badges",
      count: stats.milestone_3_count,
      note: "Developer kit with T-shirt",
      color: "three",
    },
  ] as const;

  return (
    <div className={styles.stats} aria-label="Campaign progress statistics">
      <article className={styles.participantTotal}>
        <span className="study-mono">Total participants</span>
        <strong>{total.toLocaleString("en-IN")}</strong>
        <span>registered profiles</span>
      </article>
      {milestones.map((milestone) => {
        const percent = total > 0 ? Math.round((milestone.count / total) * 100) : 0;
        return (
          <article className={styles.statCard} key={milestone.label}>
            <div className={styles.statHeading}>
              <div>
                <h3>{milestone.label}</h3>
                <span>{milestone.requirement}</span>
              </div>
              <strong>{milestone.count.toLocaleString("en-IN")}</strong>
            </div>
            <div
              className={styles.progressTrack}
              role="progressbar"
              aria-label={`${milestone.label} progress`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              aria-valuetext={`${milestone.count} of ${total} participants, ${percent}%`}
            >
              <span
                className={`${styles.progressFill} ${styles[milestone.color]}`}
                style={{ width: `${percent}%` }}
              />
            </div>
            <p className={styles.statFoot}>
              <span>{percent}% of participants</span>
              <span>{milestone.note}</span>
            </p>
          </article>
        );
      })}
    </div>
  );
}

export function MilestoneBoard({
  rows,
  lastUpdated,
}: {
  rows: MilestoneRow[];
  lastUpdated: string | null;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof filters)[number]["value"]>("all");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const name = query.trim().toLocaleLowerCase();
    return rows.filter((row) => {
      const matchesName = !name || row.name.toLocaleLowerCase().includes(name);
      const matchesMilestone = filter === "all" || row.highest_milestone >= Number(filter);
      return matchesName && matchesMilestone;
    });
  }, [filter, query, rows]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const firstRow = filtered.length === 0 ? 0 : currentPage * PAGE_SIZE + 1;
  const lastRow = Math.min((currentPage + 1) * PAGE_SIZE, filtered.length);

  return (
    <div className="study-leaderboard">
      <div className="study-board-tools">
        <label className="study-search">
          <Search aria-hidden="true" />
          <span className="sr-only">Search participants by name</span>
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(0);
            }}
            placeholder="Search a name"
            className="study-search-input"
          />
        </label>
        <div className="study-sort" role="group" aria-label="Filter by milestone">
          <span className="study-mono">Milestone</span>
          {filters.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                setFilter(option.value);
                setPage(0);
              }}
              aria-pressed={filter === option.value}
              className="study-sort-button"
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <p className={styles.lastUpdated}>Last updated: {formatIST(lastUpdated)}</p>

      <div className={styles.tableScroll}>
        <table className={styles.table}>
          <caption className="sr-only">
            Milestone Board participants, ranked by highest milestone and the date it was reached.
          </caption>
          <thead className={`${styles.tableHead} study-table-head`}>
            <tr>
              <th scope="col">Rank</th>
              <th scope="col">Name</th>
              <th scope="col">Badges</th>
              <th scope="col">Highest milestone</th>
              <th scope="col">Date reached</th>
            </tr>
          </thead>
          <tbody className={`${styles.tableBody} study-participant-list`}>
            {pageRows.map((row, index) => (
              <tr
                className={`${styles.tableRow} study-participant-row`}
                key={`${row.rank}-${row.name}-${row.badge_count}-${row.milestone_reached_on}-${index}`}
              >
                <td className={`${styles.rankCell} ${styles.cell}`}>
                  <span
                    className="study-row-rank"
                    data-rank={row.rank <= 3 ? row.rank : undefined}
                    role="img"
                    aria-label={`Rank ${row.rank}`}
                  >
                    {row.rank}
                  </span>
                </td>
                <th scope="row" className={`${styles.nameCell} ${styles.cell}`}>
                  <span className="study-participant">
                    <span
                      className="study-avatar"
                      style={{ backgroundColor: `hsl(${avatarHue(row.name)} 80% 52%)` }}
                      aria-hidden="true"
                    >
                      {initials(row.name)}
                    </span>
                    <span className="study-participant-copy">
                      <span className="study-participant-name">{row.name}</span>
                    </span>
                  </span>
                </th>
                <td className={`${styles.badgesCell} ${styles.cell}`}>
                  <span
                    className="study-row-progress"
                    role="img"
                    aria-label={`${row.badge_count} of 10 curriculum badges`}
                  >
                    <span className="study-row-progress-count">{row.badge_count}/10</span>
                    <span className="study-progress-dots" aria-hidden="true">
                      {Array.from({ length: 10 }, (_, dot) => (
                        <span
                          key={dot}
                          style={{
                            backgroundColor:
                              dot < row.badge_count
                                ? DOT_COLORS[dot % DOT_COLORS.length]
                                : "transparent",
                          }}
                        />
                      ))}
                    </span>
                  </span>
                </td>
                <td className={`${styles.milestoneCell} ${styles.cell}`}>
                  <span className={styles.mobileLabel}>Milestone</span>
                  <span className="study-row-progress-count">
                    M{row.highest_milestone}
                  </span>
                </td>
                <td className={`${styles.dateCell} ${styles.cell}`}>
                  <time className="study-row-date" dateTime={row.milestone_reached_on}>
                    {formatDate(row.milestone_reached_on)}
                  </time>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 ? (
        <div className="study-empty">
          <p>No participants match this search or milestone.</p>
        </div>
      ) : (
        <nav className={styles.pagination} aria-label="Milestone Board pages">
          <span aria-live="polite">
            Showing {firstRow}–{lastRow} of {filtered.length}
          </span>
          <div>
            <button
              type="button"
              className="study-sort-button"
              onClick={() => setPage((current) => Math.max(0, current - 1))}
              disabled={currentPage === 0}
              aria-label="Previous page"
            >
              Previous
            </button>
            <span>Page {currentPage + 1} of {pageCount}</span>
            <button
              type="button"
              className="study-sort-button"
              onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))}
              disabled={currentPage + 1 >= pageCount}
              aria-label="Next page"
            >
              Next
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}

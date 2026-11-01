"use client";

import { useMemo, useState } from "react";
import {
  Search,
  ChevronDown,
  Medal,
  CalendarDays,
  BadgeCheck,
  CloudOff,
  ArrowUpDown,
  ExternalLink,
} from "lucide-react";
import { formatDateShort } from "@/lib/format";

export type LeaderboardRow = {
  id: string;
  name: string;
  email: string;
  profileUrl: string | null;
  badgeCount: number;
  lastBadgeDate: string | null;
  avatarHue: number;
  badges: { name: string; date: string }[];
};

export const BADGE_TARGET = 15;
const DOT_COLORS = ["#4285F4", "#EA4335", "#FBBC04", "#34A853"];

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function Leaderboard({ rows }: { rows: LeaderboardRow[] }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<"badges" | "recent" | "name">("badges");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? rows.filter(
          (row) =>
            row.name.toLowerCase().includes(q) ||
            row.email.toLowerCase().includes(q)
        )
      : [...rows];
    if (sort === "recent") {
      list.sort((a, b) => {
        if (!a.lastBadgeDate && !b.lastBadgeDate) return 0;
        if (!a.lastBadgeDate) return 1;
        if (!b.lastBadgeDate) return -1;
        return b.lastBadgeDate.localeCompare(a.lastBadgeDate);
      });
    } else if (sort === "name") {
      list.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      list.sort((a, b) => {
        if (b.badgeCount !== a.badgeCount) return b.badgeCount - a.badgeCount;
        if (a.lastBadgeDate && b.lastBadgeDate)
          return a.lastBadgeDate.localeCompare(b.lastBadgeDate);
        return a.name.localeCompare(b.name);
      });
    }
    return list;
  }, [rows, query, sort]);

  return (
    <div className="study-leaderboard">
      <div className="study-board-tools">
        <label className="study-search">
          <Search aria-hidden="true" />
          <span className="sr-only">Search participants by name or email</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search a name or email"
            className="study-search-input"
          />
        </label>
        <div className="study-sort" role="group" aria-label="Sort participants">
          <span className="study-mono">
            <ArrowUpDown aria-hidden="true" /> Sort
          </span>
          {(
            [
              { key: "badges", label: "Most badges" },
              { key: "recent", label: "Most recent" },
              { key: "name", label: "A–Z" },
            ] as const
          ).map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setSort(option.key)}
              aria-pressed={sort === option.key}
              className="study-sort-button"
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="study-table-head" aria-hidden="true">
        <span>Rank</span>
        <span>Participant</span>
        <span>Skill badges</span>
        <span>Last badge</span>
        <span />
      </div>

      <ul className="study-participant-list">
        {filtered.map((row, index) => {
          const expanded = expandedId === row.id;
          const rank = sort === "badges" && index < 3 ? index + 1 : undefined;
          return (
            <li key={row.id} className="study-participant-row">
              <button
                type="button"
                onClick={() => setExpandedId(expanded ? null : row.id)}
                className="study-participant-trigger"
                aria-expanded={expanded}
              >
                <span className="study-row-rank" data-rank={rank}>
                  {sort === "badges" ? index + 1 : <Medal aria-hidden="true" />}
                </span>

                <span className="study-participant">
                  <span
                    className="study-avatar"
                    style={{ backgroundColor: `hsl(${row.avatarHue} 80% 52%)` }}
                    aria-hidden="true"
                  >
                    {initials(row.name)}
                  </span>
                  <span className="study-participant-copy">
                    <span className="study-participant-name">{row.name}</span>
                    <span className="study-participant-email">{row.email}</span>
                  </span>
                </span>

                <span
                  className="study-row-progress"
                  role="img"
                  aria-label={`${row.badgeCount} of ${BADGE_TARGET} skill badges`}
                >
                  <span className="study-row-progress-count">
                    {row.badgeCount}/{BADGE_TARGET}
                  </span>
                  <span className="study-progress-dots" aria-hidden="true">
                    {Array.from({ length: BADGE_TARGET }).map((_, dot) => (
                      <span
                        key={dot}
                        style={{
                          backgroundColor:
                            dot < row.badgeCount
                              ? DOT_COLORS[dot % DOT_COLORS.length]
                              : "transparent",
                        }}
                      />
                    ))}
                  </span>
                </span>

                <span className="study-row-date">
                  {row.lastBadgeDate ? formatDateShort(row.lastBadgeDate) : "—"}
                </span>

                <span className="study-row-expand" aria-hidden="true">
                  <ChevronDown className={expanded ? "is-expanded" : ""} />
                </span>

                <span className="study-row-mobile-metrics">
                  <span>
                    {row.badgeCount}
                    <span>/{BADGE_TARGET}</span>
                  </span>
                  <span>
                    {row.lastBadgeDate ? formatDateShort(row.lastBadgeDate) : "—"}
                  </span>
                </span>
              </button>

              {expanded && (
                <div className="study-expanded">
                  <div className="study-badge-list">
                    {row.badges.length > 0 ? (
                      row.badges.map((badge, badgeIndex) => (
                        <span
                          key={`${badge.name}-${badge.date}-${badgeIndex}`}
                          className="study-badge-chip"
                          style={{
                            backgroundColor: [
                              "var(--tint-blue)",
                              "var(--tint-red)",
                              "var(--highlight)",
                              "var(--tint-green)",
                            ][badgeIndex % 4],
                          }}
                        >
                          <BadgeCheck aria-hidden="true" />
                          {badge.name}
                          {badge.date && (
                            <span className="study-badge-date">
                              <CalendarDays aria-hidden="true" />
                              {formatDateShort(badge.date)}
                            </span>
                          )}
                        </span>
                      ))
                    ) : (
                      <span className="study-no-badges">
                        {row.badgeCount > 0
                          ? `${row.badgeCount} badges synced without individual detail. Map a badge-names column in the admin panel to list them here.`
                          : "No badges yet — the journey starts with A Tour of Google Cloud Hands-on Labs."}
                      </span>
                    )}
                  </div>
                  {row.profileUrl && (
                    <a
                      href={row.profileUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="study-profile-link"
                    >
                      View public Skills profile
                      <ExternalLink aria-hidden="true" />
                    </a>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {filtered.length === 0 && (
        <div className="study-empty">
          <CloudOff aria-hidden="true" />
          <p>No participants found</p>
        </div>
      )}
    </div>
  );
}

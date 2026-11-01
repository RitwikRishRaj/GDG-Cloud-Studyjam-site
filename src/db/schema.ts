import {
  pgTable,
  uuid,
  serial,
  text,
  date,
  integer,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  primaryKey,
} from "drizzle-orm/pg-core";


export type BadgeEntry = {
  name: string;
  date: string; // ISO date string
};

export const participants = pgTable(
  "participants",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    profileUrl: text("profile_url"),
    profileId: uuid("profile_id"),
    sheetStatus: text("sheet_status"),
    sheetBadgeCount: integer("sheet_badge_count").notNull().default(0),
    scrapeStatus: text("scrape_status").notNull().default("pending"),
    lastScrapedAt: timestamp("last_scraped_at", { mode: "date", withTimezone: true }),
    lastError: text("last_error"),
    badgeCount: integer("badge_count").notNull().default(0),
    lastBadgeDate: timestamp("last_badge_date", { mode: "date" }),
    badges: jsonb("badges").$type<BadgeEntry[]>().notNull().default([]),
    avatarHue: integer("avatar_hue").notNull().default(210),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("participants_email_idx").on(t.email),
    uniqueIndex("participants_profile_id_idx").on(t.profileId),
    index("participants_badge_count_idx").on(t.badgeCount),
  ]
);

export const syncLogs = pgTable("sync_logs", {
  id: serial("id").primaryKey(),
  status: text("status").notNull(), // "success" | "error"
  source: text("source"),
  rowsProcessed: integer("rows_processed").notNull().default(0),
  rowsAdded: integer("rows_added").notNull().default(0),
  rowsUpdated: integer("rows_updated").notNull().default(0),
  message: text("message"),
  createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
});

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>(),
  updatedAt: timestamp("updated_at", { mode: "date" }).notNull().defaultNow(),
});

export const badges = pgTable(
  "badges",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    normName: text("norm_name").notNull(),
  },
  (t) => [uniqueIndex("badges_norm_name_idx").on(t.normName)]
);

export const completions = pgTable(
  "completions",
  {
    participantId: uuid("participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    badgeId: integer("badge_id")
      .notNull()
      .references(() => badges.id, { onDelete: "cascade" }),
    earnedOn: date("earned_on", { mode: "string" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.participantId, t.badgeId] })]
);

export const snapshots = pgTable(
  "snapshots",
  {
    snapDate: date("snap_date", { mode: "string" }).notNull(),
    participantId: uuid("participant_id")
      .notNull()
      .references(() => participants.id, { onDelete: "cascade" }),
    badgeCount: integer("badge_count").notNull(),
    rank: integer("rank").notNull(),
  },
  (t) => [primaryKey({ columns: [t.snapDate, t.participantId] })]
);

export type Participant = typeof participants.$inferSelect;
export type SyncLog = typeof syncLogs.$inferSelect;

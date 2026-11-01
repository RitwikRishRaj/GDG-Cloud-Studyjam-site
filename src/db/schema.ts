import {
  pgTable,
  uuid,
  serial,
  text,
  integer,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
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

export type Participant = typeof participants.$inferSelect;
export type SyncLog = typeof syncLogs.$inferSelect;

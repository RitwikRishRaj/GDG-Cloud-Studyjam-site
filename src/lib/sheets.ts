import "server-only";
import { db } from "@/db";
import { participants, syncLogs } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { hueFromString, parseDateSmart } from "@/lib/format";
import type { BadgeEntry } from "@/db/schema";

export type ColumnMapping = {
  name: number;
  email: number;
  profileUrl: number;
  count: number;
  names: number;
  dates: number;
  lastDate: number;
};

export type SheetConfig = {
  sheetId: string;
  gid: string;
  mapping: ColumnMapping;
};

export type SheetPreview = {
  sheetId: string;
  gid: string;
  headers: string[];
  rows: CellValue[][];
  totalRows: number;
};

type CellValue = string | number | null;

export function extractSheetId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const m = trimmed.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (m) return m[1];
  if (/^[a-zA-Z0-9-_]{20,}$/.test(trimmed)) return trimmed;
  return null;
}

export function extractGid(input: string): string | null {
  const m = input.match(/[#&?]gid=(\d+)/);
  return m ? m[1] : null;
}

async function fetchGviz(
  sheetId: string,
  gid: string
): Promise<{ headers: string[]; rows: CellValue[][] }> {
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:json&headers=1&gid=${encodeURIComponent(
    gid || "0"
  )}`;
  const res = await fetch(url, {
    cache: "no-store",
    headers: { "User-Agent": "Mozilla/5.0 (leaderboard-sync)" },
    redirect: "follow",
  });
  if (!res.ok) {
    throw new Error(
      `Google Sheets responded with ${res.status}. Make sure the sheet is shared as "Anyone with the link can view".`
    );
  }
  const text = await res.text();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < 0) {
    throw new Error(
      "Unexpected response from Google Sheets. Check the sheet link and sharing settings."
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new Error("Could not parse the Google Sheets response.");
  }

  const table = (parsed as { table?: { cols?: { label?: string }[]; rows?: { c?: ({ v?: unknown; f?: unknown } | null)[] }[] } })
    .table;
  if (!table || !table.cols) {
    throw new Error(
      "The sheet returned no table data — it may be private or empty."
    );
  }

  const headers = table.cols.map((c, i) => c.label?.trim() || `Column ${i + 1}`);
  const rows: CellValue[][] = (table.rows ?? []).map((row) =>
    (row.c ?? []).map((cell) => {
      if (!cell) return null;
      const v = cell.f ?? cell.v;
      if (v === null || v === undefined) return null;
      if (typeof v === "number") return v;
      return String(v);
    })
  );
  return { headers, rows };
}

export async function previewSheet(
  sheetId: string,
  gid: string
): Promise<SheetPreview> {
  const { headers, rows } = await fetchGviz(sheetId, gid);
  return {
    sheetId,
    gid: gid || "0",
    headers,
    rows: rows.slice(0, 5),
    totalRows: rows.length,
  };
}

/** Guess column mapping from headers. -1 means "not set". */
export function autoMapColumns(headers: string[]): ColumnMapping {
  const lower = headers.map((h) => h.toLowerCase());
  const findIndex = (pred: (h: string) => boolean): number =>
    lower.findIndex(pred);

  const name =
    findIndex((h) => /\b(full\s*)?name\b/.test(h) && !/user|file/.test(h));
  const email = findIndex((h) => /e-?mail/.test(h));
  const profileUrl = findIndex(
    (h) => /profile|skills|url|link/.test(h) && !/email/.test(h)
  );
  const names = findIndex(
    (h) =>
      /badge/.test(h) && /(name|list|which|title|earned\s*badge)/.test(h)
  );
  const dates = findIndex(
    (h) => /date/.test(h) && /(badge|completion|earned)/.test(h)
  );
  const lastDate = findIndex((h) => /(last|recent).*(date|badge)/.test(h));
  const count = findIndex(
    (h) =>
      (/badge/.test(h) && /(count|number|no\.?|total|completed)/.test(h)) ||
      /^(badges|skill\s*badges)(\s*completed)?$/.test(h)
  );

  return {
    name: name >= 0 ? name : headers.length > 0 ? 0 : -1,
    email,
    profileUrl,
    count,
    names,
    dates: dates >= 0 ? dates : -1,
    lastDate: lastDate >= 0 ? lastDate : -1,
  };
}

function splitList(v: CellValue): string[] {
  if (v === null || v === undefined) return [];
  return String(v)
    .split(/[,;\n|]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export type SyncResult = {
  status: "success" | "error";
  rowsProcessed: number;
  rowsAdded: number;
  rowsUpdated: number;
  message: string;
};

function toIndex(v: unknown): number {
  const n = Number(v);
  return Number.isInteger(n) && n >= -1 ? n : -1;
}

/** Validate + normalize a raw config payload from the admin UI. */
export function sanitizeConfig(raw: unknown): SheetConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const sheetId = extractSheetId(String(obj.sheetId ?? ""));
  if (!sheetId) return null;
  const mappingRaw = (obj.mapping ?? {}) as Record<string, unknown>;
  const mapping: ColumnMapping = {
    name: toIndex(mappingRaw.name),
    email: toIndex(mappingRaw.email),
    profileUrl: toIndex(mappingRaw.profileUrl),
    count: toIndex(mappingRaw.count),
    names: toIndex(mappingRaw.names),
    dates: toIndex(mappingRaw.dates),
    lastDate: toIndex(mappingRaw.lastDate),
  };
  if (mapping.name < 0) return null;
  return { sheetId, gid: String(obj.gid ?? "0") || "0", mapping };
}

export async function syncFromGoogleSheet(
  config: SheetConfig
): Promise<SyncResult> {
  let result: SyncResult;
  try {
    const { rows } = await fetchGviz(config.sheetId, config.gid);
    const { mapping } = config;
    if (mapping.name < 0) {
      throw new Error("Column mapping is missing a 'Name' column.");
    }
    const existing = await db
      .select({ email: participants.email })
      .from(participants);
    const seen = new Set(existing.map((r) => r.email.toLowerCase()));
    const now = new Date();
    const chunk: {
      name: string;
      email: string;
      profileUrl: string | null;
      badgeCount: number;
      lastBadgeDate: Date | null;
      badges: BadgeEntry[];
      avatarHue: number;
      updatedAt: Date;
    }[] = [];

    let processed = 0;
    for (const row of rows) {
      const rawName = mapping.name >= 0 ? row[mapping.name] : null;
      const name = rawName ? String(rawName).trim() : "";
      if (!name || /^(name|full name)$/i.test(name)) continue;
      processed++;

      const rawEmail = mapping.email >= 0 ? row[mapping.email] : null;
      const email = rawEmail
        ? String(rawEmail).trim().toLowerCase()
        : `no-email:${name.toLowerCase().replace(/\s+/g, ".")}`;
      const profileUrl =
        mapping.profileUrl >= 0 && row[mapping.profileUrl]
          ? String(row[mapping.profileUrl]).trim()
          : null;

      const badgeNames =
        mapping.names >= 0 ? splitList(row[mapping.names]) : [];
      const badgeDatesRaw =
        mapping.dates >= 0 ? splitList(row[mapping.dates]) : [];
      const badges: BadgeEntry[] = badgeNames.map((bn, i) => ({
        name: bn,
        date:
          parseDateSmart(badgeDatesRaw[i]) ??
          parseDateSmart(badgeDatesRaw[badgeDatesRaw.length - 1]) ??
          "",
      }));

      let badgeCount = badges.length;
      if (mapping.count >= 0) {
        const rawCount = row[mapping.count];
        const num =
          typeof rawCount === "number"
            ? rawCount
            : parseInt(String(rawCount ?? "").replace(/[^\d-]/g, ""), 10);
        if (Number.isFinite(num)) badgeCount = Math.max(0, num);
      }

      let lastBadgeDate: Date | null = null;
      if (mapping.lastDate >= 0) {
        const iso = parseDateSmart(row[mapping.lastDate]);
        if (iso) lastBadgeDate = new Date(iso);
      }
      if (!lastBadgeDate) {
        const dated = badges
          .map((b) => b.date)
          .filter(Boolean)
          .sort();
        if (dated.length > 0) lastBadgeDate = new Date(dated[dated.length - 1]);
      }

      chunk.push({
        name,
        email,
        profileUrl,
        badgeCount,
        lastBadgeDate,
        badges,
        avatarHue: hueFromString(email),
        updatedAt: now,
      });
    }

    let added = 0;
    let updated = 0;
    for (const p of chunk) {
      await db
        .insert(participants)
        .values(p)
        .onConflictDoUpdate({
          target: participants.email,
          set: {
            name: sql`excluded.name`,
            profileUrl: sql`excluded.profile_url`,
            badgeCount: sql`excluded.badge_count`,
            lastBadgeDate: sql`excluded.last_badge_date`,
            badges: sql`excluded.badges`,
            updatedAt: sql`excluded.updated_at`,
          },
        });
      if (seen.has(p.email.toLowerCase())) updated++;
      else added++;
    }

    result = {
      status: "success",
      rowsProcessed: processed,
      rowsAdded: added,
      rowsUpdated: updated,
      message: `Synced ${processed} rows · ${added} new, ${updated} updated.`,
    };
  } catch (err) {
    result = {
      status: "error",
      rowsProcessed: 0,
      rowsAdded: 0,
      rowsUpdated: 0,
      message: err instanceof Error ? err.message : "Unknown sync error.",
    };
  }

  await db.insert(syncLogs).values({
    status: result.status,
    source: `https://docs.google.com/spreadsheets/d/${config.sheetId}`,
    rowsProcessed: result.rowsProcessed,
    rowsAdded: result.rowsAdded,
    rowsUpdated: result.rowsUpdated,
    message: result.message,
  });

  return result;
}


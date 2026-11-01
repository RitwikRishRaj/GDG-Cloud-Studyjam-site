export function formatDateShort(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";
  return d
    .toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "2-digit",
    })
    .toUpperCase();
}

export function formatDateTime(date: Date | string | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";
  return d
    .toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    })
    .toUpperCase();
}

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

/** Parse many date shapes into an ISO yyyy-mm-dd string (or null). */
export function parseDateSmart(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (raw instanceof Date) {
    if (Number.isNaN(raw.getTime())) return null;
    return toIso(raw);
  }

  const s = String(raw).trim();
  if (!s) return null;

  // gviz literal: Date(2025,10,12)
  const gviz = s.match(/Date\((\d{4}),\s*(\d{1,2}),\s*(\d{1,2})/);
  if (gviz) {
    const d = new Date(Number(gviz[1]), Number(gviz[2]), Number(gviz[3]));
    return toIso(d);
  }

  // ISO: 2025-11-12
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const d = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return toIso(d);
  }

  // dd/mm/yyyy or mm/dd/yyyy
  const slash = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (slash) {
    let day = Number(slash[1]);
    let month = Number(slash[2]);
    let year = Number(slash[3]);
    if (year < 100) year += 2000;
    if (month > 12 && day <= 12) {
      [day, month] = [month, day];
    }
    const d = new Date(year, month - 1, day);
    if (!Number.isNaN(d.getTime())) return toIso(d);
    return null;
  }

  // "12 Nov 2025" / "Nov 12, 2025"
  const named = s.match(/([A-Za-z]{3,})\w*\s+(\d{1,2}),?\s+(\d{4})/);
  if (named) {
    const m = MONTHS[named[1].slice(0, 3).toLowerCase()];
    if (m !== undefined) return toIso(new Date(Number(named[3]), m, Number(named[2])));
  }
  const named2 = s.match(/(\d{1,2})\s+([A-Za-z]{3,})\w*\s+(\d{4})/);
  if (named2) {
    const m = MONTHS[named2[2].slice(0, 3).toLowerCase()];
    if (m !== undefined) return toIso(new Date(Number(named2[3]), m, Number(named2[1])));
  }

  const parsed = Date.parse(s);
  if (!Number.isNaN(parsed)) return toIso(new Date(parsed));
  return null;
}

function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Deterministic Google-brand hue from a string. */
const GOOGLE_HUES = [210, 4, 46, 142]; // blue, red, yellow, green

export function hueFromString(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash * 31 + s.charCodeAt(i)) >>> 0;
  }
  return GOOGLE_HUES[hash % GOOGLE_HUES.length];
}

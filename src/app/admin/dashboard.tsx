"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Sheet,
  Users,
  ScrollText,
  LogOut,
  RefreshCw,
  Loader2,
  Sparkles,
  CheckCircle2,
  XCircle,
  Plus,
  Trash2,
  Save,
  Eye,
  Cloud,
  ExternalLink,
  Wand2,
  Info,
} from "lucide-react";
import { formatDateTime, formatDateShort } from "@/lib/format";
import type {
  AdminParticipant,
  AdminSync,
  ColumnMapping,
  SheetConfig,
} from "@/lib/admin-types";

type CellValue = string | number | null;

type Preview = {
  sheetId: string;
  gid: string;
  headers: string[];
  rows: CellValue[][];
  totalRows: number;
};

const MAPPING_FIELDS: {
  key: keyof ColumnMapping;
  label: string;
  help: string;
}[] = [
  { key: "name", label: "Participant name *", help: "Who earned badges" },
  { key: "email", label: "Email", help: "Unique key for updates" },
  { key: "profileUrl", label: "Skills profile URL", help: "skills.google link" },
  { key: "count", label: "Badge count", help: "Number of badges completed" },
  { key: "names", label: "Badge names", help: "Comma-separated list" },
  { key: "dates", label: "Badge dates", help: "Comma-separated, same order" },
  { key: "lastDate", label: "Last badge date", help: "Most recent completion" },
];

const EMPTY_MAPPING: ColumnMapping = {
  name: -1,
  email: -1,
  profileUrl: -1,
  count: -1,
  names: -1,
  dates: -1,
  lastDate: -1,
};

type Tab = "sheets" | "participants" | "logs";

export function AdminDashboard({
  initialConfig,
  syncs,
  participants,
  token,
  onChanged,
  onLogout,
}: {
  initialConfig: SheetConfig | null;
  syncs: AdminSync[];
  participants: AdminParticipant[];
  token: string;
  onChanged: () => Promise<void>;
  onLogout: () => void;
}) {
  const [tab, setTab] = useState<Tab>("sheets");
  const [sheetUrl, setSheetUrl] = useState(
    initialConfig
      ? `https://docs.google.com/spreadsheets/d/${initialConfig.sheetId}`
      : ""
  );
  const [gid, setGid] = useState(initialConfig?.gid ?? "0");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>(
    initialConfig?.mapping ?? EMPTY_MAPPING
  );
  const [busy, setBusy] = useState<null | "preview" | "save" | "sync" | "demo">(
    null
  );
  const [banner, setBanner] = useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);

  const authJsonHeaders: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  // If a config is saved, quietly fetch its headers so the mapping UI shows names.
  useEffect(() => {
    if (initialConfig && !preview) {
      fetchPreview(initialConfig.sheetId, initialConfig.gid, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchPreview(idOrUrl?: string, gidArg?: string, silent = false) {
    setBusy("preview");
    if (!silent) setBanner(null);
    try {
      const res = await fetch("/api/admin/sheet-preview", {
        method: "POST",
        headers: authJsonHeaders,
        body: JSON.stringify({
          sheetUrl: idOrUrl ?? sheetUrl,
          gid: gidArg ?? gid,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        if (!silent)
          setBanner({ kind: "err", text: data.error ?? "Could not fetch sheet." });
        return;
      }
      setPreview(data.preview as Preview);
      // adopt suggested mapping only for unset fields
      setMapping((prev) => {
        const next = { ...prev };
        const sug = data.suggestedMapping as ColumnMapping;
        (Object.keys(sug) as (keyof ColumnMapping)[]).forEach((k) => {
          if (next[k] === -1 && sug[k] !== -1) next[k] = sug[k];
        });
        return next;
      });
      if (!silent)
        setBanner({
          kind: "ok",
          text: `Connected! ${data.preview.totalRows} rows found. Check the column mapping below.`,
        });
    } catch {
      if (!silent)
        setBanner({ kind: "err", text: "Network error while fetching the sheet." });
    } finally {
      setBusy(null);
    }
  }

  function buildConfig(): SheetConfig | null {
    if (!preview) return null;
    return { sheetId: preview.sheetId, gid: preview.gid, mapping };
  }

  async function saveConfig(): Promise<SheetConfig | null> {
    setBusy("save");
    setBanner(null);
    try {
      const res = await fetch("/api/admin/sheet-config", {
        method: "POST",
        headers: authJsonHeaders,
        body: JSON.stringify({ config: buildConfig() }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setBanner({ kind: "err", text: data.error ?? "Save failed." });
        return null;
      }
      return data.config as SheetConfig;
    } catch {
      setBanner({ kind: "err", text: "Network error while saving." });
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function onSaveOnly() {
    const saved = await saveConfig();
    if (saved) {
      setBanner({ kind: "ok", text: "Sheet connection saved." });
      await onChanged();
    }
  }

  async function onSyncNow() {
    const saved = await saveConfig();
    if (!saved) return;
    setBusy("sync");
    setBanner(null);
    try {
      const res = await fetch("/api/admin/sync", {
        method: "POST",
        headers: authJsonHeaders,
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setBanner({
          kind: "err",
          text: data.error ?? data.result?.message ?? "Sync failed.",
        });
      } else {
        setBanner({ kind: "ok", text: data.result.message });
        await onChanged();
      }
    } catch {
      setBanner({ kind: "err", text: "Network error while syncing." });
    } finally {
      setBusy(null);
    }
  }

  async function onLoadDemo() {
    setBusy("demo");
    setBanner(null);
    try {
      const res = await fetch("/api/admin/demo", {
        method: "POST",
        headers: authJsonHeaders,
      });
      const data = await res.json();
      if (data.ok) {
        setBanner({ kind: "ok", text: "Demo dataset loaded — board repopulated." });
        await onChanged();
      } else {
        setBanner({ kind: "err", text: "Could not load demo data." });
      }
    } catch {
      setBanner({ kind: "err", text: "Network error while loading demo data." });
    } finally {
      setBusy(null);
    }
  }

  const mappedPreview = useMemo(() => {
    if (!preview) return [];
    return preview.rows.slice(0, 5).map((r) => ({
      name: mapping.name >= 0 ? r[mapping.name] : null,
      email: mapping.email >= 0 ? r[mapping.email] : null,
      count: mapping.count >= 0 ? r[mapping.count] : null,
      date:
        mapping.lastDate >= 0
          ? r[mapping.lastDate]
          : mapping.dates >= 0
            ? r[mapping.dates]
            : null,
    }));
  }, [preview, mapping]);

  return (
    <main className="min-h-screen pb-20">
      {/* top bar */}
      <header className="sticky top-0 z-40 border-b-2 border-ink bg-paper/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-full border-2 border-ink bg-gred text-white">
              <Cloud className="size-5" strokeWidth={2.5} />
            </span>
            <div className="leading-none">
              <p className="font-grotesk text-[10px] font-bold uppercase tracking-[0.22em] text-ink-soft">
                GDG KIIT · Control room
              </p>
              <h1 className="text-lg font-black uppercase">Admin Panel</h1>
            </div>
          </div>
          <nav className="flex items-center gap-2">
            {(
              [
                { key: "sheets", label: "Google Sheets", icon: Sheet },
                { key: "participants", label: "Participants", icon: Users },
                { key: "logs", label: "Sync log", icon: ScrollText },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex items-center gap-1.5 rounded-full border-2 border-ink px-3 py-1.5 text-xs font-black uppercase tracking-wider transition-colors sm:px-4 ${
                  tab === t.key ? "bg-ink text-paper" : "hover:bg-gyellow-soft"
                }`}
              >
                <t.icon className="size-3.5" />
                <span className="hidden sm:inline">{t.label}</span>
              </button>
            ))}
            <button
              onClick={onLogout}
              title="Sign out"
              className="grid size-9 place-items-center rounded-full border-2 border-ink bg-paper text-ink transition-colors hover:bg-gred hover:text-white"
            >
              <LogOut className="size-4" />
            </button>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 pt-8 sm:px-6">
        {banner && (
          <div
            className={`mb-6 flex items-start gap-3 border-2 border-ink px-4 py-3 text-sm font-bold ${
              banner.kind === "ok" ? "bg-ggreen-soft" : "bg-gred-soft"
            }`}
          >
            {banner.kind === "ok" ? (
              <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-ggreen" />
            ) : (
              <XCircle className="mt-0.5 size-4 shrink-0 text-gred" />
            )}
            <span className="uppercase tracking-wide">{banner.text}</span>
          </div>
        )}

        {/* ================= SHEETS TAB ================= */}
        {tab === "sheets" && (
          <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
            {/* left: connection + mapping */}
            <div className="space-y-6">
              <section className="border-2 border-ink bg-paper p-5 shadow-[6px_6px_0_0_var(--color-ink)]">
                <h2 className="flex items-center gap-2 text-xl font-black uppercase">
                  <Sheet className="size-5 text-ggreen" /> Connect a Google Sheet
                </h2>
                <p className="mt-1 text-sm font-medium text-ink-soft">
                  Paste the link of the sheet that tracks Study Jam progress.
                  The sheet must be shared as{" "}
                  <strong className="text-ink">“Anyone with the link — Viewer”</strong>.
                </p>
                <div className="mt-4 space-y-3">
                  <label className="block">
                    <span className="font-grotesk text-[10px] font-bold uppercase tracking-[0.2em] text-ink-soft">
                      Sheet URL or ID
                    </span>
                    <input
                      value={sheetUrl}
                      onChange={(e) => setSheetUrl(e.target.value)}
                      placeholder="https://docs.google.com/spreadsheets/d/…"
                      className="mt-1 w-full border-2 border-ink bg-white px-3 py-2.5 font-grotesk text-sm font-bold focus:outline-none"
                    />
                  </label>
                  <label className="block">
                    <span className="font-grotesk text-[10px] font-bold uppercase tracking-[0.2em] text-ink-soft">
                      Sheet tab (gid) — optional
                    </span>
                    <input
                      value={gid}
                      onChange={(e) => setGid(e.target.value)}
                      placeholder="0"
                      className="mt-1 w-32 border-2 border-ink bg-white px-3 py-2.5 font-grotesk text-sm font-bold focus:outline-none"
                    />
                  </label>
                  <button
                    onClick={() => fetchPreview()}
                    disabled={busy !== null || !sheetUrl.trim()}
                    className="btn-hard flex items-center gap-2 border-2 border-ink bg-gblue px-5 py-2.5 text-xs font-black uppercase tracking-wider text-white disabled:opacity-50"
                  >
                    {busy === "preview" ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Eye className="size-4" />
                    )}
                    Fetch columns
                  </button>
                </div>
              </section>

              {preview && (
                <section className="pop-in border-2 border-ink bg-paper p-5 shadow-[6px_6px_0_0_var(--color-ink)]">
                  <h2 className="flex items-center gap-2 text-xl font-black uppercase">
                    <Wand2 className="size-5 text-gred" /> Map the columns
                  </h2>
                  <p className="mt-1 text-sm font-medium text-ink-soft">
                    We auto-guessed the mapping — fix anything that looks off.
                    “— not used —” ignores a field.
                  </p>
                  <div className="mt-4 space-y-3">
                    {MAPPING_FIELDS.map((f) => (
                      <label
                        key={f.key}
                        className="grid grid-cols-[1fr_1.2fr] items-center gap-3"
                      >
                        <span>
                          <span className="block text-xs font-black uppercase tracking-wider">
                            {f.label}
                          </span>
                          <span className="block text-[11px] font-medium text-ink-soft">
                            {f.help}
                          </span>
                        </span>
                        <select
                          value={mapping[f.key]}
                          onChange={(e) =>
                            setMapping((m) => ({
                              ...m,
                              [f.key]: Number(e.target.value),
                            }))
                          }
                          className="border-2 border-ink bg-white px-2.5 py-2 font-grotesk text-xs font-bold focus:outline-none"
                        >
                          <option value={-1}>— not used —</option>
                          {preview.headers.map((h, i) => (
                            <option key={i} value={i}>
                              {h}
                            </option>
                          ))}
                        </select>
                      </label>
                    ))}
                  </div>
                  <div className="mt-5 flex flex-wrap gap-3">
                    <button
                      onClick={onSaveOnly}
                      disabled={busy !== null || mapping.name < 0}
                      className="btn-hard flex items-center gap-2 border-2 border-ink bg-paper px-5 py-2.5 text-xs font-black uppercase tracking-wider disabled:opacity-50"
                    >
                      {busy === "save" ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Save className="size-4" />
                      )}
                      Save connection
                    </button>
                    <button
                      onClick={onSyncNow}
                      disabled={busy !== null || mapping.name < 0}
                      className="btn-hard flex items-center gap-2 border-2 border-ink bg-ggreen px-6 py-2.5 text-xs font-black uppercase tracking-wider text-white disabled:opacity-50"
                    >
                      {busy === "sync" ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <RefreshCw className="size-4" />
                      )}
                      Save & sync now
                    </button>
                  </div>
                </section>
              )}
            </div>

            {/* right: live preview + help */}
            <div className="space-y-6">
              {preview ? (
                <section className="border-2 border-ink bg-ink p-5 text-paper shadow-[6px_6px_0_0_rgba(31,30,28,0.3)]">
                  <p className="font-grotesk text-[10px] font-bold uppercase tracking-[0.25em] text-paper/60">
                    Live preview · first {Math.min(5, preview.rows.length)} of{" "}
                    {preview.totalRows} rows
                  </p>
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-left font-grotesk text-xs">
                      <thead>
                        <tr className="border-b border-paper/25 text-paper/60">
                          <th className="py-1.5 pr-4 font-bold uppercase">Name</th>
                          <th className="py-1.5 pr-4 font-bold uppercase">Email</th>
                          <th className="py-1.5 pr-4 font-bold uppercase">Badges</th>
                          <th className="py-1.5 font-bold uppercase">Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {mappedPreview.map((r, i) => (
                          <tr key={i} className="border-b border-paper/10">
                            <td className="max-w-36 truncate py-2 pr-4 font-bold">
                              {String(r.name ?? "—")}
                            </td>
                            <td className="max-w-40 truncate py-2 pr-4 opacity-80">
                              {String(r.email ?? "—")}
                            </td>
                            <td className="py-2 pr-4">{String(r.count ?? "—")}</td>
                            <td className="max-w-32 truncate py-2 opacity-80">
                              {String(r.date ?? "—")}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="mt-3 text-[11px] font-bold uppercase tracking-wider text-paper/50">
                    Date parsing is smart: “12 Nov 2025”, “12/11/2025”, ISO — all fine.
                  </p>
                </section>
              ) : (
                <section className="border-2 border-ink bg-paper p-5 shadow-[6px_6px_0_0_var(--color-ink)]">
                  <h3 className="text-lg font-black uppercase">
                    No sheet connected
                  </h3>
                  <p className="mt-1 text-sm font-medium text-ink-soft">
                    Paste a link on the left and hit “Fetch columns”.
                  </p>
                </section>
              )}

              <section className="border-2 border-ink bg-gyellow-soft p-5">
                <h3 className="flex items-center gap-2 text-sm font-black uppercase tracking-wider">
                  <Info className="size-4" /> Recommended sheet layout
                </h3>
                <ul className="mt-3 space-y-1.5 text-[13px] font-medium text-ink">
                  <li className="flex gap-2">
                    <Sparkles className="mt-0.5 size-3.5 shrink-0 text-gred" />
                    Row 1 = headers: Name, Email, Skills Profile, Badges
                    Completed, Last Badge Date…
                  </li>
                  <li className="flex gap-2">
                    <Sparkles className="mt-0.5 size-3.5 shrink-0 text-gred" />
                    One row per participant. Blank cells are fine.
                  </li>
                  <li className="flex gap-2">
                    <Sparkles className="mt-0.5 size-3.5 shrink-0 text-gred" />
                    For per-badge history use two columns: “Badge names” and
                    “Badge dates”, comma-separated in the same order.
                  </li>
                  <li className="flex gap-2">
                    <Sparkles className="mt-0.5 size-3.5 shrink-0 text-gred" />
                    Share → General access → Anyone with the link → Viewer.
                  </li>
                </ul>
                <a
                  href="https://support.google.com/docs/answer/183965"
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex items-center gap-1.5 border-b-2 border-ink text-xs font-black uppercase tracking-wider"
                >
                  How to share a Google Sheet
                  <ExternalLink className="size-3.5" />
                </a>
              </section>

              <section className="border-2 border-dashed border-ink/40 bg-paper p-5">
                <h3 className="text-sm font-black uppercase tracking-wider text-ink-soft">
                  No sheet yet?
                </h3>
                <p className="mt-1 text-[13px] font-medium text-ink-soft">
                  Repopulate the board with the built-in demo dataset while you
                  set up your sheet.
                </p>
                <button
                  onClick={onLoadDemo}
                  disabled={busy !== null}
                  className="btn-hard mt-3 flex items-center gap-2 border-2 border-ink bg-paper px-4 py-2 text-xs font-black uppercase tracking-wider disabled:opacity-50"
                >
                  {busy === "demo" ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Wand2 className="size-4" />
                  )}
                  Load demo data
                </button>
              </section>
            </div>
          </div>
        )}

        {/* ================= PARTICIPANTS TAB ================= */}
        {tab === "participants" && (
          <ParticipantsPanel
            participants={participants}
            token={token}
            onChanged={onChanged}
          />
        )}

        {/* ================= LOGS TAB ================= */}
        {tab === "logs" && (
          <section className="border-2 border-ink bg-paper shadow-[6px_6px_0_0_var(--color-ink)]">
            <div className="flex items-center justify-between border-b-2 border-ink px-5 py-4">
              <h2 className="flex items-center gap-2 text-xl font-black uppercase">
                <ScrollText className="size-5 text-gblue" /> Recent syncs
              </h2>
              {initialConfig && (
                <span className="rounded-full border-2 border-ink bg-ggreen-soft px-3 py-1 text-[10px] font-black uppercase tracking-wider">
                  Connected · gid {initialConfig.gid}
                </span>
              )}
            </div>
            {syncs.length === 0 ? (
              <p className="px-5 py-10 text-sm font-bold uppercase tracking-wider text-ink-soft">
                No syncs yet — connect a sheet to get started.
              </p>
            ) : (
              <ul>
                {syncs.map((s) => (
                  <li
                    key={s.id}
                    className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-ink/15 px-5 py-4 last:border-b-0"
                  >
                    <span
                      className={`grid size-8 place-items-center rounded-full border-2 border-ink ${
                        s.status === "success"
                          ? "bg-ggreen text-white"
                          : "bg-gred text-white"
                      }`}
                    >
                      {s.status === "success" ? (
                        <CheckCircle2 className="size-4" />
                      ) : (
                        <XCircle className="size-4" />
                      )}
                    </span>
                    <span className="min-w-40 flex-1">
                      <span className="block text-sm font-black uppercase tracking-wide">
                        {s.message ?? s.status}
                      </span>
                      {s.source && !s.source.startsWith("demo") && (
                        <a
                          href={s.source}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-0.5 inline-flex items-center gap-1 font-grotesk text-[11px] font-bold text-gblue underline underline-offset-2"
                        >
                          Open sheet <ExternalLink className="size-3" />
                        </a>
                      )}
                    </span>
                    <span className="font-grotesk text-xs font-bold text-ink-soft">
                      {s.rowsProcessed} rows · +{s.rowsAdded} / ~{s.rowsUpdated}
                    </span>
                    <span className="font-grotesk text-xs font-bold uppercase tracking-wider text-ink-soft">
                      {formatDateTime(s.createdAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>

      <div className="mx-auto mt-12 max-w-6xl px-4 text-center sm:px-6">
        <Link
          href="/leaderboard"
          className="text-xs font-black uppercase tracking-widest text-ink-soft underline underline-offset-4 hover:text-ink"
        >
          View the public leaderboard →
        </Link>
      </div>
    </main>
  );
}

/* ======================= participants panel ======================= */

function ParticipantsPanel({
  participants,
  token,
  onChanged,
}: {
  participants: AdminParticipant[];
  token: string;
  onChanged: () => Promise<void>;
}) {
  const [drafts, setDrafts] = useState<Record<string, AdminParticipant>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newRow, setNewRow] = useState({
    name: "",
    email: "",
    badgeCount: "0",
    lastBadgeDate: "",
  });

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  function draftFor(p: AdminParticipant): AdminParticipant {
    return drafts[p.id] ?? p;
  }

  function updateDraft(id: string, patch: Partial<AdminParticipant>) {
    setDrafts((d) => {
      const base = d[id] ?? participants.find((p) => p.id === id)!;
      return { ...d, [id]: { ...base, ...patch } };
    });
  }

  async function saveRow(id: string) {
    const d = drafts[id];
    if (!d) return;
    setSavingId(id);
    try {
      await fetch("/api/admin/participants", {
        method: "POST",
        headers,
        body: JSON.stringify(d),
      });
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      await onChanged();
    } finally {
      setSavingId(null);
    }
  }

  async function deleteRow(id: string) {
    if (!confirm("Remove this participant from the board?")) return;
    await fetch("/api/admin/participants", {
      method: "DELETE",
      headers,
      body: JSON.stringify({ id }),
    });
    await onChanged();
  }

  async function addRow() {
    setSavingId("new");
    try {
      await fetch("/api/admin/participants", {
        method: "POST",
        headers,
        body: JSON.stringify({
          name: newRow.name,
          email: newRow.email,
          badgeCount: Number(newRow.badgeCount) || 0,
          lastBadgeDate: newRow.lastBadgeDate || null,
        }),
      });
      setNewRow({ name: "", email: "", badgeCount: "0", lastBadgeDate: "" });
      setAdding(false);
      await onChanged();
    } finally {
      setSavingId(null);
    }
  }

  return (
    <section className="border-2 border-ink bg-paper shadow-[6px_6px_0_0_var(--color-ink)]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-ink px-5 py-4">
        <h2 className="flex items-center gap-2 text-xl font-black uppercase">
          <Users className="size-5 text-gblue" /> {participants.length} participants
        </h2>
        <button
          onClick={() => setAdding((a) => !a)}
          className="btn-hard flex items-center gap-2 border-2 border-ink bg-gyellow px-4 py-2 text-xs font-black uppercase tracking-wider"
        >
          <Plus className="size-4" /> Add participant
        </button>
      </div>

      {adding && (
        <div className="grid gap-3 border-b-2 border-ink bg-gyellow-soft p-5 sm:grid-cols-[1fr_1fr_100px_140px_auto]">
          <input
            value={newRow.name}
            onChange={(e) => setNewRow((r) => ({ ...r, name: e.target.value }))}
            placeholder="Full name"
            className="border-2 border-ink bg-white px-3 py-2 text-sm font-bold focus:outline-none"
          />
          <input
            value={newRow.email}
            onChange={(e) => setNewRow((r) => ({ ...r, email: e.target.value }))}
            placeholder="Email"
            className="border-2 border-ink bg-white px-3 py-2 text-sm font-bold focus:outline-none"
          />
          <input
            type="number"
            min={0}
            value={newRow.badgeCount}
            onChange={(e) =>
              setNewRow((r) => ({ ...r, badgeCount: e.target.value }))
            }
            placeholder="Badges"
            className="border-2 border-ink bg-white px-3 py-2 text-sm font-bold focus:outline-none"
          />
          <input
            type="date"
            value={newRow.lastBadgeDate}
            onChange={(e) =>
              setNewRow((r) => ({ ...r, lastBadgeDate: e.target.value }))
            }
            className="border-2 border-ink bg-white px-3 py-2 text-sm font-bold focus:outline-none"
          />
          <button
            onClick={addRow}
            disabled={savingId === "new" || !newRow.name || !newRow.email}
            className="btn-hard flex items-center justify-center gap-2 border-2 border-ink bg-ggreen px-4 py-2 text-xs font-black uppercase tracking-wider text-white disabled:opacity-50"
          >
            {savingId === "new" ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            Add
          </button>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left">
          <thead>
            <tr className="border-b-2 border-ink bg-paper-deep font-grotesk text-[10px] font-black uppercase tracking-[0.2em] text-ink-soft">
              <th className="px-5 py-3">Name</th>
              <th className="px-3 py-3">Email</th>
              <th className="px-3 py-3">Badges</th>
              <th className="px-3 py-3">Last badge date</th>
              <th className="px-5 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {participants.map((p) => {
              const d = draftFor(p);
              const dirty = !!drafts[p.id];
              return (
                <tr key={p.id} className="border-b border-ink/15 last:border-b-0">
                  <td className="px-5 py-2.5">
                    <input
                      value={d.name}
                      onChange={(e) => updateDraft(p.id, { name: e.target.value })}
                      className="w-full min-w-40 bg-transparent px-1 py-1 text-sm font-black uppercase focus:bg-white focus:outline-none"
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <input
                      value={d.email}
                      onChange={(e) => updateDraft(p.id, { email: e.target.value })}
                      className="w-full min-w-52 bg-transparent px-1 py-1 font-grotesk text-xs font-bold text-ink-soft focus:bg-white focus:text-ink focus:outline-none"
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <input
                      type="number"
                      min={0}
                      value={d.badgeCount}
                      onChange={(e) =>
                        updateDraft(p.id, {
                          badgeCount: Math.max(0, Number(e.target.value) || 0),
                        })
                      }
                      className="w-20 border border-ink/30 bg-white px-2 py-1 text-center font-grotesk text-sm font-black focus:border-ink focus:outline-none"
                    />
                  </td>
                  <td className="px-3 py-2.5">
                    <input
                      type="date"
                      value={d.lastBadgeDate ?? ""}
                      onChange={(e) =>
                        updateDraft(p.id, {
                          lastBadgeDate: e.target.value || null,
                        })
                      }
                      className="border border-ink/30 bg-white px-2 py-1 font-grotesk text-xs font-bold focus:border-ink focus:outline-none"
                    />
                    <span className="ml-2 hidden font-grotesk text-[10px] font-bold uppercase text-ink-soft lg:inline">
                      {d.lastBadgeDate ? formatDateShort(d.lastBadgeDate) : "—"}
                    </span>
                  </td>
                  <td className="px-5 py-2.5">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => saveRow(p.id)}
                        disabled={!dirty || savingId === p.id}
                        className={`flex items-center gap-1.5 rounded-full border-2 border-ink px-3 py-1 text-[10px] font-black uppercase tracking-wider transition-opacity ${
                          dirty ? "bg-ggreen text-white" : "opacity-30"
                        }`}
                      >
                        {savingId === p.id ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : (
                          <Save className="size-3" />
                        )}
                        Save
                      </button>
                      <button
                        onClick={() => deleteRow(p.id)}
                        className="grid size-7 place-items-center rounded-full border-2 border-ink bg-paper text-ink transition-colors hover:bg-gred hover:text-white"
                        title="Delete"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {participants.length === 0 && (
          <p className="px-5 py-10 text-sm font-bold uppercase tracking-wider text-ink-soft">
            No participants yet — add one, load demo data, or sync a sheet.
          </p>
        )}
      </div>
      <p className="border-t-2 border-dashed border-ink/30 px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-ink-soft">
        Edits made here are overwritten on the next sheet sync if the email matches
        a sheet row.
      </p>
    </section>
  );
}

"use client";

import { useState, type FormEvent } from "react";
import { Lock, Cloud, KeyRound, Loader2 } from "lucide-react";
import Link from "next/link";

export function AdminLoginForm({
  onSuccess,
}: {
  onSuccess: (token: string) => void | Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: password.trim() }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok || typeof data.token !== "string") {
        setError(data.error ?? "Login failed.");
      } else {
        await onSuccess(data.token);
      }
    } catch {
      setError("Network error — try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md pop-in">
      <div className="border-2 border-ink bg-paper p-8 shadow-[8px_8px_0_0_var(--color-ink)]">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-full border-2 border-ink bg-gred text-white">
            <Lock className="size-5" strokeWidth={2.5} />
          </span>
          <div>
            <p className="font-grotesk text-[10px] font-bold uppercase tracking-[0.25em] text-ink-soft">
              GDG on Campus · KIIT
            </p>
            <h1 className="text-2xl font-black uppercase leading-none">
              Admin Panel
            </h1>
          </div>
        </div>

        <p className="mt-4 text-sm font-medium text-ink-soft">
          Sign in to connect the Google Sheet, sync badge progress and manage
          participants.
        </p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <label className="block">
            <span className="font-grotesk text-xs font-bold uppercase tracking-[0.2em] text-ink-soft">
              Password
            </span>
            <span className="mt-1.5 flex items-center gap-2 border-2 border-ink bg-paper px-3">
              <KeyRound className="size-4 text-ink-soft" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••"
                autoFocus
                className="w-full bg-transparent py-2.5 text-sm font-bold focus:outline-none"
              />
            </span>
          </label>
          {error && (
            <p className="border-2 border-ink bg-gred-soft px-3 py-2 text-xs font-bold uppercase tracking-wider text-gred">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={loading || !password}
            className="btn-hard flex w-full items-center justify-center gap-2 border-2 border-ink bg-ink py-3 text-sm font-black uppercase tracking-wider text-paper disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Cloud className="size-4" />
            )}
            Enter the cockpit
          </button>
        </form>

        <p className="mt-5 border-t-2 border-dashed border-ink/30 pt-4 text-[11px] font-bold leading-relaxed text-ink-soft">
          Default password is <code className="rounded bg-paper-deep px-1.5 py-0.5">gdg-admin-2026</code>.
          Set the <code className="rounded bg-paper-deep px-1.5 py-0.5">ADMIN_PASSWORD</code> env
          variable to change it.
        </p>
      </div>
      <div className="mt-4 text-center">
        <Link
          href="/"
          className="text-xs font-black uppercase tracking-widest text-ink-soft underline underline-offset-4 hover:text-ink"
        >
          ← Back to leaderboard
        </Link>
      </div>
    </div>
  );
}

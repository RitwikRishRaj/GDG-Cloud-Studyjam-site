"use client";

import { useCallback, useEffect, useState } from "react";
import { Cloud, Loader2 } from "lucide-react";
import { AdminLoginForm } from "./login-form";
import { AdminDashboard } from "./dashboard";
import { ADMIN_TOKEN_KEY, type AdminState } from "@/lib/admin-types";

type Status = "loading" | "anon" | "authed";

export function AdminGate() {
  const [status, setStatus] = useState<Status>("loading");
  const [token, setToken] = useState<string | null>(null);
  const [data, setData] = useState<AdminState | null>(null);

  const load = useCallback(async (tok: string): Promise<boolean> => {
    try {
      const res = await fetch("/api/admin/state", {
        headers: { Authorization: `Bearer ${tok}` },
        cache: "no-store",
      });
      if (res.status === 401) return false;
      const json = await res.json();
      if (!json.ok) return false;
      setData({
        config: json.config,
        syncs: json.syncs,
        participants: json.participants,
      });
      return true;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    const tok = localStorage.getItem(ADMIN_TOKEN_KEY);
    if (!tok) {
      setStatus("anon");
      return;
    }
    load(tok).then((ok) => {
      if (ok) {
        setToken(tok);
        setStatus("authed");
      } else {
        localStorage.removeItem(ADMIN_TOKEN_KEY);
        setStatus("anon");
      }
    });
  }, [load]);

  async function handleLoginSuccess(tok: string) {
    localStorage.setItem(ADMIN_TOKEN_KEY, tok);
    setStatus("loading");
    const ok = await load(tok);
    if (ok) {
      setToken(tok);
      setStatus("authed");
    } else {
      localStorage.removeItem(ADMIN_TOKEN_KEY);
      setStatus("anon");
    }
  }

  async function refetch() {
    if (token) await load(token);
  }

  function handleLogout() {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    if (token) {
      fetch("/api/admin/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    setToken(null);
    setData(null);
    setStatus("anon");
  }

  if (status === "loading") {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <span className="relative grid size-16 place-items-center rounded-full border-2 border-ink bg-gblue text-white">
            <Cloud className="size-7" strokeWidth={2.5} />
            <Loader2 className="absolute -right-1 -top-1 size-5 animate-spin rounded-full bg-paper text-ink" />
          </span>
          <p className="text-xs font-black uppercase tracking-[0.3em] text-ink-soft">
            Checking session…
          </p>
        </div>
      </main>
    );
  }

  if (status === "anon" || !token || !data) {
    return (
      <main className="flex min-h-screen items-center justify-center px-4">
        <AdminLoginForm onSuccess={handleLoginSuccess} />
      </main>
    );
  }

  return (
    <AdminDashboard
      initialConfig={data.config}
      syncs={data.syncs}
      participants={data.participants}
      token={token}
      onChanged={refetch}
      onLogout={handleLogout}
    />
  );
}

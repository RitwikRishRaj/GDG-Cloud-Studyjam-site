import "server-only";
import crypto from "crypto";
import { cookies } from "next/headers";

const SESSION_COOKIE = "gdg_admin_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function getSecret(): string | null {
  return process.env.ADMIN_SESSION_SECRET || null;
}

export function getAdminPassword(): string | null {
  return process.env.ADMIN_PASSWORD || null;
}

export function verifyPassword(password: string): boolean {
  const expected = getAdminPassword();
  if (!expected || !getSecret()) return false;
  const a = Buffer.from(password.padEnd(64).slice(0, 64));
  const b = Buffer.from(expected.padEnd(64).slice(0, 64));
  return crypto.timingSafeEqual(a, b);
}

function sign(payload: string): string {
  const secret = getSecret();
  if (!secret) return "";
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

export function createSessionValue(): string {
  if (!getAdminPassword() || !getSecret()) {
    throw new Error("Admin credentials are not configured.");
  }
  const expiry = Date.now() + SESSION_TTL_MS;
  const payload = `admin.${expiry}`;
  return `${payload}.${sign(payload)}`;
}

export function verifySessionValue(value: string | undefined | null): boolean {
  if (!value || !getAdminPassword() || !getSecret()) return false;
  const parts = value.split(".");
  if (parts.length !== 3) return false;
  const [role, expiryStr, signature] = parts;
  if (role !== "admin") return false;
  const expected = sign(`${role}.${expiryStr}`);
  const sigA = Buffer.from(signature.padEnd(64).slice(0, 64));
  const sigB = Buffer.from(expected.padEnd(64).slice(0, 64));
  if (!crypto.timingSafeEqual(sigA, sigB)) return false;
  const expiry = Number(expiryStr);
  if (!Number.isFinite(expiry) || expiry < Date.now()) return false;
  return true;
}

export async function isAdminAuthed(): Promise<boolean> {
  const store = await cookies();
  const cookie = store.get(SESSION_COOKIE);
  return verifySessionValue(cookie?.value);
}

export const sessionCookieName = SESSION_COOKIE;

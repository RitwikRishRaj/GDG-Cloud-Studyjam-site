import { db } from "@/db";
import { participants, syncLogs } from "@/db/schema";
import type { BadgeEntry } from "@/db/schema";
import { hueFromString } from "@/lib/format";

const BADGE_POOL = [
  "A Tour of Google Cloud Hands-on Labs",
  "The Basics of Google Cloud Compute",
  "Set Up an App Dev Environment on Google Cloud",
  "Build a Website on Google Cloud",
  "Perform Foundational Infrastructure Tasks in Google Cloud",
  "Networking Fundamentals on Google Cloud",
  "Prepare Data for ML APIs on Google Cloud",
  "Store, Process, and Manage Data on Google Cloud",
  "Develop Serverless Applications on Cloud Run",
  "Deploy Kubernetes Applications on Google Cloud",
  "Automate Data Capture at Scale with Document AI",
  "Create ML Models with BigQuery ML",
  "Get Started with Cloud Storage",
  "Implement Load Balancing on Compute Engine",
  "Analyze Images with the Cloud Vision API",
];

type SeedRow = {
  name: string;
  email: string;
  count: number;
  firstDay: string; // date of first badge
};

const ROWS: SeedRow[] = [
  { name: "Aarav Sharma", email: "aarav.sharma@student.kiit.ac.in", count: 15, firstDay: "2025-10-16" },
  { name: "Ananya Das", email: "ananya.das@student.kiit.ac.in", count: 14, firstDay: "2025-10-18" },
  { name: "Ishaan Verma", email: "ishaan.verma@student.kiit.ac.in", count: 14, firstDay: "2025-10-21" },
  { name: "Sneha Reddy", email: "sneha.reddy@student.kiit.ac.in", count: 12, firstDay: "2025-10-22" },
  { name: "Rohan Das", email: "rohan.das@student.kiit.ac.in", count: 11, firstDay: "2025-10-19" },
  { name: "Priya Patel", email: "priya.patel@student.kiit.ac.in", count: 10, firstDay: "2025-10-24" },
  { name: "Aditya Kumar", email: "aditya.kumar@student.kiit.ac.in", count: 10, firstDay: "2025-10-28" },
  { name: "Meera Iyer", email: "meera.iyer@student.kiit.ac.in", count: 9, firstDay: "2025-10-30" },
  { name: "Kabir Singh", email: "kabir.singh@student.kiit.ac.in", count: 8, firstDay: "2025-11-01" },
  { name: "Tanvi Menon", email: "tanvi.menon@student.kiit.ac.in", count: 8, firstDay: "2025-11-03" },
  { name: "Arjun Nair", email: "arjun.nair@student.kiit.ac.in", count: 7, firstDay: "2025-11-02" },
  { name: "Diya Chatterjee", email: "diya.chatterjee@student.kiit.ac.in", count: 7, firstDay: "2025-11-05" },
  { name: "Vikram Rao", email: "vikram.rao@student.kiit.ac.in", count: 6, firstDay: "2025-11-06" },
  { name: "Shreya Ghosh", email: "shreya.ghosh@student.kiit.ac.in", count: 6, firstDay: "2025-11-07" },
  { name: "Nikhil Jain", email: "nikhil.jain@student.kiit.ac.in", count: 5, firstDay: "2025-11-08" },
  { name: "Ritika Sahoo", email: "ritika.sahoo@student.kiit.ac.in", count: 5, firstDay: "2025-11-09" },
  { name: "Dev Mishra", email: "dev.mishra@student.kiit.ac.in", count: 4, firstDay: "2025-11-09" },
  { name: "Kavya Pillai", email: "kavya.pillai@student.kiit.ac.in", count: 4, firstDay: "2025-11-11" },
  { name: "Yash Thakur", email: "yash.thakur@student.kiit.ac.in", count: 3, firstDay: "2025-11-12" },
  { name: "Nandini Bose", email: "nandini.bose@student.kiit.ac.in", count: 3, firstDay: "2025-11-13" },
  { name: "Farhan Ali", email: "farhan.ali@student.kiit.ac.in", count: 2, firstDay: "2025-11-14" },
  { name: "Ira Kapoor", email: "ira.kapoor@student.kiit.ac.in", count: 2, firstDay: "2025-11-15" },
  { name: "Sahil Behera", email: "sahil.behera@student.kiit.ac.in", count: 1, firstDay: "2025-11-16" },
  { name: "Pooja Nanda", email: "pooja.nanda@student.kiit.ac.in", count: 1, firstDay: "2025-11-18" },
  { name: "Rahul Mohanty", email: "rahul.mohanty@student.kiit.ac.in", count: 0, firstDay: "2025-11-18" },
  { name: "Simran Kaur", email: "simran.kaur@student.kiit.ac.in", count: 0, firstDay: "2025-11-18" },
];

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function fakeProfileUrl(email: string): string {
  let h = 0;
  for (let i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) >>> 0;
  const hex = h.toString(16).padStart(8, "0");
  return `https://www.skills.google/public_profiles/${hex.slice(0, 4)}-${hex.slice(4)}`;
}

export function buildDemoParticipants() {
  return ROWS.map((row) => {
    const badges: BadgeEntry[] = BADGE_POOL.slice(0, row.count).map((b, i) => ({
      name: b,
      date: addDays(row.firstDay, i * 2 + (i % 2)),
    }));
    const last = badges.length > 0 ? badges[badges.length - 1].date : null;
    return {
      name: row.name,
      email: row.email,
      profileUrl: fakeProfileUrl(row.email),
      badgeCount: row.count,
      lastBadgeDate: last ? new Date(last) : null,
      badges,
      avatarHue: hueFromString(row.email),
      updatedAt: new Date(),
    };
  });
}

/** Returns true when demo data was inserted (only runs when table is empty). */
export async function seedIfEmpty(force = false): Promise<boolean> {
  if (!force) {
    const existing = await db
      .select({ id: participants.id })
      .from(participants)
      .limit(1);
    if (existing.length > 0) return false;
  }
  const data = buildDemoParticipants();
  const now = new Date();
  for (const p of data) {
    await db
      .insert(participants)
      .values(p)
      .onConflictDoUpdate({
        target: participants.email,
        set: {
          name: p.name,
          profileUrl: p.profileUrl,
          badgeCount: p.badgeCount,
          lastBadgeDate: p.lastBadgeDate,
          badges: p.badges,
          updatedAt: now,
        },
      });
  }
  await db.insert(syncLogs).values({
    status: "success",
    source: "demo-seed",
    rowsProcessed: data.length,
    rowsAdded: data.length,
    rowsUpdated: 0,
    message: `Demo dataset loaded (${data.length} participants).`,
  });
  return true;
}

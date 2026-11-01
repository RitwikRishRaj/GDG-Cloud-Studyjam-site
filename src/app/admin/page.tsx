import type { Metadata } from "next";
import { AdminGate } from "./gate";

export const metadata: Metadata = {
  title: "Admin Panel",
  description: "Sync the Study Jam leaderboard with Google Sheets.",
};

export default function AdminPage() {
  return <AdminGate />;
}

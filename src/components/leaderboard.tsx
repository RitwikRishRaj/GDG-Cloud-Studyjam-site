export { MilestoneBoard, MilestoneStats } from "@/components/milestone-board";

export type LeaderboardRow = {
  id: string;
  name: string;
  badgeCount: number;
  lastBadgeDate: string | null;
};

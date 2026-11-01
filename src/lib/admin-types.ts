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

export type AdminSync = {
  id: number;
  status: string;
  source: string | null;
  rowsProcessed: number;
  rowsAdded: number;
  rowsUpdated: number;
  message: string | null;
  createdAt: string;
};

export type AdminParticipant = {
  id: string;
  name: string;
  email: string;
  profileUrl: string | null;
  badgeCount: number;
  lastBadgeDate: string | null;
};

export type AdminState = {
  config: SheetConfig | null;
  syncs: AdminSync[];
  participants: AdminParticipant[];
};

export const ADMIN_TOKEN_KEY = "gdg_admin_token";

import { NextRequest, NextResponse } from "next/server";
import { adminGuard } from "@/lib/api-guard";
import {
  autoMapColumns,
  extractGid,
  extractSheetId,
  previewSheet,
} from "@/lib/sheets";

export async function POST(req: NextRequest) {
  const guard = await adminGuard(req);
  if (guard) return guard;

  try {
    const body = await req.json();
    const sheetUrl = String(body.sheetUrl ?? "");
    const gidInput = String(body.gid ?? "").trim();
    const sheetId = extractSheetId(sheetUrl);
    if (!sheetId) {
      return NextResponse.json(
        { ok: false, error: "That doesn't look like a valid Google Sheets link or ID." },
        { status: 400 }
      );
    }
    const gid = gidInput || extractGid(sheetUrl) || "0";
    const preview = await previewSheet(sheetId, gid);
    return NextResponse.json({
      ok: true,
      preview,
      suggestedMapping: autoMapColumns(preview.headers),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Fetch failed." },
      { status: 400 }
    );
  }
}

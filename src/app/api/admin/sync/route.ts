import { NextRequest, NextResponse } from "next/server";
import { adminGuard } from "@/lib/api-guard";
import { getSheetConfig, saveSheetConfig } from "@/lib/queries";
import { syncFromGoogleSheet, sanitizeConfig } from "@/lib/sheets";
import { invalidateMilestoneData } from "@/lib/milestone-data";

export async function POST(req: NextRequest) {
  const guard = await adminGuard(req);
  if (guard) return guard;

  try {
    let config = null;
    try {
      const body = await req.json();
      config = sanitizeConfig(body.config);
      if (config) await saveSheetConfig(config);
    } catch {
      /* empty body — fall through to saved config */
    }
    if (!config) config = await getSheetConfig();
    if (!config) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "No Google Sheet connected yet. Paste a sheet link, map the columns and save first.",
        },
        { status: 400 }
      );
    }
    const result = await syncFromGoogleSheet(config);
    if (result.status === "success") invalidateMilestoneData();
    return NextResponse.json({ ok: result.status === "success", result });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Sync failed." },
      { status: 400 }
    );
  }
}

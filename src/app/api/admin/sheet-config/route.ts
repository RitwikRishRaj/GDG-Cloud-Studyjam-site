import { NextRequest, NextResponse } from "next/server";
import { adminGuard } from "@/lib/api-guard";
import { saveSheetConfig } from "@/lib/queries";
import { sanitizeConfig } from "@/lib/sheets";

export async function POST(req: NextRequest) {
  const guard = await adminGuard(req);
  if (guard) return guard;

  try {
    const body = await req.json();
    const config = sanitizeConfig(body.config);
    if (!config) {
      return NextResponse.json(
        { ok: false, error: "Invalid config — a Name column is required." },
        { status: 400 }
      );
    }
    await saveSheetConfig(config);
    return NextResponse.json({ ok: true, config });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Save failed." },
      { status: 400 }
    );
  }
}

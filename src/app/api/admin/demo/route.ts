import { NextRequest, NextResponse } from "next/server";
import { adminGuard } from "@/lib/api-guard";
import { seedIfEmpty } from "@/lib/demo-data";

export async function POST(req: NextRequest) {
  const guard = await adminGuard(req);
  if (guard) return guard;

  const inserted = await seedIfEmpty(true);
  return NextResponse.json({
    ok: true,
    inserted,
    message: "Demo dataset (re)loaded.",
  });
}

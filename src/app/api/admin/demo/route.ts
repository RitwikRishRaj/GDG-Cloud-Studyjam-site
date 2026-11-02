import { NextRequest, NextResponse } from "next/server";
import { adminGuard } from "@/lib/api-guard";
import { seedIfEmpty } from "@/lib/demo-data";

export async function POST(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { ok: false, error: "Demo seeding is disabled in production." },
      { status: 403 }
    );
  }

  const guard = await adminGuard(req);
  if (guard) return guard;

  const inserted = await seedIfEmpty();
  if (!inserted) {
    return NextResponse.json(
      { ok: false, error: "Demo data can only be seeded when the participants table is empty." },
      { status: 409 }
    );
  }

  return NextResponse.json({
    ok: true,
    inserted,
    message: "Demo dataset loaded.",
  });
}

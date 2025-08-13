// app/api/debug/columns/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const [row]: Array<{ current_schema: string }> = await prisma.$queryRaw`
      SELECT current_schema()
    `;
    const schema = row?.current_schema ?? "public";

    const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND lower(table_name) IN ('listing','listings')
      ORDER BY table_name
      LIMIT 1
    `;
    const table = tables[0]?.table_name ?? "Listing";

    const columns = await prisma.$queryRaw<
      Array<{ column_name: string; data_type: string; is_nullable: string }>
    >`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND lower(table_name) = lower(${table})
      ORDER BY ordinal_position
    `;

    return NextResponse.json({ schema, table, columns }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "unknown error" }, { status: 500 });
  }
}

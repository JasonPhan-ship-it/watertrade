import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    // information_schema is safe to query with $queryRaw
    const rows: Array<{ column_name: string; data_type: string }> = await prisma.$queryRaw`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'Listing'
      ORDER BY ordinal_position
    `;

    return NextResponse.json({ columns: rows }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "unknown error" }, { status: 500 });
  }
}

// app/api/debug/columns/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    // ?table=Transaction (defaults to Transaction)
    const tableParam = url.searchParams.get("table") || "Transaction";

    // --- Environment / session context
    const [env] = await prisma.$queryRaw<Array<{
      current_database: string;
      current_schema: string;
      search_path: string;
      current_user: string;
    }>>`
      SELECT
        current_database() AS current_database,
        current_schema()   AS current_schema,
        current_setting('search_path') AS search_path,
        current_user       AS current_user
    `;

    // --- What tables are present in the current schema?
    const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = current_schema()
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `;

    // --- Columns for the requested table (case-insensitive)
    const columns = await prisma.$queryRaw<Array<{
      column_name: string;
      data_type: string;
      is_nullable: string;
      udt_name: string;
    }>>`
      SELECT column_name, data_type, is_nullable, udt_name
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND lower(table_name) = lower(${tableParam})
      ORDER BY ordinal_position
    `;

    // --- Recent Prisma migrations (if the migrations table exists)
    let migrations: Array<{ migration_name: string; finished_at: Date | null }> = [];
    try {
      migrations = await prisma.$queryRaw<Array<{ migration_name: string; finished_at: Date | null }>>`
        SELECT migration_name, finished_at
        FROM "_prisma_migrations"
        ORDER BY finished_at DESC NULLS LAST, migration_name DESC
        LIMIT 10
      `;
    } catch {
      // ignore if table doesn't exist
    }

    return NextResponse.json(
      {
        tableRequested: tableParam,
        env,
        tables: tables.map(t => t.table_name),
        columns,
        migrations,
      },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: String(e?.message ?? e) },
      { status: 500 }
    );
  }
}

import { prisma } from "@/lib/prisma";
export const runtime = "nodejs";

type Row = Record<string, any>;

export async function GET() {
  try {
    const [ping] = await prisma.$queryRaw<Row[]>`SELECT 1 AS ok`;

    // What DB/server/schema is the *app* connected to?
    const [info] = await prisma.$queryRaw<Row[]>`
      SELECT
        current_database() AS db,
        current_user       AS user,
        inet_server_addr()::text AS server_addr,
        inet_server_port()       AS server_port,
        current_schema     AS schema
    `;

    // List any tables that look like SiteSetting (case-sensitive + lowercase)
    const tables = await prisma.$queryRaw<Row[]>`
      SELECT n.nspname as schema, c.relname as table
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relkind = 'r'
        AND (c.relname = 'SiteSetting' OR c.relname ILIKE '%sitesetting%')
      ORDER BY c.relname
    `;

    // Generic inventory (first 20 public tables) to eyeball the schema
    const some = await prisma.$queryRaw<Row[]>`
      SELECT c.relname as table
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY c.relname
      LIMIT 20
    `;

    // The original existence check
    const [existsRow] = await prisma.$queryRaw<Row[]>`
      SELECT EXISTS (
        SELECT FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname='public' AND c.relname='SiteSetting' AND c.relkind='r'
      ) AS exists
    `;

    return Response.json({
      ok: true,
      ping,
      info,            // <-- shows db/host/port/schema the APP is using
      siteSettingTable: Boolean(existsRow?.exists),
      matchingTables: tables,
      sampleTables: some,
    });
  } catch (e: any) {
    console.error("[/api/debug/db]", e);
    return Response.json({ ok: false, error: e?.message }, { status: 500 });
  }
}

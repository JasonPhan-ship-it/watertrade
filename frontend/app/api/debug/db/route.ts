import { prisma } from "@/lib/prisma";
export const runtime = "nodejs";

export async function GET() {
  try {
    const ping = await prisma.$queryRaw`SELECT 1 as ok`;
    const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname='public' AND c.relname='SiteSetting' AND c.relkind='r'
      ) as exists
    `;
    return Response.json({ ok: true, ping, siteSettingTable: rows?.[0]?.exists ?? false });
  } catch (e: any) {
    return Response.json({ ok: false, error: e?.message }, { status: 500 });
  }
}

// app/api/db-check/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const meta = await prisma.$queryRawUnsafe<any[]>(
      `select current_database() as db, inet_server_addr()::text as host, inet_server_port() as port`
    );
    const tables = await prisma.$queryRawUnsafe<any[]>(
      `select table_name from information_schema.tables where table_schema = 'public' order by table_name`
    );
    return NextResponse.json({ meta: meta?.[0], tables: tables.map(t => t.table_name) });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "unknown error" }, { status: 500 });
  }
}

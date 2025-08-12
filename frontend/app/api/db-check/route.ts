// app/api/db-check/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

function maskDbUrl(url?: string | null) {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.password) u.password = "****";
    return {
      protocol: u.protocol,
      username: u.username,
      password: u.password,
      host: u.hostname,
      port: u.port,
      pathname: u.pathname,
      search: u.search,
    };
  } catch {
    return "INVALID_URL_FORMAT";
  }
}

export async function GET() {
  try {
    const meta = await prisma.$queryRawUnsafe<any[]>(
      `select current_database() as db, inet_server_addr()::text as host, inet_server_port() as port`
    );
    const tables = await prisma.$queryRawUnsafe<any[]>(
      `select table_name from information_schema.tables where table_schema = 'public' order by table_name`
    );

    const envUrl = process.env.DATABASE_URL || null;

    return NextResponse.json({
      runtime: "nodejs",
      datasourceEnv: "DATABASE_URL",
      envUrlMasked: maskDbUrl(envUrl),
      meta: meta?.[0] || null,
      tables: tables.map(t => t.table_name),
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "unknown error", datasourceEnv: "DATABASE_URL", envUrlMasked: maskDbUrl(process.env.DATABASE_URL) },
      { status: 500 }
    );
  }
}

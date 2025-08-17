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

    // CHECK USER TABLE COLUMNS
    const userColumns = await prisma.$queryRawUnsafe<any[]>(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'User' 
      AND table_schema = 'public'
      ORDER BY ordinal_position;
    `);

    // Check specifically for subscription columns
    const subscriptionColumns = userColumns.filter(col => 
      ['subscriptionStatus', 'subscriptionUpdatedAt', 'stripeCustomerId', 'stripeSubscriptionId']
        .includes(col.column_name)
    );

    const envUrl = process.env.DATABASE_URL || null;

    return NextResponse.json({
      runtime: "nodejs",
      datasourceEnv: "DATABASE_URL",
      envUrlMasked: maskDbUrl(envUrl),
      meta: meta?.[0] || null,
      tables: tables.map(t => t.table_name),
      // NEW: User table column analysis
      userColumns: userColumns,
      subscriptionColumns: subscriptionColumns,
      hasSubscriptionStatus: userColumns.some(col => col.column_name === 'subscriptionStatus'),
      hasStripeCustomerId: userColumns.some(col => col.column_name === 'stripeCustomerId'),
      hasStripeSubscriptionId: userColumns.some(col => col.column_name === 'stripeSubscriptionId'),
      hasSubscriptionUpdatedAt: userColumns.some(col => col.column_name === 'subscriptionUpdatedAt'),
      missingColumns: ['subscriptionStatus', 'subscriptionUpdatedAt', 'stripeCustomerId', 'stripeSubscriptionId']
        .filter(colName => !userColumns.some(col => col.column_name === colName))
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "unknown error", datasourceEnv: "DATABASE_URL", envUrlMasked: maskDbUrl(process.env.DATABASE_URL) },
      { status: 500 }
    );
  }
}

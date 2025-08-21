import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const raw = process.env.DATABASE_URL || "";
  // redact password and username, but keep host:port/db
  try {
    const u = new URL(raw);
    const masked = `${u.protocol}//***:***@${u.host}${u.pathname}`;
    return NextResponse.json({ databaseUrl: masked });
  } catch {
    return NextResponse.json({ databaseUrl: raw ? "(set but unparsable)" : "(not set)" });
  }
}

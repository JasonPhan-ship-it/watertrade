import { NextResponse } from "next/server";
import type { BalanceResponse } from "./login-and-fetch-balance";
import { loginAndFetchBalance } from "./login-and-fetch-balance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request): Promise<NextResponse<{ balance?: BalanceResponse; error?: string }>> {
  try {
    const body = await req.json().catch(() => ({}));
    const username = typeof body?.username === "string" ? body.username.trim() : "";
    const password = typeof body?.password === "string" ? body.password.trim() : "";

    if (!username || !password) {
      return NextResponse.json(
        { error: "Username and password are required" },
        { status: 400 },
      );
    }

    const balance = await loginAndFetchBalance(username, password);
    return NextResponse.json({ balance });
  } catch (error: any) {
    console.error("[POST /api/integrations/westlands/balance]", error);
    const message = error?.message || "Unable to retrieve Westlands balance";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

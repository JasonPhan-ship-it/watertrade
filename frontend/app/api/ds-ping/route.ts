// app/api/ds-ping/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getDsClient } from "@/lib/docusign";

export async function GET() {
  try {
    const { accountId, basePath, userInfo } = await getDsClient();
    return NextResponse.json({
      ok: true,
      accountId,
      basePath,
      userName: userInfo?.name || userInfo?.userName,
      accounts: (userInfo?.accounts || []).map((a: any) => ({
        accountId: a.accountId,
        name: a.accountName,
        baseUri: a.baseUri,
        isDefault: a.isDefault,
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}

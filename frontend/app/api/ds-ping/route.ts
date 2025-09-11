// app/api/ds-ping/route.ts
import { NextResponse } from "next/server";
import { getEnvelopesApiWithAuth } from "@/lib/docusign";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { envelopesApi, accountId } = await getEnvelopesApiWithAuth();
    // simple call: list status changes in last day (or just return ok)
    return NextResponse.json({ ok: true, accountId });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "DocuSign error" },
      { status: 500 }
    );
  }
}

// app/api/debug/template/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { TemplateApi } = await import("@dropbox/sign");
  const apiKey = process.env.DROPBOX_SIGN_API_KEY || "";
  const id = new URL(req.url).searchParams.get("id") || "";
  if (!apiKey || !id) return NextResponse.json({ error: "Missing apiKey or id" }, { status: 400 });
  try {
    const api = new TemplateApi();
    api.username = apiKey;
    const r = await api.templateGet(id as any);
    const roles = r?.body?.template?.signer_roles?.map((x: any) => x?.name).filter(Boolean) || [];
    return NextResponse.json({ id, roles });
  } catch (e: any) {
    const body = e?.response?.body ?? e?.message ?? "error";
    return NextResponse.json({ error: body }, { status: e?.status || 500 });
  }
}

// app/api/debug/template/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { TemplateApi } from "@dropbox/sign";

export async function GET(req: Request) {
  const apiKey = process.env.DROPBOX_SIGN_API_KEY || "";
  const id = new URL(req.url).searchParams.get("id") || "";

  if (!apiKey || !id) {
    return NextResponse.json({ error: "Missing apiKey or id" }, { status: 400 });
  }

  try {
    const api = new TemplateApi();
    api.username = apiKey;

    const r = await api.templateGet(id as any);
    const tpl: any = r?.body?.template ?? null;

    // Prefer typed camelCase; fall back to snake_case if present.
    const roles: string[] =
      (tpl?.signerRoles?.map((x: any) => x?.name).filter(Boolean) ??
        tpl?.signer_roles?.map((x: any) => x?.name).filter(Boolean) ??
        []) as string[];

    return NextResponse.json({ id, roles });
  } catch (e: any) {
    const status =
      e?.status ??
      e?.response?.status ??
      e?.response?.statusCode ??
      500;
    const body = e?.response?.body ?? e?.message ?? "error";
    return NextResponse.json({ error: body }, { status });
  }
}

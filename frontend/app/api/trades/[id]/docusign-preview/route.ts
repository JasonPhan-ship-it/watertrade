import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/prisma";
import { buildDocuSignHtmlPayload, getViewerById } from "@/lib/trade";
import { requireAdmin } from "@/lib/rbac";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const id = (params.id || "").trim();
    if (!id) {
      return NextResponse.json({ error: "Missing trade id" }, { status: 400 });
    }

    let isAdmin = false;
    try {
      await requireAdmin();
      isAdmin = true;
    } catch {
      // Not an admin; fall back to viewer checks
    }

    const { viewer, trade } = await getViewerById(req, id, { createIfMissing: false });
    if (!trade) {
      return NextResponse.json({ error: "Trade not found" }, { status: 404 });
    }

    if (!isAdmin && viewer.role !== "seller" && viewer.role !== "buyer") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const hydrated = await prisma.trade.findUnique({
      where: { id: trade.id },
      include: {
        listing: { include: { waterCode: true, sellerFarm: true } },
        transaction: { include: { sellerFarm: true } },
        buyer: { include: { profile: true } },
        seller: { include: { profile: true } },
      },
    });

    if (!hydrated) {
      return NextResponse.json({ error: "Trade not found" }, { status: 404 });
    }

    const { html } = await buildDocuSignHtmlPayload(hydrated as any);

    return new NextResponse(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (err) {
    console.error("[trades docusign-preview] unexpected", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

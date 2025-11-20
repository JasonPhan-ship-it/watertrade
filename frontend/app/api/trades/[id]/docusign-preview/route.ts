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

    const { sellerHtml, buyerHtml } = await buildDocuSignHtmlPayload(hydrated as any);

    const escapeSrcdoc = (html: string) =>
      html
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    const preview = `<!DOCTYPE html>
      <html>
        <body style="font-family:Arial,sans-serif;padding:24px;">
          <h2 style="margin-top:0;">Seller contract preview</h2>
          <iframe srcdoc="${escapeSrcdoc(sellerHtml)}" style="width:100%;height:600px;border:1px solid #e2e8f0;"></iframe>
          <h2 style="margin-top:32px;">Buyer contract preview</h2>
          <iframe srcdoc="${escapeSrcdoc(buyerHtml)}" style="width:100%;height:600px;border:1px solid #e2e8f0;"></iframe>
        </body>
      </html>`;

    return new NextResponse(preview, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (err) {
    console.error("[trades docusign-preview] unexpected", err);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

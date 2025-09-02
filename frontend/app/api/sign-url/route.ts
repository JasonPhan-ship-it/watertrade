// app/api/sign-url/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/trade";

let SignatureRequestApi: any;
let EmbeddedApi: any;

async function loadDropbox() {
  if (SignatureRequestApi && EmbeddedApi) return;
  try {
    const mod = await import("@dropbox/sign");
    SignatureRequestApi = new mod.SignatureRequestApi();
    EmbeddedApi = new mod.EmbeddedApi();
    // Set API key
    SignatureRequestApi.username = process.env.DROPBOX_SIGN_API_KEY || "";
    EmbeddedApi.username = process.env.DROPBOX_SIGN_API_KEY || "";
  } catch (e) {
    // ok to run without SDK in dev; we'll return a placeholder URL
    console.warn("[sign-url] @dropbox/sign not installed or API key missing.");
  }
}

export async function GET(req: NextRequest) {
  try {
    await loadDropbox();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id") || "";
    const role = (searchParams.get("role") || "").toLowerCase();
    const token = searchParams.get("token") || "";

    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const trade = await prisma.trade.findUnique({ where: { id } });
    if (!trade) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // ✅ authorization using your existing helper
    const viewer = await getViewer(req as any, trade);
    if (viewer.role === "forbidden") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (role && viewer.role !== role) {
      // Optional: prevent crossing roles (buyer vs seller)
      return NextResponse.json({ error: "Role mismatch" }, { status: 403 });
    }

    // If SDK/env not configured yet, return a harmless placeholder
    if (!SignatureRequestApi || !process.env.DROPBOX_SIGN_CLIENT_ID) {
      const fake = `https://example.com/fake-dropbox-sign?trade=${encodeURIComponent(id)}`;
      return NextResponse.json({ url: fake });
    }

    // Build signers based on role (example; adapt to your data)
    const signers = [
      {
        email_address: role === "seller" ? trade.sellerEmail : trade.buyerEmail,
        name: role === "seller" ? trade.sellerName : trade.buyerName,
        role: role || "signer",
      },
    ];

    // 1) Create embedded signature request
    const reqCreate = {
      client_id: process.env.DROPBOX_SIGN_CLIENT_ID!,
      title: `Water Traders – Trade ${trade.id}`,
      subject: "Sign the Water Traders agreement",
      message: "Please review and sign.",
      signers,
      files: [], // or use file_urls / templates
      // file_urls: ["https://.../agreement.pdf"],
      test_mode: process.env.NODE_ENV !== "production" ? 1 : 0,
    };

    // NOTE: Depending on your usage, you may use templates:
    // SignatureRequestApi.signatureRequestCreateEmbeddedWithTemplate(reqWithTemplate)

    const created = await SignatureRequestApi.signatureRequestCreateEmbedded(reqCreate as any);
    const signatureId = created?.body?.signature_request?.signatures?.[0]?.signature_id;
    if (!signatureId) {
      return NextResponse.json({ error: "Failed to create signature request" }, { status: 500 });
    }

    // 2) Get the embedded sign URL for the signer
    const embedded = await EmbeddedApi.embeddedSignUrl(signatureId);
    const signUrl = embedded?.body?.embedded?.sign_url;
    if (!signUrl) {
      return NextResponse.json({ error: "Failed to get embedded URL" }, { status: 500 });
    }

    return NextResponse.json({ url: signUrl });
  } catch (e: any) {
    console.error("[sign-url] error", e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}

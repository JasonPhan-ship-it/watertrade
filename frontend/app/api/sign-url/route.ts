// app/api/sign-url/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/trade";

// ---- Optional: re-declare the Viewer shape if not exported from lib/trade ----
// type Viewer =
//   | { role: "seller" | "buyer" | "guest"; userId?: string }
//   | { role: "forbidden"; reason: string };

// Narrowing helper – avoids `"forbidden"` type complaint
function isForbidden(v: any): v is { role: "forbidden"; reason: string } {
  return v?.role === "forbidden";
}

let SignatureRequestApi: any;
let EmbeddedApi: any;

async function loadDropbox() {
  if (SignatureRequestApi && EmbeddedApi) return;
  try {
    const mod = await import("@dropbox/sign");
    SignatureRequestApi = new mod.SignatureRequestApi();
    EmbeddedApi = new mod.EmbeddedApi();
    // Note: Dropbox Sign node SDK uses basic auth with "username" for API key
    SignatureRequestApi.username = process.env.DROPBOX_SIGN_API_KEY || "";
    EmbeddedApi.username = process.env.DROPBOX_SIGN_API_KEY || "";
  } catch (e) {
    console.warn("[sign-url] @dropbox/sign not installed or API key missing.");
  }
}

export async function GET(req: NextRequest) {
  try {
    await loadDropbox();

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id") || "";
    const roleParam = (searchParams.get("role") || "").toLowerCase();
    const token = searchParams.get("token") || "";

    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const trade = await prisma.trade.findUnique({ where: { id } });
    if (!trade) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // ✅ authorization using your existing helper
    const viewer = await getViewer(req as any, trade);

    if (isForbidden(viewer)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Optional: enforce role from query string if present
    if (roleParam && viewer.role !== roleParam) {
      return NextResponse.json({ error: "Role mismatch" }, { status: 403 });
    }

    // If SDK/env not configured yet, return a harmless placeholder so the page renders
    if (!SignatureRequestApi || !process.env.DROPBOX_SIGN_CLIENT_ID) {
      const fake = `https://example.com/fake-dropbox-sign?trade=${encodeURIComponent(id)}`;
      return NextResponse.json({ url: fake });
    }

    // Map the viewer/role to a signer; tweak these fields based on your schema
    const isSeller = (roleParam || viewer.role) === "seller";
    const signerEmail =
      (isSeller ? (trade as any).sellerEmail : (trade as any).buyerEmail) ||
      (isSeller ? (trade as any).sellerUserEmail : (trade as any).buyerUserEmail);
    const signerName =
      (isSeller ? (trade as any).sellerName : (trade as any).buyerName) || "Signer";

    if (!signerEmail) {
      return NextResponse.json({ error: "Missing signer email on trade" }, { status: 422 });
    }

    // 1) Create embedded signature request
    const reqCreate = {
      client_id: process.env.DROPBOX_SIGN_CLIENT_ID!,
      title: `Water Traders – Trade ${trade.id}`,
      subject: "Sign the Water Traders agreement",
      message: "Please review and sign.",
      signers: [
        {
          email_address: signerEmail,
          name: signerName,
          role: "signer",
        },
      ],
      // Provide your doc via files[] (Buffer) or file_urls[] or use a template flow
      // file_urls: ["https://your-cdn.com/water-trade-agreement.pdf"],
      test_mode: process.env.NODE_ENV !== "production" ? 1 : 0,
    } as any;

    // If you’re using templates, switch to:
    // SignatureRequestApi.signatureRequestCreateEmbeddedWithTemplate(reqWithTemplate)
    const created = await SignatureRequestApi.signatureRequestCreateEmbedded(reqCreate);

    const signatureId = created?.body?.signature_request?.signatures?.[0]?.signature_id;
    if (!signatureId) {
      return NextResponse.json({ error: "Failed to create signature request" }, { status: 500 });
    }

    // 2) Get embedded sign URL
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

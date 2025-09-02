// app/api/sign-url/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getViewer } from "@/lib/trade";

/** Type guard to narrow the viewer union safely */
function isForbidden(v: any): v is { role: "forbidden"; reason: string } {
  return v?.role === "forbidden";
}

/** Lazy-load Dropbox Sign SDK so builds work even if the package isn't installed locally */
let SignatureRequestApi: any;
let EmbeddedApi: any;

async function loadDropbox() {
  if (SignatureRequestApi && EmbeddedApi) return;

  try {
    const mod = await import("@dropbox/sign");
    SignatureRequestApi = new mod.SignatureRequestApi();
    EmbeddedApi = new mod.EmbeddedApi();

    // Dropbox Sign SDK uses HTTP basic auth via "username"
    const apiKey = process.env.DROPBOX_SIGN_API_KEY || "";
    SignatureRequestApi.username = apiKey;
    EmbeddedApi.username = apiKey;
  } catch (e) {
    // OK in dev or when env not set; we'll return a placeholder URL instead
    console.warn("[sign-url] @dropbox/sign not installed or API key missing.");
  }
}

export async function GET(req: NextRequest) {
  try {
    await loadDropbox();

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id") || "";
    // role & token may still be useful for UI/telemetry, but not for auth
    const roleParam = (searchParams.get("role") || "").toLowerCase();
    const token = searchParams.get("token") || "";

    if (!id) {
      return NextResponse.json({ error: "Missing id" }, { status: 400 });
    }

    const trade = await prisma.trade.findUnique({ where: { id } });
    if (!trade) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // ✅ Authorization via your helper (source of truth)
    const viewer = await getViewer(req as any, trade);
    if (isForbidden(viewer)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (viewer.role === "guest") {
      // Adjust if you intend to allow guests with magic links
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Use the actual viewer role; ignore roleParam for auth
    const effectiveRole = viewer.role; // "seller" | "buyer"

    // Resolve signer from your Trade record (best-effort field mapping)
    const isSeller = effectiveRole === "seller";

    // Try multiple field names since schema can vary
    const signerEmail =
      (isSeller ? (trade as any).sellerEmail : (trade as any).buyerEmail) ||
      (isSeller ? (trade as any).sellerUserEmail : (trade as any).buyerUserEmail) ||
      (isSeller ? (trade as any).seller_contact_email : (trade as any).buyer_contact_email) ||
      (isSeller ? (trade as any).seller_user_email : (trade as any).buyer_user_email) ||
      null;

    const signerName =
      (isSeller ? (trade as any).sellerName : (trade as any).buyerName) ||
      (isSeller ? (trade as any).sellerUserName : (trade as any).buyerUserName) ||
      (isSeller ? (trade as any).seller_contact_name : (trade as any).buyer_contact_name) ||
      "Signer";

    if (!signerEmail) {
      return NextResponse.json(
        { error: "Missing signer email on trade" },
        { status: 422 }
      );
    }

    // If the SDK or clientId isn't configured, return a harmless placeholder so the UI renders
    const clientId = process.env.DROPBOX_SIGN_CLIENT_ID || "";
    if (!SignatureRequestApi || !clientId) {
      const fake = `https://example.com/fake-dropbox-sign?trade=${encodeURIComponent(
        id
      )}&role=${encodeURIComponent(effectiveRole)}&token=${encodeURIComponent(token)}`;
      return NextResponse.json({ url: fake });
    }

    // Optional: support template or file URL via env
    const templateId = process.env.DROPBOX_SIGN_TEMPLATE_ID || "";
    const fileUrl = process.env.DROPBOX_SIGN_FILE_URL || ""; // e.g., your agreement PDF on a CDN
    const testMode = process.env.NODE_ENV !== "production" ? 1 : 0;

    let signatureId: string | undefined;

    if (templateId) {
      // --- Embedded with Template ---
      // Map the signer role in the template to this participant.
      const reqWithTemplate = {
        client_id: clientId,
        template_id: templateId,
        subject: "Sign the Water Traders agreement",
        message: "Please review and sign.",
        signers: [
          // Adjust "role" to match your template's role name (e.g., "seller", "buyer", "signer1", etc.)
          {
            role: isSeller ? "seller" : "buyer",
            email_address: signerEmail,
            name: signerName,
          },
        ],
        // Optional: custom_fields if your template expects them
        // custom_fields: [{ name: "TradeID", value: id }],
        test_mode: testMode,
      } as any;

      const created =
        await SignatureRequestApi.signatureRequestCreateEmbeddedWithTemplate(
          reqWithTemplate
        );

      signatureId =
        created?.body?.signature_request?.signatures?.[0]?.signature_id;
    } else {
      // --- Embedded without Template (direct file or file_url) ---
      const reqCreate = {
        client_id: clientId,
        title: `Water Traders – Trade ${id}`,
        subject: "Sign the Water Traders agreement",
        message: "Please review and sign.",
        signers: [
          {
            email_address: signerEmail,
            name: signerName,
            role: "signer",
          },
        ],
        // Exactly one of: files[], file_urls[] (or use templates above)
        ...(fileUrl ? { file_urls: [fileUrl] } : {}),
        test_mode: testMode,
      } as any;

      const created =
        await SignatureRequestApi.signatureRequestCreateEmbedded(reqCreate);

      signatureId =
        created?.body?.signature_request?.signatures?.[0]?.signature_id;
    }

    if (!signatureId) {
      return NextResponse.json(
        { error: "Failed to create signature request" },
        { status: 500 }
      );
    }

    // Fetch the embedded signing URL
    const embedded = await EmbeddedApi.embeddedSignUrl(signatureId);
    const signUrl = embedded?.body?.embedded?.sign_url;

    if (!signUrl) {
      return NextResponse.json(
        { error: "Failed to get embedded URL" },
        { status: 500 }
      );
    }

    return NextResponse.json({ url: signUrl });
  } catch (e: any) {
    console.error("[sign-url] error", e);
    return NextResponse.json(
      { error: e?.message || "Internal error" },
      { status: 500 }
    );
  }
}

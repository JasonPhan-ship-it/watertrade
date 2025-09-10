// app/api/sign-url/route.ts
import { NextRequest, NextResponse } from "next/server";
import * as DropboxSign from "@dropbox/sign";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const apiKey = process.env.DROPBOX_SIGN_API_KEY!;
    const clientId = process.env.DROPBOX_SIGN_CLIENT_ID!;
    const templateId = process.env.DROPBOX_SIGN_TEMPLATE_ID!;
    const testMode = process.env.DROPBOX_SIGN_TEST_MODE === "1" ? 1 : 0;

    if (!apiKey || !clientId || !templateId) {
      return NextResponse.json({ error: "Missing Dropbox Sign env vars" }, { status: 500 });
    }

    // Init Dropbox Sign SDK
    const config = new DropboxSign.Configuration({ username: apiKey });
    const signatureApi = new DropboxSign.SignatureRequestApi(config);
    const embeddedApi = new DropboxSign.EmbeddedApi(config);

    // Example signer payload (replace with DB lookup)
    const signers = [
      {
        role: "SELLER",
        email_address: "jasonphuocphan@gmail.com",
        name: "Jason Phan",
      },
      {
        role: "BUYER",
        email_address: "jasonphuocphan+buyer@gmail.com",
        name: "Jason Phan",
      },
    ];

    // Create embedded signature request
    const createResp = await signatureApi.signatureRequestCreateEmbeddedWithTemplate({
      clientId,
      templateId,
      subject: "WaterTrade Agreement",
      message: "Please review and sign.",
      signers,
      testMode,
    } as any);

    const signatureRequest = createResp.body.signature_request;
    if (!signatureRequest) {
      return NextResponse.json({ error: "Failed to create signature request" }, { status: 500 });
    }

    // Find the SELLER signature (you could target BUYER instead)
    const sigForSeller = signatureRequest.signatures?.find(
      (s: any) => s.signer_role === "SELLER"
    );
    if (!sigForSeller) {
      return NextResponse.json({ error: "Could not find SELLER signature" }, { status: 400 });
    }

    const signatureId = sigForSeller.signature_id;

    // Fetch the embedded signing URL
    const embeddedResp = await embeddedApi.embeddedSignUrl(signatureId);
    const embeddedUrl = embeddedResp.body.embedded?.sign_url;
    if (!embeddedUrl) {
      return NextResponse.json({ error: "Failed to get embedded URL" }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      embeddedUrl,
      requestId: signatureRequest.signature_request_id,
      signatureId,
    });
  } catch (err: any) {
    console.error("Dropbox Sign error:", err);
    return NextResponse.json({ error: "Dropbox Sign error", details: err.message }, { status: 500 });
  }
}

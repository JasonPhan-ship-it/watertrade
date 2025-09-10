// app/api/sign-url/route.ts
import { NextRequest, NextResponse } from "next/server";
import { Configuration, EmbeddedApi, SignatureRequestApi } from "@dropbox/sign";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ----------------- Helpers ----------------- */
function parseDropboxError(e: any) {
  if (e?.response?.body) {
    return {
      status: e?.response?.statusCode,
      body: e.response.body,
    };
  }
  return { status: 500, body: String(e) };
}

/* ----------------- API Route ----------------- */
export async function GET(req: NextRequest) {
  try {
    // Load env
    const apiKey = process.env.DROPBOX_SIGN_API_KEY!;
    const clientId = process.env.DROPBOX_SIGN_CLIENT_ID!;
    const templateId = process.env.DROPBOX_SIGN_TEMPLATE_ID!;
    const testMode = process.env.DROPBOX_SIGN_TEST_MODE === "1" ? 1 : 0;

    if (!apiKey || !clientId || !templateId) {
      return NextResponse.json(
        { error: "Missing Dropbox Sign environment variables" },
        { status: 500 }
      );
    }

    const sdkConfig = new Configuration({ username: apiKey });
    const signatureApi = new SignatureRequestApi(sdkConfig);
    const embeddedApi = new EmbeddedApi(sdkConfig);

    // Example payload (in real use you’d build this from your DB/trade)
    const signers = [
      {
        role: "SELLER",
        email_address: "jasonphuocphan@gmail.com",
        name: "Jason Phan",
      },
      {
        role: "BUYER",
        email_address: "jasonphuocphan+buyer.53fl1a@gmail.com",
        name: "Jason Phan",
      },
    ];

    // Build request
    const request = {
      clientId,
      templateId,
      subject: "WaterTrade Agreement",
      message: "Please review and sign.",
      signers,
      testMode,
    };

    // Create signature request
    const createResp = await signatureApi.signatureRequestCreateEmbeddedWithTemplate(
      request as any
    );

    const signatureRequest = createResp?.body?.signature_request;
    if (!signatureRequest) {
      return NextResponse.json(
        { error: "Failed to create signature request" },
        { status: 500 }
      );
    }

    // Pick the right signer — for now, assume SELLER is the viewer
    const targetRole = "SELLER";
    const sigForRole = signatureRequest.signatures?.find(
      (s: any) => s.signer_role === targetRole
    );
    if (!sigForRole) {
      return NextResponse.json(
        { error: "Could not find signature for target role" },
        { status: 400 }
      );
    }

    const signatureId = sigForRole.signature_id;

    // Get embedded signing URL
    const embeddedResp = await embeddedApi.embeddedSignUrl(signatureId, {
      signatures: [signatureId], // 👈 important
    });

    const embeddedUrl = embeddedResp?.body?.embedded?.sign_url;
    if (!embeddedUrl) {
      return NextResponse.json(
        { error: "Failed to get embedded URL" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      embeddedUrl,
      requestId: signatureRequest.signature_request_id,
      signatureId,
    });
  } catch (e: any) {
    const err = parseDropboxError(e);
    return NextResponse.json(
      { error: "Dropbox Sign error", details: err },
      { status: err.status || 500 }
    );
  }
}

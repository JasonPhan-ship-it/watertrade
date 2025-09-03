// app/api/debug/dropbox-sign/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

async function lazySdk() {
  const mod = await import("@dropbox/sign");
  return mod;
}

function red(s?: string, keepLast = 4) {
  if (!s) return "";
  return s.length <= keepLast ? "****" : `${"*".repeat(Math.max(0, s.length - keepLast))}${s.slice(-keepLast)}`;
}

export async function GET() {
  try {
    const apiKey = process.env.DROPBOX_SIGN_API_KEY || "";
    const clientId = process.env.DROPBOX_SIGN_CLIENT_ID || "";
    const nextPublicClientId = process.env.NEXT_PUBLIC_DROPBOX_SIGN_CLIENT_ID || "";
    const testMode = process.env.DROPBOX_SIGN_TEST_MODE || "1";

    const { AccountApi, Configuration } = await lazySdk();
    const cfg = new Configuration({ username: apiKey });
    const accountApi = new AccountApi(cfg);

    // Minimal call to verify credentials
    const account = await accountApi.accountGet();

    return NextResponse.json({
      ok: true,
      env: {
        DROPBOX_SIGN_API_KEY: red(apiKey),
        DROPBOX_SIGN_CLIENT_ID: red(clientId),
        NEXT_PUBLIC_DROPBOX_SIGN_CLIENT_ID: red(nextPublicClientId),
        DROPBOX_SIGN_TEST_MODE: testMode,
      },
      accountEmail: account.body.account?.email_address ?? null,
    });
  } catch (e: any) {
    // Show full error payloads from SDK
    return NextResponse.json(
      {
        ok: false,
        error: e?.message || "Unknown error",
        details: e?.response?.text || e?.response?.data || null,
        status: e?.status || e?.response?.status || null,
      },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  // Creates a test embedded signature request and returns a sign_url you can try
  try {
    const { signerEmail = "test@example.com", signerName = "Test Signer" } = await req.json().catch(() => ({}));

    const apiKey = process.env.DROPBOX_SIGN_API_KEY || "";
    const clientId = process.env.DROPBOX_SIGN_CLIENT_ID || "";
    const testMode = (process.env.DROPBOX_SIGN_TEST_MODE ?? "1") === "1";

    const { SignatureRequestApi, EmbeddedApi, Configuration } = await lazySdk();
    const cfg = new Configuration({ username: apiKey });
    const sigApi = new SignatureRequestApi(cfg);
    const embApi = new EmbeddedApi(cfg);

    // Create a tiny test request using a public PDF; test_mode ensures no real emails are sent.
    const create = await sigApi.signatureRequestCreateEmbedded({
      clientId,
      testMode: testMode ? 1 : 0,
      title: "Water Traders — Test Embedded Sign",
      subject: "Please sign this test document",
      message: "This is a test embedded signature request from the debug endpoint.",
      signers: [{ emailAddress: signerEmail, name: signerName, order: 0 }],
      fileUrls: ["https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf"],
      // Optional callback if you want to test webhooks later
      // metadata: { env: process.env.VERCEL_ENV ?? "local" },
    } as any);

    const signatureId = create.body.signatureRequest?.signatures?.[0]?.signatureId;
    if (!signatureId) throw new Error("No signatureId returned in signatureRequest");

    const sign = await embApi.embeddedSignUrl(signatureId);
    const signUrl = sign.body.embedded?.signUrl;

    if (!signUrl) throw new Error("No sign_url returned via embeddedSignUrl");

    return NextResponse.json({ ok: true, signUrl, signatureId });
  } catch (e: any) {
    return NextResponse.json(
      {
        ok: false,
        error: e?.message || "Unknown error",
        details: e?.response?.text || e?.response?.data || null,
        status: e?.status || e?.response?.status || null,
      },
      { status: 500 }
    );
  }
}

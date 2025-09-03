// app/api/debug/dropbox-sign/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

/** Lazy-load the SDK so builds don't break if the package is absent in some envs */
async function lazySdk() {
  const sdk = await import("@dropbox/sign");
  return sdk;
}

/** Mask secrets but keep last few chars for visual verification */
function mask(s?: string | null, keepLast = 4) {
  if (!s) return "";
  const v = String(s);
  return v.length <= keepLast ? "****" : `${"*".repeat(Math.max(0, v.length - keepLast))}${v.slice(-keepLast)}`;
}

/** Uniform JSON response (adds CORS headers for quick local testing) */
function json(data: any, init?: ResponseInit) {
  const res = NextResponse.json(data, init);
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  return res;
}

export async function OPTIONS() {
  return json({ ok: true });
}

/** Build the SDK client config (avoids Configuration typing) */
function buildCfg(apiKey: string) {
  return {
    username: apiKey,
    // Default US cluster; override with DROPBOX_SIGN_BASE_URL for EU: https://api.eu.hellosign.com/v3
    basePath: process.env.DROPBOX_SIGN_BASE_URL || "https://api.hellosign.com/v3",
  } as any;
}

/**
 * GET /api/debug/dropbox-sign
 * Sanity check: confirms API key works and shows Dropbox Sign account email.
 */
export async function GET() {
  try {
    const apiKey = process.env.DROPBOX_SIGN_API_KEY || "";
    const clientId = process.env.DROPBOX_SIGN_CLIENT_ID || "";
    const nextPublicClientId = process.env.NEXT_PUBLIC_DROPBOX_SIGN_CLIENT_ID || "";
    const testMode = process.env.DROPBOX_SIGN_TEST_MODE ?? "1";

    if (!apiKey) {
      return json(
        {
          ok: false,
          error: "Missing DROPBOX_SIGN_API_KEY",
          hint: "Set DROPBOX_SIGN_API_KEY in your environment.",
        },
        { status: 500 }
      );
    }

    const sdk = await lazySdk();
    const cfg = buildCfg(apiKey);
    const accountApi = new (sdk as any).AccountApi(cfg);

    const account = await accountApi.accountGet();

    return json({
      ok: true,
      env: {
        DROPBOX_SIGN_API_KEY: mask(apiKey),
        DROPBOX_SIGN_CLIENT_ID: mask(clientId),
        NEXT_PUBLIC_DROPBOX_SIGN_CLIENT_ID: mask(nextPublicClientId),
        DROPBOX_SIGN_TEST_MODE: testMode,
        DROPBOX_SIGN_BASE_URL: process.env.DROPBOX_SIGN_BASE_URL || null,
      },
      accountEmail: account.body.account?.email_address ?? null,
    });
  } catch (e: any) {
    return json(
      {
        ok: false,
        error: e?.message || "Unknown error",
        status: e?.status || e?.response?.status || null,
        details: e?.response?.text || e?.response?.data || null,
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/debug/dropbox-sign
 * Body (optional): { signerEmail?: string, signerName?: string }
 * Creates a test embedded signature request and returns a signUrl you can open in a new tab or iFrame.
 */
export async function POST(req: NextRequest) {
  try {
    const { signerEmail = "test@example.com", signerName = "Test Signer" } =
      (await req.json().catch(() => ({}))) as { signerEmail?: string; signerName?: string };

    const apiKey = process.env.DROPBOX_SIGN_API_KEY || "";
    const clientId = process.env.DROPBOX_SIGN_CLIENT_ID || "";
    const testMode = (process.env.DROPBOX_SIGN_TEST_MODE ?? "1") === "1";

    if (!apiKey || !clientId) {
      return json(
        {
          ok: false,
          error: "Missing Dropbox Sign envs",
          hint: "Ensure DROPBOX_SIGN_API_KEY and DROPBOX_SIGN_CLIENT_ID are set.",
        },
        { status: 500 }
      );
    }

    const sdk = await lazySdk();
    const cfg = buildCfg(apiKey);
    const sigApi = new (sdk as any).SignatureRequestApi(cfg);
    const embApi = new (sdk as any).EmbeddedApi(cfg);

    // Use a public dummy PDF; replace with your own doc when ready.
    const create = await sigApi.signatureRequestCreateEmbedded({
      clientId,
      testMode: testMode ? 1 : 0,
      title: "Water Traders — Test Embedded Sign",
      subject: "Please sign this test document",
      message: "This is a test embedded signature request from the debug endpoint.",
      signers: [{ emailAddress: signerEmail, name: signerName, order: 0 }],
      fileUrls: ["https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf"],
    } as any);

    const signatureId = create.body.signatureRequest?.signatures?.[0]?.signatureId;
    if (!signatureId) {
      return json(
        {
          ok: false,
          error: "No signatureId returned by Dropbox Sign",
          dump: create.body,
        },
        { status: 502 }
      );
    }

    const sign = await embApi.embeddedSignUrl(signatureId);
    const signUrl = sign.body.embedded?.signUrl;

    if (!signUrl) {
      return json(
        {
          ok: false,
          error: "No sign_url returned by Dropbox Sign",
          dump: sign.body,
        },
        { status: 502 }
      );
    }

    return json({ ok: true, signUrl, signatureId });
  } catch (e: any) {
    return json(
      {
        ok: false,
        error: e?.message || "Unknown error",
        status: e?.status || e?.response?.status || null,
        details: e?.response?.text || e?.response?.data || null,
      },
      { status: 500 }
    );
  }
}

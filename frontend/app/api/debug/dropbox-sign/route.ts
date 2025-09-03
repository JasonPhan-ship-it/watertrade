// app/api/debug/dropbox-sign/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

/** Config */
const BASE_URL =
  process.env.DROPBOX_SIGN_BASE_URL ||
  "https://api.hellosign.com/v3"; // set to https://api.eu.hellosign.com/v3 if you're on EU

/** Utils */
function btoa(str: string) {
  return Buffer.from(str, "utf8").toString("base64");
}
function mask(s?: string | null, keepLast = 4) {
  if (!s) return "";
  const v = String(s);
  return v.length <= keepLast ? "****" : `${"*".repeat(Math.max(0, v.length - keepLast))}${v.slice(-keepLast)}`;
}
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

/** Build Basic auth header: "Basic base64(API_KEY:)" */
function authHeader(apiKey: string) {
  return `Basic ${btoa(`${apiKey}:`)}`;
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

    const resp = await fetch(`${BASE_URL}/account`, {
      method: "GET",
      headers: {
        Authorization: authHeader(apiKey),
        Accept: "application/json",
      },
    });

    const bodyText = await resp.text();
    let body: any = null;
    try {
      body = bodyText ? JSON.parse(bodyText) : null;
    } catch {
      /* leave as text if non-JSON */
    }

    if (!resp.ok) {
      return json(
        {
          ok: false,
          error: body?.error?.error_name || body?.error || resp.statusText || "Request failed",
          status: resp.status,
          details: body || bodyText || null,
        },
        { status: 500 }
      );
    }

    return json({
      ok: true,
      env: {
        DROPBOX_SIGN_API_KEY: mask(apiKey),
        DROPBOX_SIGN_CLIENT_ID: mask(clientId),
        NEXT_PUBLIC_DROPBOX_SIGN_CLIENT_ID: mask(nextPublicClientId),
        DROPBOX_SIGN_TEST_MODE: testMode,
        DROPBOX_SIGN_BASE_URL: BASE_URL,
      },
      accountEmail: body?.account?.email_address ?? null,
    });
  } catch (e: any) {
    return json(
      {
        ok: false,
        error: e?.message || "Unknown error",
        status: null,
        details: null,
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/debug/dropbox-sign
 * Body (optional): { signerEmail?: string, signerName?: string }
 * Creates a test embedded signature request and returns a signUrl you can open in a new tab or iFrame.
 *
 * NOTE: The REST API expects form-encoded fields (not JSON) for this endpoint.
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

    // Build x-www-form-urlencoded body per Dropbox Sign v3 REST
    const form = new URLSearchParams();
    form.set("client_id", clientId);
    form.set("test_mode", testMode ? "1" : "0");
    form.set("title", "Water Traders — Test Embedded Sign");
    form.set("subject", "Please sign this test document");
    form.set("message", "This is a test embedded signature request from the debug endpoint.");
    // signers[0][email_address], signers[0][name], signers[0][order]
    form.set("signers[0][email_address]", signerEmail);
    form.set("signers[0][name]", signerName);
    form.set("signers[0][order]", "0");
    // file_url[] (array)
    form.append(
      "file_url[]",
      process.env.NEXT_PUBLIC_SAMPLE_PDF_URL || "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf"
    );

    // 1) Create embedded signature request
    const createResp = await fetch(`${BASE_URL}/signature_request/create_embedded`, {
      method: "POST",
      headers: {
        Authorization: authHeader(apiKey),
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
        Accept: "application/json",
      },
      body: form.toString(),
    });

    const createText = await createResp.text();
    let createBody: any = null;
    try {
      createBody = createText ? JSON.parse(createText) : null;
    } catch {
      /* keep raw text */
    }

    if (!createResp.ok) {
      return json(
        {
          ok: false,
          error: createBody?.error?.error_name || createBody?.error || createResp.statusText || "Create request failed",
          status: createResp.status,
          details: createBody || createText || null,
        },
        { status: 502 }
      );
    }

    const signatureId =
      createBody?.signature_request?.signatures?.[0]?.signature_id ||
      createBody?.signatureRequest?.signatures?.[0]?.signature_id;

    if (!signatureId) {
      return json(
        {
          ok: false,
          error: "No signature_id returned by Dropbox Sign",
          dump: createBody || createText || null,
        },
        { status: 502 }
      );
    }

    // 2) Get embedded sign URL
    const signResp = await fetch(`${BASE_URL}/embedded/sign_url/${encodeURIComponent(signatureId)}`, {
      method: "GET",
      headers: {
        Authorization: authHeader(apiKey),
        Accept: "application/json",
      },
    });

    const signText = await signResp.text();
    let signBody: any = null;
    try {
      signBody = signText ? JSON.parse(signText) : null;
    } catch {
      /* keep raw text */
    }

    if (!signResp.ok) {
      return json(
        {
          ok: false,
          error: signBody?.error?.error_name || signBody?.error || signResp.statusText || "Sign URL request failed",
          status: signResp.status,
          details: signBody || signText || null,
        },
        { status: 502 }
      );
    }

    const signUrl = signBody?.embedded?.sign_url || signBody?.embedded?.signUrl;
    if (!signUrl) {
      return json(
        {
          ok: false,
          error: "No sign_url returned by Dropbox Sign",
          dump: signBody || signText || null,
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
        status: null,
        details: null,
      },
      { status: 500 }
    );
  }
}

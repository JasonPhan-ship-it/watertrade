// app/api/debug/docusign/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";

/** ========= Config =========
 * Required env:
 *  DOCUSIGN_BASE_PATH=https://account-d.docusign.com   // or https://account.docusign.com (prod)
 *  DOCUSIGN_ACCOUNT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
 *  DOCUSIGN_INTEGRATION_KEY=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
 *  DOCUSIGN_USER_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx      // API user GUID
 *  DOCUSIGN_PRIVATE_KEY_B64=...                                // base64-encoded PKCS#8 RSA private key
 *
 * Optional:
 *  DOCUSIGN_RETURN_URL=https://yourapp.com/sign/complete
 *  DOCUSIGN_PING_URL=https://yourapp.com/
 *  NEXT_PUBLIC_SAMPLE_PDF_URL=https://.../dummy.pdf
 */

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

function mask(s?: string | null, keepLast = 4) {
  if (!s) return "";
  const v = String(s);
  return v.length <= keepLast ? "****" : `${"*".repeat(Math.max(0, v.length - keepLast))}${v.slice(-keepLast)}`;
}

let docusign: any = null;
async function loadSDK() {
  if (docusign) return;
  docusign = await import("docusign-esign").catch(() => null);
  if (!docusign) throw new Error("docusign-esign not installed");
}

/** Map OAuth base → REST base */
function resolveRestBase(oauthBase: string) {
  const host = new URL(oauthBase).hostname;
  if (host.includes("account-d")) return "https://demo.docusign.net/restapi";
  if (host.includes("account.")) return "https://www.docusign.net/restapi";
  // fallback: demo
  return "https://demo.docusign.net/restapi";
}

function readPrivateKey(): string {
  const b64 = process.env.DOCUSIGN_PRIVATE_KEY_B64 || "";
  return b64 ? Buffer.from(b64, "base64").toString("utf8") : "";
}

async function getAccessToken() {
  await loadSDK();
  const basePath = process.env.DOCUSIGN_BASE_PATH || "https://account-d.docusign.com";
  const integrationKey = process.env.DOCUSIGN_INTEGRATION_KEY || "";
  const userId = process.env.DOCUSIGN_USER_ID || "";
  const privateKey = readPrivateKey();
  if (!integrationKey || !userId || !privateKey) {
    throw new Error("Missing DocuSign creds: DOCUSIGN_INTEGRATION_KEY, DOCUSIGN_USER_ID, DOCUSIGN_PRIVATE_KEY_B64");
  }

  const apiClient = new docusign.ApiClient();
  apiClient.setOAuthBasePath(new URL(basePath).hostname);

  const res = await apiClient.requestJWTUserToken(
    integrationKey,
    userId,
    ["signature", "impersonation"],
    privateKey,
    3600
  );
  return {
    accessToken: res?.body?.access_token as string,
    oauthBase: basePath,
    restBase: resolveRestBase(basePath),
  };
}

/** GET /api/debug/docusign
 *  Sanity check: validates JWT, returns masked env & user info.
 */
export async function GET() {
  try {
    const accountId = process.env.DOCUSIGN_ACCOUNT_ID || "";
    const integrationKey = process.env.DOCUSIGN_INTEGRATION_KEY || "";
    const userId = process.env.DOCUSIGN_USER_ID || "";
    const basePath = process.env.DOCUSIGN_BASE_PATH || "https://account-d.docusign.com";

    const { accessToken, oauthBase } = await getAccessToken();

    // userinfo (handy to confirm who we’re impersonating)
    const uinfoResp = await fetch(`${oauthBase}/oauth/userinfo`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const uinfoText = await uinfoResp.text();
    let uinfo: any = null;
    try { uinfo = uinfoText ? JSON.parse(uinfoText) : null; } catch {}

    if (!uinfoResp.ok) {
      return json(
        {
          ok: false,
          error: "Failed to fetch /oauth/userinfo",
          status: uinfoResp.status,
          details: uinfo || uinfoText || null,
        },
        { status: 500 }
      );
    }

    const defaultAccount = uinfo?.accounts?.find((a: any) => a?.is_default) || uinfo?.accounts?.[0] || null;

    return json({
      ok: true,
      env: {
        DOCUSIGN_BASE_PATH: basePath,
        DOCUSIGN_ACCOUNT_ID: mask(accountId),
        DOCUSIGN_INTEGRATION_KEY: mask(integrationKey),
        DOCUSIGN_USER_ID: mask(userId),
        DOCUSIGN_PRIVATE_KEY_B64: process.env.DOCUSIGN_PRIVATE_KEY_B64 ? "set" : "missing",
      },
      user: {
        sub: uinfo?.sub ?? null,
        name: uinfo?.name ?? null,
        email: uinfo?.email ?? null,
        defaultAccountName: defaultAccount?.account_name ?? null,
        defaultAccountId: defaultAccount?.account_id ?? null,
      },
    });
  } catch (e: any) {
    return json(
      { ok: false, error: e?.message || "Unknown error", status: null, details: null },
      { status: 500 }
    );
  }
}

/** POST /api/debug/docusign
 * Body (optional): { signerEmail?: string, signerName?: string }
 * Creates a simple envelope (file URL) and returns an embedded signing URL.
 */
export async function POST(req: NextRequest) {
  try {
    await loadSDK();

    const {
      signerEmail = "test@example.com",
      signerName = "Test Signer",
    } = (await req.json().catch(() => ({}))) as { signerEmail?: string; signerName?: string };

    const accountId = process.env.DOCUSIGN_ACCOUNT_ID || "";
    const integrationKey = process.env.DOCUSIGN_INTEGRATION_KEY || "";
    const userId = process.env.DOCUSIGN_USER_ID || "";
    const returnUrl = process.env.DOCUSIGN_RETURN_URL || "https://example.com/docusign/return";
    const pingUrl = process.env.DOCUSIGN_PING_URL || "";
    const sampleUrl =
      process.env.NEXT_PUBLIC_SAMPLE_PDF_URL ||
      "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf";

    if (!accountId || !integrationKey || !userId || !process.env.DOCUSIGN_PRIVATE_KEY_B64) {
      return json(
        {
          ok: false,
          error: "Missing DocuSign envs",
          hint:
            "Ensure DOCUSIGN_ACCOUNT_ID, DOCUSIGN_INTEGRATION_KEY, DOCUSIGN_USER_ID, DOCUSIGN_PRIVATE_KEY_B64 are set.",
        },
        { status: 500 }
      );
    }

    const { accessToken, restBase } = await getAccessToken();

    const apiClient = new docusign.ApiClient();
    apiClient.setBasePath(restBase);
    apiClient.addDefaultHeader("Authorization", "Bearer " + accessToken);

    const envelopesApi = new docusign.EnvelopesApi(apiClient);

    // Download sample file and attach
    const fileRes = await fetch(sampleUrl);
    if (!fileRes.ok) {
      return json(
        { ok: false, error: `Failed to fetch sample PDF (${fileRes.status} ${fileRes.statusText})` },
        { status: 500 }
      );
    }
    const arr = await fileRes.arrayBuffer();
    const docB64 = Buffer.from(arr).toString("base64");
    const nameGuess = new URL(sampleUrl).pathname.split("/").pop() || "sample.pdf";

    const doc = new docusign.Document();
    doc.documentBase64 = docB64;
    doc.name = nameGuess;
    doc.fileExtension = (nameGuess.split(".").pop() || "pdf").toLowerCase();
    doc.documentId = "1";

    const signer = new docusign.Signer();
    signer.email = signerEmail;
    signer.name = signerName;
    signer.recipientId = "1";
    signer.clientUserId = "debug-signer"; // required for embedded

    const signHere = new docusign.SignHere();
    signHere.documentId = "1";
    signHere.pageNumber = "1";
    signHere.recipientId = "1";
    // simple anchor (if present) or absolute placement
    signHere.anchorString = "/sig1/";
    signHere.anchorUnits = "pixels";
    signHere.anchorYOffset = "0";
    signHere.anchorXOffset = "0";

    const tabs = new docusign.Tabs();
    tabs.signHereTabs = [signHere];
    signer.tabs = tabs;

    const recipients = new docusign.Recipients();
    recipients.signers = [signer];

    const env = new docusign.EnvelopeDefinition();
    env.emailSubject = "Water Traders — Test Embedded Sign";
    env.emailBlurb = "This is a test envelope from the debug endpoint.";
    env.documents = [doc];
    env.recipients = recipients;
    env.status = "sent";

    // 1) Create envelope
    let summary;
    try {
      summary = await envelopesApi.createEnvelope(accountId, { envelopeDefinition: env });
    } catch (e: any) {
      return json(
        { ok: false, error: "createEnvelope failed", status: 502, details: e?.response?.text || e?.message || String(e) },
        { status: 502 }
      );
    }
    const envelopeId = summary?.envelopeId;
    if (!envelopeId) {
      return json({ ok: false, error: "No envelopeId returned", details: summary || null }, { status: 502 });
    }

    // 2) Recipient view (embedded signing URL)
    const viewReq = new docusign.RecipientViewRequest();
    viewReq.returnUrl = returnUrl;
    if (pingUrl) {
      viewReq.pingUrl = pingUrl;
      viewReq.pingFrequency = 600;
    }
    viewReq.authenticationMethod = "none";
    viewReq.email = signerEmail;
    viewReq.userName = signerName;
    viewReq.clientUserId = "debug-signer";

    let view;
    try {
      view = await envelopesApi.createRecipientView(accountId, envelopeId, { recipientViewRequest: viewReq });
    } catch (e: any) {
      return json(
        { ok: false, error: "createRecipientView failed", status: 502, details: e?.response?.text || e?.message || String(e) },
        { status: 502 }
      );
    }

    const signUrl = view?.url;
    if (!signUrl) {
      return json({ ok: false, error: "No sign URL in response", details: view || null }, { status: 500 });
    }

    return json({ ok: true, signUrl, envelopeId });
  } catch (e: any) {
    return json(
      { ok: false, error: e?.message || "Unknown error", status: null, details: null },
      { status: 500 }
    );
  }
}

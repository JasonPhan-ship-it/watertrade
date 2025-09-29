// lib/docusign.ts
// Utilities for authenticating with DocuSign via JWT and generating recipient view (embedded signing) URLs.

import "server-only";
import * as docusign from "docusign-esign";

/* ----------------------------- Env & Constants ----------------------------- */

const INTEGRATION_KEY = process.env.DOCUSIGN_INTEGRATION_KEY!;
const USER_ID = process.env.DOCUSIGN_USER_ID!;
const PRIVATE_KEY = (process.env.DOCUSIGN_PRIVATE_KEY || "").replace(/\\n/g, "\n");
const OAUTH_BASE = process.env.DOCUSIGN_OAUTH_BASE_PATH || "account-d.docusign.com"; // demo: account-d
const REST_BASE_FALLBACK = process.env.DOCUSIGN_BASE_PATH || "https://demo.docusign.net/restapi"; // used only before account discovery
const FORCED_ACCOUNT_ID = process.env.DOCUSIGN_ACCOUNT_ID || null; // optional: pin to a specific account
const JWT_EXPIRES_IN = 60 * 60; // 1 hour
const SCOPES = ["signature", "impersonation"] as const;

if (!INTEGRATION_KEY || !USER_ID || !PRIVATE_KEY) {
  console.warn("[docusign] Missing DOCUSIGN_INTEGRATION_KEY / DOCUSIGN_USER_ID / DOCUSIGN_PRIVATE_KEY");
}

/* ----------------------------- Helpers ------------------------------------ */

function isAbsoluteHttps(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:";
  } catch {
    return false;
  }
}

function pickDefaultAccount(userInfo: any) {
  const accounts = userInfo?.accounts || [];
  if (!accounts.length) return null;

  if (FORCED_ACCOUNT_ID) {
    const forced = accounts.find((a: any) => a?.accountId === FORCED_ACCOUNT_ID);
    if (forced) return forced;
    console.warn(`[docusign] DOCUSIGN_ACCOUNT_ID=${FORCED_ACCOUNT_ID} not found in user accounts; falling back to default.`);
  }

  return accounts.find((a: any) => a?.isDefault === true || a?.isDefault === "true") || accounts[0];
}

function decorateAndThrow(err: any, context: string): never {
  // Try to extract DocuSign response details
  const res = err?.response || err?.responseBody || undefined;
  const status = res?.status || err?.status || err?.code || 500;
  const headers = res?.headers || {};
  const trace = headers["x-docusign-tracetoken"] || headers["X-DocuSign-TraceToken"];
  const body = (() => {
    try {
      if (typeof res?.body === "string") return res.body;
      if (res?.body && typeof res.body === "object") return JSON.stringify(res.body);
      if (err?.body && typeof err.body === "object") return JSON.stringify(err.body);
      if (err?.text) return String(err.text);
      return undefined;
    } catch {
      return undefined;
    }
  })();

  const details = {
    status,
    traceToken: trace,
    body,
    message: err?.message || String(err),
  };

  const friendly =
    `[docusign:${context}] HTTP ${status}` +
    (trace ? ` trace=${trace}` : "") +
    (body ? ` body=${body}` : "");

  const e = new Error(friendly);
  (e as any).details = details;
  throw e;
}

/* ----------------------------- API Client Setup ---------------------------- */

export function makeApiClient() {
  const apiClient = new (docusign as any).ApiClient();
  apiClient.setBasePath(REST_BASE_FALLBACK);
  apiClient.setOAuthBasePath(OAUTH_BASE); // domain only, no scheme
  return apiClient;
}

/* ----------------------------- JWT Token Cache ----------------------------- */

type CachedToken = { accessToken: string; expiresAt: number };
let _jwtCache: CachedToken | null = null;

function tokenIsValid(tok: CachedToken | null) {
  if (!tok) return false;
  // Renew 60s early
  return Date.now() < tok.expiresAt - 60_000;
}

async function requestJwtTokenRaw(apiClient = makeApiClient()) {
  if (!INTEGRATION_KEY || !USER_ID || !PRIVATE_KEY) {
    throw new Error("Missing DOCUSIGN_INTEGRATION_KEY / DOCUSIGN_USER_ID / DOCUSIGN_PRIVATE_KEY");
  }
  try {
    const res = await (apiClient as any).requestJWTUserToken(
      INTEGRATION_KEY,
      USER_ID,
      SCOPES,
      PRIVATE_KEY,
      JWT_EXPIRES_IN
    );
    const accessToken: string = res?.body?.access_token || res?.accessToken;
    const expiresIn: number = res?.body?.expires_in || JWT_EXPIRES_IN;
    if (!accessToken) throw new Error("Failed to obtain JWT access token");
    const expiresAt = Date.now() + Math.max(60, expiresIn) * 1000;
    return { accessToken, expiresAt };
  } catch (err: any) {
    decorateAndThrow(err, "jwt");
  }
}

export async function getJwtToken(apiClient = makeApiClient()) {
  if (!tokenIsValid(_jwtCache)) {
    const fresh = await requestJwtTokenRaw(apiClient);
    _jwtCache = fresh;
  }
  return { accessToken: _jwtCache!.accessToken, apiClient };
}

/* ----------------------------- Account Context ----------------------------- */

export async function getDsClient() {
  const { accessToken, apiClient } = await getJwtToken();
  apiClient.addDefaultHeader("Authorization", `Bearer ${accessToken}`);

  let userInfo: any;
  try {
    userInfo = await (apiClient as any).getUserInfo(accessToken);
  } catch (err: any) {
    decorateAndThrow(err, "userInfo");
  }

  const account = pickDefaultAccount(userInfo);
  if (!account) throw new Error("[docusign] No DocuSign account available for this user");

  const basePath = `${account.baseUri}/restapi`; // authoritative per account
  apiClient.setBasePath(basePath);

  return {
    apiClient,
    accountId: account.accountId as string,
    basePath,
    userInfo,
  };
}

/* ----------------------------- Recipient View ------------------------------ */

export type RecipientIdentity = {
  /** Must match the envelope recipient's clientUserId for embedded signing */
  clientUserId: string;
  email: string;
  name: string;
};

export type RecipientViewArgs = {
  envelopeId: string;
  recipient: RecipientIdentity;
  /** Absolute HTTPS URL where DocuSign returns the signer */
  returnUrl: string;
  /** Optional keepalive ping URL (DocuSign pings this from the browser) */
  pingUrl?: string;
  /** Defaults to 600 when pingUrl provided */
  pingFrequencySeconds?: number;
  /** Optional DocuSign brandId */
  brandId?: string;
};

/**
 * Create a recipient (embedded signer) view URL for a given envelope+recipient.
 * IMPORTANT: The envelope MUST have a recipient with the same clientUserId
 * (i.e., an embedded recipient) or DocuSign will 400 this call.
 */
export async function createRecipientViewUrl(args: RecipientViewArgs): Promise<string> {
  if (!args?.recipient?.clientUserId) {
    throw new Error("[docusign:recipientView] Missing recipient.clientUserId (required for embedded signing)");
  }
  if (!args?.recipient?.email || !args?.recipient?.name) {
    throw new Error("[docusign:recipientView] Missing recipient name/email");
  }
  if (!isAbsoluteHttps(args.returnUrl)) {
    throw new Error("[docusign:recipientView] returnUrl must be an absolute HTTPS URL");
  }

  const { accountId, apiClient } = await getDsClient();
  const envelopesApi = new docusign.EnvelopesApi(apiClient);
  const viewReq = new docusign.RecipientViewRequest();

  viewReq.returnUrl = args.returnUrl;
  viewReq.authenticationMethod = "none";
  viewReq.email = args.recipient.email;     // MUST MATCH envelope recipient
  viewReq.userName = args.recipient.name;   // MUST MATCH envelope recipient
  viewReq.clientUserId = args.recipient.clientUserId; // MUST MATCH envelope recipient

  if (args.brandId) viewReq.brandId = args.brandId;

  // Optional keep-alive (DocuSign recommends https)
  if (args.pingUrl) {
    if (!isAbsoluteHttps(args.pingUrl)) {
      console.warn("[docusign:recipientView] pingUrl should be absolute HTTPS; ignoring non-https value.");
    } else {
      (viewReq as any).pingUrl = args.pingUrl;
      (viewReq as any).pingFrequency = String(args.pingFrequencySeconds ?? 600);
    }
  }

  try {
    const result = await envelopesApi.createRecipientView(accountId, args.envelopeId, {
      recipientViewRequest: viewReq,
    } as any);

    const url: string | undefined = (result as any)?.url;
    if (!url) throw new Error("DocuSign did not return a recipient view URL");
    return url;
  } catch (err: any) {
    // Re-throw with DocuSign details (status/body/traceToken) so you can see the exact reason
    decorateAndThrow(err, "recipientView.create");
  }
}

/* ----------------------------- Convenience --------------------------------- */

/**
 * Convenience: generate a seller signing URL and return it.
 */
export async function createSellerSigningUrl(opts: {
  envelopeId: string;
  sellerEmail: string;
  sellerName: string;
  sellerClientUserId: string; // must match envelope recipient
  returnUrl: string;
  pingUrl?: string;
  pingFrequencySeconds?: number;
  brandId?: string;
}) {
  return createRecipientViewUrl({
    envelopeId: opts.envelopeId,
    recipient: {
      clientUserId: opts.sellerClientUserId,
      email: opts.sellerEmail,
      name: opts.sellerName,
    },
    returnUrl: opts.returnUrl,
    pingUrl: opts.pingUrl,
    pingFrequencySeconds: opts.pingFrequencySeconds,
    brandId: opts.brandId,
  });
}

/**
 * Force refresh JWT (e.g., after a 401).
 */
export async function refreshJwt() {
  _jwtCache = null;
  const { accessToken } = await getJwtToken();
  return accessToken;
}

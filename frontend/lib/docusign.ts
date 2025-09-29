// lib/docusign.ts
// Utilities for authenticating with DocuSign via JWT and generating recipient view (embedded signing) URLs.

import "server-only";
import * as docusign from "docusign-esign";

/* ----------------------------- Env & Constants ----------------------------- */

const INTEGRATION_KEY = process.env.DOCUSIGN_INTEGRATION_KEY!;
const USER_ID = process.env.DOCUSIGN_USER_ID!;
const PRIVATE_KEY = (process.env.DOCUSIGN_PRIVATE_KEY || "").replace(/\\n/g, "\n");
const OAUTH_BASE = process.env.DOCUSIGN_OAUTH_BASE_PATH || "account-d.docusign.com"; // demo: account-d
const REST_BASE = process.env.DOCUSIGN_BASE_PATH || "https://demo.docusign.net/restapi"; // demo REST
const JWT_EXPIRES_IN = 60 * 60; // 1 hour
const SCOPES = ["signature", "impersonation"] as const;

if (!INTEGRATION_KEY || !USER_ID || !PRIVATE_KEY) {
  // Throwing at import time can break local dev; prefer console warn.
  console.warn(
    "[docusign] Missing DOCUSIGN_INTEGRATION_KEY / DOCUSIGN_USER_ID / DOCUSIGN_PRIVATE_KEY"
  );
}

/* ----------------------------- API Client Setup ---------------------------- */

export function makeApiClient() {
  const apiClient = new (docusign as any).ApiClient();
  apiClient.setBasePath(REST_BASE);
  apiClient.setOAuthBasePath(OAUTH_BASE);
  return apiClient;
}

/* ----------------------------- JWT Token Cache ----------------------------- */

type CachedToken = { accessToken: string; expiresAt: number };
let _jwtCache: CachedToken | null = null;

function tokenIsValid(tok: CachedToken | null) {
  if (!tok) return false;
  // Renew 60s early to be safe
  return Date.now() < tok.expiresAt - 60_000;
}

async function requestJwtTokenRaw(apiClient = makeApiClient()) {
  if (!INTEGRATION_KEY || !USER_ID || !PRIVATE_KEY) {
    throw new Error(
      "Missing DOCUSIGN_INTEGRATION_KEY / DOCUSIGN_USER_ID / DOCUSIGN_PRIVATE_KEY"
    );
  }
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
}

/** Returns a valid JWT access token (cached) and the api client used. */
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

  const userInfo = await (apiClient as any).getUserInfo(accessToken);
  const accounts = userInfo?.accounts || [];
  const account =
    accounts.find((a: any) => a?.isDefault === true || a?.isDefault === "true") || accounts[0];
  if (!account) throw new Error("No DocuSign account available for this user");

  const basePath = `${account.baseUri}/restapi`;
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
  /**
   * Where DocuSign will send the signer after they finish or cancel.
   * Can include query params (e.g. ?signed=1) and your app will show a status toast.
   */
  returnUrl: string;
  /**
   * Optional: Your app's ping URL to keep the signing session alive (DocuSign pings this origin).
   * If provided, set pingFrequency to 600 (seconds) by default.
   */
  pingUrl?: string;
  pingFrequencySeconds?: number; // default 600 if pingUrl provided
  /**
   * Optional: if you want to brand the signing session with your DocuSign brandId.
   */
  brandId?: string;
};

/**
 * Create a recipient (embedded signer) view URL for a given envelope+recipient.
 * IMPORTANT: The envelope MUST have a recipient with the same clientUserId
 * (i.e., an embedded recipient) or DocuSign will reject the call.
 */
export async function createRecipientViewUrl(args: RecipientViewArgs): Promise<string> {
  const { accountId, apiClient } = await getDsClient();

  const envelopesApi = new docusign.EnvelopesApi(apiClient);
  const viewReq = new docusign.RecipientViewRequest();

  viewReq.returnUrl = args.returnUrl;
  viewReq.authenticationMethod = "none";
  viewReq.email = args.recipient.email;
  viewReq.userName = args.recipient.name;
  viewReq.clientUserId = args.recipient.clientUserId;

  if (args.brandId) viewReq.brandId = args.brandId;

  // Optional keep-alive (DocuSign will ping this URL from the browser)
  if (args.pingUrl) {
    viewReq.pingUrl = args.pingUrl;
    viewReq.pingFrequency = String(args.pingFrequencySeconds ?? 600);
  }

  const result = await envelopesApi.createRecipientView(accountId, args.envelopeId, {
    recipientViewRequest: viewReq,
  } as any);

  const url: string | undefined = (result as any)?.url;
  if (!url) {
    throw new Error("DocuSign did not return a recipient view URL");
  }
  return url;
}

/* ----------------------------- Helpers (optional) -------------------------- */

/**
 * Convenience: generate a **seller** signing URL and return it.
 * You can call this directly in your route/action, then 302 redirect or email the URL.
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
 * If you want to force a re-auth of JWT (for example, on 401s), call this and retry.
 */
export async function refreshJwt() {
  _jwtCache = null;
  const { accessToken } = await getJwtToken();
  return accessToken;
}

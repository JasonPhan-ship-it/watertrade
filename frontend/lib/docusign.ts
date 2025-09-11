// lib/docusign.ts
import * as docusign from "docusign-esign";

const INTEGRATION_KEY = process.env.DOCUSIGN_INTEGRATION_KEY!;
const USER_ID = process.env.DOCUSIGN_USER_ID!;
const PRIVATE_KEY = (process.env.DOCUSIGN_PRIVATE_KEY || "").replace(/\\n/g, "\n");
const OAUTH_BASE = process.env.DOCUSIGN_OAUTH_BASE_PATH || "account-d.docusign.com";
const REST_BASE = process.env.DOCUSIGN_BASE_PATH || "https://demo.docusign.net/restapi";
const JWT_EXPIRES_IN = 60 * 60; // 1 hour
const SCOPES = ["signature", "impersonation"];

export function makeApiClient() {
  const apiClient = new (docusign as any).ApiClient();
  apiClient.setBasePath(REST_BASE);
  apiClient.setOAuthBasePath(OAUTH_BASE);
  return apiClient;
}

export async function getJwtToken(apiClient = makeApiClient()) {
  if (!INTEGRATION_KEY || !USER_ID || !PRIVATE_KEY) {
    throw new Error("Missing DOCUSIGN_INTEGRATION_KEY / DOCUSIGN_USER_ID / DOCUSIGN_PRIVATE_KEY");
  }
  const res = await (apiClient as any).requestJWTUserToken(
    INTEGRATION_KEY,
    USER_ID,
    SCOPES,
    PRIVATE_KEY,
    JWT_EXPIRES_IN
  );
  const accessToken: string = res?.body?.access_token || res?.accessToken;
  if (!accessToken) throw new Error("Failed to obtain JWT access token");
  return { accessToken, apiClient };
}

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
    accountId: account.accountId,
    basePath,
    userInfo,
  };
}

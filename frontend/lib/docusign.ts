// lib/docusign.ts
import * as docusign from "docusign-esign";

/** Build an ApiClient with REST + OAuth base paths set */
export function makeApiClient() {
  const dsApiClient = new docusign.ApiClient();

  // REST base (demo)
  dsApiClient.setBasePath(
    process.env.DOCUSIGN_BASE_PATH || "https://demo.docusign.net/restapi"
  );

  // OAuth base (host only, no protocol or path)
  const oauthHost = (
    process.env.DOCUSIGN_OAUTH_BASE_PATH || "account-d.docusign.com"
  )
    .replace(/^https?:\/\//, "")
    .replace(/\/oauth2.*$/i, "");
  dsApiClient.setOAuthBasePath(oauthHost);

  return dsApiClient;
}

/** Exchange JWT for a user access token */
export async function getAccessToken(dsApiClient = makeApiClient()) {
  const INTEGRATION_KEY = process.env.DOCUSIGN_INTEGRATION_KEY!;
  const USER_ID = process.env.DOCUSIGN_USER_ID!; // the GUID that granted consent
  const PRIVATE_KEY = (process.env.DOCUSIGN_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  const scopes = ["signature", "impersonation"];

  const jwt = await dsApiClient.requestJWTUserToken(
    INTEGRATION_KEY,
    USER_ID,
    scopes,
    PRIVATE_KEY,
    3600
  );

  const body: any = jwt.body || jwt;
  const accessToken = body.access_token || body.accessToken;
  const expiresIn = body.expires_in || body.expiresIn;
  return { accessToken, expiresIn };
}

/** Get default accountId for the authed user */
export async function getDefaultAccountId(
  accessToken: string,
  dsApiClient = makeApiClient()
) {
  const userInfo = await dsApiClient.getUserInfo(accessToken);
  const accounts: any[] =
    (userInfo as any).accounts || (userInfo as any).body?.accounts || [];
  const def = accounts.find((a) => a.isDefault) || accounts[0];
  if (!def?.accountId && !def?.account_id) {
    throw new Error("No DocuSign account found for this user");
  }
  return def.accountId || def.account_id;
}

/** Convenience: an authenticated EnvelopesApi and accountId */
export async function getEnvelopesApiWithAuth() {
  const client = makeApiClient();
  const { accessToken } = await getAccessToken(client);
  client.addDefaultHeader("Authorization", `Bearer ${accessToken}`);
  const accountId = await getDefaultAccountId(accessToken, client);
  const envelopesApi = new docusign.EnvelopesApi(client);
  return { envelopesApi, accountId };
}

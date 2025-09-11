// lib/docusign.ts
import * as docusign from 'docusign-esign';

export async function getDsClient() {
  const INTEGRATION_KEY = process.env.DOCUSIGN_INTEGRATION_KEY!;
  const USER_ID = process.env.DOCUSIGN_USER_ID!;
  const OAUTH_BASE = process.env.DOCUSIGN_OAUTH_BASE_PATH || 'account-d.docusign.com';
  const PRIVATE_KEY = (process.env.DOCUSIGN_PRIVATE_KEY || '').replace(/\\n/g, '\n');

  const apiClient = new docusign.ApiClient();
  apiClient.setOAuthBasePath(OAUTH_BASE);

  // Request JWT (1 hour)
  const scopes = ['signature', 'impersonation'];
  const jwt = await apiClient.requestJWTUserToken(
    INTEGRATION_KEY,
    USER_ID,
    scopes,
    Buffer.from(PRIVATE_KEY, 'utf8'),
    3600
  );
  const accessToken = jwt.body.access_token;

  // Get base URI & accountId
  const userInfo = await apiClient.getUserInfo(accessToken);
  const account =
    userInfo?.accounts?.find((a: any) => a.isDefault) || userInfo?.accounts?.[0];
  if (!account) throw new Error('No DocuSign account found for this user');

  apiClient.addDefaultHeader('Authorization', `Bearer ${accessToken}`);
  apiClient.setBasePath(`${account.baseUri}/restapi`);
  return { apiClient, accountId: account.accountId, accessToken };
}

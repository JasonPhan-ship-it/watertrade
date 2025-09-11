// lib/docusign.ts
export async function getDsClient() {
  // Lazy-load so it never touches client bundles
  const docusign = await import('docusign-esign');

  const INTEGRATION_KEY = process.env.DOCUSIGN_INTEGRATION_KEY!;
  const USER_ID        = process.env.DOCUSIGN_USER_ID!;
  const OAUTH_BASE     = process.env.DOCUSIGN_OAUTH_BASE_PATH || 'account-d.docusign.com';
  const PRIVATE_KEY    = (process.env.DOCUSIGN_PRIVATE_KEY || '').replace(/\\n/g, '\n');

  if (!INTEGRATION_KEY || !USER_ID || !PRIVATE_KEY) {
    throw new Error('Missing DocuSign env vars: check DOCUSIGN_INTEGRATION_KEY, DOCUSIGN_USER_ID, DOCUSIGN_PRIVATE_KEY');
  }

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

  // Resolve baseUri/accountId
  const userInfo = await apiClient.getUserInfo(accessToken);
  const account = userInfo?.accounts?.find((a: any) => a.isDefault) || userInfo?.accounts?.[0];
  if (!account) throw new Error('No DocuSign account found for this user');

  apiClient.addDefaultHeader('Authorization', `Bearer ${accessToken}`);
  apiClient.setBasePath(`${account.baseUri}/restapi`);
  return { apiClient, accountId: account.accountId, accessToken };
}

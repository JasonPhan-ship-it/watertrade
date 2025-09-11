// lib/docusign.ts
import * as docusign from 'docusign-esign';

type DsClient = {
  apiClient: docusign.ApiClient;
  accessToken: string;
  userInfo: any;
  basePath: string;
};

/**
 * Creates a DocuSign API client using JWT (demo/sandbox).
 * Required env:
 * - DOCUSIGN_INTEGRATION_KEY        (a.k.a. "Client ID" / Integration Key)
 * - DOCUSIGN_USER_ID                (GUID of the user who granted consent)
 * - DOCUSIGN_PRIVATE_KEY            (RSA private key, with \n escaped)
 * Optional:
 * - DOCUSIGN_OAUTH_BASE_PATH        (default: account-d.docusign.com)
 * - DOCUSIGN_REST_BASE_PATH         (default: https://demo.docusign.net/restapi)
 */
export async function getDsClient(): Promise<DsClient> {
  const INTEGRATION_KEY = process.env.DOCUSIGN_INTEGRATION_KEY!;
  const USER_ID = process.env.DOCUSIGN_USER_ID!;
  const PRIVATE_KEY = (process.env.DOCUSIGN_PRIVATE_KEY || '').replace(/\\n/g, '\n');

  if (!INTEGRATION_KEY || !USER_ID || !PRIVATE_KEY) {
    throw new Error(
      'Missing DocuSign env vars. Set DOCUSIGN_INTEGRATION_KEY, DOCUSIGN_USER_ID, DOCUSIGN_PRIVATE_KEY.'
    );
  }

  const OAUTH_BASE = process.env.DOCUSIGN_OAUTH_BASE_PATH || 'account-d.docusign.com';
  const REST_BASE = process.env.DOCUSIGN_REST_BASE_PATH || 'https://demo.docusign.net/restapi';

  const apiClient = new docusign.ApiClient();
  apiClient.setOAuthBasePath(OAUTH_BASE); // e.g. account-d.docusign.com

  // Request JWT user token
  const jwtLifeSec = 3600;
  const scopes = ['signature', 'impersonation'];
  const jwt = await apiClient.requestJWTUserToken(
    INTEGRATION_KEY,
    USER_ID,
    scopes,
    PRIVATE_KEY,
    jwtLifeSec
  );

  const accessToken = jwt.body?.access_token;
  if (!accessToken) throw new Error('Failed to obtain DocuSign access token (JWT).');

  // Attach bearer on REST client and resolve user info
  apiClient.setBasePath(REST_BASE);
  apiClient.addDefaultHeader('Authorization', `Bearer ${accessToken}`);

  const userInfo = await apiClient.getUserInfo(accessToken);

  return {
    apiClient,
    accessToken,
    userInfo,
    basePath: REST_BASE,
  };
}

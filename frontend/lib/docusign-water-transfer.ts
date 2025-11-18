import "server-only";

export type WaterTransferEnvelopeInput = {
  buyerName: string;
  buyerEmail: string;
  buyerAccountNumber: string;
  sellerName: string;
  sellerEmail: string;
  sellerAccountNumber: string;
  afAmount: number;
  waterYear: number;
  waterCode: string;
};

export type WaterTransferEnvelopeBody = {
  emailSubject: string;
  documents: Array<{
    documentId: string;
    name: string;
    fileExtension: string;
    documentUrl: { url: string };
  }>;
  recipients: {
    signers: Array<{
      recipientId: string;
      name: string;
      email: string;
      roleName: string;
      tabs: {
        dateSignedTabs: Array<{ anchorString: string; anchorXOffset: string; anchorYOffset: string }>;
        textTabs: Array<{ anchorString: string; value: string }>;
      };
    }>;
  };
};
  prefillTabs: {
    textTabs: Array<{ anchorString: string; value: string; tabLabel: string }>;
  };
  status: "sent";
};

function resolveTemplateUrl() {
  const envUrl = process.env.DOCUSIGN_FILE_URL;
  if (envUrl) return envUrl;

  const base = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/docs/Water-Transfer-Agreement.pdf`;
}

export function buildWaterTransferEnvelopeBody(input: WaterTransferEnvelopeInput): WaterTransferEnvelopeBody {
  const {
    buyerName,
    buyerEmail,
    buyerAccountNumber,
    sellerName,
    sellerEmail,
    sellerAccountNumber,
    afAmount,
    waterYear,
    waterCode,
  } = input;

  const textTabs = [
    { tabLabel: "buyer_name", anchorString: "{{BUYER_NAME}}", value: buyerName },
    { tabLabel: "buyer_account", anchorString: "{{BUYER_ACCOUNT}}", value: buyerAccountNumber },
    { tabLabel: "seller_name", anchorString: "{{SELLER_NAME}}", value: sellerName },
    { tabLabel: "seller_account", anchorString: "{{SELLER_ACCOUNT}}", value: sellerAccountNumber },
    { tabLabel: "af_amount", anchorString: "{{AF_AMOUNT}}", value: String(afAmount) },
    { tabLabel: "water_year", anchorString: "{{WATER_YEAR}}", value: String(waterYear) },
    { tabLabel: "water_code", anchorString: "{{WATER_CODE}}", value: waterCode },
  ];

  const signerTextTabs = textTabs.map(({ anchorString, value }) => ({ anchorString, value }));

  return {
    emailSubject: "Water Transfer Agreement",
    documents: [
      {
        documentId: "1",
        name: "Water Transfer Agreement",
        fileExtension: "pdf",
        documentUrl: {
          url: resolveTemplateUrl(),
        },
      },
    ],
    recipients: {
      signers: [
        {
          recipientId: "1",
          name: buyerName,
          email: buyerEmail,
          roleName: "Buyer",
          tabs: {
            dateSignedTabs: [{ anchorString: "Date:", anchorXOffset: "50", anchorYOffset: "0" }],
            textTabs: signerTextTabs,
          },
        },
        {
          recipientId: "2",
          name: sellerName,
          email: sellerEmail,
          roleName: "Seller",
          tabs: {
            dateSignedTabs: [{ anchorString: "Date:", anchorXOffset: "50", anchorYOffset: "40" }],
            textTabs: signerTextTabs,
          },
        },
      ],
    },
    prefillTabs: {
      textTabs,
    },
    status: "sent",
  };
}

export async function createWaterTransferEnvelope(input: WaterTransferEnvelopeInput) {
  const body = buildWaterTransferEnvelopeBody(input);

  const baseUrl = process.env.DOCUSIGN_BASE_URL || process.env.DOCUSIGN_BASE_PATH || "https://demo.docusign.net/restapi";
  const accountId = process.env.DOCUSIGN_ACCOUNT_ID;
  const accessToken = process.env.DOCUSIGN_ACCESS_TOKEN;

  if (!accountId || !accessToken) {
    throw new Error("Missing DOCUSIGN_ACCOUNT_ID or DOCUSIGN_ACCESS_TOKEN environment variables");
  }

  const res = await fetch(`${baseUrl}/v2.1/accounts/${accountId}/envelopes`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("DocuSign error", res.status, text);
    throw new Error(`DocuSign error: ${res.status} ${text}`);
  }

  return res.json();
}

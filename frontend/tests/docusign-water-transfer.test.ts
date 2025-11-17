import { afterEach, describe, expect, it, vi } from "vitest";

import { buildWaterTransferEnvelopeBody, createWaterTransferEnvelope } from "@/lib/docusign-water-transfer";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

describe("buildWaterTransferEnvelopeBody", () => {
  it("builds an envelope with anchors and template URL", () => {
    process.env.DOCUSIGN_FILE_URL = "https://www.watertraders.com/docs/Water-Transfer-Agreement.pdf";

    const body = buildWaterTransferEnvelopeBody({
      buyerName: "Alice Buyer",
      buyerEmail: "alice@example.com",
      buyerAccountNumber: "B-123",
      sellerName: "Sam Seller",
      sellerEmail: "sam@example.com",
      sellerAccountNumber: "S-456",
      afAmount: 25,
      waterYear: 2025,
      waterCode: "WTR-1",
    });

    expect(body.documents[0].documentUrl.url).toBe(process.env.DOCUSIGN_FILE_URL);
    expect(body.recipients.signers).toHaveLength(2);
    expect(body.recipients.signers[0].tabs.textTabs).toContainEqual({ anchorString: "{{BUYER_NAME}}", value: "Alice Buyer" });
    expect(body.recipients.signers[1].tabs.textTabs).toContainEqual({ anchorString: "{{SELLER_ACCOUNT}}", value: "S-456" });
    expect(body.recipients.signers[0].tabs.dateSignedTabs[0]).toMatchObject({ anchorString: "Date:" });
  });
});

describe("createWaterTransferEnvelope", () => {
  it("posts to DocuSign and returns JSON", async () => {
    process.env.DOCUSIGN_ACCOUNT_ID = "123";
    process.env.DOCUSIGN_ACCESS_TOKEN = "token";
    process.env.DOCUSIGN_BASE_URL = "https://demo.docusign.net/restapi";

    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ envelopeId: "env-1", status: "sent" }),
    } as any);

    const result = await createWaterTransferEnvelope({
      buyerName: "Alice Buyer",
      buyerEmail: "alice@example.com",
      buyerAccountNumber: "B-123",
      sellerName: "Sam Seller",
      sellerEmail: "sam@example.com",
      sellerAccountNumber: "S-456",
      afAmount: 25,
      waterYear: 2025,
      waterCode: "WTR-1",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://demo.docusign.net/restapi/v2.1/accounts/123/envelopes",
      expect.objectContaining({ method: "POST" })
    );
    expect(result).toEqual({ envelopeId: "env-1", status: "sent" });
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/docusign", () => ({
  getDsClient: vi.fn(),
  refreshJwt: vi.fn(),
}));

import { buildWaterTransferEnvelopeBody, createWaterTransferEnvelope } from "@/lib/docusign-water-transfer";
import { getDsClient, refreshJwt } from "@/lib/docusign";

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
    expect(body.prefillTabs.textTabs).toEqual(
      expect.arrayContaining([
        { tabLabel: "buyer_name", anchorString: "{{BUYER_NAME}}", value: "Alice Buyer" },
        { tabLabel: "seller_account", anchorString: "{{SELLER_ACCOUNT}}", value: "S-456" },
        { tabLabel: "af_amount", anchorString: "{{AF_AMOUNT}}", value: "25" },
        { tabLabel: "water_year", anchorString: "{{WATER_YEAR}}", value: "2025" },
        { tabLabel: "water_code", anchorString: "{{WATER_CODE}}", value: "WTR-1" },
      ])
    );
  });
});

describe("createWaterTransferEnvelope", () => {
  it("posts to DocuSign and returns JSON", async () => {
    (getDsClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      accountId: "123",
      basePath: "https://demo.docusign.net/restapi",
      apiClient: { defaultHeaders: { Authorization: "Bearer token" } },
    });

    (refreshJwt as unknown as ReturnType<typeof vi.fn>).mockResolvedValue("fresh-token");

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
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer token" }),
      })
    );
    expect(result).toEqual({ envelopeId: "env-1", status: "sent" });
  });

  it("refreshes the token on 401 and retries", async () => {
    (getDsClient as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      accountId: "123",
      basePath: "https://demo.docusign.net/restapi",
      apiClient: { defaultHeaders: { Authorization: "Bearer expired" } },
    });

    (refreshJwt as unknown as ReturnType<typeof vi.fn>).mockResolvedValue("new-token");

    const fetchMock = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce({ ok: false, status: 401 } as any)
      .mockResolvedValueOnce({ ok: true, status: 200, json: () => Promise.resolve({ envelopeId: "env-2", status: "sent" }) } as any);

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

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://demo.docusign.net/restapi/v2.1/accounts/123/envelopes",
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer new-token" }) })
    );
    expect(result).toEqual({ envelopeId: "env-2", status: "sent" });
  });
});

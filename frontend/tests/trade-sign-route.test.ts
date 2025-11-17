import { describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/trades/[id]/sign/route";
import { createWaterTransferEnvelope } from "@/lib/docusign-water-transfer";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/docusign-water-transfer", () => ({
  createWaterTransferEnvelope: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    trade: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

describe("POST /api/trades/:id/sign", () => {
  it("creates an envelope with trade data", async () => {
    const mockEnvelopeId = "env-123";
    (createWaterTransferEnvelope as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      envelopeId: mockEnvelopeId,
      status: "sent",
    });

    const mockTrade: any = {
      id: "trade-1",
      volumeAf: 50,
      buyerAccountNumber: null,
      sellerAccountNumber: null,
      waterYear: 2024,
      waterCode: null,
      listing: {
        buyerWaterAccount: "B-ACC-1",
        waterCodeYear: "2025",
        waterCodeValue: "CODE-25",
        waterCode: { code: "CODE-ALT", year: "2025" },
        sellerFarm: { accountNumber: "SF-001" },
      },
      transaction: {
        buyerWaterAccount: "B-ACC-TX",
        sellerFarm: { accountNumber: "SF-TX" },
      },
      buyer: { name: "Buyer Bob", email: "buyer@example.com" },
      seller: { name: "Seller Sue", email: "seller@example.com" },
    };

    (prisma.trade.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(mockTrade);
    (prisma.trade.update as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ...mockTrade, docusignEnvelopeId: mockEnvelopeId });

    const res = await POST(new Request("http://localhost/api/trades/trade-1/sign"), { params: { id: "trade-1" } });
    const json = await res.json();

    expect(createWaterTransferEnvelope).toHaveBeenCalledWith(
      expect.objectContaining({
        buyerAccountNumber: "B-ACC-TX",
        sellerAccountNumber: "SF-001",
        waterYear: 2024,
        waterCode: "CODE-25",
        afAmount: 50,
      })
    );
    expect(prisma.trade.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "trade-1" },
        data: expect.objectContaining({ docusignEnvelopeId: mockEnvelopeId }),
      })
    );
    expect(json).toEqual({ envelopeId: mockEnvelopeId, status: "sent" });
  });

  it("returns 404 when trade is missing", async () => {
    (prisma.trade.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    const res = await POST(new Request("http://localhost/api/trades/missing/sign"), { params: { id: "missing" } });
    expect(res.status).toBe(404);
  });
});

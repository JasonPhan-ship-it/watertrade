// app/api/docusign/start/route.ts
import "server-only";
import { NextResponse } from "next/server";
import * as docusign from "docusign-esign";
import { createRecipientViewUrl, getDsClient } from "@/lib/docusign";
import { prisma } from "@/lib/prisma";
import { generateWaterTransferAgreement } from "@/lib/contracts";

export const dynamic = "force-dynamic";

type StartBody = {
  transactionId: string;
  role?: "buyer" | "seller"; // defaults to buyer
  returnUrl: string; // absolute https
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as StartBody;

    if (!body?.transactionId || !body?.returnUrl) {
      return NextResponse.json({ error: "Missing transactionId or returnUrl" }, { status: 400 });
    }

    const role = body.role || "buyer";

    // 1. Fetch Transaction & Related Data
    const tx = await prisma.transaction.findUnique({
      where: { id: body.transactionId },
      include: {
        listing: true,
        seller: {
          include: {
            farms: true,
            profile: true,
          },
        },
        buyer: {
          include: {
            farms: true,
            profile: true,
          },
        },
      },
    });

    if (!tx) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    // 2. Prepare Contract Data
    // Water Traders LLC details (Hardcoded for now as per requirement)
    const waterTradersName = "Water Traders LLC";
    const waterTradersAccount = "WT-LLC-001"; // Placeholder

    // Determine Transferor/Transferee based on the role (Envelope)
    // Envelope 1: Seller -> Water Traders LLC
    // Envelope 2: Water Traders LLC -> Buyer

    let transferorName = "";
    let transferorAccount = "";
    let transfereeName = "";
    let transfereeAccount = "";

    let signerName = "";
    let signerEmail = "";
    let signerClientUserId = "";

    if (role === "seller") {
      // Seller -> Water Traders LLC
      transferorName = tx.seller.name || tx.seller.email;
      transferorAccount = tx.seller.farms[0]?.accountNumber || "N/A";

      transfereeName = waterTradersName;
      transfereeAccount = waterTradersAccount;

      signerName = transferorName;
      signerEmail = tx.seller.email;
      signerClientUserId = tx.sellerClientUserId || `seller-${tx.id}`;
    } else {
      // Water Traders LLC -> Buyer
      transferorName = waterTradersName;
      transferorAccount = waterTradersAccount;

      transfereeName = tx.buyer.name || tx.buyer.email;
      transfereeAccount = tx.buyer.farms[0]?.accountNumber || "N/A";

      signerName = transfereeName;
      signerEmail = tx.buyer.email;
      signerClientUserId = tx.buyerClientUserId || `buyer-${tx.id}`;
    }

    const html = generateWaterTransferAgreement({
      transferorName,
      transferorAccount,
      transfereeName,
      transfereeAccount,
      waterYear: new Date().getFullYear().toString(), // Default to current year
      waterCode: tx.listing.waterType || "General",
      amountAF: tx.acreFeet,
      pricePerAF: tx.pricePerAF / 100, // Convert cents to dollars
      totalPrice: tx.totalAmount / 100,
      role,
    });

    // 3. Create Envelope
    const { apiClient, accountId } = await getDsClient();
    const envApi = new docusign.EnvelopesApi(apiClient);

    const doc = new docusign.Document();
    doc.documentBase64 = Buffer.from(html, "utf8").toString("base64");
    doc.name = "Water Transfer Agreement.html";
    doc.fileExtension = "html";
    doc.documentId = "1";

    const signHere = new docusign.SignHere();
    signHere.documentId = "1";
    signHere.recipientId = "1";
    signHere.anchorString = "/sn1/";
    signHere.anchorUnits = "pixels";
    signHere.anchorXOffset = "0";
    signHere.anchorYOffset = "0";

    const tabs = new docusign.Tabs();
    tabs.signHereTabs = [signHere];

    const signer = new docusign.Signer();
    signer.email = signerEmail;
    signer.name = signerName;
    signer.recipientId = "1";
    signer.clientUserId = signerClientUserId;
    signer.routingOrder = "1";
    signer.tabs = tabs;

    const recipients = new docusign.Recipients();
    recipients.signers = [signer];

    const env = new docusign.EnvelopeDefinition();
    env.emailSubject = "Please sign your Water Trade agreement";
    env.documents = [doc];
    env.recipients = recipients;
    env.status = "sent";

    const result = await envApi.createEnvelope(accountId, { envelopeDefinition: env });
    const envelopeId = result.envelopeId;

    if (!envelopeId) {
      throw new Error("Failed to create envelope");
    }

    // 4. Update Transaction with Envelope ID
    await prisma.transaction.update({
      where: { id: tx.id },
      data: {
        [role === "seller" ? "sellerEnvelopeId" : "buyerEnvelopeId"]: envelopeId,
        [role === "seller" ? "sellerClientUserId" : "buyerClientUserId"]: signerClientUserId,
      },
    });

    // 5. Generate Recipient View URL
    const url = await createRecipientViewUrl({
      envelopeId,
      recipient: {
        name: signerName,
        email: signerEmail,
        clientUserId: signerClientUserId,
      },
      returnUrl: body.returnUrl,
    });

    return NextResponse.json({ url });
  } catch (err: any) {
    console.error("DocuSign Start Error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to start DocuSign", details: err?.details },
      { status: 400 }
    );
  }
}

// app/api/docusign/start/route.ts
import "server-only";
import { NextResponse } from "next/server";
import * as docusign from "docusign-esign";
import { createRecipientViewUrl, getDsClient } from "@/lib/docusign";

export const dynamic = "force-dynamic";

type StartBody = {
  name: string;
  email: string;
  clientUserId: string; // must match the signer on the envelope
  listingId: string;
  returnUrl: string; // absolute https
};

/**
 * Create & send a simple envelope with one embedded signer (clientUserId),
 * using an HTML document that contains an anchor "/sn1/" for the SignHere tab.
 * This avoids needing a stored PDF and is DocuSign-supported.
 */
async function createEnvelopeForBuyer(params: {
  name: string;
  email: string;
  clientUserId: string;
  listingId: string;
}) {
  const { apiClient, accountId } = await getDsClient();
  const envApi = new docusign.EnvelopesApi(apiClient);

  // 1) Document: simple HTML with an anchor string for SignHere
  const html = `<!DOCTYPE html>
<html>
  <body style="font-family: Arial, sans-serif;">
    <h2>Water Trade Agreement</h2>
    <p>Listing ID: <strong>${params.listingId}</strong></p>
    <p>Buyer: <strong>${params.name} &lt;${params.email}&gt;</strong></p>
    <p>Please sign here: /sn1/</p>
  </body>
</html>`;

  const doc = new docusign.Document();
  doc.documentBase64 = Buffer.from(html, "utf8").toString("base64");
  doc.name = "Agreement.html";
  doc.fileExtension = "html";
  doc.documentId = "1";

  // 2) Tabs: place a SignHere tab at the anchor "/sn1/"
  const signHere = new docusign.SignHere();
  signHere.documentId = "1";
  signHere.recipientId = "1";
  signHere.anchorString = "/sn1/";
  signHere.anchorUnits = "pixels";
  signHere.anchorXOffset = "0";
  signHere.anchorYOffset = "0";

  const tabs = new docusign.Tabs();
  tabs.signHereTabs = [signHere];

  // 3) Signer: embedded (must have clientUserId)
  const signer = new docusign.Signer();
  signer.email = params.email;
  signer.name = params.name;
  signer.recipientId = "1";
  signer.clientUserId = params.clientUserId; // <- critical for embedded signing
  signer.routingOrder = "1";
  signer.tabs = tabs;

  const recipients = new docusign.Recipients();
  recipients.signers = [signer];

  // 4) Envelope: must be sent (not created) before creating a recipient view
  const env = new docusign.EnvelopeDefinition();
  env.emailSubject = "Please sign your Water Trade agreement";
  env.documents = [doc];
  env.recipients = recipients;
  env.status = "sent";

  const result = await envApi.createEnvelope(accountId, { envelopeDefinition: env });
  return { envelopeId: result.envelopeId as string };
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as StartBody;

    // Basic input validation
    if (!body?.name || !body?.email || !body?.clientUserId || !body?.listingId || !body?.returnUrl) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // 1) Create & send the envelope with embedded signer
    const { envelopeId } = await createEnvelopeForBuyer({
      name: body.name,
      email: body.email,
      clientUserId: body.clientUserId,
      listingId: body.listingId,
    });

    // 2) Create the embedded signing URL
    const url = await createRecipientViewUrl({
      envelopeId,
      recipient: {
        name: body.name,
        email: body.email,
        clientUserId: body.clientUserId,
      },
      returnUrl: body.returnUrl, // must be absolute https (lib/docusign validates)
      // pingUrl: `${process.env.NEXT_PUBLIC_APP_URL}/api/ping`, // optional
    });

    return NextResponse.json({ url });
  } catch (err: any) {
    // The lib/docusign decorator includes DocuSign status/body/traceToken when available
    return NextResponse.json(
      { error: err?.message || "Failed to start DocuSign", details: err?.details },
      { status: 400 }
    );
  }
}

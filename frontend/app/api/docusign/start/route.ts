import { NextResponse } from "next/server";
import { createRecipientViewUrl } from "@/lib/docusign";
import { /* your envelope creation */ createEnvelopeForBuyer } from "@/lib/your-envelopes";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { name, email, clientUserId, returnUrl, listingId } = await req.json();

    // 1) create/sent envelope for this buyer + listing (must include signer with clientUserId)
    const { envelopeId } = await createEnvelopeForBuyer({ name, email, clientUserId, listingId });

    // 2) get embedded signing URL
    const url = await createRecipientViewUrl({
      envelopeId,
      recipient: { name, email, clientUserId },
      returnUrl, // absolute https
    });

    return NextResponse.json({ url });
  } catch (e: any) {
    return NextResponse.json({ error: e.message, details: e.details }, { status: 400 });
  }
}

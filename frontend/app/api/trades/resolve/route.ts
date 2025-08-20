// app/api/trades/resolve/route.ts
export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id") || "";
  const token = searchParams.get("token") || "";

  const out: any = { id, token, match: null };

  try {
    if (id) {
      // Look up by Transaction.id only (no Trade table)
      const tx = await prisma.transaction.findUnique({
        where: { id },
        select: { id: true, listingId: true },
      } as any);
      if (tx) {
        out.match = "txById";
        out.record = tx;
        return NextResponse.json(out, { status: 200 });
      }
    }

    // Optional token lookups — only if your Transaction model actually has these columns.
    // If you haven't added sellerToken/buyerToken yet, skip this block or add them (see section 3 below).
    if (token) {
      try {
        const txTok = await prisma.transaction.findFirst({
          where: {
            OR: [{ sellerToken: token as any }, { buyerToken: token as any }],
          },
          select: { id: true, listingId: true },
        } as any);
        if (txTok) {
          out.match = "txByToken";
          out.record = txTok;
          return NextResponse.json(out, { status: 200 });
        }
      } catch {
        // If columns don't exist, ignore silently.
        out.tokenLookupSkipped = true;
      }
    }

    return NextResponse.json(out, { status: 404 });
  } catch (e: any) {
    out.error = e?.message || "lookup failed";
    // Return 200 with details to avoid Vercel masking useful info
    return NextResponse.json(out, { status: 200 });
  }
}

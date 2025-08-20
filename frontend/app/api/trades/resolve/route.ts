// app/api/trades/resolve/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

type RoleHint = "buyer" | "seller" | "";

const txInclude = Prisma.validator<Prisma.TransactionInclude>()({
  listing: {
    select: {
      id: true,
      title: true,
      district: true,
      waterType: true,
      kind: true,
    },
  },
  seller: { select: { id: true, email: true, name: true } },
  buyer: { select: { id: true, email: true, name: true } },
  signatures: true,
});

type TxWithJoins = Prisma.TransactionGetPayload<{ include: typeof txInclude }>;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = (url.searchParams.get("id") || "").trim();
  const token = (url.searchParams.get("token") || "").trim(); // optional, can be blank
  const roleHint = (url.searchParams.get("role") || "").toLowerCase() as RoleHint;

  if (!id) {
    return NextResponse.json(
      { ok: false, id, token, error: "missing id", match: null },
      { status: 400 }
    );
  }

  try {
    const row = await prisma.transaction.findUnique({
      where: { id },
      include: txInclude,
    });

    if (!row) {
      return NextResponse.json({ ok: false, id, token, match: null }, { status: 404 });
    }

    // Determine viewer role
    let viewerRole: "buyer" | "seller" | "guest" = "guest";
    const { userId: clerkId } = auth();

    if (roleHint === "buyer" || roleHint === "seller") {
      viewerRole = roleHint;
    } else if (clerkId) {
      const me = await prisma.user.findUnique({ where: { clerkId } });
      if (me) {
        if (me.id === row.buyerId) viewerRole = "buyer";
        else if (me.id === row.sellerId) viewerRole = "seller";
      }
    }

    // Normalize payload for UI — include both listingId and listing object
    const trade: Partial<TxWithJoins> & {
      id: string;
      type: any;
      status: any;
      acreFeet: number;
      pricePerAF: number;
      totalAmount: number;
      listingId: string;
      createdAt: Date;
      updatedAt: Date;
    } = {
      id: row.id,
      type: row.type,               // "OFFER" | "BUY_NOW" | "AUCTION"
      status: row.status,           // TransactionStatus
      acreFeet: row.acreFeet,
      pricePerAF: row.pricePerAF,   // cents
      totalAmount: row.totalAmount, // cents
      listingId: row.listingId,
      listing: row.listing,         // joined object (typed from txInclude)
      seller: row.seller,           // joined object
      buyer: row.buyer,             // joined object
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      signatures: row.signatures ?? [],
    };

    return NextResponse.json({
      ok: true,
      source: "byId",
      id,
      token,
      role: viewerRole,
      tokenOk: Boolean(token),
      match: trade, // keep `match` for backwards-compat
      trade,        // alias some clients read
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, id, token, match: null, error: e?.message || "lookup failed" },
      { status: 500 }
    );
  }
}

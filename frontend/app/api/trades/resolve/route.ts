// app/api/trades/resolve/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

type RoleHint = "buyer" | "seller" | "";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = (url.searchParams.get("id") || "").trim();
  const token = (url.searchParams.get("token") || "").trim(); // optional one-click token
  const roleHint = (url.searchParams.get("role") || "").toLowerCase() as RoleHint;

  if (!id) {
    return NextResponse.json(
      { id, token, match: null, error: "missing id" },
      { status: 400 }
    );
  }

  try {
    const row = await prisma.transaction.findUnique({
      where: { id },
      include: {
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
        signatures: true, // OK if you haven't used it yet
      },
    } as any);

    if (!row) {
      return NextResponse.json({ id, token, match: null }, { status: 404 });
    }

    // Figure out viewer role:
    // 1) honor ?role=buyer|seller if present
    // 2) else try to infer from logged-in Clerk user
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

    // Token gate (optional). If you later store per-email tokens on the row, validate here.
    // For now we mark true when present, false when blank—UI can decide how strict to be.
    const tokenOk = token.length > 0 ? true : false;

    const trade = {
      id: row.id,
      type: row.type,                 // "BUY_NOW" | "OFFER" | "AUCTION"
      status: row.status,             // enum TransactionStatus
      acreFeet: row.acreFeet,
      pricePerAF: row.pricePerAF,     // cents
      totalAmount: row.totalAmount,   // cents
      listing: row.listing,
      seller: row.seller,
      buyer: row.buyer,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      // include anything else your UI needs here:
      // signatures: row.signatures,
    };

    // Backward-compat: some UIs expect "match". We return both.
    return NextResponse.json({
      id,
      token,
      role: viewerRole,
      tokenOk,
      match: trade,
      trade,
    });
  } catch (e: any) {
    return NextResponse.json(
      { id, token, match: null, error: e?.message || "lookup failed" },
      { status: 500 }
    );
  }
}

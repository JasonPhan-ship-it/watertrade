// app/api/dashboard/trades/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function parseQuery(req: NextRequest) {
  const sp = new URL(req.url).searchParams;
  const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10));
  const pageSize = Math.min(50, Math.max(1, parseInt(sp.get("pageSize") ?? "10", 10)));
  const sortDir = (sp.get("sortDir") ?? "desc").toLowerCase() === "asc" ? "asc" : "desc";
  return {
    page,
    pageSize,
    sortDir: sortDir as "asc" | "desc",
    skip: (page - 1) * pageSize,
    take: pageSize,
  };
}

function noCache(res: NextResponse) {
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0, s-maxage=0");
  res.headers.set("Pragma", "no-cache");
  res.headers.set("Expires", "0");
  return res;
}

export async function GET(req: NextRequest) {
  try {
    const { userId: clerkId } = auth();
    if (!clerkId) {
      return noCache(NextResponse.json({ trades: [], total: 0, viewerRole: null }, { status: 200 }));
    }

    const viewer = await prisma.user.findUnique({
      where: { clerkId },
      select: { id: true, role: true, name: true, email: true },
    });

    if (!viewer?.id) {
      return noCache(
        NextResponse.json({ trades: [], total: 0, viewerRole: viewer?.role ?? null }, { status: 200 })
      );
    }

    const q = parseQuery(req);
    const where = {
      OR: [{ buyerUserId: viewer.id }, { sellerUserId: viewer.id }],
    };

    const [total, rows] = await Promise.all([
      prisma.trade.count({ where }),
      prisma.trade.findMany({
        where,
        orderBy: { updatedAt: q.sortDir },
        skip: q.skip,
        take: q.take,
        include: {
          listing: { select: { id: true, title: true, district: true, waterType: true } },
          buyer: { select: { id: true, name: true, email: true } },
          seller: { select: { id: true, name: true, email: true } },
          transaction: {
            select: {
              id: true,
              type: true,
              status: true,
              listingTitleSnapshot: true,
              buyerNameSnapshot: true,
              buyerEmailSnapshot: true,
              sellerNameSnapshot: true,
              sellerEmailSnapshot: true,
            },
          },
        },
      }),
    ]);

    const trades = rows.map((trade) => {
      const viewerRole =
        trade.buyerUserId === viewer.id ? "buyer" : trade.sellerUserId === viewer.id ? "seller" : "unknown";

      const counterpartName =
        viewerRole === "buyer"
          ? trade.seller?.name || trade.transaction?.sellerNameSnapshot || trade.seller?.email || trade.transaction?.sellerEmailSnapshot || null
          : viewerRole === "seller"
            ? trade.buyer?.name || trade.transaction?.buyerNameSnapshot || trade.buyer?.email || trade.transaction?.buyerEmailSnapshot || null
            : null;

      return {
        id: trade.transactionId ?? trade.id,
        tradeId: trade.id,
        transactionId: trade.transactionId,
        listingId: trade.listingId,
        listingTitle:
          trade.transaction?.listingTitleSnapshot || trade.windowLabel || trade.listing?.title || "Water Trade",
        district: trade.district,
        waterType: trade.waterType ?? trade.listing?.waterType ?? null,
        volumeAf: trade.volumeAf,
        pricePerAf: (trade.pricePerAf ?? 0) / 100,
        status: trade.status,
        updatedAt: trade.updatedAt.toISOString(),
        viewerRole,
        counterpartName,
        transactionStatus: trade.transaction?.status ?? null,
        type: trade.transaction?.type ?? null,
      };
    });

    return noCache(
      NextResponse.json(
        {
          trades,
          total,
          viewerRole: (viewer.role as "ADMIN" | "USER" | null) ?? null,
        },
        { status: 200 }
      )
    );
  } catch (err: any) {
    console.error("[api/dashboard/trades] error", err);
    return noCache(
      NextResponse.json(
        { trades: [], total: 0, error: err?.message || "Internal error" },
        { status: 500 }
      )
    );
  }
}

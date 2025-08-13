import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/rbac";

export async function GET(req: NextRequest) {
  await requireAdmin();
  const sp = new URL(req.url).searchParams;
  const status = sp.get("status") as "ACTIVE" | "UNDER_CONTRACT" | "SOLD" | "ARCHIVED" | null;
  const where = status ? { status } : {};
  const listings = await prisma.listing.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      title: true,
      district: true,
      waterType: true,
      acreFeet: true,
      pricePerAF: true,
      status: true,
      createdAt: true,
    },
  });
  return NextResponse.json({ listings }, { status: 200 });
}

export async function PATCH(req: NextRequest) {
  await requireAdmin();
  const { id, status } = await req.json();
  if (!id || !status) return NextResponse.json({ error: "Missing id/status" }, { status: 400 });

  const updated = await prisma.listing.update({ where: { id }, data: { status } });
  return NextResponse.json({ ok: true, listing: updated }, { status: 200 });
}

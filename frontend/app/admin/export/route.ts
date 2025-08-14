// app/api/admin/transactions/export/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import * as XLSX from "xlsx";

export const runtime = "nodejs";

function parseDate(d?: string) {
  if (!d) return null;
  const date = new Date(d);
  return Number.isFinite(date.valueOf()) ? date : null;
}
function toStartOfDay(d: Date) {
  const dd = new Date(d);
  dd.setHours(0, 0, 0, 0);
  return dd;
}
function toEndOfDay(d: Date) {
  const dd = new Date(d);
  dd.setHours(23, 59, 59, 999);
  return dd;
}

export async function GET(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Ensure local user & ADMIN
  let me = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!me) {
    const cu = await clerkClient.users.getUser(userId);
    const email =
      cu?.emailAddresses?.find((e) => e.id === cu.primaryEmailAddressId)?.emailAddress ||
      cu?.emailAddresses?.[0]?.emailAddress ||
      `${userId}@example.local`;
    const name = [cu?.firstName, cu?.lastName].filter(Boolean).join(" ") || cu?.username || null;
    me = await prisma.user.create({ data: { clerkId: userId, email, name: name ?? undefined } });
  }
  if (me.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const fromParam = parseDate(searchParams.get("from") || undefined);
  const toParam = parseDate(searchParams.get("to") || undefined);

  const where: any = {};
  if (fromParam || toParam) {
    where.createdAt = {};
    if (fromParam) where.createdAt.gte = toStartOfDay(fromParam);
    if (toParam) where.createdAt.lte = toEndOfDay(toParam);
  }

  const txns = await prisma.transaction.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      createdAt: true,
      type: true,
      status: true,
      acreFeet: true,
      pricePerAF: true,   // cents
      totalAmount: true,  // cents
      listingTitleSnapshot: true,
      listing: { select: { title: true } },
      buyer: { select: { email: true, name: true } },
      seller: { select: { email: true, name: true } },
    },
  });

  // Shape rows for Excel
  const rows = txns.map((t) => ({
    "Transaction ID": t.id,
    "Created At": t.createdAt.toISOString(),
    "Type": t.type,
    "Status": t.status,
    "Listing Title": t.listingTitleSnapshot || t.listing?.title || "",
    "Buyer Name": t.buyer?.name || "",
    "Buyer Email": t.buyer?.email || "",
    "Seller Name": t.seller?.name || "",
    "Seller Email": t.seller?.email || "",
    "Acre-Feet": t.acreFeet,
    "Price / AF (USD)": Number((t.pricePerAF / 100).toFixed(2)),
    "Total (USD)": Number((t.totalAmount / 100).toFixed(2)),
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Transactions");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const filename = `transactions-${yyyy}-${mm}-${dd}.xlsx`;

  return new NextResponse(buf, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

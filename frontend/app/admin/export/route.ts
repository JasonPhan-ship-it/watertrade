// frontend/app/admin/export/route.ts
import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs"; // ensure Node (not Edge)

function parseDate(d?: string) {
  if (!d) return null;
  const dt = new Date(d);
  return Number.isFinite(dt.valueOf()) ? dt : null;
}
function toStartOfDay(d: Date) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function toEndOfDay(d: Date)   { const x = new Date(d); x.setHours(23,59,59,999); return x; }

export async function GET(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // ensure local user and ADMIN
  let me = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!me) {
    const cu = await clerkClient.users.getUser(userId);
    const email =
      cu?.emailAddresses?.find(e => e.id === cu.primaryEmailAddressId)?.emailAddress ||
      cu?.emailAddresses?.[0]?.emailAddress ||
      `${userId}@example.local`;
    const name = [cu?.firstName, cu?.lastName].filter(Boolean).join(" ") || cu?.username || null;
    me = await prisma.user.create({ data: { clerkId: userId, email, name: name ?? undefined } });
  }
  if (me.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const from = parseDate(searchParams.get("from") || undefined);
  const to   = parseDate(searchParams.get("to") || undefined);

  const where: any = {};
  if (from || to) {
    where.createdAt = {};
    if (from) where.createdAt.gte = toStartOfDay(from);
    if (to)   where.createdAt.lte = toEndOfDay(to);
  }

  const txns = await prisma.transaction.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true, createdAt: true, type: true, status: true,
      acreFeet: true, pricePerAF: true, totalAmount: true,
      listingTitleSnapshot: true,
      listing: { select: { title: true } },
      buyer: { select: { name: true, email: true } },
      seller: { select: { name: true, email: true } },
    },
  });

  const rows = txns.map(t => ({
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

  // ---- Robust dynamic import for both ESM/CJS bundling cases
  const mod = await import("xlsx");
  const XLSX: any = (mod as any).default ?? mod;

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Transactions");

  // Produce ArrayBuffer (safer for Response body than Node Buffer in some envs)
  const ab: ArrayBuffer = XLSX.write(wb, { type: "array", bookType: "xlsx" });

  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const filename = `transactions-${yyyy}-${mm}-${dd}.xlsx`;

  return new NextResponse(ab, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
      "Content-Length": String(ab.byteLength),
    },
  });
}

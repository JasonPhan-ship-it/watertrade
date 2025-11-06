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

  const headers = [
    "Transaction ID",
    "Created At",
    "Type",
    "Status",
    "Listing Title",
    "Buyer Name",
    "Buyer Email",
    "Seller Name",
    "Seller Email",
    "Acre-Feet",
    "Price / AF (USD)",
    "Total (USD)",
  ] as const;
  
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
  const XLSX = (mod as any).default ?? mod;

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows, { header: [...headers], origin: "B2" });

  // Format header row with bottom border and hide gridlines for the worksheet
  const headerRowIndex = 1; // zero-based index (row 2 in Excel)
  const headerColIndex = 1; // zero-based index (column B in Excel)
  headers.forEach((_, colOffset) => {
    const cellAddress = XLSX.utils.encode_cell({ r: headerRowIndex, c: headerColIndex + colOffset });
    const cell: any = ws[cellAddress];
    if (!cell) return;
    const currentStyle = cell.s ?? {};
    const currentBorder = currentStyle.border ?? {};
    cell.s = {
      ...currentStyle,
      border: {
        ...currentBorder,
        bottom: { style: "medium", color: { rgb: "000000" } },
      },
    };
  });

  const sheet: any = ws as any;
  sheet["!gridlines"] = false;
  sheet["!sheetViews"] = [{ showGridLines: false, workbookViewId: 0 }];
  const workbook: any = wb as any;
  workbook.Workbook = workbook.Workbook ?? {};
  workbook.Workbook.Views = workbook.Workbook.Views ?? [];
  if (!workbook.Workbook.Views.length) {
    workbook.Workbook.Views.push({});
  }
  
  XLSX.utils.book_append_sheet(wb, ws, "Transactions");

  // Produce ArrayBuffer (safer for Response body than Node Buffer in some envs)
  const ab: ArrayBuffer = XLSX.write(wb, { type: "array", bookType: "xlsx", cellStyles: true });

  const today = new Date();
  const yyyy = today.getFullYear();
  const month = today.getMonth() + 1;
  const day = today.getDate();
  const filename = `watertraders_transactions_${month}.${day}.${yyyy}.xlsx`;

  return new NextResponse(ab, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
      "Content-Length": String(ab.byteLength),
    },
  });
}

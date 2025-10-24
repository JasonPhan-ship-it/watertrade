
New
+109
-0

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/rbac";

type Params = { params: { id: string } };

function mapCode(code: any) {
  return {
    id: code.id,
    districtId: code.districtId,
    districtName: code.district?.name ?? null,
    code: code.code,
    year: code.year,
    description: code.description,
    category: code.category,
    isActive: code.isActive,
    createdAt: code.createdAt instanceof Date ? code.createdAt.toISOString() : null,
    updatedAt: code.updatedAt instanceof Date ? code.updatedAt.toISOString() : null,
  };
}

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const code = await prisma.waterCode.findUnique({
      where: { id: params.id },
      include: { district: true },
    });
    if (!code) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ code: mapCode(code) });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Failed to load water code" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    await requireAdmin();
    const body = (await req.json()) as any;

    const districtName = typeof body?.districtName === "string" ? body.districtName.trim() : "";
    const codeValue = typeof body?.code === "string" ? body.code.trim() : "";
    const yearValue = typeof body?.year === "string" ? body.year.trim() : "";
    const descriptionValue = typeof body?.description === "string" ? body.description.trim() : "";
    const categoryValue = typeof body?.category === "string" ? body.category.trim() : "";
    const isActive = typeof body?.isActive === "boolean" ? body.isActive : undefined;

    if (!districtName || !codeValue || !yearValue) {
      return NextResponse.json({ error: "districtName, code, and year are required" }, { status: 400 });
    }

    let district = await prisma.waterDistrict.findFirst({
      where: { name: { equals: districtName, mode: "insensitive" } },
    });
    if (!district) {
      district = await prisma.waterDistrict.create({ data: { name: districtName } });
    }

    try {
      const updated = await prisma.waterCode.update({
        where: { id: params.id },
        data: {
          districtId: district.id,
          code: codeValue,
          year: yearValue,
          description: descriptionValue || null,
          category: categoryValue || null,
          ...(typeof isActive === "boolean" ? { isActive } : {}),
        },
        include: { district: true },
      });
      return NextResponse.json({ code: mapCode(updated) });
    } catch (err: any) {
      if (err?.code === "P2002") {
        return NextResponse.json(
          { error: "A water code with this code and year already exists for the district." },
          { status: 409 }
        );
      }
      if (err?.code === "P2025") {
        return NextResponse.json({ error: "Water code not found" }, { status: 404 });
      }
      throw err;
    }
  } catch (err: any) {
    const status = err?.status && Number.isInteger(err.status) ? err.status : 500;
    const message = err?.message || "Failed to update water code";
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    await requireAdmin();
    await prisma.waterCode.delete({ where: { id: params.id } });
    return new NextResponse(null, { status: 204 });
  } catch (err: any) {
    if (err?.code === "P2025") {
      return NextResponse.json({ error: "Water code not found" }, { status: 404 });
    }
    const status = err?.status && Number.isInteger(err.status) ? err.status : 500;
    const message = err?.message || "Failed to delete water code";
    return NextResponse.json({ error: message }, { status });
  }
}

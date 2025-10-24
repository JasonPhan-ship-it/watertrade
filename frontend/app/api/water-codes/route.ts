import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/rbac";

function mapCode(code: any, districtName?: string) {
  return {
    id: code.id,
    districtId: code.districtId,
    districtName: districtName || code.district?.name || null,
    code: code.code,
    year: code.year,
    description: code.description,
    category: code.category,
    isActive: code.isActive,
    createdAt: code.createdAt instanceof Date ? code.createdAt.toISOString() : null,
    updatedAt: code.updatedAt instanceof Date ? code.updatedAt.toISOString() : null,
  };
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const districtQuery = (url.searchParams.get("district") || "").trim();
    const includeInactive = (url.searchParams.get("includeInactive") || "").toLowerCase() === "true";

    if (districtQuery) {
      const district = await prisma.waterDistrict.findFirst({
        where: { name: { equals: districtQuery, mode: "insensitive" } },
        include: {
          codes: {
            where: includeInactive ? {} : { isActive: true },
            orderBy: [{ category: "asc" }, { code: "asc" }],
          },
        },
      });

      if (!district) {
        return NextResponse.json({ district: null, codes: [] });
      }

      return NextResponse.json({
        district: { id: district.id, name: district.name },
        codes: district.codes.map((code) => mapCode(code, district.name)),
      });
    }

    const districts = await prisma.waterDistrict.findMany({
      orderBy: { name: "asc" },
      include: {
        codes: {
          where: includeInactive ? {} : { isActive: true },
          orderBy: [{ category: "asc" }, { code: "asc" }],
        },
      },
    });

    return NextResponse.json({
      districts: districts.map((district) => ({
        id: district.id,
        name: district.name,
        codes: district.codes.map((code) => mapCode(code, district.name)),
      })),
    });
  } catch (err: any) {
    console.error("[water-codes] GET failed", err);
    return NextResponse.json({ error: err?.message || "Failed to load water codes" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const body = (await req.json()) as any;

    const districtName = typeof body?.districtName === "string" ? body.districtName.trim() : "";
    const codeValue = typeof body?.code === "string" ? body.code.trim() : "";
    const yearValue = typeof body?.year === "string" ? body.year.trim() : "";
    const descriptionValue = typeof body?.description === "string" ? body.description.trim() : "";
    const categoryValue = typeof body?.category === "string" ? body.category.trim() : "";
    const isActive = typeof body?.isActive === "boolean" ? body.isActive : true;

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
      const created = await prisma.waterCode.create({
        data: {
          districtId: district.id,
          code: codeValue,
          year: yearValue,
          description: descriptionValue || null,
          category: categoryValue || null,
          isActive,
        },
        include: { district: true },
      });

      return NextResponse.json({ code: mapCode(created) }, { status: 201 });
    } catch (err: any) {
      if (err?.code === "P2002") {
        return NextResponse.json(
          { error: "A water code with this code and year already exists for the district." },
          { status: 409 }
        );
      }
      throw err;
    }
  } catch (err: any) {
    const status = err?.status && Number.isInteger(err.status) ? err.status : 500;
    const message = err?.message || "Failed to create water code";
    return NextResponse.json({ error: message }, { status });
  }
}

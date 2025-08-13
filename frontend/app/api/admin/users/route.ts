import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/rbac";

export async function GET() {
  await requireAdmin();
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, email: true, name: true, role: true, clerkId: true, createdAt: true },
  });
  return NextResponse.json({ users }, { status: 200 });
}

export async function PATCH(req: NextRequest) {
  await requireAdmin();
  const { userId, role } = await req.json();
  if (!userId || !role) return NextResponse.json({ error: "Missing userId or role" }, { status: 400 });
  if (!["USER", "ADMIN"].includes(role)) return NextResponse.json({ error: "Invalid role" }, { status: 400 });

  const user = await prisma.user.update({ where: { id: userId }, data: { role } });
  return NextResponse.json({ ok: true, user }, { status: 200 });
}

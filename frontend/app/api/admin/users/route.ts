import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/rbac";
import { appUrl, renderAdminPromotionEmail, sendEmail } from "@/lib/email";

export async function GET() {
  const admin = await requireAdmin();
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

  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, role: true },
  });
  if (!existing) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const user = await prisma.user.update({ where: { id: userId }, data: { role } });


  if (role === "ADMIN" && existing.role !== "ADMIN") {
    try {
      const { html, preheader } = renderAdminPromotionEmail({
        name: user.name,
        adminPortalUrl: appUrl("/admin"),
        promotedByName: admin.name,
        promotedByEmail: admin.email,
      });
      await sendEmail({ to: user.email, subject: "Admin access granted", html, preheader });
    } catch (err) {
      console.warn("[admin/users] admin promotion email failed", (err as any)?.message ?? err);
    }
  }
  
  return NextResponse.json({ ok: true, user }, { status: 200 });
}

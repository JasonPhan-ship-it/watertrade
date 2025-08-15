import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const body = await req.json();
  // TODO: Persist onboarding info for the current user (Clerk userId) via Prisma
  // Example: const userId = auth().userId; await db.user.update({ where:{id:userId}, data:{ onboarding: body }})
  return NextResponse.json({ ok: true });
}

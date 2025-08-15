import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const { plan } = await req.json();
  if (plan !== "free" && plan !== "premium") {
    return new NextResponse("Invalid plan", { status: 400 });
  }
  // TODO: Set plan in DB for current user. If free, mark as active immediately.
  return NextResponse.json({ ok: true, plan });
}

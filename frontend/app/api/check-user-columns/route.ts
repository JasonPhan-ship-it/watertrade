// app/api/check-user-columns/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    // Get the User table structure
    const columns = await prisma.$queryRawUnsafe(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'User' 
      AND table_schema = 'public'
      ORDER BY ordinal_position;
    `) as any[];

    // Check specifically for subscription columns
    const subscriptionColumns = columns.filter(col => 
      ['subscriptionStatus', 'subscriptionUpdatedAt', 'stripeCustomerId', 'stripeSubscriptionId']
        .includes(col.column_name)
    );

    return NextResponse.json({
      allUserColumns: columns,
      subscriptionColumns,
      hasSubscriptionStatus: columns.some(col => col.column_name === 'subscriptionStatus'),
      hasStripeCustomerId: columns.some(col => col.column_name === 'stripeCustomerId'),
      hasStripeSubscriptionId: columns.some(col => col.column_name === 'stripeSubscriptionId'),
      hasSubscriptionUpdatedAt: columns.some(col => col.column_name === 'subscriptionUpdatedAt'),
      totalColumns: columns.length
    });
  } catch (error: any) {
    return NextResponse.json({
      error: error.message,
      stack: error.stack
    }, { status: 500 });
  }
}

// app/transactions/[id]/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { purchaseAction } from "./actions";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import NextDynamic from "next/dynamic";

type PageProps = {
  params: { id?: string };
  searchParams?: Record<string, string | string[] | undefined>;
};

function asString(v: unknown): string | undefined {
  if (typeof v === "string") return v.trim();
  if (Array.isArray(v)) return v[0]?.toString().trim();
  return undefined;
}

// Map "PURCHASED" to an existing enum value if it doesn't exist in prod.
function mapPurchasedToExisting(): Prisma.TransactionStatus {
  const S = Prisma.TransactionStatus as any;
  return S.PURCHASED ?? S.CLOSED ?? S.COMPLETED ?? S.EXECUTED ?? S.FINALIZED;
}

// Client-only portal that mounts children into #inline-buy-now
const InlinePortal = NextDynamic(() => import("@/components/InlinePortal"), { ssr: false });

export default async function Page({ params, searchParams }: PageProps) {
  try {
    const id = params?.id?.trim() ?? "";
    const role = (asString(searchParams?.role) || "").toLowerCase();
    const action = (asString(searchParams?.action) || "").toLowerCase();
    const token = asString(searchParams?.token) || undefined;

    const forceError = asString(searchParams?.forceError);
    const safe = asString(searchParams?.safe);
    if (forceError === "1") throw new Error("Forced error for testing (page)");

    if (!id) {
      return (
        <div className="mx-auto max-w-2xl p-6">
          <h1 className="text-xl font-semibold">Transaction not found</h1>
          <p className="mt-2 text-sm text-slate-600">
            The URL is missing an ID. Go back to your dashboard and open the trade again.
          </p>
          <div className="mt-4">
            <a
              href="/dashboard"
              className="inline-flex items-center rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Back to dashboard
            </a>
          </div>
        </div>
      );
    }

    if (safe === "1") {
      return (
        <div className="mx-auto max-w-2xl p-6">
          <h1 className="text-xl font-semibold">Transaction (Safe Mode)</h1>
          <p className="mt-2 text-sm text-slate-600">
            Skipping component imports to isolate a server render error. If this renders, the crash is likely caused by a
            module imported by the normal page (e.g., TradeShell).
          </p>
          <div className="mt-4 text-xs text-slate-600 space-y-1">
            <div><strong>ID:</strong> {id}</div>
            <div><strong>role:</strong> {role || "—"}</div>
            <div><strong>action:</strong> {action || "—"}</div>
            <div><strong>token:</strong> {token || "—"}</div>
          </div>
          <div className="mt-4 flex gap-3">
            <a href={`/transactions/${id}?action=review`} className="rounded-lg border px-3 py-2 text-sm">Back to normal</a>
            <a href="/dashboard" className="rounded-lg border px-3 py-2 text-sm">Dashboard</a>
          </div>
        </div>
      );
    }

    // Load TradeShell safely
    let TradeShell: any;
    try {
      const mod = await import("@/components/trade/TradeShell");
      TradeShell = mod.default;
    } catch (impErr: any) {
      console.error("[transactions/[id]/page] TradeShell import failed", {
        message: impErr?.message,
        digest: impErr?.digest,
        stack: impErr?.stack,
      });
      return (
        <div className="mx-auto max-w-2xl p-6">
          <h1 className="text-xl font-semibold">We couldn’t load this transaction</h1>
          <p className="mt-2 text-sm text-slate-600">
            A component failed to load. Please reload, or go back to your dashboard.
          </p>
          <div className="mt-4 flex gap-3">
            <a href="" className="rounded-lg bg-[#004434] px-4 py-2 text-sm font-medium text-white hover:bg-[#003a2f]">Reload</a>
            <a href="/dashboard" className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">Dashboard</a>
          </div>
        </div>
      );
    }

    // Bound server action with enum-fallback safety
    const boundPurchase = async (_fd: FormData) => {
      "use server";
      try {
        const { confirmationUrl } = await purchaseAction(id);
        return { confirmationUrl };
      } catch (e: any) {
        const msg = e?.message || "";
        const looksLikeEnumError =
          /Expected\s+TransactionStatus/i.test(msg) ||
          /Invalid value for argument `set`/i.test(msg);

        console.error("[transactions/[id]/page] purchaseAction failed", {
          message: e?.message,
          digest: e?.digest,
          stack: e?.stack,
        });

        if (!looksLikeEnumError) throw e;

        try {
          const mapped = mapPurchasedToExisting();

          let buyerId: string | undefined = undefined;
          try {
            const { userId } = auth();
            if (userId) {
              const buyer = await prisma.user.findUnique({
                where: { clerkId: userId },
                select: { id: true },
              });
              buyerId = buyer?.id;
            }
          } catch {}

          await prisma.transaction.update({
            where: { id },
            data: {
              ...(buyerId ? { buyerId } : {}),
              status: mapped,
              purchasedAt: new Date(),
            },
          });

          return { confirmationUrl: undefined as string | undefined };
        } catch (fallbackErr: any) {
          console.error("[transactions/[id]/page] fallback enum mapping failed", {
            message: fallbackErr?.message,
            stack: fallbackErr?.stack,
          });
          throw e;
        }
      }
    };

    const onReview = action === "review";

    // Only import the client BuyNowButton when actually needed
    let BuyNowButton: any = null;
    if (onReview) {
      try {
        const mod = await import("@/components/BuyNowButton");
        BuyNowButton = mod.default;
      } catch (impErr: any) {
        console.error("[transactions/[id]/page] BuyNowButton import failed", {
          message: impErr?.message,
          digest: impErr?.digest,
          stack: impErr?.stack,
        });
      }
    }

    return (
      <div className="mx-auto w-full max-w-5xl p-4 sm:p-6">
        {/* Keep TradeShell's inline area present but hide any legacy button on review */}
        <TradeShell
          tradeId={id}
          role={role}
          action={action}
          token={token}
          hideInlineBuyNow={onReview} // hides TradeShell’s own button if it renders one
        />

        {onReview && BuyNowButton && (
          <>
            {/* Hide any stray full-width submit inside TradeShell on review */}
            <style
              dangerouslySetInnerHTML={{
                __html: `
                  [data-trade-actions] button[type="submit"].w-full { display: none !important; }
                `,
              }}
            />
            {/* Mount our Buy Now directly into the original spot */}
            <InlinePortal targetId="inline-buy-now">
              {/* Match legacy sizing: inline, not full-width */}
              <div className="flex flex-wrap items-center gap-3">
                <BuyNowButton transactionId={id} action={boundPurchase} label="Buy Now" />
              </div>
            </InlinePortal>
          </>
        )}
      </div>
    );
  } catch (e: any) {
    console.error("[transactions/[id]/page] render error", {
      message: e?.message,
      digest: e?.digest,
      stack: e?.stack,
    });
    return (
      <div className="mx-auto max-w-2xl p-6">
        <h1 className="text-xl font-semibold">Couldn’t render this transaction</h1>
        <p className="mt-2 text-sm text-slate-600">
          Try reloading. If the problem persists, head back to your dashboard.
        </p>
        <div className="mt-4 flex gap-3">
          <a
            href=""
            className="inline-flex items-center rounded-lg bg-[#004434] px-4 py-2 text-sm font-medium text-white hover:bg-[#003a2f]"
          >
            Reload
          </a>
          <a
            href="/dashboard"
            className="inline-flex items-center rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Dashboard
          </a>
        </div>
      </div>
    );
  }
}

// app/transactions/[id]/page.tsx
import TradeShell from "@/components/trade/TradeShell";
import BuyNowButton from "@/components/BuyNowButton"; // lives at frontend/components/BuyNowButton.tsx
import { purchaseAction } from "./actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = {
  params: { id?: string };
  searchParams?: Record<string, string | string[] | undefined>;
};

function asString(v: unknown): string | undefined {
  if (typeof v === "string") return v.trim();
  if (Array.isArray(v)) return v[0]?.toString().trim();
  return undefined;
}

export default async function Page({ params, searchParams }: PageProps) {
  try {
    const id = params?.id?.trim() ?? "";
    const role = (asString(searchParams?.role) || "").toLowerCase();
    const action = (asString(searchParams?.action) || "").toLowerCase();
    const token = asString(searchParams?.token) || undefined;

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

    // Bind server action for this specific transaction id
    const boundPurchase = async (_fd: FormData) => {
      "use server";
      const { confirmationUrl } = await purchaseAction(id);
      return { confirmationUrl };
    };

    const onReview = action === "review";

    return (
      <div className="mx-auto w-full max-w-5xl p-4 sm:p-6">
        {/* On review pages, ensure only ONE Buy button exists:
            1) Ask TradeShell to hide any inline/legacy Buy Now
            2) Render the single canonical button below */}
        <TradeShell
          tradeId={id}
          role={role}
          action={action}
          token={token}
          hideInlineBuyNow={onReview}
        />

        {onReview && (
          <>
            {/* Defensive CSS: if anything else tries to inject a full-width submit
               inside the actions box, hide it on review pages. */}
            <style
              // scoped to this page render
              dangerouslySetInnerHTML={{
                __html: `
                  [data-trade-actions] button[type="submit"].w-full { display: none !important; }
                `,
              }}
            />
            <div className="mt-6 max-w-md" id="primary-buy">
              <BuyNowButton transactionId={id} action={boundPurchase} label="Buy Now" />
            </div>
          </>
        )}
      </div>
    );
  } catch (e: any) {
    // Log and render a friendly fallback instead of the opaque digest page
    // eslint-disable-next-line no-console
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

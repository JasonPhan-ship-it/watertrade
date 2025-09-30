// app/transactions/[id]/page.tsx
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// NOTE: We intentionally avoid top-level imports of components that might throw during module evaluation.
// We only import primitives that are very unlikely to fail.
import { purchaseAction } from "./actions";

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

    // Diagnostics (optional; keep while debugging)
    const forceError = asString(searchParams?.forceError);
    const safe = asString(searchParams?.safe);
    if (forceError === "1") {
      throw new Error("Forced error for testing (page)");
    }

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

    // "Safe Mode": render a minimal page to confirm if import-time code is crashing.
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

    // Dynamically import TradeShell so we can catch module-evaluation errors
    let TradeShell: any;
    try {
      const mod = await import("@/components/trade/TradeShell");
      TradeShell = mod.default;
    } catch (impErr: any) {
      // eslint-disable-next-line no-console
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

    // Bind server action for this specific transaction id
    const boundPurchase = async (_fd: FormData) => {
      "use server";
      const { confirmationUrl } = await purchaseAction(id);
      return { confirmationUrl };
    };

    const onReview = action === "review";

    // Only import the client BuyNowButton when actually needed
    let BuyNowButton: any = null;
    if (onReview) {
      try {
        const mod = await import("@/components/BuyNowButton");
        BuyNowButton = mod.default;
      } catch (impErr: any) {
        // eslint-disable-next-line no-console
        console.error("[transactions/[id]/page] BuyNowButton import failed", {
          message: impErr?.message,
          digest: impErr?.digest,
          stack: impErr?.stack,
        });
        // We can continue without the extra button; TradeShell hides its inline one on review anyway.
      }
    }

    return (
      <div className="mx-auto w-full max-w-5xl p-4 sm:p-6">
        {/* Ask TradeShell to hide any inline/legacy Buy Now on review */}
        <TradeShell
          tradeId={id}
          role={role}
          action={action}
          token={token}
          hideInlineBuyNow={onReview}
        />

        {onReview && BuyNowButton && (
          <>
            {/* Defensive CSS: hide any stray full-width submit buttons inside TradeShell on review */}
            <style
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

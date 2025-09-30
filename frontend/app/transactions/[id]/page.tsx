// app/transactions/[id]/page.tsx
import TradeShell from "@/components/trade/TradeShell";
import BuyNowButton from "@/components/BuyNowButton";
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
  const id = params?.id?.trim() ?? "";
  const role = (asString(searchParams?.role) || "").toLowerCase();
  const action = (asString(searchParams?.action) || "").toLowerCase();
  const token = asString(searchParams?.token) || undefined;

  // Bind a server action for this transaction id so the client button can call it.
  // The button expects a `(fd: FormData) => Promise<{ confirmationUrl?: string } | void | string>`.
  const boundPurchase = async (_fd: FormData) => {
    "use server";
    const { confirmationUrl } = await purchaseAction(id);
    return { confirmationUrl };
  };

  return (
    <div className="mx-auto w-full max-w-5xl p-4 sm:p-6">
      <TradeShell tradeId={id} role={role} action={action} token={token} />

      {/* Only show the Buy Now button on the review screen */}
      {action === "review" && id && (
        <div className="mt-6 max-w-md">
          <BuyNowButton
            transactionId={id}
            action={boundPurchase}
            label="Buy Now"
          />
        </div>
      )}
    </div>
  );
}

// app/transactions/[id]/page.tsx
import TradeShell from "@/components/trade/TradeShell";
import BuyNowButton from "@/components/BuyNowButton"; // your file at frontend/components/BuyNowButton.tsx
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

  // Bind server action for this specific transaction id
  const boundPurchase = async (_fd: FormData) => {
    "use server";
    const { confirmationUrl } = await purchaseAction(id);
    return { confirmationUrl };
  };

  return (
    <div className="mx-auto w-full max-w-5xl p-4 sm:p-6">
      <TradeShell tradeId={id} role={role} action={action} token={token} />

      {action === "review" && id && (
        <div className="mt-6 max-w-md" id="primary-buy">
          <BuyNowButton transactionId={id} action={boundPurchase} label="Buy Now" />
        </div>
      )}
    </div>
  );
}

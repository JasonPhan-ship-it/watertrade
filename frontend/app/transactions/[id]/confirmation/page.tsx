import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";

export const revalidate = 0;

type PageProps = { params: { id: string } };

export default async function TransactionConfirmationPage({ params }: PageProps) {
  const { userId } = auth();
  if (!userId) {
    redirect("/sign-in");
  }

  // Keep the page simple; client-side auto-redirect below
  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold">Purchase confirmed</h1>
      <p className="mt-2 text-slate-600">
        Your order has been received. A confirmation email has been sent and your dashboard will reflect this
        purchase shortly.
      </p>

      <div className="mt-6 rounded-xl border border-slate-200 p-4">
        <p className="text-sm text-slate-600">
          Transaction ID: <span className="font-mono">{params.id}</span>
        </p>
        <p className="mt-2 text-sm text-slate-600">
          Redirecting you to your dashboard in a moment…
        </p>
      </div>

      <div className="mt-6">
        <Link
          href="/dashboard"
          className="inline-flex items-center rounded-xl border border-transparent bg-black px-4 py-2 text-white"
        >
          Go to Dashboard now
        </Link>
      </div>

      {/* Auto-redirect after 3.5s */}
      <script
        dangerouslySetInnerHTML={{
          __html: `setTimeout(()=>{ window.location.href = "/dashboard" }, 3500);`,
        }}
      />
    </div>
  );
}

// app/rules/page.tsx
import Link from "next/link";

export const metadata = {
  title: "Marketplace Rules • Water Traders",
  description: "Simple, clear rules for using the marketplace.",
};

export default function RulesPage() {
  return (
    <div className="mx-auto max-w-3xl p-6 space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
        Marketplace Rules
      </h1>

      <p className="text-slate-700">
        These guidelines help keep trading safe and fair. By creating a listing
        or placing a bid, you agree to follow the rules below.
      </p>

      <ol className="list-decimal pl-6 space-y-3 text-slate-800">
        <li>
          <span className="font-medium">Be accurate.</span> Listings must reflect
          real availability, districts, water types, and quantities.
        </li>
        <li>
          <span className="font-medium">No off‑platform deals.</span> Don’t move
          negotiations off Water Traders to circumvent fees or visibility.
        </li>
        <li>
          <span className="font-medium">Respect timelines.</span> Honor listing
          windows, acceptance deadlines, and payment milestones.
        </li>
        <li>
          <span className="font-medium">Compliance matters.</span> You are
          responsible for ensuring transfers meet all legal and district
          requirements.
        </li>
        <li>
          <span className="font-medium">No misrepresentation.</span> Fraudulent
          or misleading listings, bids, or documents can result in removal.
        </li>
        <li>
          <span className="font-medium">Be civil.</span> Treat other traders
          professionally. Harassment or abuse isn’t allowed.
        </li>
      </ol>

      <p className="text-sm text-slate-500">
        Questions?{" "}
        <Link href="/contact" className="text-[#004434] underline hover:text-[#00392f]">
          Contact support
        </Link>
        .
      </p>

      <div>
        <Link
          href="/create-listing"
          className="inline-flex items-center rounded-xl bg-[#004434] px-4 py-2 text-sm font-semibold text-white hover:bg-[#00392f]"
        >
          ← Back to Create Listing
        </Link>
      </div>
    </div>
  );
}

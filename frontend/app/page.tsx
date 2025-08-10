// app/page.tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl p-8 space-y-6">
      <h1 className="text-3xl font-semibold">WaterTrade</h1>
      <p className="text-gray-700">
        A simple marketplace to buy and sell water and water credits.
      </p>
      <div className="flex gap-3">
        <Link href="/create-listing"><Button>Create Listing</Button></Link>
        <Link href="/dashboard"><Button variant="outline">Dashboard</Button></Link>
      </div>
    </main>
  );
}

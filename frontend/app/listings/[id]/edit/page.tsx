// frontend/app/listings/[id]/edit/page.tsx
import { auth, clerkClient } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";
import EditListingForm from "./EditListingForm";
import DeleteListingButton from "@/components/DeleteListingButton"; // keep if you created it

export default async function EditListingPage({ params }: { params: { id: string } }) {
  const { userId } = auth();
  if (!userId) redirect("/sign-in");

  // Ensure local user exists
  let me = await prisma.user.findUnique({ where: { clerkId: userId } });
  if (!me) {
    const cu = await clerkClient.users.getUser(userId);
    const email =
      cu?.emailAddresses?.find((e) => e.id === cu.primaryEmailAddressId)?.emailAddress ||
      cu?.emailAddresses?.[0]?.emailAddress ||
      `${userId}@example.local`;
    const name = [cu?.firstName, cu?.lastName].filter(Boolean).join(" ") || cu?.username || null;

    me = await prisma.user.create({
      data: { clerkId: userId, email, name: name ?? undefined },
    });
  }

  const listing = await prisma.listing.findUnique({
    where: { id: params.id },
    select: {
      id: true,
      sellerId: true,
      title: true,
      description: true,
      district: true,
      waterType: true,
      // availabilityStart: true, // removed from payload/props
      // availabilityEnd: true,   // removed from payload/props
      acreFeet: true,
      pricePerAF: true, // cents
      isAuction: true,
      reservePrice: true, // cents
      auctionEndsAt: true,
    },
  });

  if (!listing) redirect("/dashboard?scope=mine&nocreate=1");
  if (listing.sellerId !== me.id) {
    // not owner → view page
    redirect(`/listings/${listing.id}`);
  }

  const props = {
    id: listing.id,
    title: listing.title || "",
    description: listing.description || "",
    district: listing.district || "",
    waterType: listing.waterType || "",
    acreFeet: listing.acreFeet,
    pricePerAF: listing.pricePerAF ?? 0,
    isAuction: !!listing.isAuction,
    reservePrice: listing.reservePrice ?? null,
    auctionEndsAtISO: listing.auctionEndsAt?.toISOString() ?? "",
  };

  return (
    <div className="mx-auto max-w-3xl p-6">
      {/* Header + actions */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Edit Listing</h1>
          <p className="mt-1 text-sm text-slate-600">Only the listing owner can edit.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard?scope=mine&nocreate=1"
            className="rounded-xl border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </Link>
          <DeleteListingButton listingId={listing.id} />
        </div>
      </div>

      <div className="mt-6">
        <EditListingForm listing={props} />
      </div>
    </div>
  );
}

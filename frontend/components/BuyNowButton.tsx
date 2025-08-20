"use client";

import * as React from "react";
import { useTransition, useState } from "react";
import { Button } from "@/components/ui/button";

type Props = {
  listingId: string;
  action: (formData: FormData) => Promise<void>; // server action
  label?: string;
};

export default function BuyNowButton({ listingId, action, label }: Props) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const fd = new FormData();
    fd.set("listingId", listingId);

    startTransition(async () => {
      try {
        await action(fd);
        setDone(true);
      } catch (err: any) {
        setError(err?.message ?? "Something went wrong.");
      }
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <input type="hidden" name="listingId" value={listingId} />
      <Button type="submit" disabled={isPending || done} className="w-full">
        {isPending ? "Processing..." : done ? "Purchased" : (label ?? "Buy Now")}
      </Button>
      {error ? <div className="text-sm text-red-600">{error}</div> : null}
    </form>
  );
}

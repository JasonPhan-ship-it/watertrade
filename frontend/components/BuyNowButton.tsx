// components/BuyNowButton.tsx
"use client";

import * as React from "react";
import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type ServerActionResult =
  | void
  | { confirmationUrl?: string } // preferred: return this from your server action
  | string;                      // also allow a raw string URL

type Props = {
  transactionId: string;                                // ⬅️ use transactionId
  action: (formData: FormData) => Promise<ServerActionResult>; // server action
  label?: string;
  className?: string;
};

export default function BuyNowButton({ transactionId, action, label, className }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isPending || done) return; // double-submit guard
    setError(null);

    const fd = new FormData();
    fd.set("transactionId", transactionId); // ⬅️ pass tx id

    startTransition(async () => {
      try {
        const result = await action(fd);
        // If the server action calls redirect(), code below won't run (that’s fine).

        // If action returned a URL (object or string), navigate there.
        const url =
          (typeof result === "string" && result) ||
          ((result && typeof result === "object" && "confirmationUrl" in result && result.confirmationUrl) as
            | string
            | undefined);

        if (url) {
          router.push(url);
          return;
        }

        // Fallback behavior: show success then go to dashboard.
        setDone(true);
        setTimeout(() => {
          router.push("/dashboard");
        }, 3500);
      } catch (err: any) {
        const msg =
          err?.message ||
          err?.cause?.message ||
          (typeof err === "string" ? err : "") ||
          "Something went wrong.";
        setError(msg);
      }
    });
  };

  return (
    <form onSubmit={onSubmit} className="space-y-2">
      <input type="hidden" name="transactionId" value={transactionId} />
      <Button
        type="submit"
        disabled={isPending || done}
        className={className ? `w-full ${className}` : "w-full"}
        aria-busy={isPending}
        aria-live="polite"
      >
        {isPending
          ? "Processing..."
          : done
          ? "Purchased — redirecting…"
          : label ?? "Buy Now"}
      </Button>
      {error && <div className="text-sm text-red-600" role="alert">{error}</div>}
    </form>
  );
}

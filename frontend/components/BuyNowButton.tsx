// components/transactions/BuyNowButton.tsx
"use client";

import * as React from "react";
import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type ServerActionResult = void | { confirmationUrl?: string } | string;

type Props =
  | {
      /** Transaction id (required in both modes) */
      transactionId: string;
      /** OPTIONAL: server action to run purchase. If omitted, falls back to REST POST /api/transactions/:id/buy */
      action?: (formData: FormData) => Promise<ServerActionResult>;
      label?: string;
      className?: string;
      redirectDelayMs?: number;
      fallbackUrl?: string;
    }
  | never;

export default function BuyNowButton(props: Props) {
  const {
    transactionId,
    action,
    label,
    className,
    redirectDelayMs = 3500,
    fallbackUrl = "/dashboard",
  } = props as Props;

  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isPending || done) return;
    setError(null);

    startTransition(async () => {
      try {
        // MODE A: Server Action (if provided)
        if (action) {
          const fd = new FormData();
          fd.set("transactionId", transactionId);
          const result = await action(fd);
          const url =
            typeof result === "string"
              ? result
              : (result && typeof result === "object" && (result as any).confirmationUrl) || undefined;

          if (url) {
            router.push(url);
            return;
          }
          setDone(true);
          setTimeout(() => router.push(fallbackUrl), redirectDelayMs);
          return;
        }

        // MODE B: REST API fallback (no server action provided)
        const res = await fetch(`/api/transactions/${transactionId}/buy`, {
          method: "POST",
        });
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(j?.error || `Purchase failed (${res.status})`);
        }
        const j = (await res.json().catch(() => ({}))) as { confirmationUrl?: string };
        if (j?.confirmationUrl) {
          router.push(j.confirmationUrl);
          return;
        }
        // No URL? fallback redirect
        setDone(true);
        setTimeout(() => router.push(fallbackUrl), redirectDelayMs);
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

  const disabled = isPending || done;

  return (
    <form onSubmit={onSubmit} className="space-y-2" data-buy-now="primary">
      <input type="hidden" name="transactionId" value={transactionId} />
      <Button
        type="submit"
        disabled={disabled}
        aria-busy={isPending}
        aria-disabled={disabled}
        aria-live="polite"
        className={`w-full ${disabled ? "pointer-events-none" : ""} ${className ?? ""}`}
      >
        {isPending
          ? "Processing..."
          : done
          ? "Purchased — redirecting…"
          : label ?? "Buy Now"}
      </Button>
      {error && (
        <div className="text-sm text-red-600" role="alert">
          {error}
        </div>
      )}
    </form>
  );
}

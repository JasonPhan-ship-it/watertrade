"use client";
import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    // surfaces the actual message/stack in browser devtools
    console.error("Listing page error:", error);
  }, [error]);

  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4">
      <h2 className="font-semibold text-red-700">Something went wrong.</h2>
      <p className="text-sm text-red-600">{error.message}</p>
      <button onClick={() => reset()} className="mt-3 rounded-md bg-red-600 px-3 py-1.5 text-white">
        Retry
      </button>
    </div>
  );
}

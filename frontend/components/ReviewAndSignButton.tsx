// components/ReviewAndSignButton.tsx
"use client";
import { useState } from "react";

export function ReviewAndSignButton({ tradeId, role }: { tradeId: string; role: "buyer" | "seller" }) {
  const [loading, setLoading] = useState(false);

  async function go() {
    setLoading(true);
    try {
      const res = await fetch(`/api/sign-url?id=${encodeURIComponent(tradeId)}&role=${role}`, {
        method: "GET",
        headers: { "Accept": "application/json" },
      });
      const data = await res.json();
      if (data?.url) {
        window.location.assign(data.url); // <-- send them to DocuSign
      } else {
        console.error("No sign URL:", data);
        alert("Could not start signing.");
      }
    } catch (e) {
      console.error(e);
      alert("Could not start signing.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button onClick={go} disabled={loading} className="btn btn-primary">
      {loading ? "Opening…" : "Review & Sign"}
    </button>
  );
}

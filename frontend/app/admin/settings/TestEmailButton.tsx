// app/admin/settings/TestEmailButton.tsx
"use client";

import React from "react";

export default function TestEmailButton({ email }: { email: string }) {
  const [state, setState] = React.useState<"idle" | "sending" | "sent" | "error">("idle");
  const [msg, setMsg] = React.useState<string | null>(null);

  async function send() {
    try {
      setState("sending");
      setMsg(null);
      const res = await fetch("/api/admin/send-test-email", { method: "POST" });
      if (!res.ok) {
        let m = "Failed";
        try {
          const j = await res.json();
          m = j?.error || m;
        } catch {
          m = await res.text().catch(() => m);
        }
        throw new Error(m);
      }
      setState("sent");
      setMsg(`Sent to ${email}`);
    } catch (e: any) {
      setState("error");
      setMsg(e?.message || "Failed to send");
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={send}
        disabled={state === "sending"}
        className="rounded-xl bg-black px-4 py-2 text-white disabled:opacity-50"
      >
        {state === "sending" ? "Sending…" : "Send Test Email"}
      </button>
      {msg ? (
        <span className={`text-sm ${state === "error" ? "text-red-600" : "text-slate-600"}`}>
          {msg}
        </span>
      ) : null}
    </div>
  );
}

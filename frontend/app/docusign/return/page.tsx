// app/docusign/return/page.tsx
export const dynamic = "force-dynamic";
export const revalidate = 0;

import Link from "next/link";

type SearchParams = { [key: string]: string | string[] | undefined };

function titleFor(event: string) {
  switch (event) {
    case "signing_complete":
    case "completed":
    case "finish":
      return { label: "All set! 🎉", tone: "success" as const };
    case "decline":
    case "declined":
      return { label: "You declined to sign", tone: "warning" as const };
    case "cancel":
    case "cancelled":
    case "viewing_complete":
      return { label: "Signing session ended", tone: "neutral" as const };
    case "session_timeout":
    case "ttl_expired":
      return { label: "Session expired", tone: "warning" as const };
    default:
      return { label: "Signing status", tone: "neutral" as const };
  }
}

function messageFor(event: string) {
  switch (event) {
    case "signing_complete":
    case "completed":
    case "finish":
      return "Thanks! Your document was submitted successfully.";
    case "declined":
    case "decline":
      return "This envelope was declined. If this was a mistake, you can restart the signing process.";
    case "cancel":
    case "cancelled":
    case "viewing_complete":
      return "You closed the signing window. You can resume whenever you’re ready.";
    case "session_timeout":
    case "ttl_expired":
      return "The signing session timed out. Please start a new session.";
    default:
      return "We’ve recorded the result from DocuSign.";
  }
}

function StatusBadge({ tone }: { tone: "success" | "warning" | "neutral" }) {
  const map = {
    success: "bg-green-100 text-green-800 border-green-200",
    warning: "bg-yellow-100 text-yellow-800 border-yellow-200",
    neutral: "bg-gray-100 text-gray-800 border-gray-200",
  } as const;
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${map[tone]}`} />;
}

function getString(sp: SearchParams, key: string) {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v || "";
}

function toLower(s: string) {
  return (s || "").toLowerCase();
}

function TargetLink({
  tradeId,
  children,
}: {
  tradeId?: string;
  children?: React.ReactNode;
}) {
  // If we know the trade, link back there; else home.
  const href = tradeId ? `/trades/${encodeURIComponent(tradeId)}` : "/";
  return (
    <Link
      href={href}
      className="inline-flex items-center justify-center rounded-lg border px-4 py-2 text-sm font-medium hover:bg-gray-50"
    >
      {children || "Back to Water Traders"}
    </Link>
  );
}

/** Small client widget to notify opener/parent and optionally close */
function Notifier({
  payload,
  shouldClose,
}: {
  payload: Record<string, any>;
  shouldClose: boolean;
}) {
  // client-only
  if (typeof window === "undefined") return null;
  try {
    if (window.opener) {
      window.opener.postMessage({ type: "DOCUSIGN_EVENT", ...payload }, "*");
    } else if (window.parent && window.parent !== window) {
      window.parent.postMessage({ type: "DOCUSIGN_EVENT", ...payload }, "*");
    }
    if (shouldClose) {
      // Give the postMessage a tick to travel
      setTimeout(() => {
        try {
          window.close();
        } catch {}
      }, 250);
    }
  } catch {}
  return null;
}

export default function Page({ searchParams }: { searchParams: SearchParams }) {
  const event = toLower(getString(searchParams, "event"));
  const envelopeId = getString(searchParams, "envelopeId");
  const tradeId = getString(searchParams, "tradeId");
  const role = getString(searchParams, "role");
  const { label, tone } = titleFor(event);
  const msg = messageFor(event);

  const autoClose = event === "signing_complete" || event === "completed" || event === "finish";
  const payload = { event, envelopeId, tradeId, role, source: "docusign-return" };

  return (
    <main className="mx-auto max-w-xl px-4 py-10">
      {/* noindex for safety */}
      <meta name="robots" content="noindex,nofollow" />
      <div className="rounded-2xl border bg-white p-6 shadow-sm">
        <div className="mb-2 flex items-center gap-2">
          <div
            className={{
              success: "text-green-600",
              warning: "text-yellow-600",
              neutral: "text-gray-600",
            }[tone]}
          >
            {tone === "success" ? "✅" : tone === "warning" ? "⚠️" : "ℹ️"}
          </div>
          <h1 className="text-lg font-semibold">{label}</h1>
        </div>

        <p className="text-sm text-gray-700">{msg}</p>

        <div className="mt-6 grid gap-3 sm:flex">
          <TargetLink tradeId={tradeId}>Back to {tradeId ? "trade" : "home"}</TargetLink>
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-lg bg-black px-4 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            Go to Dashboard
          </Link>
        </div>

        {/* tiny debug block, collapsible style */}
        <details className="mt-6 text-xs text-gray-500">
          <summary className="cursor-pointer select-none">Technical details</summary>
          <div className="mt-2 space-y-1">
            <div>event: <code>{event || "(none)"}</code></div>
            {envelopeId && <div>envelopeId: <code>{envelopeId}</code></div>}
            {tradeId && <div>tradeId: <code>{tradeId}</code></div>}
            {role && <div>role: <code>{role}</code></div>}
          </div>
        </details>
      </div>

      {/* notify opener/parent and optionally close */}
      <Notifier payload={payload} shouldClose={autoClose} />
    </main>
  );
}

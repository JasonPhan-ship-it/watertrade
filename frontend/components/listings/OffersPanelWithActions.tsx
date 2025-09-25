"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ListingOffersPanel, { type ListingOffersPanelProps } from "./ListingOffersPanel";
import type { Offer } from "@/components/listings/types";

/* ======================== Types ======================== */

export type ViewerRole = "buyer" | "seller" | "admin" | "unknown";

export type OffersPanelWithActionsProps = ListingOffersPanelProps & {
  viewerRole?: ViewerRole;
};

/* ======================== Tiny UI ======================== */

function cx(...cls: Array<string | false | undefined>) {
  return cls.filter(Boolean).join(" ");
}

function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[100]">
      {/* backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      {/* dialog */}
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-xl">
          <div className="border-b px-4 py-3">
            <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          </div>
          <div className="px-4 py-4">{children}</div>
          <div className="flex items-center justify-end gap-2 border-t px-4 py-3">
            {footer}
          </div>
        </div>
      </div>
    </div>
  );
}

function Button({
  children,
  onClick,
  disabled,
  variant = "primary",
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger";
  type?: "button" | "submit";
}) {
  const base = "inline-flex items-center justify-center rounded-xl px-4 py-2 text-sm";
  const styles =
    variant === "primary"
      ? "bg-emerald-600 text-white hover:bg-emerald-700"
      : variant === "secondary"
      ? "bg-slate-200 text-slate-900 hover:bg-slate-300"
      : variant === "outline"
      ? "border border-slate-300 text-slate-900 hover:bg-slate-50"
      : variant === "danger"
      ? "bg-rose-600 text-white hover:bg-rose-700"
      : "text-slate-700 hover:bg-slate-100";
  return (
    <button className={cx(base, styles, disabled && "opacity-60 cursor-not-allowed")} onClick={onClick} disabled={disabled} type={type}>
      {children}
    </button>
  );
}

/* ======================== Component ======================== */

export default function OffersPanelWithActions({
  viewerRole = "unknown",
  listingId,
  unitLabel,
  offers,
  currentStage,
  onAccept,
  onDecline,
  onCounter,
}: OffersPanelWithActionsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Magic link bits (optional chaining to satisfy TS)
  const urlRole = ((searchParams?.get?.("role") ?? "") as string).toLowerCase() as "seller" | "buyer" | "";
  const urlToken = (searchParams?.get?.("token") ?? "") as string;

  // Local optimistic items
  const [items, setItems] = useState<Offer[]>(offers);
  useEffect(() => {
    if (offers !== items) setItems(offers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offers]);

  // Busy tracker avoids double-submits
  const busy = useRef<Set<string>>(new Set());
  const withBusy = useCallback(async (id: string, fn: () => Promise<void>) => {
    if (busy.current.has(id)) return;
    busy.current.add(id);
    try {
      await fn();
    } finally {
      busy.current.delete(id);
    }
  }, []);

  const patchOffer = useCallback((id: string, patch: Partial<Offer>) => {
    setItems((prev) => prev.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  }, []);

  /* -------- Helpers to match your API contracts -------- */

  function buildAuthBits(roleForAction: "seller" | "buyer") {
    const role = roleForAction;
    const token = urlToken || undefined;

    const headers: HeadersInit = token
      ? { "Content-Type": "application/json", "x-trade-token": token }
      : { "Content-Type": "application/json" };

    const bodyAuth: Record<string, string> = { role };
    if (token) bodyAuth.token = token;

    return { headers, bodyAuth };
  }

  // Enhanced postJSON: propagate status & errorCode for UI branching (verification modal)
  async function postJSON(url: string, body?: unknown, extraHeaders?: HeadersInit) {
    const res = await fetch(url, {
      method: "POST",
      headers: extraHeaders ?? (body ? { "Content-Type": "application/json" } : undefined),
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      let message = `Request failed (${res.status})`;
      let errorCode: string | undefined;
      try {
        const data = await res.json();
        if (data?.error) message = data.error;
        if (data?.errorCode) errorCode = String(data.errorCode);
      } catch {
        /* swallow */
      }
      const err: any = new Error(message);
      err.status = res.status;
      if (errorCode) err.errorCode = errorCode;
      throw err;
    }

    // success
    try {
      return await res.json();
    } catch {
      return {};
    }
  }

  function acceptRoute(offerId: string) {
    if (viewerRole === "seller" || viewerRole === "admin" || urlRole === "seller") return `/api/trades/${offerId}/seller/accept`;
    if (viewerRole === "buyer" || urlRole === "buyer") return `/api/trades/${offerId}/buyer/accept`;
    return `/api/trades/${offerId}/seller/accept`;
  }
  function declineRoute(offerId: string) {
    if (viewerRole === "seller" || viewerRole === "admin" || urlRole === "seller") return `/api/trades/${offerId}/seller/decline`;
    if (viewerRole === "buyer" || urlRole === "buyer") return `/api/trades/${offerId}/buyer/decline`;
    return `/api/trades/${offerId}/seller/decline`;
  }
  function counterRoute(offerId: string) {
    if (viewerRole === "seller" || viewerRole === "admin" || urlRole === "seller") return `/api/trades/${offerId}/seller/counter`;
    if (viewerRole === "buyer" || urlRole === "buyer") return `/api/trades/${offerId}/buyer/counter`;
    return `/api/trades/${offerId}/seller/counter`;
  }

  /* ======================== Verification modal state ======================== */

  const [verifyOpen, setVerifyOpen] = useState(false);
  const [verifyMessage, setVerifyMessage] = useState<string>("");

  function handleVerificationError(e: any) {
    const code = (e?.errorCode || "").toUpperCase();
    const msg = String(e?.message || "");
    const looksLikeVerification =
      code === "VERIFICATION_REQUIRED" ||
      /verification required/i.test(msg);

    if (looksLikeVerification) {
      setVerifyMessage(
        "Your account needs admin verification before you can complete this action. We’ve created a request for you — an admin will review shortly."
      );
      setVerifyOpen(true);
      return true;
    }
    return false;
  }

  /* ======================== Action modal state ======================== */

  type ActionKind = "accept" | "decline" | "counter" | null;
  const [modalOpen, setModalOpen] = useState(false);
  const [action, setAction] = useState<ActionKind>(null);
  const [targetId, setTargetId] = useState<string | null>(null);

  // Counter form fields
  const [usdPerAf, setUsdPerAf] = useState<string>("");
  const [volumeAf, setVolumeAf] = useState<string>("");

  const targetOffer = useMemo(() => items.find((o) => o.id === targetId) || null, [items, targetId]);

  function openModal(kind: ActionKind, id: string) {
    setAction(kind);
    setTargetId(id);
    if (kind === "counter") {
      setUsdPerAf("");
      setVolumeAf("");
    }
    setModalOpen(true);
  }
  function closeModal() {
    setModalOpen(false);
    setAction(null);
    setTargetId(null);
  }

  /* ======================== Action handlers (invoked from modal) ======================== */

  async function doAccept() {
    if (!targetId) return;
    await withBusy(targetId, async () => {
      const prev = items.find((o) => o.id === targetId);
      patchOffer(targetId, { status: "accepted", unread: false });

      const roleForAction: "seller" | "buyer" = (viewerRole === "buyer" || urlRole === "buyer") ? "buyer" : "seller";
      const { headers, bodyAuth } = buildAuthBits(roleForAction);

      try {
        const resp = await postJSON(acceptRoute(targetId), bodyAuth, headers);
        alert("Accepted. The buyer has been emailed with next steps.");
        if (resp?.redirectUrl) router.replace(resp.redirectUrl);
        else router.refresh();
        closeModal();
      } catch (e: any) {
        if (handleVerificationError(e)) {
          // rollback already accepted optimistic state
          if (prev) patchOffer(targetId, { status: prev.status, unread: prev.unread });
          return;
        }
        if (prev) patchOffer(targetId, { status: prev.status, unread: prev.unread });
        alert(`Accept failed: ${e?.message || e}`);
      }
    });
  }

  async function doDecline() {
    if (!targetId) return;
    await withBusy(targetId, async () => {
      const prev = items.find((o) => o.id === targetId);
      patchOffer(targetId, { status: "declined", unread: false });

      const roleForAction: "seller" | "buyer" = (viewerRole === "buyer" || urlRole === "buyer") ? "buyer" : "seller";
      const { headers, bodyAuth } = buildAuthBits(roleForAction);

      try {
        await postJSON(declineRoute(targetId), bodyAuth, headers);
        alert("Declined. The buyer has been notified.");
        router.refresh();
        closeModal();
      } catch (e: any) {
        if (handleVerificationError(e)) {
          if (prev) patchOffer(targetId, { status: prev.status, unread: prev.unread });
          return;
        }
        if (prev) patchOffer(targetId, { status: prev.status, unread: prev.unread });
        alert(`Decline failed: ${e?.message || e}`);
      }
    });
  }

  async function doCounter() {
    if (!targetId) return;

    // Validate form: USD per AF (dollars), volume AF
    const usd = Number(usdPerAf);
    const vol = Number(volumeAf);
    if (!Number.isFinite(usd) || !Number.isFinite(vol)) {
      alert("Please enter valid numeric values for USD/AF and AF.");
      return;
    }
    if (usd <= 0 || vol <= 0) {
      alert("USD/AF and AF must be greater than 0.");
      return;
    }
    const pricePerAf = Math.round(usd * 100); // dollars -> cents

    await withBusy(targetId, async () => {
      const prev = items.find((o) => o.id === targetId);
      // Optimistically mark as countered (amount shown in thread is read from server, so no local amount change here)
      patchOffer(targetId, { status: "countered", unread: false });

      const roleForAction: "seller" | "buyer" = (viewerRole === "buyer" || urlRole === "buyer") ? "buyer" : "seller";
      const { headers, bodyAuth } = buildAuthBits(roleForAction);

      try {
        await postJSON(counterRoute(targetId), { ...bodyAuth, pricePerAf, volumeAf: vol }, headers);
        alert("Counter sent. The buyer has been emailed.");
        router.refresh();
        closeModal();
      } catch (e: any) {
        if (handleVerificationError(e)) {
          if (prev) patchOffer(targetId, prev);
          return;
        }
        if (prev) patchOffer(targetId, prev);
        alert(`Counter failed: ${e?.message || e}`);
      }
    });
  }

  /* ======================== Wire up to child panel ======================== */

  const onAcceptInternal = useCallback((id: string) => openModal("accept", id), []);
  const onDeclineInternal = useCallback((id: string) => openModal("decline", id), []);
  const onCounterInternal = useCallback((id: string) => openModal("counter", id), []);

  const mergedOnAccept = onAccept ?? onAcceptInternal;
  const mergedOnDecline = onDecline ?? onDeclineInternal;
  const mergedOnCounter = onCounter ?? onCounterInternal;

  /* ======================== Modal content ======================== */

  const modalTitle =
    action === "accept"
      ? "Confirm Accept"
      : action === "decline"
      ? "Confirm Decline"
      : action === "counter"
      ? "Send Counteroffer"
      : "";

  const modalBody =
    action === "accept" ? (
      <div className="space-y-2">
        <p className="text-sm text-slate-700">
          You’re about to <span className="font-medium">accept</span> this offer. The buyer will receive an email with
          a link to review & sign.
        </p>
        {targetOffer && (
          <p className="text-xs text-slate-500">
            From: <span className="font-medium">{targetOffer.fromParty}</span> • Sent{" "}
            {new Date(targetOffer.createdAt).toLocaleString()}
          </p>
        )}
      </div>
    ) : action === "decline" ? (
      <div className="space-y-2">
        <p className="text-sm text-slate-700">
          Decline this offer? The buyer will be notified and the thread will be closed.
        </p>
        {targetOffer && (
          <p className="text-xs text-slate-500">
            From: <span className="font-medium">{targetOffer.fromParty}</span> • Sent{" "}
            {new Date(targetOffer.createdAt).toLocaleString()}
          </p>
        )}
      </div>
    ) : action === "counter" ? (
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void doCounter();
        }}
      >
        <div>
          <label className="block text-xs text-slate-600">USD per AF</label>
          <input
            inputMode="decimal"
            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
            placeholder="e.g. 650.00"
            value={usdPerAf}
            onChange={(e) => setUsdPerAf(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs text-slate-600">Volume (AF)</label>
          <input
            inputMode="numeric"
            className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
            placeholder="e.g. 250"
            value={volumeAf}
            onChange={(e) => setVolumeAf(e.target.value.replace(/[^\d.]/g, ""))}
          />
        </div>
      </form>
    ) : null;

  const modalFooter =
    action === "accept" ? (
      <>
        <Button variant="outline" onClick={closeModal}>
          Cancel
        </Button>
        <Button onClick={() => void doAccept()}>Accept</Button>
      </>
    ) : action === "decline" ? (
      <>
        <Button variant="outline" onClick={closeModal}>
          Cancel
        </Button>
        <Button variant="danger" onClick={() => void doDecline()}>
          Decline
        </Button>
      </>
    ) : action === "counter" ? (
      <>
        <Button variant="outline" onClick={closeModal}>
          Cancel
        </Button>
        <Button onClick={() => void doCounter()}>Send Counter</Button>
      </>
    ) : null;

  /* ======================== Render ======================== */

  return (
    <>
      <ListingOffersPanel
        listingId={listingId}
        unitLabel={unitLabel}
        offers={items}
        currentStage={currentStage}
        onAccept={mergedOnAccept}
        onDecline={mergedOnDecline}
        onCounter={mergedOnCounter}
      />

      {/* Action modal (accept/decline/counter) */}
      <Modal open={modalOpen} onClose={closeModal} title={modalTitle} footer={modalFooter}>
        {modalBody}
      </Modal>

      {/* Verification-required modal */}
      <Modal
        open={verifyOpen}
        onClose={() => setVerifyOpen(false)}
        title="Verification required"
        footer={<Button onClick={() => setVerifyOpen(false)}>Got it</Button>}
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-700">{verifyMessage}</p>
          <p className="text-xs text-slate-500">
            Tip: Add your company name and phone in your profile so an admin can reach you faster.
          </p>
        </div>
      </Modal>
    </>
  );
}

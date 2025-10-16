"use client";

import React, { useMemo, useState } from "react";
import { Check, Clock, ChevronRight } from "lucide-react";

/* ----------------------------- Types ----------------------------- */

export type OfferSide = "received" | "sent";
export type OfferStatus = "pending" | "accepted" | "declined" | "expired" | "countered";

export type DealStage =
  | "OFFER_SENT"
  | "OFFER_ACCEPTED"
  | "CONTRACTS_DRAFTED"
  | "SIGNING_IN_PROGRESS"
  | "ESCROW_OPENED"
  | "DUE_DILIGENCE"
  | "CLOSING_SCHEDULED"
  | "CLOSED";

export type Offer = {
  id: string;
  side: OfferSide;
  fromParty: string;
  amount: number;
  terms?: string;
  createdAt: string;
  expiresAt?: string;
  status: OfferStatus;
  unread?: boolean;
  notes?: string;
};

export type ListingOffersPanelProps = {
  listingId: string;
  /** Label for the amount line; defaults to "Total ($)" */
  unitLabel?: string;
  offers: Offer[];
  currentStage?: DealStage | null;
  onAccept?: (offerId: string) => Promise<void> | void;
  onDecline?: (offerId: string) => Promise<void> | void;
  onCounter?: (offerId: string) => Promise<void> | void;
};

/* --------------------------- Utilities --------------------------- */

const STAGE_ORDER: DealStage[] = [
  "OFFER_SENT",
  "OFFER_ACCEPTED",
  "CONTRACTS_DRAFTED",
  "SIGNING_IN_PROGRESS",
  "ESCROW_OPENED",
  "DUE_DILIGENCE",
  "CLOSING_SCHEDULED",
  "CLOSED",
];

function formatMoney(n: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}
function isExpired(offer: Offer) {
  if (!offer.expiresAt) return false;
  const d = new Date(offer.expiresAt);
  return Number.isFinite(d.valueOf()) ? d < new Date() : false;
}
function cx(...cls: Array<string | false | undefined>) {
  return cls.filter(Boolean).join(" ");
}

/* ------------------------- Tiny UI atoms ------------------------- */

function Badge({
  children,
  variant = "solid",
}: {
  children: React.ReactNode;
  variant?: "solid" | "outline" | "destructive" | "secondary";
}) {
  const styles =
    variant === "outline"
      ? "border border-slate-300 text-slate-700 bg-white"
      : variant === "destructive"
      ? "bg-red-100 text-red-700"
      : variant === "secondary"
      ? "bg-slate-200 text-slate-700"
      : "bg-emerald-600 text-white";
  return (
    <span className={cx("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", styles)}>
      {children}
    </span>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={cx("rounded-2xl border border-slate-200 bg-white shadow-sm", className)}>{children}</div>;
}
function CardHeader({ children }: { children: React.ReactNode }) {
  return <div className="px-4 pt-4">{children}</div>;
}
function CardTitle({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={cx("text-base font-semibold", className)}>{children}</div>;
}
function CardDescription({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cx("mt-1 text-sm text-slate-600", className)}>{children}</div>;
}
function CardContent({ children }: { children: React.ReactNode }) {
  return <div className="px-4 pb-4">{children}</div>;
}

function Button({
  children,
  onClick,
  disabled,
  variant = "primary",
  className = "",
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "outline" | "ghost" | "icon";
  className?: string;
  title?: string;
}) {
  const base = "inline-flex items-center justify-center rounded-2xl px-3 py-2 text-sm";
  const styles =
    variant === "primary"
      ? "bg-emerald-600 text-white hover:bg-emerald-700"
      : variant === "secondary"
      ? "bg-slate-200 text-slate-900 hover:bg-slate-300"
      : variant === "outline"
      ? "border border-slate-300 text-slate-900 hover:bg-slate-50"
      : variant === "ghost"
      ? "text-slate-700 hover:bg-slate-100"
      : "p-2 rounded-full"; // icon
  return (
    <button
      className={cx(base, styles, disabled && "opacity-60 cursor-not-allowed", className)}
      onClick={onClick}
      disabled={disabled}
      title={title}
      type="button"
    >
      {children}
    </button>
  );
}

/* -------------------------- Subcomponents ------------------------- */

function StatusBadge({ status }: { status: OfferStatus }) {
  const map: Record<
    OfferStatus,
    { label: string; variant: React.ComponentProps<typeof Badge>["variant"] }
  > = {
    pending: { label: "Pending", variant: "outline" },
    accepted: { label: "Accepted", variant: "solid" },
    declined: { label: "Declined", variant: "secondary" },
    expired: { label: "Expired", variant: "destructive" },
    countered: { label: "Countered", variant: "solid" },
  };
  return <Badge variant={map[status].variant}>{map[status].label}</Badge>;
}

function StagePill({ label, active, complete }: { label: string; active?: boolean; complete?: boolean }) {
  return (
    <div
      className={cx(
        "flex items-center gap-2 rounded-full px-3 py-1 text-xs",
        complete ? "bg-green-100 text-green-700" : active ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-600"
      )}
    >
      {complete ? <Check className="h-3 w-3" /> : active ? <Clock className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
      <span>{label}</span>
    </div>
  );
}

function TransactionProgress({ stage }: { stage: DealStage }) {
  const currentIndex = STAGE_ORDER.indexOf(stage);
  const pct = Math.max(0, Math.min(100, (currentIndex / (STAGE_ORDER.length - 1)) * 100));
  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="text-base">Transaction Progress</CardTitle>
        <CardDescription className="mb-4">Live status once signing begins</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-3">
          <div className="relative h-2 w-full rounded-full bg-slate-100">
            <div className="absolute left-0 top-0 h-2 rounded-full bg-emerald-600" style={{ width: `${pct}%` }} />
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {STAGE_ORDER.map((s, i) => (
              <StagePill key={s} label={toStageLabel(s)} complete={i < currentIndex} active={i === currentIndex} />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function InlineDealProgress({ stage }: { stage: DealStage }) {
  const currentIndex = STAGE_ORDER.indexOf(stage);
  const pct = currentIndex < 0 ? 0 : Math.max(0, Math.min(100, (currentIndex / (STAGE_ORDER.length - 1)) * 100));
  return (
    <div className="min-w-[200px] space-y-1">
      <div className="relative h-2 w-full rounded-full bg-slate-200">
        <div className="absolute left-0 top-0 h-2 rounded-full bg-emerald-600" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center justify-between text-xs text-slate-600">
        <span className="font-medium text-slate-700">{toStageLabel(stage)}</span>
        <span>{Math.round(pct)}%</span>
      </div>
    </div>
  );
}

function toStageLabel(s: DealStage) {
  switch (s) {
    case "OFFER_SENT":
      return "Offer Sent";
    case "OFFER_ACCEPTED":
      return "Offer Accepted";
    case "CONTRACTS_DRAFTED":
      return "Contracts Drafted";
    case "SIGNING_IN_PROGRESS":
      return "Signing In Progress";
    case "ESCROW_OPENED":
      return "Escrow Opened";
    case "DUE_DILIGENCE":
      return "Due Diligence";
    case "CLOSING_SCHEDULED":
      return "Closing Scheduled";
    case "CLOSED":
      return "Closed";
  }
}

/* ----------------------------- Offer row ----------------------------- */

function OfferRow({
  offer,
  unitLabel,
  currentStage,
  onAccept,
  onDecline,
  onCounter,
}: {
  offer: Offer;
  unitLabel?: string;
  currentStage?: DealStage | null;
  onAccept?: (id: string) => void | Promise<void>;
  onDecline?: (id: string) => void | Promise<void>;
  onCounter?: (id: string) => void | Promise<void>;
}) {
  const expired = isExpired(offer);
  const canAct = offer.status === "pending" && !expired;
  const stageIndex = currentStage ? STAGE_ORDER.indexOf(currentStage) : -1;
  const showProgress = !canAct && stageIndex >= STAGE_ORDER.indexOf("OFFER_ACCEPTED");

  return (
    <div className="flex flex-col justify-between gap-3 rounded-2xl border p-4 md:flex-row md:items-center">
      <div className="flex items-start gap-3">
        {offer.unread ? <Badge>New</Badge> : <Badge variant="outline">Offer</Badge>}
        <div>
          <div className="flex items-center gap-2">
            <p className="font-medium leading-none">{offer.fromParty}</p>
            <StatusBadge status={expired ? "expired" : offer.status} />
          </div>
          <p className="mt-1 text-sm text-slate-600">
            {unitLabel || "Total ($)"}: <span className="font-medium">{formatMoney(offer.amount)}</span>
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Sent {new Date(offer.createdAt).toLocaleString()}{" "}
            {offer.expiresAt && `• Expires ${new Date(offer.expiresAt).toLocaleString()}`}
          </p>
          {offer.terms && (
            <p className="mt-2 text-sm">
              <span className="text-slate-500">Terms:</span> {offer.terms}
            </p>
          )}
          {offer.notes && (
            <p className="mt-1 text-sm">
              <span className="text-slate-500">Notes:</span> {offer.notes}
            </p>
          )}
        </div>
      </div>
      <div className="flex w-full items-center gap-2 md:w-auto md:justify-end">
        {canAct ? (
          <>
            <Button
              variant="outline"
              className="rounded-2xl"
              disabled={!canAct}
              onClick={() => onCounter?.(offer.id)}
              title="Send a counter offer"
            >
              Counter
            </Button>
            <Button
              variant="secondary"
              className="rounded-2xl"
              disabled={!canAct}
              onClick={() => onDecline?.(offer.id)}
              title="Decline this offer"
            >
              Decline
            </Button>
            <Button className="rounded-2xl" disabled={!canAct} onClick={() => onAccept?.(offer.id)} title="Accept this offer">
              Accept
            </Button>
          </>
        ) : showProgress && currentStage ? (
          <InlineDealProgress stage={currentStage} />
        ) : null}

        {/* Copy ID button removed */}
      </div>
    </div>
  );
}

/* ----------------------------- Main Panel ----------------------------- */

export default function ListingOffersPanel({
  listingId, // retained for future route/action usage
  unitLabel = "Total ($)",
  offers,
  currentStage = null,
  onAccept,
  onDecline,
  onCounter,
}: ListingOffersPanelProps) {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<OfferSide | "all">("received");

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    return offers
      .filter((o) => (tab === "all" ? true : o.side === tab))
      .filter((o) =>
        !q
          ? true
          : [o.fromParty, o.terms, o.notes, o.status, o.amount.toString()]
              .filter(Boolean)
              .some((v) => String(v).toLowerCase().includes(q))
      )
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [offers, query, tab]);

  const unreadCount = offers.filter((o) => o.unread && o.side === "received").length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 md:items-center">
        <div>
          <h2 className="text-xl font-semibold">Offers &amp; Activity</h2>
        </div>
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="offers-search">
            Search offers
          </label>
          <input
            id="offers-search"
            placeholder="Search offers, terms, notes…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-9 w-64 rounded-lg border px-3 text-sm"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2" role="tablist" aria-label="Offer tabs">
        <button
          role="tab"
          aria-selected={tab === "received"}
          className={cx(
            "rounded-2xl border px-3 py-1.5 text-sm",
            tab === "received" ? "bg-slate-900 text-white" : "bg-white text-slate-700 hover:bg-slate-50"
          )}
          onClick={() => setTab("received")}
        >
          Received{" "}
          {unreadCount > 0 && (
            <span className="ml-2 rounded-full bg-emerald-600 px-2 py-0.5 text-xs text-white">{unreadCount}</span>
          )}
        </button>
        <button
          role="tab"
          aria-selected={tab === "sent"}
          className={cx(
            "rounded-2xl border px-3 py-1.5 text-sm",
            tab === "sent" ? "bg-slate-900 text-white" : "bg-white text-slate-700 hover:bg-slate-50"
          )}
          onClick={() => setTab("sent")}
        >
          Sent
        </button>
        <button
          role="tab"
          aria-selected={tab === "all"}
          className={cx(
            "rounded-2xl border px-3 py-1.5 text-sm",
            tab === "all" ? "bg-slate-900 text-white" : "bg-white text-slate-700 hover:bg-slate-50"
          )}
          onClick={() => setTab("all")}
        >
          All
        </button>
      </div>

      {/* List */}
      <div className="mt-4 space-y-3">
        {filtered.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>
                No {tab === "all" ? "activity yet" : tab === "received" ? "received offers" : "sent offers"}
              </CardTitle>
              <CardDescription className="mt-2">
                {tab === "sent"
                  ? "Make an offer on a listing to see it here."
                  : "When offers are created or updated, they’ll appear here."}
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          filtered.map((o) => (
            <OfferRow
              key={o.id}
              offer={o}
              unitLabel={unitLabel}
              currentStage={currentStage}
              onAccept={onAccept}
              onDecline={onDecline}
              onCounter={onCounter}
            />
          ))
        )}
      </div>

      {/* Progress bar (only once signing has begun) */}
      {currentStage &&
        STAGE_ORDER.indexOf(currentStage) >= STAGE_ORDER.indexOf("OFFER_ACCEPTED") && (
          <TransactionProgress stage={currentStage} />
        )}
    </div>
  );
}

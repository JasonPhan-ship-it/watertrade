import React, { useMemo, useState } from "react";
import { Check, Clock, ChevronRight, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/* -------------------------------- Types ------------------------------- */

export type OfferSide = "received" | "sent";
export type OfferStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "expired"
  | "countered";

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
  listingTitle?: string;
  unitLabel?: string;
  offers: Offer[];
  currentStage?: DealStage | null;
  onAccept?: (offerId: string) => Promise<void> | void;
  onDecline?: (offerId: string) => Promise<void> | void;
  onCounter?: (offerId: string) => Promise<void> | void;
};

/* ------------------------------- Constants ---------------------------- */

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

/* ------------------------------ Utilities ----------------------------- */

function formatMoney(n: number) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function isExpired(offer: Offer) {
  return offer.expiresAt ? new Date(offer.expiresAt) < new Date() : false;
}

/* ----------------------------- Subcomponents -------------------------- */

function StatusBadge({ status }: { status: OfferStatus }) {
  const map: Record<OfferStatus, { label: string; variant: string }> = {
    pending: { label: "Pending", variant: "outline" },
    accepted: { label: "Accepted", variant: "default" },
    declined: { label: "Declined", variant: "secondary" },
    expired: { label: "Expired", variant: "destructive" },
    countered: { label: "Countered", variant: "default" },
  };
  return <Badge variant={map[status].variant as any}>{map[status].label}</Badge>;
}

function StagePill({
  label,
  active,
  complete,
}: {
  label: string;
  active?: boolean;
  complete?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-full px-3 py-1 text-xs",
        complete
          ? "bg-green-100 text-green-700"
          : active
          ? "bg-blue-100 text-blue-700"
          : "bg-muted text-muted-foreground"
      )}
    >
      {complete ? (
        <Check className="h-3 w-3" />
      ) : active ? (
        <Clock className="h-3 w-3" />
      ) : (
        <ChevronRight className="h-3 w-3" />
      )}
      <span>{label}</span>
    </div>
  );
}

function TransactionProgress({ stage }: { stage: DealStage }) {
  const currentIndex = STAGE_ORDER.indexOf(stage);
  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="text-base">Transaction Progress</CardTitle>
        <CardDescription>Live status once signing begins</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-3">
          <div className="relative h-2 w-full rounded-full bg-muted">
            <div
              className="absolute left-0 top-0 h-2 rounded-full bg-primary"
              style={{
                width: `${
                  (currentIndex / (STAGE_ORDER.length - 1)) * 100
                }%`,
              }}
            />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {STAGE_ORDER.map((s, i) => (
              <StagePill
                key={s}
                label={toStageLabel(s)}
                complete={i < currentIndex}
                active={i === currentIndex}
              />
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
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

function OfferRow({
  offer,
  unitLabel,
  onAccept,
  onDecline,
  onCounter,
}: {
  offer: Offer;
  unitLabel?: string;
  onAccept?: (id: string) => void | Promise<void>;
  onDecline?: (id: string) => void | Promise<void>;
  onCounter?: (id: string) => void | Promise<void>;
}) {
  const expired = isExpired(offer);
  const canAct = offer.status === "pending" && !expired;
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 rounded-2xl border p-4">
      <div className="flex items-start gap-3">
        {offer.unread ? (
          <Badge className="shrink-0">New</Badge>
        ) : (
          <Badge variant="outline" className="shrink-0">
            Offer
          </Badge>
        )}
        <div>
          <div className="flex items-center gap-2">
            <p className="font-medium leading-none">{offer.fromParty}</p>
            <StatusBadge status={expired ? "expired" : offer.status} />
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            {unitLabel || "Total ($)"}:{" "}
            <span className="font-medium">{formatMoney(offer.amount)}</span>
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Sent {new Date(offer.createdAt).toLocaleString()}{" "}
            {offer.expiresAt &&
              `• Expires ${new Date(offer.expiresAt).toLocaleString()}`}
          </p>
          {offer.terms && (
            <p className="text-sm mt-2">
              <span className="text-muted-foreground">Terms:</span>{" "}
              {offer.terms}
            </p>
          )}
          {offer.notes && (
            <p className="text-sm mt-1">
              <span className="text-muted-foreground">Notes:</span>{" "}
              {offer.notes}
            </p>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          className="rounded-2xl"
          disabled={!canAct}
          onClick={() => onCounter?.(offer.id)}
        >
          Counter
        </Button>
        <Button
          variant="secondary"
          className="rounded-2xl"
          disabled={!canAct}
          onClick={() => onDecline?.(offer.id)}
        >
          Decline
        </Button>
        <Button
          className="rounded-2xl"
          disabled={!canAct}
          onClick={() => onAccept?.(offer.id)}
        >
          Accept
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="icon" variant="ghost" className="rounded-full">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>More</DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() =>
                navigator?.clipboard?.writeText(offer.id)
              }
            >
              Copy Offer ID
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled>View Thread</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

/* ------------------------------ Main Panel ---------------------------- */

export default function ListingOffersPanel({
  listingId,
  listingTitle = "Unnamed Listing",
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
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() -
          new Date(a.createdAt).getTime()
      );
  }, [offers, query, tab]);

  const unreadCount = offers.filter(
    (o) => o.unread && o.side === "received"
  ).length;

  return (
    <div className="space-y-4">
      <div className="flex items-start md:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Offers & Activity</h2>
          <p className="text-sm text-muted-foreground">
            For <span className="font-medium">{listingTitle}</span> ·
            Listing ID {listingId}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Search offers, terms, notes…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-64"
          />
        </div>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="w-full">
        <TabsList className="rounded-2xl">
          <TabsTrigger value="received" className="rounded-2xl">
            Received {unreadCount > 0 && <Badge className="ml-2">{unreadCount}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="sent" className="rounded-2xl">
            Sent
          </TabsTrigger>
          <TabsTrigger value="all" className="rounded-2xl">
            All
          </TabsTrigger>
        </TabsList>

        <TabsContent value="received" className="space-y-3 mt-4">
          {filtered.length === 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">No received offers</CardTitle>
                <CardDescription>
                  Check back later or share your listing to get more visibility.
                </CardDescription>
              </CardHeader>
            </Card>
          )}
          {filtered.map((o) => (
            <OfferRow
              key={o.id}
              offer={o}
              unitLabel={unitLabel}
              onAccept={onAccept}
              onDecline={onDecline}
              onCounter={onCounter}
            />
          ))}
        </TabsContent>

        <TabsContent value="sent" className="space-y-3 mt-4">
          {filtered.length === 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">No sent offers</CardTitle>
                <CardDescription>
                  Make an offer on a listing to see it here.
                </CardDescription>
              </CardHeader>
            </Card>
          )}
          {filtered.map((o) => (
            <OfferRow
              key={o.id}
              offer={o}
              unitLabel={unitLabel}
              onAccept={onAccept}
              onDecline={onDecline}
              onCounter={onCounter}
            />
          ))}
        </TabsContent>

        <TabsContent value="all" className="space-y-3 mt-4">
          {filtered.length === 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">No activity yet</CardTitle>
                <CardDescription>
                  When offers are created or updated, they’ll appear here.
                </CardDescription>
              </CardHeader>
            </Card>
          )}
          {filtered.map((o) => (
            <OfferRow
              key={o.id}
              offer={o}
              unitLabel={unitLabel}
              onAccept={onAccept}
              onDecline={onDecline}
              onCounter={onCounter}
            />
          ))}
        </TabsContent>
      </Tabs>

      {currentStage &&
        STAGE_ORDER.indexOf(currentStage) >=
          STAGE_ORDER.indexOf("SIGNING_IN_PROGRESS") && (
          <TransactionProgress stage={currentStage} />
        )}

      <Card className="mt-2">
        <CardHeader>
          <CardTitle className="text-base">How actions work</CardTitle>
          <CardDescription>
            Accept locks the price and moves the deal to contracts. Decline closes
            the thread. Counter lets you revise price/terms and re-send.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}

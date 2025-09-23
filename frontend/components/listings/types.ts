// components/listings/types.ts

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

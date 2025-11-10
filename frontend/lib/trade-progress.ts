// lib/trade-progress.ts
// Shared helpers for deriving progress tracker steps from trade + transaction status.

export type TradeProgressStep = {
  id: string;
  title: string;
  description: string;
  status: "complete" | "current" | "upcoming";
};

export type TradeProgressInput = {
  tradeStatus?: string | null;
  sellerSignStatus?: string | null;
  buyerSignStatus?: string | null;
  txStatus?: string | null;
};

function normalize(value: string | null | undefined) {
  return (value ?? "").toUpperCase();
}

function toStep(
  id: string,
  title: string,
  description: string,
  complete: boolean,
  state: { currentAssigned: boolean }
): TradeProgressStep {
  if (complete) {
    return { id, title, description, status: "complete" };
  }
  if (!state.currentAssigned) {
    state.currentAssigned = true;
    return { id, title, description, status: "current" };
  }
  return { id, title, description, status: "upcoming" };
}

export function buildTradeProgressSteps(input: TradeProgressInput): TradeProgressStep[] {
  const tradeStatus = normalize(input.tradeStatus);
  const sellerSignStatus = normalize(input.sellerSignStatus || "NONE");
  const buyerSignStatus = normalize(input.buyerSignStatus || "NONE");
  const txStatus = normalize(input.txStatus);

  const acceptedComplete = tradeStatus.startsWith("ACCEPTED") || tradeStatus === "FULLY_EXECUTED";
  const sellerSigned = sellerSignStatus === "SIGNED";
  const sellerRequested = sellerSignStatus === "REQUESTED";
  const buyerSigned = buyerSignStatus === "SIGNED";
  const buyerRequested = buyerSignStatus === "REQUESTED";
  const adminComplete = txStatus === "APPROVED" || txStatus === "FUNDS_RELEASED";
  const adminActive = txStatus === "COMPLIANCE_REVIEW";
  const districtComplete = txStatus === "FUNDS_RELEASED";
  const districtActive = txStatus === "APPROVED";

  const sellerDescription = sellerSigned
    ? "Seller signature received."
    : sellerRequested
    ? "Waiting for the seller to complete DocuSign."
    : acceptedComplete
    ? "Seller can sign the agreement now."
    : "Seller signature begins once the offer is accepted.";

  const buyerDescription = buyerSigned
    ? "Buyer signature received."
    : buyerRequested
    ? "Waiting for the buyer to complete DocuSign."
    : sellerSigned
    ? "Buyer will be invited to sign next."
    : "Buyer signature begins after the seller signs.";

  let adminDescription = "Water Traders reviews the agreement after both signatures.";
  if (adminActive) adminDescription = "Water Traders compliance team is reviewing the agreement.";
  else if (adminComplete) adminDescription = "Admin review complete.";

  let districtDescription = "The water district confirms once admin approval is complete.";
  if (districtActive) districtDescription = "Awaiting water district confirmation.";
  if (districtComplete) districtDescription = "Water district confirmed and funds are being released.";

  const state = { currentAssigned: false };

  return [
    toStep(
      "accepted",
      "Offer accepted",
      "Seller accepted the buyer’s offer.",
      acceptedComplete,
      state
    ),
    toStep("seller-signature", "Seller signature", sellerDescription, sellerSigned, state),
    toStep("buyer-signature", "Buyer signature", buyerDescription, buyerSigned, state),
    toStep("admin-review", "Admin approval", adminDescription, adminComplete || districtComplete, state),
    toStep("district", "Water district confirmation", districtDescription, districtComplete, state),
  ];
}

-- Create Enums
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');
CREATE TYPE "Party" AS ENUM ('SELLER', 'BUYER');
CREATE TYPE "ListingStatus" AS ENUM ('ACTIVE', 'UNDER_CONTRACT', 'SOLD', 'ARCHIVED');
CREATE TYPE "TransactionType" AS ENUM ('BUY_NOW', 'OFFER', 'AUCTION');
CREATE TYPE "TransactionStatus" AS ENUM ('INITIATED', 'PENDING_SELLER_SIGNATURE', 'AWAITING_BUYER_PAYMENT', 'PAYMENT_IN_REVIEW', 'PENDING_BUYER_SIGNATURE', 'COMPLIANCE_REVIEW', 'APPROVED', 'FUNDS_RELEASED', 'CANCELLED');
CREATE TYPE "SignatureStatus" AS ENUM ('PENDING', 'SENT', 'COMPLETED', 'DECLINED');
CREATE TYPE "PaymentMethod" AS ENUM ('STRIPE', 'ESCROW_COM');
CREATE TYPE "ProfileRole" AS ENUM ('BUYER', 'SELLER', 'BOTH', 'DISTRICT_ADMIN');

-- CreateTable: User
CREATE TABLE "User" (
  "id" TEXT PRIMARY KEY,
  "email" TEXT NOT NULL UNIQUE,
  "name" TEXT,
  "role" "Role" NOT NULL DEFAULT 'USER',
  "clerkId" TEXT UNIQUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

-- CreateTable: Listing
CREATE TABLE "Listing" (
  "id" TEXT PRIMARY KEY,
  "district" TEXT NOT NULL,
  "waterType" TEXT NOT NULL,
  "availability" TEXT NOT NULL,
  "acreFeet" INTEGER NOT NULL,
  "pricePerAF" INTEGER NOT NULL,
  "status" "ListingStatus" NOT NULL DEFAULT 'ACTIVE',
  "sellerId" TEXT,
  "isAuction" BOOLEAN NOT NULL DEFAULT FALSE,
  "auctionEndsAt" TIMESTAMP(3),
  "reservePrice" INTEGER,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Listing_sellerId_fkey"
    FOREIGN KEY ("sellerId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable: Bid
CREATE TABLE "Bid" (
  "id" TEXT PRIMARY KEY,
  "listingId" TEXT NOT NULL,
  "bidderId" TEXT NOT NULL,
  "pricePerAF" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Bid_listingId_fkey"
    FOREIGN KEY ("listingId") REFERENCES "Listing"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,

  CONSTRAINT "Bid_bidderId_fkey"
    FOREIGN KEY ("bidderId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable: Transaction
CREATE TABLE "Transaction" (
  "id" TEXT PRIMARY KEY,
  "type" "TransactionType" NOT NULL,
  "status" "TransactionStatus" NOT NULL DEFAULT 'INITIATED',
  "listingId" TEXT NOT NULL,
  "sellerId" TEXT NOT NULL,
  "buyerId" TEXT NOT NULL,
  "acreFeet" INTEGER NOT NULL,
  "pricePerAF" INTEGER NOT NULL,
  "totalAmount" INTEGER NOT NULL,
  "paymentMethod" "PaymentMethod",
  "paymentId" TEXT,
  "complianceApprovedBy" TEXT,
  "complianceApprovedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Transaction_listingId_fkey"
    FOREIGN KEY ("listingId") REFERENCES "Listing"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,

  CONSTRAINT "Transaction_sellerId_fkey"
    FOREIGN KEY ("sellerId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE,

  CONSTRAINT "Transaction_buyerId_fkey"
    FOREIGN KEY ("buyerId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable: Signature
CREATE TABLE "Signature" (
  "id" TEXT PRIMARY KEY,
  "transactionId" TEXT NOT NULL,
  "party" "Party" NOT NULL,
  "docusignEnvelopeId" TEXT,
  "status" "SignatureStatus" NOT NULL DEFAULT 'PENDING',
  "completedAt" TIMESTAMP(3),

  CONSTRAINT "Signature_transactionId_fkey"
    FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable: UserProfile
CREATE TABLE "UserProfile" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL UNIQUE,
  "fullName" TEXT NOT NULL,
  "company" TEXT,
  "tradeRole" "ProfileRole" NOT NULL,
  "phone" TEXT,
  "primaryDistrict" TEXT,
  "waterTypes" TEXT[] NOT NULL DEFAULT '{}',
  "acceptTerms" BOOLEAN NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "UserProfile_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

-- Indexes
CREATE INDEX "User_role_idx" ON "User"("role");

CREATE INDEX "Listing_status_isAuction_auctionEndsAt_idx"
  ON "Listing"("status", "isAuction", "auctionEndsAt");
CREATE INDEX "Listing_district_waterType_idx"
  ON "Listing"("district", "waterType");

CREATE INDEX "Bid_listingId_createdAt_idx"
  ON "Bid"("listingId", "createdAt");
CREATE INDEX "Bid_bidderId_createdAt_idx"
  ON "Bid"("bidderId", "createdAt");

CREATE INDEX "Transaction_buyerId_idx" ON "Transaction"("buyerId");
CREATE INDEX "Transaction_sellerId_idx" ON "Transaction"("sellerId");
CREATE INDEX "Transaction_status_idx" ON "Transaction"("status");
CREATE INDEX "Transaction_listingId_idx" ON "Transaction"("listingId");

CREATE INDEX "Signature_transactionId_party_idx"
  ON "Signature"("transactionId", "party");

CREATE INDEX "UserProfile_userId_idx" ON "UserProfile"("userId")

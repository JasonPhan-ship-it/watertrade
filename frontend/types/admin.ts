export type AdminOverviewTimeseriesPoint = {
  /** ISO-8601 date string in YYYY-MM-DD format */
  date: string;
  /** Number of visitors or signups recorded on the date */
  visitors: number;
};

export type AdminOverviewMetrics = {
  revenue: {
    /** Lifetime revenue in cents */
    totalCents: number;
    /** Revenue in the most recent 30 day window (cents) */
    last30Cents: number;
    /** Revenue in the preceding 30 day window (cents) */
    previous30Cents: number;
    /** Percentage change between the current and previous window */
    trendPct: number;
  };
  newCustomers: {
    /** Number of newly created non-admin accounts in the latest 30 days */
    current: number;
    /** Number of newly created non-admin accounts in the previous 30 days */
    previous: number;
    /** Percentage change between the current and previous window */
    trendPct: number;
  };
  activeAccounts: {
    /** Count of distinct buyer/seller accounts active in the latest 30 days */
    current: number;
    /** Count of distinct buyer/seller accounts active in the previous 30 days */
    previous: number;
    /** Percentage change between the current and previous window */
    trendPct: number;
  };
  /** Alias for the revenue trend percentage */
  growthRatePct: number;
  counts: {
    /** Listings currently marked ACTIVE */
    activeListings: number;
    /** Total listings ever created */
    totalListings: number;
    /** Transactions that are not cancelled or fully released */
    transactionsInFlight: number;
    /** Transactions with completed payouts */
    transactionsCompleted: number;
  };
  visitors: {
    /** Indicates whether visitor data came from Vercel analytics or signup fallback */
    source: "vercel" | "signups";
    /** Daily visitor datapoints covering the trailing 90 day window */
    series: AdminOverviewTimeseriesPoint[];
  };
};

export type MetricFormatter = "integer" | "currency";

export type HomepageCopy = {
  hero: {
    preheading: string;
    description: string;
    phrases: string[];
    signedInCta: string;
    signedOutPrimaryCta: string;
    signedOutSecondaryCta: string;
    metricsError: string;
  };
  metrics: {
    cards: Array<{
      label: string;
      formatter: MetricFormatter;
    }>;
  };
  featuredDistricts: {
    heading: string;
  };
  coreWorkflows: {
    preheading: string;
    heading: string;
    description: string;
    carouselInstructions: {
      default: string;
      reducedMotion: string;
    };
    items: Array<{
      id: string;
      highlight: string;
      title: string;
      description: string;
    }>;
  };
  process: {
    preheading: string;
    heading: string;
    description: string;
    quote: string;
    attribution: string;
    steps: Array<{
      title: string;
      description: string;
    }>;
  };
  gradientCta: {
    preheading: string;
    heading: string;
    description: string;
    primaryCtaLabel: string;
    secondaryCtaLabel: string;
  };
  cookieBanner: {
    message: string;
    learnMoreLabel: string;
    declineLabel: string;
    acceptLabel: string;
  };
  logoutToast: {
    title: string;
    body: string;
  };
};

export type WaterTraderFeeSetting = {
  rate: number;
};

export type SiteSettings = {
  homepageCopy: HomepageCopy;
  waterTraderFee: WaterTraderFeeSetting;
};

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  homepageCopy: {
    hero: {
      preheading: "California water desk",
      description:
        "Water Traders connects California growers, advisors, and districts with a trusted operating system for trading surface water, transfers, and recharge. List inventory, qualify demand, and execute with institutional rigor.",
      phrases: [
        "Institutional execution for water trades",
        "List surface water, transfers, and recharge inventory",
        "Accelerate closing with compliance automation",
      ],
      signedInCta: "Go to dashboard",
      signedOutPrimaryCta: "Create free account",
      signedOutSecondaryCta: "Sign in",
      metricsError: "Unable to load marketplace metrics. Please try again later.",
    },
    metrics: {
      cards: [
        { label: "Active listings", formatter: "integer" },
        { label: "Acre-feet available", formatter: "integer" },
        { label: "Value under negotiation", formatter: "currency" },
      ],
    },
    featuredDistricts: {
      heading: "Featured districts",
    },
    coreWorkflows: {
      preheading: "Core workflows",
      heading: "Explore the operating system for water trading",
      description:
        "Guided workspaces keep growers, advisors, and districts aligned from first offer to final delivery.",
      carouselInstructions: {
        default: "",
        reducedMotion: "Select a workflow to explore the UI at your own pace.",
      },
      items: [
        {
          id: "offer",
          highlight: "Offer desk",
          title: "Structure multi-party offers",
          description: "Manage counterparty negotiations with guardrails for compliance.",
        },
        {
          id: "buy-now",
          highlight: "Checkout",
          title: "Launch escrow-ready Buy Now",
          description: "Automate payment, DocuSign, and district notifications in one click.",
        },
        {
          id: "create-listing",
          highlight: "Listings",
          title: "Publish verified supply",
          description: "Compose listings with pricing, volume, and distribution controls.",
        },
        {
          id: "track-progress",
          highlight: "Execution",
          title: "Track deal progress",
          description: "Monitor signatures, payments, and district confirmations in real-time.",
        },
      ],
    },
    process: {
      preheading: "How it works",
      heading: "Full lifecycle coverage",
      description:
        "Water Traders streamlines every step—from sourcing inventory to filing closing paperwork—so that your compliance, finance, and operations teams move in lockstep.",
      quote:
        "\"Water Traders gives us growers the confidence we need to trade water.\"",
      attribution: "Farmer LLC - COO",
      steps: [
        {
          title: "Source and qualify supply",
          description: "Centralize grower inventory, water types, and priority allocations.",
        },
        {
          title: "Launch guided negotiations",
          description: "Coordinate offers, approvals, and counterparty communications.",
        },
        {
          title: "Execute with compliance",
          description: "Generate DocuSign packets and district filings with audit-ready data.",
        },
      ],
    },
    gradientCta: {
      preheading: "Ready to trade",
      heading: "Start exchanging water now",
      description:
        "Schedule a walkthrough with our team to see how Water Traders powers advisory firms, growers, and districts with a connected operating system.",
      primaryCtaLabel: "Talk to our team",
    },
    cookieBanner: {
      message:
        "We use cookies to improve your experience, analyze traffic, and provide essential site functionality.",
      learnMoreLabel: "Learn more",
      declineLabel: "No thanks",
      acceptLabel: "Allow cookies",
    },
    logoutToast: {
      title: "Signed out successfully",
      body: "You're now signed out. Come back anytime to manage your listings.",
    },
  },
  waterTraderFee: {
    rate: 0.015,
  },
};

export const DEFAULT_HOMEPAGE_COPY = DEFAULT_SITE_SETTINGS.homepageCopy;
export const DEFAULT_WATER_TRADER_FEE = DEFAULT_SITE_SETTINGS.waterTraderFee;
export const DEFAULT_WATER_TRADER_FEE_RATE = DEFAULT_WATER_TRADER_FEE.rate;

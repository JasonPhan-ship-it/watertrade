import { NextRequest, NextResponse } from "next/server";
import {
  DEFAULT_SITE_SETTINGS,
  getSiteSetting,
  setSiteSetting,
  type HomepageCopy,
  type MetricFormatter,
  type SiteSettingKey,
} from "@/lib/site-settings";
import { requireAdmin } from "@/lib/rbac";

type RouteContext = {
  params: {
    key: string;
  };
};

const KEY_ALIASES: Record<string, SiteSettingKey> = {
  "water-trader-fee": "waterTraderFee",
  waterTraderFee: "waterTraderFee",
  water_trader_fee: "waterTraderFee",
  "homepage-copy": "homepageCopy",
  homepageCopy: "homepageCopy",
  homepage_copy: "homepageCopy",
};

function resolveKey(rawKey: string | undefined): SiteSettingKey | null {
  if (!rawKey) return null;
  return KEY_ALIASES[rawKey] ?? null;
}

function ensureString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function ensureStringArray(value: unknown, fallback: string[]): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }
  return fallback;
}

function normalizeHomepageCopy(value: unknown): HomepageCopy {
  const defaults = DEFAULT_SITE_SETTINGS.homepageCopy;
  if (!value || typeof value !== "object") {
    return defaults;
  }
  const raw = value as Record<string, unknown>;

  const heroRaw = (raw.hero as Record<string, unknown>) ?? {};
  const metricsRaw = (raw.metrics as Record<string, unknown>) ?? {};
  const featuredRaw = (raw.featuredDistricts as Record<string, unknown>) ?? {};
  const workflowsRaw = (raw.coreWorkflows as Record<string, unknown>) ?? {};
  const listingComposerExampleRaw =
    (workflowsRaw.listingComposerExample as Record<string, unknown>) ?? {};
  const processRaw = (raw.process as Record<string, unknown>) ?? {};
  const gradientRaw = (raw.gradientCta as Record<string, unknown>) ?? {};
  const cookieRaw = (raw.cookieBanner as Record<string, unknown>) ?? {};
  const logoutRaw = (raw.logoutToast as Record<string, unknown>) ?? {};

  const metricsCardsRaw = Array.isArray(metricsRaw.cards) ? metricsRaw.cards : defaults.metrics.cards;

  const workflowItemsRaw = Array.isArray(workflowsRaw.items) ? workflowsRaw.items : defaults.coreWorkflows.items;
  const processStepsRaw = Array.isArray(processRaw.steps) ? processRaw.steps : defaults.process.steps;

  const metricsCards = metricsCardsRaw.map((card, index) => {
    const fallback = defaults.metrics.cards[index] ?? defaults.metrics.cards[0];
    if (!card || typeof card !== "object") return fallback;
    const cardObj = card as Record<string, unknown>;
    const formatter: MetricFormatter = cardObj.formatter === "currency" ? "currency" : "integer";
    return {
      label: ensureString(cardObj.label, fallback.label),
      formatter,
    };
  });

  const coreWorkflowItems = workflowItemsRaw.map((item, index) => {
    const fallback = defaults.coreWorkflows.items[index] ?? defaults.coreWorkflows.items[0];
    if (!item || typeof item !== "object") return fallback;
    const itemObj = item as Record<string, unknown>;
    return {
      id: ensureString(itemObj.id, fallback.id),
      title: ensureString(itemObj.title, fallback.title),
      description: ensureString(itemObj.description, fallback.description),
      highlight: ensureString(itemObj.highlight, fallback.highlight),
    };
  });

  const processSteps = processStepsRaw.map((step, index) => {
    const fallback = defaults.process.steps[index] ?? defaults.process.steps[0];
    if (!step || typeof step !== "object") return fallback;
    const stepObj = step as Record<string, unknown>;
    return {
      title: ensureString(stepObj.title, fallback.title),
      description: ensureString(stepObj.description, fallback.description),
    };
  });

  return {
    hero: {
      preheading: ensureString(heroRaw.preheading, defaults.hero.preheading),
      description: ensureString(heroRaw.description, defaults.hero.description),
      phrases: ensureStringArray(heroRaw.phrases, defaults.hero.phrases),
      signedInCta: ensureString(heroRaw.signedInCta, defaults.hero.signedInCta),
      signedOutPrimaryCta: ensureString(heroRaw.signedOutPrimaryCta, defaults.hero.signedOutPrimaryCta),
      signedOutSecondaryCta: ensureString(heroRaw.signedOutSecondaryCta, defaults.hero.signedOutSecondaryCta),
      metricsError: ensureString(heroRaw.metricsError, defaults.hero.metricsError),
    },
    metrics: {
      cards: metricsCards.length ? metricsCards : defaults.metrics.cards,
    },
    featuredDistricts: {
      heading: ensureString(featuredRaw.heading, defaults.featuredDistricts.heading),
    },
    coreWorkflows: {
      preheading: ensureString(workflowsRaw.preheading, defaults.coreWorkflows.preheading),
      heading: ensureString(workflowsRaw.heading, defaults.coreWorkflows.heading),
      description: ensureString(workflowsRaw.description, defaults.coreWorkflows.description),
      carouselInstructions: {
        default: ensureString(
          workflowsRaw.carouselInstructions &&
            typeof workflowsRaw.carouselInstructions === "object" &&
            (workflowsRaw.carouselInstructions as Record<string, unknown>).default,
          defaults.coreWorkflows.carouselInstructions.default,
        ),
        reducedMotion: ensureString(
          workflowsRaw.carouselInstructions &&
            typeof workflowsRaw.carouselInstructions === "object" &&
            (workflowsRaw.carouselInstructions as Record<string, unknown>).reducedMotion,
          defaults.coreWorkflows.carouselInstructions.reducedMotion,
        ),
      },
      items: coreWorkflowItems.length ? coreWorkflowItems : defaults.coreWorkflows.items,
      listingComposerExample: {
        waterDistrict: ensureString(
          listingComposerExampleRaw.waterDistrict,
          defaults.coreWorkflows.listingComposerExample.waterDistrict,
        ),
        waterType: ensureString(
          listingComposerExampleRaw.waterType,
          defaults.coreWorkflows.listingComposerExample.waterType,
        ),
        volume: ensureString(
          listingComposerExampleRaw.volume,
          defaults.coreWorkflows.listingComposerExample.volume,
        ),
        pricePerAf: ensureString(
          listingComposerExampleRaw.pricePerAf,
          defaults.coreWorkflows.listingComposerExample.pricePerAf,
        ),
      },
    },
    process: {
      preheading: ensureString(processRaw.preheading, defaults.process.preheading),
      heading: ensureString(processRaw.heading, defaults.process.heading),
      description: ensureString(processRaw.description, defaults.process.description),
      quote: ensureString(processRaw.quote, defaults.process.quote),
      attribution: ensureString(processRaw.attribution, defaults.process.attribution),
      steps: processSteps.length ? processSteps : defaults.process.steps,
    },
    gradientCta: {
      preheading: ensureString(gradientRaw.preheading, defaults.gradientCta.preheading),
      heading: ensureString(gradientRaw.heading, defaults.gradientCta.heading),
      description: ensureString(gradientRaw.description, defaults.gradientCta.description),
      primaryCtaLabel: ensureString(gradientRaw.primaryCtaLabel, defaults.gradientCta.primaryCtaLabel),
      secondaryCtaLabel: ensureString(gradientRaw.secondaryCtaLabel, defaults.gradientCta.secondaryCtaLabel),
    },
    cookieBanner: {
      message: ensureString(cookieRaw.message, defaults.cookieBanner.message),
      learnMoreLabel: ensureString(cookieRaw.learnMoreLabel, defaults.cookieBanner.learnMoreLabel),
      declineLabel: ensureString(cookieRaw.declineLabel, defaults.cookieBanner.declineLabel),
      acceptLabel: ensureString(cookieRaw.acceptLabel, defaults.cookieBanner.acceptLabel),
    },
    logoutToast: {
      title: ensureString(logoutRaw.title, defaults.logoutToast.title),
      body: ensureString(logoutRaw.body, defaults.logoutToast.body),
    },
  };
}

function normalizeWaterTraderFee(value: unknown) {
  if (value && typeof value === "object") {
    const raw = value as Record<string, unknown>;
    const parsed = Number(raw.rate);
    if (Number.isFinite(parsed) && parsed >= 0 && parsed <= 1) {
      return { rate: parsed };
    }
  }
  if (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1) {
    return { rate: value };
  }
  throw new Error("Invalid fee value");
}

export async function GET(_req: NextRequest, context: RouteContext) {
  const key = resolveKey(context.params.key);
  if (!key) {
    return NextResponse.json({ error: "Unknown setting" }, { status: 404 });
  }
  const value = await getSiteSetting(key);
  return NextResponse.json({ key, value });
}

export async function PUT(req: NextRequest, context: RouteContext) {
  const key = resolveKey(context.params.key);
  if (!key) {
    return NextResponse.json({ error: "Unknown setting" }, { status: 404 });
  }
  await requireAdmin();
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  let value;
  try {
    if (key === "waterTraderFee") {
      value = normalizeWaterTraderFee(body);
    } else if (key === "homepageCopy") {
      value = normalizeHomepageCopy(body);
    } else {
      return NextResponse.json({ error: "Unsupported setting" }, { status: 400 });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid value";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  await setSiteSetting(key, value);
  return NextResponse.json({ key, value });
}

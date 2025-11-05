"use client";

import * as React from "react";
import { DEFAULT_SITE_SETTINGS, type HomepageCopy } from "@/lib/site-settings/defaults";

type Props = {
  initialCopy: HomepageCopy;
};

type FormStatus = "idle" | "saving";

type MetricFormatter = HomepageCopy["metrics"]["cards"][number]["formatter"];

export function HomepageCopyForm({ initialCopy }: Props) {
  const defaultCopy = DEFAULT_SITE_SETTINGS.homepageCopy;
  const [form, setForm] = React.useState<HomepageCopy>(initialCopy);
  const [heroPhrases, setHeroPhrases] = React.useState<string>(() => initialCopy.hero.phrases.join("\n"));
  const [status, setStatus] = React.useState<FormStatus>("idle");
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setForm(initialCopy);
    setHeroPhrases(initialCopy.hero.phrases.join("\n"));
  }, [initialCopy]);

  const handleHeroChange = (key: keyof HomepageCopy["hero"], value: string) => {
    setForm((prev) => ({
      ...prev,
      hero: {
        ...prev.hero,
        [key]: value,
      },
    }));
  };

  const handleMetricChange = (index: number, key: "label" | "formatter", value: string) => {
    setForm((prev) => {
      const nextCards = [...prev.metrics.cards];
      const target = nextCards[index] ?? defaultCopy.metrics.cards[index];
      const nextCard = {
        ...target,
        [key]: key === "formatter" ? (value === "currency" ? "currency" : "integer") : value,
      } as (typeof nextCards)[number];
      nextCards[index] = nextCard;
      return {
        ...prev,
        metrics: {
          cards: nextCards,
        },
      };
    });
  };

  const handleWorkflowChange = (index: number, key: "highlight" | "title" | "description", value: string) => {
    setForm((prev) => {
      const nextItems = [...prev.coreWorkflows.items];
      const target = nextItems[index] ?? defaultCopy.coreWorkflows.items[index];
      nextItems[index] = {
        ...target,
        [key]: value,
      };
      return {
        ...prev,
        coreWorkflows: {
          ...prev.coreWorkflows,
          items: nextItems,
        },
      };
    });
  };

  const handleListingExampleChange = (
    key: keyof HomepageCopy["coreWorkflows"]["listingComposerExample"],
    value: string,
  ) => {
    setForm((prev) => ({
      ...prev,
      coreWorkflows: {
        ...prev.coreWorkflows,
        listingComposerExample: {
          ...prev.coreWorkflows.listingComposerExample,
          [key]: value,
        },
      },
    }));
  };
  
  const handleProcessStepChange = (index: number, key: "title" | "description", value: string) => {
    setForm((prev) => {
      const nextSteps = [...prev.process.steps];
      const target = nextSteps[index] ?? defaultCopy.process.steps[index];
      nextSteps[index] = {
        ...target,
        [key]: value,
      };
      return {
        ...prev,
        process: {
          ...prev.process,
          steps: nextSteps,
        },
      };
    });
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (status === "saving") return;

    setStatus("saving");
    setMessage(null);
    setError(null);

    const payload: HomepageCopy = {
      ...form,
      hero: {
        ...form.hero,
        phrases: heroPhrases
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean),
      },
    };

    try {
      const response = await fetch("/api/site-settings/homepage-copy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || "Failed to update homepage content");
      }

      setForm(payload);
      setHeroPhrases(payload.hero.phrases.join("\n"));
      setMessage("Homepage content updated successfully.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected error";
      setError(message);
    } finally {
      setStatus("idle");
    }
  };

  const handleReset = () => {
    setForm(defaultCopy);
    setHeroPhrases(defaultCopy.hero.phrases.join("\n"));
    setMessage(null);
    setError(null);
  };

  const renderMetricFormatterOption = (value: MetricFormatter, label: string) => (
    <option value={value} key={value}>
      {label}
    </option>
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <section>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Hero</h2>
          <button
            type="button"
            onClick={handleReset}
            className="text-sm font-medium text-emerald-700 hover:text-emerald-600"
          >
            Reset to defaults
          </button>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <TextField
            label="Preheading"
            value={form.hero.preheading}
            onChange={(value) => handleHeroChange("preheading", value)}
          />
          <TextField
            label="Signed-in CTA"
            value={form.hero.signedInCta}
            onChange={(value) => handleHeroChange("signedInCta", value)}
          />
          <TextField
            label="Signed-out primary CTA"
            value={form.hero.signedOutPrimaryCta}
            onChange={(value) => handleHeroChange("signedOutPrimaryCta", value)}
          />
          <TextField
            label="Signed-out secondary CTA"
            value={form.hero.signedOutSecondaryCta}
            onChange={(value) => handleHeroChange("signedOutSecondaryCta", value)}
          />
        </div>
        <div className="mt-4 space-y-4">
          <TextAreaField
            label="Description"
            value={form.hero.description}
            onChange={(value) => handleHeroChange("description", value)}
          />
          <TextAreaField
            label="Metrics error message"
            value={form.hero.metricsError}
            onChange={(value) => handleHeroChange("metricsError", value)}
          />
          <TextAreaField
            label="Typewriter phrases"
            description="One phrase per line"
            value={heroPhrases}
            onChange={(value) => setHeroPhrases(value)}
          />
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-900">Market metrics</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {form.metrics.cards.map((card, index) => (
            <div key={card.label + index} className="rounded-xl border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-slate-700">Card {index + 1}</h3>
              <div className="mt-3 space-y-3">
                <TextField
                  label="Label"
                  value={card.label}
                  onChange={(value) => handleMetricChange(index, "label", value)}
                />
                <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
                  Formatter
                  <select
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                    value={card.formatter}
                    onChange={(event) => handleMetricChange(index, "formatter", event.target.value)}
                  >
                    {renderMetricFormatterOption("integer", "Integer")}
                    {renderMetricFormatterOption("currency", "Currency")}
                  </select>
                </label>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-900">Core workflows</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <TextField
            label="Preheading"
            value={form.coreWorkflows.preheading}
            onChange={(value) =>
              setForm((prev) => ({
                ...prev,
                coreWorkflows: { ...prev.coreWorkflows, preheading: value },
              }))
            }
          />
          <TextField
            label="Heading"
            value={form.coreWorkflows.heading}
            onChange={(value) =>
              setForm((prev) => ({
                ...prev,
                coreWorkflows: { ...prev.coreWorkflows, heading: value },
              }))
            }
          />
        </div>
        <div className="mt-4 space-y-4">
          <TextAreaField
            label="Description"
            value={form.coreWorkflows.description}
            onChange={(value) =>
              setForm((prev) => ({
                ...prev,
                coreWorkflows: { ...prev.coreWorkflows, description: value },
              }))
            }
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Carousel instructions"
              description="Default"
              value={form.coreWorkflows.carouselInstructions.default}
              onChange={(value) =>
                setForm((prev) => ({
                  ...prev,
                  coreWorkflows: {
                    ...prev.coreWorkflows,
                    carouselInstructions: {
                      ...prev.coreWorkflows.carouselInstructions,
                      default: value,
                    },
                  },
                }))
              }
            />
            <TextField
              label="Carousel instructions"
              description="Reduced motion"
              value={form.coreWorkflows.carouselInstructions.reducedMotion}
              onChange={(value) =>
                setForm((prev) => ({
                  ...prev,
                  coreWorkflows: {
                    ...prev.coreWorkflows,
                    carouselInstructions: {
                      ...prev.coreWorkflows.carouselInstructions,
                      reducedMotion: value,
                    },
                  },
                }))
              }
            />
          </div>
        </div>
        <div className="mt-6 space-y-4">
          {form.coreWorkflows.items.map((item, index) => (
            <div key={item.id} className="rounded-xl border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-slate-700">Workflow {index + 1}</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <TextField
                  label="Highlight"
                  value={item.highlight}
                  onChange={(value) => handleWorkflowChange(index, "highlight", value)}
                />
                <TextField
                  label="Title"
                  value={item.title}
                  onChange={(value) => handleWorkflowChange(index, "title", value)}
                />
              </div>
              <div className="mt-3">
                <TextAreaField
                  label="Description"
                  value={item.description}
                  onChange={(value) => handleWorkflowChange(index, "description", value)}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

        <div className="mt-6 rounded-xl border border-slate-200 p-4">
          <h3 className="text-sm font-semibold text-slate-700">Listing composer example</h3>
          <p className="mt-1 text-xs text-slate-500">
            Control the sample values shown in the public listing composer preview.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <TextField
              label="Water district"
              value={form.coreWorkflows.listingComposerExample.waterDistrict}
              onChange={(value) => handleListingExampleChange("waterDistrict", value)}
            />
            <TextField
              label="Water type"
              value={form.coreWorkflows.listingComposerExample.waterType}
              onChange={(value) => handleListingExampleChange("waterType", value)}
            />
            <TextField
              label="Volume"
              value={form.coreWorkflows.listingComposerExample.volume}
              onChange={(value) => handleListingExampleChange("volume", value)}
            />
            <TextField
              label="Price per AF"
              value={form.coreWorkflows.listingComposerExample.pricePerAf}
              onChange={(value) => handleListingExampleChange("pricePerAf", value)}
            />
          </div>
        </div>
      
      <section>
        <h2 className="text-lg font-semibold text-slate-900">How it works</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <TextField
            label="Preheading"
            value={form.process.preheading}
            onChange={(value) =>
              setForm((prev) => ({
                ...prev,
                process: { ...prev.process, preheading: value },
              }))
            }
          />
          <TextField
            label="Heading"
            value={form.process.heading}
            onChange={(value) =>
              setForm((prev) => ({
                ...prev,
                process: { ...prev.process, heading: value },
              }))
            }
          />
        </div>
        <div className="mt-4 space-y-4">
          <TextAreaField
            label="Description"
            value={form.process.description}
            onChange={(value) =>
              setForm((prev) => ({
                ...prev,
                process: { ...prev.process, description: value },
              }))
            }
          />
          <TextAreaField
            label="Quote"
            value={form.process.quote}
            onChange={(value) =>
              setForm((prev) => ({
                ...prev,
                process: { ...prev.process, quote: value },
              }))
            }
          />
          <TextField
            label="Attribution"
            value={form.process.attribution}
            onChange={(value) =>
              setForm((prev) => ({
                ...prev,
                process: { ...prev.process, attribution: value },
              }))
            }
          />
        </div>
        <div className="mt-6 space-y-4">
          {form.process.steps.map((step, index) => (
            <div key={step.title + index} className="rounded-xl border border-slate-200 p-4">
              <h3 className="text-sm font-semibold text-slate-700">Step {index + 1}</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <TextField
                  label="Title"
                  value={step.title}
                  onChange={(value) => handleProcessStepChange(index, "title", value)}
                />
                <TextAreaField
                  label="Description"
                  value={step.description}
                  onChange={(value) => handleProcessStepChange(index, "description", value)}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-900">Gradient call-to-action</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <TextField
            label="Preheading"
            value={form.gradientCta.preheading}
            onChange={(value) =>
              setForm((prev) => ({
                ...prev,
                gradientCta: { ...prev.gradientCta, preheading: value },
              }))
            }
          />
          <TextField
            label="Heading"
            value={form.gradientCta.heading}
            onChange={(value) =>
              setForm((prev) => ({
                ...prev,
                gradientCta: { ...prev.gradientCta, heading: value },
              }))
            }
          />
        </div>
        <div className="mt-4 space-y-4">
          <TextAreaField
            label="Description"
            value={form.gradientCta.description}
            onChange={(value) =>
              setForm((prev) => ({
                ...prev,
                gradientCta: { ...prev.gradientCta, description: value },
              }))
            }
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              label="Primary CTA label"
              value={form.gradientCta.primaryCtaLabel}
              onChange={(value) =>
                setForm((prev) => ({
                  ...prev,
                  gradientCta: { ...prev.gradientCta, primaryCtaLabel: value },
                }))
              }
            />
            <TextField
              label="Secondary CTA label"
              value={form.gradientCta.secondaryCtaLabel}
              onChange={(value) =>
                setForm((prev) => ({
                  ...prev,
                  gradientCta: { ...prev.gradientCta, secondaryCtaLabel: value },
                }))
              }
            />
          </div>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-900">Footer messaging</h2>
        <div className="mt-4 space-y-4">
          <TextAreaField
            label="Cookie banner message"
            value={form.cookieBanner.message}
            onChange={(value) =>
              setForm((prev) => ({
                ...prev,
                cookieBanner: { ...prev.cookieBanner, message: value },
              }))
            }
          />
          <div className="grid gap-4 sm:grid-cols-3">
            <TextField
              label="Learn more label"
              value={form.cookieBanner.learnMoreLabel}
              onChange={(value) =>
                setForm((prev) => ({
                  ...prev,
                  cookieBanner: { ...prev.cookieBanner, learnMoreLabel: value },
                }))
              }
            />
            <TextField
              label="Decline label"
              value={form.cookieBanner.declineLabel}
              onChange={(value) =>
                setForm((prev) => ({
                  ...prev,
                  cookieBanner: { ...prev.cookieBanner, declineLabel: value },
                }))
              }
            />
            <TextField
              label="Accept label"
              value={form.cookieBanner.acceptLabel}
              onChange={(value) =>
                setForm((prev) => ({
                  ...prev,
                  cookieBanner: { ...prev.cookieBanner, acceptLabel: value },
                }))
              }
            />
          </div>
          <TextField
            label="Logout toast title"
            value={form.logoutToast.title}
            onChange={(value) =>
              setForm((prev) => ({
                ...prev,
                logoutToast: { ...prev.logoutToast, title: value },
              }))
            }
          />
          <TextAreaField
            label="Logout toast message"
            value={form.logoutToast.body}
            onChange={(value) =>
              setForm((prev) => ({
                ...prev,
                logoutToast: { ...prev.logoutToast, body: value },
              }))
            }
          />
        </div>
      </section>

      {message ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {message}
        </div>
      ) : null}
      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      ) : null}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={status === "saving"}
          className="inline-flex items-center justify-center rounded-lg bg-emerald-600 px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600/40 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === "saving" ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}

type TextFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  description?: string;
};

function TextField({ label, value, onChange, description }: TextFieldProps) {
  return (
    <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
      {label}
      {description ? <span className="ml-1 text-[10px] normal-case text-slate-400">({description})</span> : null}
      <input
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

type TextAreaFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  description?: string;
};

function TextAreaField({ label, value, onChange, description }: TextAreaFieldProps) {
  return (
    <label className="block text-xs font-medium uppercase tracking-wide text-slate-500">
      {label}
      {description ? <span className="ml-1 text-[10px] normal-case text-slate-400">({description})</span> : null}
      <textarea
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
        rows={3}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

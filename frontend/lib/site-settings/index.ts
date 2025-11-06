import { prisma } from "@/lib/prisma";
import { DEFAULT_SITE_SETTINGS, type SiteSettings } from "./defaults";

export { DEFAULT_SITE_SETTINGS } from "./defaults";
export type { HomepageCopy, MetricFormatter, WaterTraderFeeSetting } from "./defaults";

export type SiteSettingKey = keyof SiteSettings;

type SiteSettingValue<K extends SiteSettingKey> = SiteSettings[K];

function mergeWithDefaults<T>(defaults: T, value: unknown): T {
  if (value === null || value === undefined) {
    return defaults;
  }

  if (Array.isArray(defaults)) {
    if (!Array.isArray(value)) {
      return defaults;
    }

    const length = Math.max(defaults.length, value.length);
    return Array.from({ length }, (_, index) => {
      const defaultItem = index < defaults.length ? defaults[index] : value[index];
      const valueItem = value[index];

      if (defaultItem === undefined) {
        return valueItem;
      }

      return mergeWithDefaults(defaultItem, valueItem ?? defaultItem);
    }) as T;
  }

  if (typeof defaults === "object" && defaults !== null) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return defaults;
    }

    const defaultsRecord = defaults as Record<string, unknown>;
    const valueRecord = value as Record<string, unknown>;
    const result: Record<string, unknown> = {};

    for (const key of new Set([...Object.keys(defaultsRecord), ...Object.keys(valueRecord)])) {
      const defaultChild = defaultsRecord[key];

      if (key in valueRecord) {
        const valueChild = valueRecord[key];
        result[key] =
          defaultChild === undefined
            ? valueChild
            : mergeWithDefaults(defaultChild, valueChild);
      } else if (defaultChild !== undefined) {
        result[key] = mergeWithDefaults(defaultChild, undefined);
      }
    }

    return result as T;
  }

  return (value ?? defaults) as T;
}

export async function getSiteSetting<K extends SiteSettingKey>(key: K): Promise<SiteSettingValue<K>> {
  try {
    const record = await prisma.siteSetting.findUnique({ where: { key } });
    const value = record?.value as SiteSettingValue<K> | null;
    const defaults = DEFAULT_SITE_SETTINGS[key];
    if (value === null || value === undefined) {
      return defaults;
    }
    
    return mergeWithDefaults(defaults, value);
  } catch (error) {
    console.error(`Failed to load site setting "${key}":`, error);
    return DEFAULT_SITE_SETTINGS[key];
  }
}

export async function setSiteSetting<K extends SiteSettingKey>(
  key: K,
  value: SiteSettingValue<K>,
): Promise<void> {
  await prisma.siteSetting.upsert({
    where: { key },
    update: { value },
    create: { key, value },
  });
}

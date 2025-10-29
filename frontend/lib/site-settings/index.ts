import { prisma } from "@/lib/prisma";
import {
  DEFAULT_SITE_SETTINGS,
  type HomepageCopy,
  type SiteSettings,
  type WaterTraderFeeSetting,
} from "./defaults";

export { DEFAULT_SITE_SETTINGS } from "./defaults";
export type { HomepageCopy, MetricFormatter, WaterTraderFeeSetting } from "./defaults";

export type SiteSettingKey = keyof SiteSettings;

type SiteSettingValue<K extends SiteSettingKey> = SiteSettings[K];

export async function getSiteSetting<K extends SiteSettingKey>(key: K): Promise<SiteSettingValue<K>> {
  try {
    const record = await prisma.siteSetting.findUnique({ where: { key } });
    const value = record?.value as SiteSettingValue<K> | null;
    if (value === null || value === undefined) {
      return DEFAULT_SITE_SETTINGS[key];
    }
    return value;
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

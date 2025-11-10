import HomepageClient from "./homepage-client";
import { DEFAULT_WATER_TRADER_FEE_RATE } from "@/lib/site-settings/defaults";
import { getSiteSetting } from "@/lib/site-settings";

export default async function HomePage() {
  const [homepageCopy, waterTraderFee] = await Promise.all([
    getSiteSetting("homepageCopy"),
    getSiteSetting("waterTraderFee"),
  ]);

  const initialCopy = homepageCopy;
  const initialFeeRate = Number.isFinite(waterTraderFee.rate)
    ? waterTraderFee.rate
    : DEFAULT_WATER_TRADER_FEE_RATE;

  return <HomepageClient initialCopy={initialCopy} initialFeeRate={initialFeeRate} />;
}

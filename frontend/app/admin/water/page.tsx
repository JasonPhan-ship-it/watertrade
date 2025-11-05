import WaterCodesManager from "@/components/admin/WaterCodesManager";
import { getSiteSetting } from "@/lib/site-settings";
import { WaterTraderFeeForm } from "./WaterTraderFeeForm";

export default async function AdminWaterPage() {
  const waterTraderFee = await getSiteSetting("waterTraderFee");

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-medium">Marketplace</h2>
        <p className="mt-1 text-sm text-slate-600">
          Adjust platform fees that appear in listing and checkout estimates.
        </p>
        <div className="mt-4">
          <WaterTraderFeeForm initialRate={waterTraderFee.rate} />
        </div>
      </section>

      <WaterCodesManager />
    </div>
  );
}

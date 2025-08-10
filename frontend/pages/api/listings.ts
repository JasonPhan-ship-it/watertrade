import type { NextApiRequest, NextApiResponse } from "next";

// Seed data (replace with DB)
type Listing = {
  id: string;
  district: string;
  acreFeet: number;
  pricePerAf: number;
  availabilityStart: string; // ISO
  availabilityEnd: string;   // ISO
  waterType: string;
  createdAt: string;         // ISO
};

const SEED: Listing[] = [
  mk("Westlands Water District", 2000, 450, "2025-04-01", "2025-06-30", "Pumping Credits", "2025-01-15"),
  mk("San Luis Water District", 1500, 500, "2025-03-01", "2025-05-31", "CVP Allocation", "2025-01-18"),
  mk("Panoche Water District", 1200, 475, "2025-05-01", "2025-07-31", "Supplemental Water", "2025-02-02"),
  mk("Arvin Edison Water District", 2500, 425, "2025-02-01", "2025-04-30", "Pumping Credits", "2025-01-25"),
  mk("Westlands Water District", 1800, 460, "2025-04-01", "2025-06-30", "Supplemental Water", "2025-02-10"),
  mk("San Luis Water District", 1000, 510, "2025-03-01", "2025-04-30", "CVP Allocation", "2025-02-12"),
];

function mk(
  district: string,
  acreFeet: number,
  pricePerAf: number,
  start: string,
  end: string,
  waterType: string,
  created: string
): Listing {
  return {
    id: `${district}-${acreFeet}-${pricePerAf}-${start}`,
    district,
    acreFeet,
    pricePerAf,
    availabilityStart: new Date(start).toISOString(),
    availabilityEnd: new Date(end).toISOString(),
    waterType,
    createdAt: new Date(created).toISOString(),
  };
}

// Parse “Apr–Jun 2025”, etc.
function parseWindowLabel(label: string): { start: Date; end: Date } | null {
  if (!label || label === "Any Window") return null;
  // Expected formats like “Feb–Apr 2025” or “Mar–May 2025”
  const match = label.match(/^([A-Za-z]{3})\u2013([A-Za-z]{3})\s(\d{4})$/);
  if (!match) return null;
  const [_, m1, m2, y] = match;
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const i1 = months.indexOf(m1);
  const i2 = months.indexOf(m2);
  const year = Number(y);
  if (i1 < 0 || i2 < 0) return null;
  const start = new Date(Date.UTC(year, i1, 1));
  // end: last day of end month
  const end = new Date(Date.UTC(year, i2 + 1, 0, 23, 59, 59, 999));
  return { start, end };
}

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const {
    district,
    waterType,
    window,
    sortBy = "createdAt",
    sortDir = "desc",
    page = "1",
    pageSize = "10",
    premium = "false",
  } = req.query as Record<string, string>;

  const isPremium = premium === "true";

  // Filter
  let results = SEED.slice();

  if (district && district !== "All Districts") {
    results = results.filter((r) => r.district === district);
  }
  if (waterType && waterType !== "Any Water Type") {
    results = results.filter((r) => r.waterType === waterType);
  }
  const win = parseWindowLabel(window);
  if (win) {
    results = results.filter((r) => {
      const s = new Date(r.availabilityStart).getTime();
      const e = new Date(r.availabilityEnd).getTime();
      // overlap with requested window
      return !(e < win.start.getTime() || s > win.end.getTime());
    });
  }

  // Sort
  results.sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    const key = sortBy as keyof Listing;
    const va = a[key];
    const vb = b[key];

    if (typeof va === "number" && typeof vb === "number") {
      return (va - vb) * dir;
    }
    // date / string compare
    return String(va).localeCompare(String(vb)) * dir;
  });

  // Premium gating: non-premium users get limited results and no early-access rows
  let limited = false;
  if (!isPremium) {
    limited = true;
    // keep just earliest 3 and reduce visibility if needed (here we keep it simple)
    results = results.slice(0, 3);
  }

  // Pagination (after gating)
  const p = Math.max(1, parseInt(page, 10) || 1);
  const ps = Math.min(50, Math.max(1, parseInt(pageSize, 10) || 10));
  const total = results.length;
  const start = (p - 1) * ps;
  const pageItems = results.slice(start, start + ps);

  res.status(200).json({
    listings: pageItems,
    total,
    limited,
  });
}

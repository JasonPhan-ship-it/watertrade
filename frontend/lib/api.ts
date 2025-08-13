// lib/api.ts

// If set, this should be just an origin (protocol+host), e.g. "https://watertrade.vercel.app"
// Do NOT include "/api" at the end. We'll add it safely below.
const RAW = (process.env.NEXT_PUBLIC_API_URL || "").trim();

// Strip trailing slashes
const ORIGIN = RAW.replace(/\/+$/, "")
  // Also strip a trailing "/api" if someone set it that way
  .replace(/\/api$/i, "");

// Turn "path" into a safe "/api/..." path.
// - If caller passes "listings" => "/api/listings"
// - If caller passes "/listings" => "/api/listings"
// - If caller passes "/api/listings" => "/api/listings"
function toApiPath(path: string) {
  if (/^https?:\/\//i.test(path)) return path; // absolute URL: use as-is
  const p = path.startsWith("/") ? path : `/${path}`;
  return p.startsWith("/api/") ? p : `/api${p}`;
}

export async function api<T = any>(path: string, init?: RequestInit): Promise<T> {
  const apiPath = toApiPath(path);
  const url = /^https?:\/\//i.test(apiPath)
    ? apiPath
    : ORIGIN
    ? `${ORIGIN}${apiPath}`
    : apiPath;

  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // helpful in console / logs
    console.error("API error", { url, status: res.status, body: body.slice(0, 300) });
    throw new Error(`API ${res.status}: ${res.statusText}${body ? " - " + body.slice(0, 200) : ""}`);
  }

  if (res.status === 204) return {} as T;

  try {
    return (await res.json()) as T;
  } catch {
    return {} as T;
  }
}

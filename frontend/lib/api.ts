// Prefer same-origin relative calls by default.
// If you *must* hit a different origin, set NEXT_PUBLIC_API_URL (without trailing slash).
const ORIGIN = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/+$/, "");

// Ensures we always hit /api/... (even if caller passes "/listings").
function toApiPath(path: string) {
  const p = path.startsWith("/") ? path : `/${path}`;
  return p.startsWith("/api/") ? p : `/api${p}`;
}

export async function api<T = any>(path: string, init?: RequestInit): Promise<T> {
  const apiPath = toApiPath(path);

  // Build final URL: same-origin by default, or external if NEXT_PUBLIC_API_URL is set
  const url = ORIGIN ? `${ORIGIN}${apiPath}` : apiPath;

  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    // Trim noisy HTML if we accidentally get a Next error page
    const snippet = body.replace(/\s+/g, " ").slice(0, 300);
    throw new Error(`API ${res.status}: ${res.statusText}${snippet ? " - " + snippet : ""}`);
  }

  // Support endpoints that return 204 No Content
  if (res.status === 204) return {} as T;

  // Try JSON; if it fails, return empty object
  try {
    return (await res.json()) as T;
  } catch {
    return {} as T;
  }
}

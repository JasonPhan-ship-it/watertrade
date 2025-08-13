// lib/api.ts

const RAW = (process.env.NEXT_PUBLIC_API_URL || "").trim();
const ORIGIN = RAW.replace(/\/+$/, "").replace(/\/api$/i, "");

function toApiPath(path: string) {
  if (/^https?:\/\//i.test(path)) return path; // absolute URL: use as-is
  const p = path.startsWith("/") ? path : `/${path}`;
  return p.startsWith("/api/") ? p : `/api${p}`;
}

export async function api<T = any>(path: string, init?: RequestInit): Promise<T> {
  const apiPath = toApiPath(path);
  const url = /^https?:\/\//i.test(apiPath) ? apiPath : (ORIGIN ? `${ORIGIN}${apiPath}` : apiPath);

  // DEBUG: see exactly where we’re posting
  if (typeof window !== "undefined") console.log("FETCH", init?.method || "GET", url);

  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error("API error", { url, status: res.status, body: body.slice(0, 300) });
    throw new Error(`API ${res.status}: ${res.statusText}${body ? " - " + body.slice(0, 200) : ""}`);
  }

  if (res.status === 204) return {} as T;
  try { return (await res.json()) as T; } catch { return {} as T; }
}

// lib/api.ts
const BASE = (process.env.NEXT_PUBLIC_BASE_PATH || "").trim().replace(/\/+$/,""); // e.g. "/watertrade" or ""
const RAW_ORIGIN = (process.env.NEXT_PUBLIC_API_URL || "").trim();
const ORIGIN = RAW_ORIGIN.replace(/\/+$/,"").replace(/\/api$/i, "");

function toApiPath(path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  const p = path.startsWith("/") ? path : `/${path}`;
  const apiPath = p.startsWith("/api/") ? p : `/api${p}`;
  return `${BASE}${apiPath}`;
}

export async function api<T = any>(path: string, init?: RequestInit): Promise<T> {
  const apiPath = toApiPath(path);
  const url = /^https?:\/\//i.test(apiPath) ? apiPath : (ORIGIN ? `${ORIGIN}${apiPath}` : apiPath);

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

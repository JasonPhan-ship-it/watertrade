import { NextResponse } from "next/server";
import { extractBalance } from "./extract-balance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CookieJar = Map<string, string>;

type BalanceResponse = {
  balanceText: string | null;
  balanceValue: number | null;
  fetchedAt: string;
};

const LOGIN_URL = "https://cs.westlandswater.org/cacct/login.asp";
const BALANCE_URL = "https://cs.westlandswater.org/CAcct/CatExhaust.asp";
const MAX_REDIRECTS = 10;

function normalizeHeaderKey(key: string): string {
  return key.trim().toLowerCase();
}

function parseSetCookie(headers: Headers, jar: CookieJar) {
  const setCookies = headers.getSetCookie();
  setCookies.forEach((raw) => {
    const [cookie] = raw.split(";");
    const [name, value] = cookie.split("=");
    if (name && value !== undefined) {
      jar.set(name.trim(), value.trim());
    }
  });
}

function buildCookieHeader(jar: CookieJar): string | undefined {
  const cookies = Array.from(jar.entries()).map(([name, value]) => `${name}=${value}`);
  return cookies.length ? cookies.join("; ") : undefined;
}

async function fetchWithCookies(
  url: string,
  jar: CookieJar,
  init: RequestInit = {}
): Promise<Response> {
  let currentUrl = url;
  let redirects = 0;
  let response: Response | null = null;

  while (redirects <= MAX_REDIRECTS) {
    const headers = new Headers(init.headers);
    const cookieHeader = buildCookieHeader(jar);
    if (cookieHeader) {
      headers.set("cookie", cookieHeader);
    }

    response = await fetch(currentUrl, {
      ...init,
      redirect: "manual",
      headers,
    });

    parseSetCookie(response.headers, jar);

    const location = response.headers.get("location");
    if (
      location &&
      response.status >= 300 &&
      response.status < 400 &&
      redirects < MAX_REDIRECTS
    ) {
      redirects += 1;
      const nextUrl = new URL(location, currentUrl);
      currentUrl = nextUrl.toString();
      init = { method: "GET" };
      continue;
    }

    return response;
  }

  throw new Error("Too many redirects while contacting Westlands portal");
}

type InputField = {
  name: string;
  type: string;
  value: string;
};

function extractInputFields(html: string): InputField[] {
  const inputs = Array.from(html.matchAll(/<input[^>]*>/gi));
  return inputs
    .map((match) => match[0])
    .map((tag) => {
      const attributes = Object.fromEntries(
        Array.from(tag.matchAll(/(\w+)=\"([^\"]*)\"/gi)).map(([, key, value]) => [
          normalizeHeaderKey(key),
          value,
        ])
      );

      return {
        name: attributes.name ?? "",
        type: attributes.type ?? "text",
        value: attributes.value ?? "",
      } satisfies InputField;
    })
    .filter((field) => Boolean(field.name));
}

function detectFieldName(fields: InputField[], target: "username" | "password"): string | null {
  const lowerTarget = target === "username" ? ["user", "username", "login", "email"] : [
    "password",
    "pass",
    "pin",
  ];

  const preferredTypes = target === "username" ? ["text", "email", "tel"] : ["password"];

  const firstByType = fields.find((field) => preferredTypes.includes(field.type.toLowerCase()));
  if (firstByType) return firstByType.name;

  const byName = fields.find((field) =>
    lowerTarget.some((key) => normalizeHeaderKey(field.name) === key)
  );
  return byName?.name ?? null;
}

function extractHiddenFields(fields: InputField[]): Record<string, string> {
  return fields
    .filter((field) => field.type.toLowerCase() === "hidden")
    .reduce<Record<string, string>>((acc, field) => {
      acc[field.name] = field.value;
      return acc;
    }, {});
}

async function loginAndFetchBalance(
  username: string,
  password: string
): Promise<BalanceResponse> {
  const jar: CookieJar = new Map();

  const loginPage = await fetchWithCookies(LOGIN_URL, jar, { method: "GET" });
  const loginHtml = await loginPage.text();
  const fields = extractInputFields(loginHtml);
  const hiddenFields = extractHiddenFields(fields);

  const usernameField = detectFieldName(fields, "username");
  const passwordField = detectFieldName(fields, "password");

  if (!usernameField || !passwordField) {
    throw new Error("Unable to locate login form fields for Westlands portal");
  }

  const formBody = new URLSearchParams({
    ...hiddenFields,
    [usernameField]: username,
    [passwordField]: password,
  });

  const loginResponse = await fetchWithCookies(LOGIN_URL, jar, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: formBody.toString(),
  });

  if (loginResponse.status >= 400) {
    throw new Error("Authentication with Westlands portal failed");
  }

  const balanceResponse = await fetchWithCookies(BALANCE_URL, jar, { method: "GET" });
  const balanceHtml = await balanceResponse.text();
  const { text, value } = extractBalance(balanceHtml);

  if (!text) {
    throw new Error("Unable to locate balance figure in account statement");
  }

  return {
    balanceText: text,
    balanceValue: value,
    fetchedAt: new Date().toISOString(),
  };
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const username = typeof body?.username === "string" ? body.username.trim() : "";
    const password = typeof body?.password === "string" ? body.password.trim() : "";

    if (!username || !password) {
      return NextResponse.json(
        { error: "Username and password are required" },
        { status: 400 }
      );
    }

    const balance = await loginAndFetchBalance(username, password);
    return NextResponse.json({ balance });
  } catch (error: any) {
    console.error("[POST /api/integrations/westlands/balance]", error);
    const message = error?.message || "Unable to retrieve Westlands balance";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

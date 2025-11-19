# Westlands callback troubleshooting

Use this checklist if Westlands does not return to the callback URL after login:

1. Always start from the in-app link `/westlands/connect?next=/onboarding?next=/dashboard` (or another encoded `next`). This page builds an **absolute** callback like `https://<your-domain>/westlands/callback?next=...` and applies it to both `ReturnUrl` and `ReturnURL` query parameters expected by the Westlands portal.
2. On the Westlands login page, confirm the address bar still includes the `ReturnUrl` you expect. If Westlands rewrites or strips it, append the full callback URL manually before signing in.
3. Complete the entire Westlands login in the same tab. If the portal opens a new tab or window, copy the `ReturnUrl` to that window so it can redirect back when authentication finishes.
4. If you get stuck on the Westlands site, use the fallback link on `/westlands/connect` to restart the flow—it preserves the callback so the redirect can succeed on the next attempt.

When Westlands sends you back to `/westlands/callback`, the app immediately posts consent and refreshes your balance before redirecting to the `next` path, so a successful return should take you straight back into onboarding or your dashboard.

# CatExhaust scraping helper

This repository includes a Playwright-based helper to load the protected CatExhaust page (`https://cs.westlandswater.org/CAcct/CatExhaust.asp`) after you have authenticated.

## Prerequisites
- Install dependencies: `npm install`
- Save an authenticated storage state (cookies/session) to a file such as `auth_state.json` after logging in once with Playwright. Keep this file secure and out of version control.

## Running the scraper
From the `frontend` directory:

```bash
npm run scrape:catexhaust
```

Optional environment variables:
- `STORAGE_STATE_PATH`: Override the storage state file path (defaults to `auth_state.json`).

The script outputs the full HTML content and attempts to print any table rows found on the page. Adjust selectors in `scripts/fetchCatExhaust.js` if the DOM structure changes.

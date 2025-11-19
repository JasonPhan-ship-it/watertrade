import fs from "fs";
import { chromium } from "playwright";

const TARGET_URL = "https://cs.westlandswater.org/CAcct/CatExhaust.asp";
const storageStatePath = process.env.STORAGE_STATE_PATH || "auth_state.json";

async function run() {
  if (!fs.existsSync(storageStatePath)) {
    console.error(
      `Missing storage state at "${storageStatePath}". Log in once with Playwright and save the state file before scraping.`
    );
    process.exitCode = 1;
    return;
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: storageStatePath });
  const page = await context.newPage();

  const response = await page.goto(TARGET_URL, { waitUntil: "networkidle" });
  if (!response || !response.ok()) {
    const status = response ? `${response.status()} ${response.statusText()}` : "no response";
    console.error(`Failed to load target page (${TARGET_URL}): ${status}`);
    await browser.close();
    process.exitCode = 1;
    return;
  }

  const html = await page.content();
  console.log("\nFull page content:\n");
  console.log(html);

  const tableRows = await page.locator("table tr").all();
  if (tableRows.length === 0) {
    console.warn("No table rows found on the page.");
  } else {
    console.log("\nExtracted table rows:\n");
    for (const [index, row] of tableRows.entries()) {
      const cells = await row.locator("th, td").allInnerTexts();
      console.log(`Row ${index}: ${cells.join(" | ")}`);
    }
  }

  await browser.close();
}

run().catch((error) => {
  console.error("Unexpected error while scraping CatExhaust:", error);
  process.exitCode = 1;
});

// Runs tests/logic.test.html in headless Chromium at phone size and fails unless it reports PASS.
import { chromium } from "playwright";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
await page.goto("http://127.0.0.1:8000/tests/logic.test.html");
await page.waitForFunction(() => window.__result, null, { timeout: 60000 });
const result = await page.evaluate(() => window.__result);
console.log(result);
await browser.close();
process.exit(result === "PASS" ? 0 : 1);

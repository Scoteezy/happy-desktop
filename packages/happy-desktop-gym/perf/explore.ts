// One-off: drive the perf web host in a persistent profile, clicking the named buttons in order,
// then screenshot and print the accessibility tree. PERF_CLICKS="Go Happy|Skip".
import { chromium } from "playwright";

const url = process.env.PERF_URL ?? "http://127.0.0.1:5199/";
const out = process.env.PERF_OUT ?? ".";
const context = await chromium.launchPersistentContext(process.env.PERF_PROFILE ?? `${out}/profile`, {
    viewport: { height: 1000, width: 1600 },
});
const page = context.pages()[0] ?? (await context.newPage());
page.on("console", (message) => {
    if (message.type() === "error") console.log("console error:", message.text().slice(0, 300));
});
await page.goto(url);
await page.waitForTimeout(4000);
for (const name of (process.env.PERF_CLICKS ?? "").split("|").filter(Boolean)) {
    await page.getByRole("button", { name, exact: false }).first().click({ timeout: 10_000 });
    await page.waitForTimeout(2500);
}
await page.waitForTimeout(Number(process.env.PERF_WAIT ?? "2000"));
await page.screenshot({ path: `${out}/explore.png` });
console.log((await page.locator("body").ariaSnapshot()).slice(0, Number(process.env.PERF_CHARS ?? "8000")));
await context.close();

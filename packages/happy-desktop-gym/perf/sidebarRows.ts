/**
 * Prints the session rows the sidebar shows on first load, with the size of each one's newest
 * history page, so a gym pass can pick real rows a reader can click without expanding anything.
 *
 * Env: PERF_SCRATCH, PERF_PROFILE (a browser profile to copy), PERF_SOCKET, PERF_TOKEN.
 */
import { cp, readFile, rm } from "node:fs/promises";
import { request } from "node:http";
import { join } from "node:path";
import { chromium } from "playwright";

const scratch = process.env.PERF_SCRATCH!;
const profileDir = join(scratch, "chromium-rows");
await rm(profileDir, { force: true, recursive: true });
await cp(process.env.PERF_PROFILE!, profileDir, { recursive: true });
const context = await chromium.launchPersistentContext(profileDir, { viewport: { height: 1000, width: 1600 } });
const page = context.pages()[0] ?? (await context.newPage());
await page.goto("http://127.0.0.1:5199/");
await page.waitForTimeout(6000);
const rows = await page.evaluate(() =>
    [...document.querySelectorAll('[data-happy-desktop-ui="sidebar"] button')]
        .map((button) => ({ href: button.closest("a")?.getAttribute("href") ?? "", text: button.textContent?.trim() ?? "" }))
        .filter((row) => row.text.length > 0),
);
await context.close();
const token = (await readFile(process.env.PERF_TOKEN!, "utf8")).trim();
const pageBytes = (agentId: string) =>
    new Promise<number>((resolve) => {
        const req = request(
            { headers: { authorization: `Bearer ${token}` }, path: `/v0/agents/${agentId}/messages?limit=100`, socketPath: process.env.PERF_SOCKET! },
            (res) => {
                let bytes = 0;
                res.on("data", (chunk: Buffer) => (bytes += chunk.length));
                res.on("end", () => resolve(res.statusCode === 200 ? bytes : -1));
            },
        );
        req.on("error", () => resolve(-1));
        req.end();
    });
for (const row of rows) {
    const agentId = /\/([a-z0-9]{24})$/.exec(row.href)?.[1];
    console.log(`${agentId === undefined ? "-" : String(Math.round((await pageBytes(agentId)) / 1024)) + "KB"}\t${row.text.slice(0, 70)}`);
}

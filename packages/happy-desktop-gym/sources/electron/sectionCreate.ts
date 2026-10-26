import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright";

import { gymElectronVideoRecord } from "./launch.js";
import type { GymHappyAgentClient } from "./happyAgentProtocol.js";

/*
 * An open section heading offers new work right under it. The person points at
 * the heading, its `+` shows, and a click makes new work: its row stands
 * right under the heading and its chat is on screen at once, the daemon writes
 * it there too, and no row above the heading moves.
 */

const ROWS = '[data-happy-desktop-ui="sidebar-item"]';
const PLUS = '[data-happy-desktop-ui="sidebar-item-action"]';

export interface SectionCreateResult {
    readonly sectionId: string;
    readonly spaceId: string;
    readonly agentId: string;
    /** The plus's opacity at rest and while the heading is pointed at. */
    readonly plusOpacity: { readonly rest: string; readonly hover: string };
    readonly video: string;
}

async function until<T>(read: () => Promise<T | undefined>, what: string): Promise<T> {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
        const value = await read();
        if (value !== undefined) return value;
        await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error(`Timed out waiting for ${what}.`);
}

/** Every drawn row's ID and top edge, in order. */
async function rowsRead(page: Page): Promise<{ readonly id: string; readonly top: number }[]> {
    return page.evaluate(
        (rows) =>
            [...document.querySelectorAll<HTMLElement>(rows)].map((node) => ({
                id: node.dataset.itemId ?? "",
                top: node.getBoundingClientRect().top,
            })),
        ROWS,
    );
}

export async function sectionCreateRun(
    page: Page,
    client: GymHappyAgentClient,
    artifacts: string,
): Promise<SectionCreateResult> {
    const heading = page.locator(`${ROWS}[data-kind="section"]:not([data-collapsed])`).last();
    await heading.waitFor({ state: "visible", timeout: 30_000 });
    const section = await heading.getAttribute("data-item-id");
    if (!section) throw new Error("The sidebar shows no open section.");
    const sectionId = section.slice("section:".length);
    const plus = heading.locator(PLUS);
    await page.mouse.move(0, 0);
    await page.waitForTimeout(400);

    const videoPath = join(artifacts, "section-create.webm");
    const video = await gymElectronVideoRecord(page, { path: videoPath, scale: 2 });
    try {
        await page.waitForTimeout(600);
        const rest = await plus.evaluate((node) => getComputedStyle(node).opacity);
        await heading.hover();
        await page.waitForTimeout(400);
        const hover = await plus.evaluate((node) => getComputedStyle(node).opacity);
        if (rest !== "0" || hover !== "1")
            throw new Error(`The heading's + is ${rest} at rest and ${hover} on hover.`);
        const before = await rowsRead(page);
        const at = before.findIndex((entry) => entry.id === section);
        await plus.click();
        // In the click: the new row stands right under the heading.
        const after = await rowsRead(page);
        const made = after[after.findIndex((entry) => entry.id === section) + 1]?.id ?? "";
        if (!made.startsWith("space:") || before.some((entry) => entry.id === made))
            throw new Error(`The row under ${section} is ${made}, not new work.`);
        for (const entry of before.slice(0, at + 1)) {
            const now = after.find((candidate) => candidate.id === entry.id);
            if (now === undefined || Math.abs(now.top - entry.top) > 0.5)
                throw new Error(`${entry.id} moved when new work was made under ${section}.`);
        }
        const spaceId = made.slice("space:".length);
        // The daemon writes it under the same heading.
        await until(async () => {
            const html = (await client.spaceSidebar()).html;
            const heading = html.indexOf(`<happy-section id="${sectionId}"`);
            const next = html.indexOf("<happy-", heading + 1);
            return heading >= 0 && html.startsWith(`<happy-space id="${spaceId}"`, next)
                ? true
                : undefined;
        }, "the daemon to write the new work under the heading");
        const space = (await client.spaceSidebar()).spaces.find((entry) => entry.id === spaceId);
        const agentId = space?.target.agentId ?? "";
        const tab = page.locator('[data-happy-desktop-ui="tab"][aria-selected="true"]').first();
        await until(
            async () => ((await tab.getAttribute("data-tab-id")) === agentId ? true : undefined),
            "the new work's chat to be on screen",
        );
        await page.waitForTimeout(1_200);
        await page.screenshot({ path: join(artifacts, "section-create.png") });
        const result: SectionCreateResult = {
            sectionId,
            spaceId,
            agentId,
            plusOpacity: { rest, hover },
            video: videoPath,
        };
        await writeFile(join(artifacts, "section-create.json"), JSON.stringify(result, null, 2));
        return result;
    } finally {
        await video.stop();
    }
}

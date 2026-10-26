import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright";

import { GYM_STOP_SHIMMER_PROMPT } from "./inferenceServer.js";
import { gymElectronVideoRecord } from "./launch.js";
import type { GymHappyAgentClient } from "./happyAgentProtocol.js";

/*
 * The transcript's jump-to-latest button shimmers while the agent works. The
 * person scrolls up through a long conversation during a slow turn: the button
 * that offers the way back sweeps the same shimmer as every other in-progress
 * label. Stop ends the turn and the plain arrow returns, on the same pixels.
 */

const STOP = 'button[aria-label="Stop the agent"]';
const JUMP = '.happy-message-list__jump:not([hidden]) button[aria-label="Jump to latest"]';
const VIEWPORT = ".happy-message-list__viewport";

export interface JumpShimmerState {
    readonly shimmer: boolean;
    /** The arrow's box, to prove turning the shimmer on and off moves nothing. */
    readonly arrow: {
        readonly x: number;
        readonly y: number;
        readonly width: number;
        readonly height: number;
    } | null;
}

export interface JumpShimmerResult {
    readonly working: JumpShimmerState;
    readonly idle: JumpShimmerState;
    readonly video: string;
}

function jumpRead(page: Page): Promise<JumpShimmerState> {
    return page.evaluate((selector) => {
        const button = document.querySelector<HTMLElement>(selector);
        const arrow = button?.querySelector<HTMLElement>(".happy-icon")?.getBoundingClientRect();
        return {
            shimmer: button?.querySelector(".happy-shimmer-text") != null,
            arrow: arrow
                ? { x: arrow.x, y: arrow.y, width: arrow.width, height: arrow.height }
                : null,
        };
    }, JUMP);
}

export async function jumpShimmerRun(
    page: Page,
    client: GymHappyAgentClient,
    options: { readonly artifacts: string; readonly sessionId: string },
): Promise<JumpShimmerResult> {
    const videoPath = join(options.artifacts, "jump-shimmer.webm");
    const video = await gymElectronVideoRecord(page, { path: videoPath, scale: 2 });
    try {
        await client.sendMessage(options.sessionId, `${GYM_STOP_SHIMMER_PROMPT}-${Date.now()}`);
        const stop = page.locator(`${STOP}:visible`).first();
        await stop.waitFor({ state: "visible", timeout: 30_000 });
        await page.waitForTimeout(1_500);

        // Away from the newest row, the way a person scrolls back to reread.
        const viewport = await page.locator(`${VIEWPORT}:visible`).first().boundingBox();
        if (!viewport) throw new Error("The transcript is not on screen.");
        await page.mouse.move(viewport.x + viewport.width / 2, viewport.y + viewport.height / 2);
        await page.mouse.wheel(0, -1_600);
        await page.locator(JUMP).waitFor({ state: "visible", timeout: 10_000 });
        await page.waitForTimeout(3_500);
        const working = await jumpRead(page);
        await page.screenshot({ path: join(options.artifacts, "jump-shimmer-working.png") });
        if (!working.shimmer) throw new Error("The jump button is plain while the agent works.");

        await stop.click();
        await page.waitForFunction(
            (selector) => {
                const button = document.querySelector(selector);
                return button !== null && button.querySelector(".happy-shimmer-text") === null;
            },
            JUMP,
            { timeout: 5_000 },
        );
        await page.waitForTimeout(2_500);
        const idle = await jumpRead(page);
        await page.screenshot({ path: join(options.artifacts, "jump-shimmer-idle.png") });
        if (idle.shimmer) throw new Error("The jump button still shimmers after Stop.");
        if (!working.arrow || !idle.arrow) throw new Error("The jump button lost its arrow.");
        if (JSON.stringify(idle.arrow) !== JSON.stringify(working.arrow))
            throw new Error(
                `The arrow moved: ${JSON.stringify(working.arrow)} → ${JSON.stringify(idle.arrow)}.`,
            );

        await page.locator(JUMP).click();
        await page.waitForTimeout(1_500);

        const result: JumpShimmerResult = { working, idle, video: videoPath };
        await writeFile(
            join(options.artifacts, "jump-shimmer.json"),
            JSON.stringify(result, null, 2),
        );
        return result;
    } finally {
        await video.stop();
    }
}

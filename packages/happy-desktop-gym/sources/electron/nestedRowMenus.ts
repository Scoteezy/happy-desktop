import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright";

import { GYM_STOP_SHIMMER_PARENT_PROMPT } from "./inferenceServer.js";
import { gymElectronVideoRecord } from "./launch.js";
import type { GymHappyAgentClient } from "./happyAgentProtocol.js";

/*
 * A row nested under another offers what that row holds. The person makes
 * work that hands its turn to a subtask, and a second piece of work carried
 * under the first. Then, from right-click menus only, they rename the
 * attached work in place, archive the subtask, and delete a section's heading.
 * The daemon has to agree with each act.
 */

const ROWS = '[data-happy-desktop-ui="sidebar-item"]';
const COMPOSER = '[data-happy-desktop-ui="composer-textarea"]';
/** Opens new work that answers at once and names nothing else. */
const CHILD_PROMPT = "Nested child. gym-nested-row-menus";
const RENAMED = "Renamed nested child";

export interface NestedRowMenusResult {
    readonly parentAgentId: string;
    readonly subtaskId: string;
    readonly childSpaceId: string;
    readonly menus: Readonly<Record<string, readonly string[]>>;
    readonly renamedTo: string;
    readonly subtaskArchived: boolean;
    readonly sectionDeleted: string;
    readonly video: string;
}

const row = (page: Page, id: string) => page.locator(`${ROWS}[data-item-id="${id}"]`).first();

async function selectedAgentId(page: Page): Promise<string> {
    const tab = page.locator('[data-happy-desktop-ui="tab"][aria-selected="true"]').first();
    await tab.waitFor({ state: "attached", timeout: 30_000 });
    const id = await tab.getAttribute("data-tab-id");
    if (!id) throw new Error("The selected tab names no conversation.");
    return id;
}

async function workCreate(page: Page, prompt: string): Promise<string> {
    await row(page, "create").click();
    const composer = page.locator(`${COMPOSER}:visible`).first();
    await composer.waitFor({ state: "visible", timeout: 30_000 });
    await composer.fill(`${prompt}-${Date.now()}`);
    await composer.press("Enter");
    return selectedAgentId(page);
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

/** Right-clicks a row and reads the menu it opens. */
async function menuOpen(page: Page, id: string): Promise<string[]> {
    await row(page, id).click({ button: "right" });
    const menu = page.getByRole("menu");
    await menu.waitFor({ state: "visible", timeout: 10_000 });
    return (await menu.getByRole("menuitem").allTextContents()).map((label) =>
        label.replace(/\p{Co}/gu, "").trim(),
    );
}

export async function nestedRowMenusRun(
    page: Page,
    client: GymHappyAgentClient,
    artifacts: string,
): Promise<NestedRowMenusResult> {
    const parentAgentId = await workCreate(page, GYM_STOP_SHIMMER_PARENT_PROMPT);
    const subtaskId = await until(
        async () => (await client.subtaskIds(parentAgentId))[0],
        "the work's subtask",
    );
    const childAgentId = await workCreate(page, CHILD_PROMPT);
    const spaceOf = async (agentId: string) =>
        (await client.spaceSidebar()).spaces.find((space) => space.target.agentId === agentId);
    const parentSpace = await until(() => spaceOf(parentAgentId), "the work's row");
    const childSpace = await until(() => spaceOf(childAgentId), "the second work's row");
    if (childSpace.target.kind !== "task")
        throw new Error(`New work is a ${childSpace.target.kind}, not a task.`);
    await client.spaceAttach(childSpace.id, parentSpace.id);
    const subtaskRow = row(page, `session:${subtaskId}`);
    const shown = await subtaskRow.waitFor({ state: "visible", timeout: 5_000 }).then(
        () => true,
        () => false,
    );
    if (!shown) {
        await row(page, `space:${parentSpace.id}`).click({ button: "right" });
        await page.getByRole("menuitem", { name: "Show subtasks" }).click();
        await subtaskRow.waitFor({ state: "visible", timeout: 30_000 });
    }
    const childRow = row(page, `space:${childSpace.id}`);
    await page.waitForFunction(
        (selector) => document.querySelector<HTMLElement>(selector)?.dataset.depth === "1",
        `${ROWS}[data-item-id="space:${childSpace.id}"]`,
        { timeout: 30_000 },
    );
    await page.mouse.move(0, 0);
    await page.waitForTimeout(500);

    const videoPath = join(artifacts, "nested-row-menus.webm");
    const video = await gymElectronVideoRecord(page, { path: videoPath, scale: 2 });
    const menus: Record<string, string[]> = {};
    try {
        await page.waitForTimeout(600);
        // Rename the attached work in place, from its own menu.
        menus.child = await menuOpen(page, `space:${childSpace.id}`);
        await page.waitForTimeout(500);
        await page.getByRole("menuitem", { name: "Rename task" }).click();
        const editor = childRow.locator('[contenteditable="plaintext-only"]');
        await editor.waitFor({ state: "visible", timeout: 10_000 });
        await page.keyboard.press(process.platform === "darwin" ? "Meta+A" : "Control+A");
        await page.keyboard.type(RENAMED, { delay: 25 });
        await page.keyboard.press("Enter");
        await until(
            async () =>
                (await client.taskName(childSpace.target.id)) === RENAMED ? true : undefined,
            "the daemon to take the new name",
        );
        if (!(await childRow.textContent())?.includes(RENAMED))
            throw new Error("The nested row does not wear its new name.");
        await page.waitForTimeout(800);

        // Archive the subtask from its own menu.
        menus.subtask = await menuOpen(page, `session:${subtaskId}`);
        await page.waitForTimeout(500);
        await page.getByRole("menuitem", { name: "Archive subtask" }).click();
        await until(
            async () => ((await client.agentArchived(subtaskId)) ? true : undefined),
            "the daemon to archive the subtask",
        );
        await subtaskRow.waitFor({ state: "detached", timeout: 30_000 });
        await page.waitForTimeout(800);

        // Delete a section's heading; its rows stay where they stand.
        const section = await page
            .locator(`${ROWS}[data-item-id^="section:"]`)
            .first()
            .getAttribute("data-item-id");
        if (!section) throw new Error("The sidebar shows no section.");
        menus.section = await menuOpen(page, section);
        await page.waitForTimeout(500);
        await page.getByRole("menuitem", { name: "Delete section" }).click();
        await row(page, section).waitFor({ state: "detached", timeout: 10_000 });
        const sectionId = section.slice("section:".length);
        await until(
            async () =>
                (await client.spaceSidebar()).html.includes(`id="${sectionId}"`) ? undefined : true,
            "the daemon to drop the heading",
        );
        await page.waitForTimeout(1_200);
        await page.screenshot({ path: join(artifacts, "nested-row-menus.png") });
        const result: NestedRowMenusResult = {
            parentAgentId,
            subtaskId,
            childSpaceId: childSpace.id,
            menus,
            renamedTo: RENAMED,
            subtaskArchived: true,
            sectionDeleted: sectionId,
            video: videoPath,
        };
        await writeFile(join(artifacts, "nested-row-menus.json"), JSON.stringify(result, null, 2));
        return result;
    } finally {
        await video.stop();
    }
}

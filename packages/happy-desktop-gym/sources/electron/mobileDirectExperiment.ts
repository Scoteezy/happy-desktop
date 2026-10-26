import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Page } from "playwright";

import { gymElectronVideoRecord } from "./launch.js";

/*
 * Pairing a phone directly is an experiment. Mobile Access's pairing page
 * shows a Relay | Direct control, on Relay for every installation that has
 * not chosen Direct: the relay's code alone, and no Direct connection
 * section. Choosing Direct swaps in the direct code in the same place and
 * turns on Settings › Experimental's "Direct phone connection"; turning that
 * off brings the page back to Relay.
 */

const ROWS = '[data-happy-desktop-ui="sidebar-item"]';
const SLOTS = '[data-happy-desktop-ui="mobile-pairing-options-slot"]';
const CONTROL = '[data-testid="mobile-pairing-method"]';
const SLOTS_BOX = ".happy-mobile-pairing-options__slots";
const SWITCH_LABEL = "Direct phone connection";

export interface MobileDirectExperimentState {
    /** The method the Relay | Direct control shows as chosen. */
    readonly method: string;
    /** Pairing methods the page shows, in order. */
    readonly slots: readonly string[];
    /** Where the control and the code sit, to prove a switch moves nothing. */
    readonly controlTop: number;
    readonly slotsTop: number;
}

export interface MobileDirectExperimentResult {
    /** Mobile Access before anything is chosen, then after choosing Direct on the page. */
    readonly relay: MobileDirectExperimentState;
    readonly direct: MobileDirectExperimentState;
    /** Whether Mobile Access has its Direct connection section, off and then on. */
    readonly directSectionOff: boolean;
    readonly directSectionOn: boolean;
    /** The Experimental switch after Direct was chosen on the page. */
    readonly switchAfterDirect: boolean;
    /** The page's method after the switch was turned off again. */
    readonly methodAfterSwitchOff: string;
    readonly video: string;
}

async function categoryOpen(page: Page, id: string): Promise<void> {
    await page.locator(`${ROWS}[data-item-id="${id}"]`).first().click();
    await page.waitForTimeout(400);
}

function directSection(page: Page): Promise<boolean> {
    return page
        .locator('[data-happy-desktop-ui="mobile-direct-section"]')
        .count()
        .then((count) => count > 0);
}

/** Opens Connect phone up to its pairing page. */
async function pairingOpen(page: Page): Promise<void> {
    await page.getByRole("button", { name: "Connect phone" }).click();
    // The local desktop first walks through getting the app.
    const downloaded = page.getByRole("button", { name: "Downloaded and opened" });
    if (await downloaded.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await page.waitForTimeout(600);
        await downloaded.click();
    }
    await page.locator(CONTROL).waitFor({ state: "visible", timeout: 30_000 });
    await page.waitForTimeout(1_200);
}

/** Leaves the pairing page as the person would. */
async function pairingLeave(page: Page): Promise<void> {
    const skip = page.getByRole("button", { name: "Skip mobile setup" });
    if (await skip.isVisible().catch(() => false)) await skip.click();
    else await page.getByRole("button", { name: "Close" }).first().click();
    await page.waitForTimeout(600);
}

async function pageRead(page: Page): Promise<MobileDirectExperimentState> {
    const method =
        (await page.locator(`${CONTROL} [aria-pressed="true"]`).getAttribute("data-value")) ?? "";
    const slots = await page
        .locator(SLOTS)
        .evaluateAll((nodes) => nodes.map((node) => (node as HTMLElement).dataset.method ?? ""));
    const controlTop = (await page.locator(CONTROL).boundingBox())?.y ?? -1;
    const slotsTop = (await page.locator(SLOTS_BOX).boundingBox())?.y ?? -1;
    return { method, slots, controlTop, slotsTop };
}

export async function mobileDirectExperimentRun(
    page: Page,
    artifacts: string,
): Promise<MobileDirectExperimentResult> {
    const videoPath = join(artifacts, "mobile-direct-experiment.webm");
    const video = await gymElectronVideoRecord(page, { path: videoPath, scale: 2 });
    try {
        await page.waitForTimeout(500);
        await page
            .locator('[data-happy-desktop-ui="sidebar-footer"]')
            .getByRole("button", { name: "Settings", exact: true })
            .click();
        await page.locator(`${ROWS}[data-item-id="mobile-access"]`).first().waitFor({
            state: "visible",
            timeout: 30_000,
        });

        // Nothing chosen yet: Relay, its code alone, no direct section.
        await categoryOpen(page, "mobile-access");
        const directSectionOff = await directSection(page);
        await pairingOpen(page);
        const relay = await pageRead(page);
        await page.screenshot({ path: join(artifacts, "mobile-pairing-relay.png") });
        if (directSectionOff || relay.method !== "relay" || relay.slots.join() !== "relay")
            throw new Error(`Before choosing, Mobile Access showed ${JSON.stringify(relay)}.`);

        // Choosing Direct swaps the code in place.
        await page.locator(`${CONTROL} [data-value="direct"]`).click();
        await page.locator(`${SLOTS}[data-method="direct"]`).waitFor({ timeout: 10_000 });
        await page.waitForTimeout(1_500);
        const direct = await pageRead(page);
        await page.screenshot({ path: join(artifacts, "mobile-pairing-direct.png") });
        if (direct.method !== "direct" || direct.slots.join() !== "direct")
            throw new Error(`After choosing Direct the page showed ${JSON.stringify(direct)}.`);
        if (direct.controlTop !== relay.controlTop || direct.slotsTop !== relay.slotsTop)
            throw new Error(
                `Switching moved the page: ${JSON.stringify(relay)} → ${JSON.stringify(direct)}.`,
            );
        await pairingLeave(page);

        // It is the same choice as the Experimental switch.
        await categoryOpen(page, "experimental");
        const toggle = page.getByRole("switch", { name: SWITCH_LABEL });
        await toggle.waitFor({ state: "visible", timeout: 10_000 });
        const switchAfterDirect = (await toggle.getAttribute("aria-checked")) === "true";
        if (!switchAfterDirect) throw new Error("Choosing Direct left the experiment off.");

        await categoryOpen(page, "mobile-access");
        const directSectionOn = await directSection(page);
        if (!directSectionOn) throw new Error("Direct on, but no Direct connection section.");

        // Turning the experiment off brings the page back to Relay.
        await categoryOpen(page, "experimental");
        await page.waitForTimeout(400);
        await toggle.click();
        await page.waitForTimeout(800);
        await categoryOpen(page, "mobile-access");
        await pairingOpen(page);
        const afterOff = await pageRead(page);
        await pairingLeave(page);
        if (afterOff.method !== "relay" || (await directSection(page)))
            throw new Error(`After turning it off the page showed ${JSON.stringify(afterOff)}.`);

        const result: MobileDirectExperimentResult = {
            relay,
            direct,
            directSectionOff,
            directSectionOn,
            switchAfterDirect,
            methodAfterSwitchOff: afterOff.method,
            video: videoPath,
        };
        await writeFile(
            join(artifacts, "mobile-direct-experiment.json"),
            JSON.stringify(result, null, 2),
        );
        return result;
    } finally {
        await video.stop();
    }
}

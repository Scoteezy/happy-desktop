import { join } from "node:path";
import type { ElectronApplication, Page } from "playwright";

/*
 * The window's own controls at every zoom, in the real app. macOS draws its
 * traffic lights at fixed window points (three 14pt buttons from x=14, ending
 * at x=68) and they do not zoom with the page, so the sidebar toggle beside
 * them must start at the same window point, 16pt past them, whatever the zoom —
 * reached as the View menu reaches it, and kept across a reload (a renderer
 * update or ⌘R), which keeps the zoom but not the menu's report of it. The
 * sweep covers the sidebar open and folded, and full screen, where the lights
 * are gone and nothing is held for them.
 *
 * At each step every control in the title band with a keyboard shortcut is
 * hovered, and what it reveals must hang under that control, inside the window.
 *
 * Full screen is the app's own window-state report, sent the way the main
 * process sends it: a hidden window must never really go full screen.
 */

const LIGHTS_END_PT = 68;
const LIGHTS_CLEARANCE_PT = 16;
const BAND = 56;

export interface WindowZoomOptions {
    readonly zooms: readonly number[];
    readonly artifacts: string;
}

export interface WindowZoomStep {
    readonly zoom: number;
    readonly via: "menu" | "reload";
    readonly collapsed: boolean;
    readonly fullScreen: boolean;
    readonly toggleLeftPt: number | null;
    readonly hints: readonly {
        readonly control: string;
        readonly offsetX: number;
        readonly gapY: number;
    }[];
    readonly problems: readonly string[];
}

export interface WindowZoomResult {
    readonly steps: readonly WindowZoomStep[];
    readonly problems: readonly string[];
}

const SHELL = '[data-happy-desktop-ui="app-shell"]';
const TOGGLE = ".happy-desktop-app-shell__sidebar-toggle";

/** A control with a chord: a floating hint, a declared shortcut, or a tooltip naming one. */
const CONTROLS = JSON.stringify(
    "[data-shortcut-hint], [aria-keyshortcuts], .happy-tooltip:has(.happy-tooltip__shortcut) > :first-child",
);

/** Sent as source: the TypeScript loader names nested functions with a helper the page lacks. */
const CONTROLS_READ = `(() => {
    const CONTROLS = ${CONTROLS};
    const band = ${String(BAND)};
    return [...document.querySelectorAll(CONTROLS)]
        .filter((node) => {
            const box = node.getBoundingClientRect();
            return box.width > 0 && box.bottom <= band && getComputedStyle(node).visibility !== "hidden";
        })
        .map((node) => node.getAttribute("aria-label") || node.getAttribute("data-happy-desktop-ui") || node.className);
})()`;

const HINT_READ = (label: string) => `(() => {
    const CONTROLS = ${CONTROLS};
    const control = [...document.querySelectorAll(CONTROLS)]
        .find((node) => (node.getAttribute("aria-label") || node.getAttribute("data-happy-desktop-ui") || node.className) === ${JSON.stringify(label)});
    if (!control) return null;
    const box = control.getBoundingClientRect();
    const shown = [...document.querySelectorAll(".happy-shortcut-hint--floating, .happy-tooltip__bubble")]
        .filter((node) => {
            const style = getComputedStyle(node);
            return style.visibility !== "hidden" && Number(style.opacity) > 0.9;
        })
        .map((node) => node.getBoundingClientRect());
    return {
        control: [box.left, box.top, box.width, box.height],
        shown: shown.map((hint) => [hint.left, hint.top, hint.width, hint.height]),
    };
})()`;

async function zoomSet(app: ElectronApplication, zoom: number): Promise<void> {
    await app.evaluate(({ BrowserWindow }, factor) => {
        const contents = BrowserWindow.getAllWindows()[0]!.webContents;
        contents.zoomFactor = factor;
        contents.send("happy:zoom:changed", Math.round(contents.zoomFactor * 100));
    }, zoom);
}

async function fullScreenReport(app: ElectronApplication, fullScreen: boolean): Promise<void> {
    await app.evaluate(({ BrowserWindow }, value) => {
        BrowserWindow.getAllWindows()[0]!.webContents.send("happy:window-state:changed", {
            fullScreen: value,
        });
    }, fullScreen);
}

async function shellReady(page: Page): Promise<void> {
    await page.locator(TOGGLE).first().waitFor({ timeout: 45_000 });
    await page.waitForTimeout(800);
}

export async function windowZoomRun(
    page: Page,
    app: ElectronApplication,
    options: WindowZoomOptions,
): Promise<WindowZoomResult> {
    const steps: WindowZoomStep[] = [];
    await shellReady(page);
    for (const fullScreen of [false, true]) {
        for (const collapsed of [false, true]) {
            for (const zoom of options.zooms) {
                for (const via of ["menu", "reload"] as const) {
                    await zoomSet(app, zoom);
                    if (via === "reload") {
                        await page.reload();
                        await shellReady(page);
                    }
                    await fullScreenReport(app, fullScreen);
                    await page.waitForTimeout(300);
                    const folded = await page.locator(`${SHELL}[data-sidebar-collapsed]`).count();
                    if (folded > 0 !== collapsed) {
                        await page.locator(TOGGLE).first().click();
                        await page.waitForTimeout(300);
                    }
                    const problems: string[] = [];
                    const name = `${fullScreen ? "full-screen" : "window"} ${collapsed ? "folded" : "open"} ${String(Math.round(zoom * 100))}% via ${via}`;
                    const factor = await app.evaluate(
                        ({ BrowserWindow }) =>
                            BrowserWindow.getAllWindows()[0]!.webContents.zoomFactor,
                    );
                    const lights =
                        (await page.locator(`${SHELL}[data-window-traffic-lights]`).count()) > 0;
                    if (lights === fullScreen)
                        problems.push(
                            `traffic lights ${lights ? "held" : "not held"} ${fullScreen ? "in full screen" : "in a window"}`,
                        );
                    const toggle = await page.locator(TOGGLE).first().boundingBox();
                    const toggleLeftPt = toggle ? Math.round(toggle.x * factor * 10) / 10 : null;
                    if (toggleLeftPt === null) problems.push("no sidebar toggle");
                    else if (
                        !fullScreen &&
                        Math.abs(toggleLeftPt - (LIGHTS_END_PT + LIGHTS_CLEARANCE_PT)) > 0.5
                    )
                        problems.push(
                            `the toggle starts at ${String(toggleLeftPt)}pt, not ${String(LIGHTS_END_PT + LIGHTS_CLEARANCE_PT)}pt past the window edge` +
                                (toggleLeftPt < LIGHTS_END_PT ? " (over the traffic lights)" : ""),
                        );
                    await page.screenshot({
                        path: join(
                            options.artifacts,
                            `window-zoom-${name.replaceAll(/[^a-z0-9]+/giu, "-")}.png`,
                        ),
                        clip: { x: 0, y: 0, width: 560 / factor, height: 120 / factor },
                    });
                    const hints: { control: string; offsetX: number; gapY: number }[] = [];
                    const viewport = (await page.evaluate("window.innerWidth")) as number;
                    for (const control of (await page.evaluate(CONTROLS_READ)) as string[]) {
                        const before = (await page.evaluate(HINT_READ(control))) as {
                            control: number[];
                        } | null;
                        if (!before) continue;
                        const [left, top, width, height] = before.control as [
                            number,
                            number,
                            number,
                            number,
                        ];
                        await page.mouse.move(left + width / 2, top + height / 2);
                        await page.waitForTimeout(800);
                        const read = (await page.evaluate(HINT_READ(control))) as {
                            shown: [number, number, number, number][];
                        } | null;
                        const hint = read?.shown[0];
                        if (!hint) {
                            problems.push(`${control}: hovering it shows no shortcut`);
                        } else {
                            const offsetX =
                                Math.round((hint[0] + hint[2] / 2 - (left + width / 2)) * 10) / 10;
                            const gapY = Math.round((hint[1] - (top + height)) * 10) / 10;
                            hints.push({ control, offsetX, gapY });
                            if (hint[0] > left + width / 2 || hint[0] + hint[2] < left + width / 2)
                                problems.push(
                                    `${control}: its shortcut sits ${String(offsetX)}px away, not under it`,
                                );
                            if (hint[0] < 0 || hint[0] + hint[2] > viewport)
                                problems.push(`${control}: its shortcut runs off the window`);
                            if (gapY < 0 || gapY > 8)
                                problems.push(
                                    `${control}: its shortcut sits ${String(gapY)}px below it`,
                                );
                        }
                        await page.screenshot({
                            path: join(
                                options.artifacts,
                                `window-zoom-hover-${name.replaceAll(/[^a-z0-9]+/giu, "-")}.png`,
                            ),
                            clip: { x: 0, y: 0, width: 560 / factor, height: 120 / factor },
                        });
                        await page.mouse.move(700 / factor, 500 / factor);
                        await page.waitForTimeout(200);
                    }
                    steps.push({ zoom, via, collapsed, fullScreen, toggleLeftPt, hints, problems });
                }
            }
        }
    }
    await zoomSet(app, 1);
    await fullScreenReport(app, false);
    return {
        steps,
        problems: steps.flatMap((step) =>
            step.problems.map(
                (problem) =>
                    `${step.fullScreen ? "full screen" : "window"}, ${step.collapsed ? "folded" : "open"}, ${String(Math.round(step.zoom * 100))}% via ${step.via}: ${problem}`,
            ),
        ),
    };
}

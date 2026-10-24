import { stat } from "node:fs/promises";
import { join } from "node:path";
import type { ElectronApplication, Page } from "playwright";

import {
    gymElectronInvisibleAssert,
    gymElectronVideoRecord,
    type GymElectronVideo,
} from "./launch.js";
import {
    windowServerReportAssert,
    windowServerWatchStart,
    type WindowServerReport,
} from "./windowServer.js";

interface MainInvisibilitySamples {
    samples: number;
    visible: number;
    focused: number;
    dock: number;
}

type MainInvisibilityGlobal = typeof globalThis & {
    __happyDesktopGymInvisibility?: {
        samples: MainInvisibilitySamples;
        timer: ReturnType<typeof setInterval>;
    };
};

/**
 * Proves the hidden-window contract on the real app with a seeded session
 * open: the window is never visible, focused, or in the Dock — sampled from the
 * main process and, on macOS, from the window server — while it still paints
 * animation frames, lays out, takes clicks and typing, screenshots, and
 * records video. It also asks the app to show, focus, raise, and maximize its
 * window and to open a dialog, and requires all of them to leave it hidden.
 *
 * Callbacks evaluated in the page or main process name no inner functions:
 * tsx would wrap them in a `__name` helper that does not exist there.
 */
export async function hiddenWindowRun(
    page: Page,
    app: ElectronApplication,
    artifacts: string,
    mark: (name: string) => Promise<void>,
): Promise<Record<string, unknown>> {
    const watch = await windowServerWatchStart(app.process().pid!);
    let video: GymElectronVideo | undefined;
    let windowServer: WindowServerReport | undefined;
    let mainSamples: MainInvisibilitySamples | undefined;
    try {
        await app.evaluate(({ app: electronApp, BrowserWindow }) => {
            const samples = { samples: 0, visible: 0, focused: 0, dock: 0 };
            const timer = setInterval(() => {
                samples.samples++;
                for (const window of BrowserWindow.getAllWindows()) {
                    if (window.isVisible()) samples.visible++;
                    if (window.isFocused()) samples.focused++;
                }
                if (electronApp.dock?.isVisible()) samples.dock++;
            }, 20);
            (globalThis as MainInvisibilityGlobal).__happyDesktopGymInvisibility = {
                samples,
                timer,
            };
        });
        const before = await gymElectronInvisibleAssert(app);
        await mark("sampling-started");

        const framesPerSecond = await page.evaluate(
            () =>
                new Promise<number>((resolve) => {
                    const state = { frames: 0, started: performance.now() };
                    const loop: { step?: (now: number) => void } = {};
                    loop.step = (now) => {
                        state.frames++;
                        if (now - state.started < 1_000) requestAnimationFrame(loop.step!);
                        else resolve((state.frames * 1_000) / (now - state.started));
                    };
                    requestAnimationFrame(loop.step);
                }),
        );
        if (framesPerSecond < 30)
            throw new Error(
                `The hidden window painted only ${framesPerSecond.toFixed(1)} frames/s.`,
            );
        await mark("frames");

        const layout = await page.evaluate(() => {
            const [sidebar, composer] = [
                '[data-happy-desktop-ui="sidebar-item"]',
                '[data-happy-desktop-ui="composer-textarea"]',
            ].map((selector) => {
                const rect = document.querySelector(selector)?.getBoundingClientRect();
                return rect
                    ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
                    : null;
            });
            return {
                viewport: { width: window.innerWidth, height: window.innerHeight },
                sidebar,
                composer,
                dragRegions: [...document.querySelectorAll<HTMLElement>("*")].filter(
                    (element) =>
                        getComputedStyle(element).getPropertyValue("-webkit-app-region") === "drag",
                ).length,
                visibilityState: document.visibilityState,
            };
        });
        if (!layout.sidebar?.width || !layout.composer?.width)
            throw new Error(`The hidden window did not lay out: ${JSON.stringify(layout)}`);
        if (layout.visibilityState !== "visible")
            throw new Error(`The hidden page reports ${layout.visibilityState}.`);
        await mark("layout");

        video = await gymElectronVideoRecord(page, {
            path: join(artifacts, "hidden-window.webm"),
        });
        const composer = page.locator('[data-happy-desktop-ui="composer-textarea"]').first();
        const typed = "Typed into a window nobody can see.";
        await composer.click();
        await page.keyboard.type(typed, { delay: 30 });
        const inputValue = await composer.inputValue();
        const composerFocused = await composer.evaluate(
            (element) => element === document.activeElement,
        );
        await page.keyboard.press("ControlOrMeta+a");
        await page.keyboard.press("Backspace");
        await page.waitForTimeout(500);
        const recorded = await video.stop();
        video = undefined;
        if (inputValue !== typed || !composerFocused)
            throw new Error(
                `Input did not reach the hidden window: ${JSON.stringify(inputValue)}.`,
            );
        if (recorded.framesReceived < 2 || (await stat(recorded.path)).size === 0)
            throw new Error(`The hidden window recorded no video: ${JSON.stringify(recorded)}`);
        await mark("input-and-video");

        const screenshot = join(artifacts, "hidden-window.png");
        await page.screenshot({ path: screenshot });
        const capture = await app.evaluate(async ({ BrowserWindow }) => {
            const window = BrowserWindow.getAllWindows()[0];
            if (!window) throw new Error("The desktop window is gone.");
            const image = await window.webContents.capturePage(undefined, { stayHidden: true });
            const bitmap = image.toBitmap();
            const colors = new Set<number>();
            for (let index = 0; index < bitmap.length; index += 4 * 97)
                colors.add((bitmap[index]! << 16) | (bitmap[index + 1]! << 8) | bitmap[index + 2]!);
            return { ...image.getSize(), distinctColors: colors.size };
        });
        if (capture.distinctColors < 8)
            throw new Error(`The hidden window captured a blank frame: ${JSON.stringify(capture)}`);
        await mark("capture");

        const refused = await app.evaluate(async ({ app: electronApp, BrowserWindow, dialog }) => {
            for (const window of BrowserWindow.getAllWindows()) {
                const bounds = window.getBounds();
                window.show();
                window.showInactive();
                window.focus();
                window.moveTop();
                window.maximize();
                window.setBounds(bounds);
            }
            electronApp.focus({ steal: true });
            await electronApp.dock?.show();
            const dialogRefusal = await dialog
                .showMessageBox({ message: "This must not appear." })
                .then(() => "shown")
                .catch((error: unknown) =>
                    error instanceof Error ? error.message : String(error),
                );
            await new Promise((resolve) => setTimeout(resolve, 500));
            return { dialogRefusal };
        });
        if (refused.dialogRefusal === "shown") throw new Error("A dialog opened in a hidden run.");
        const after = await gymElectronInvisibleAssert(app);
        await mark("presentation-refused");
        return {
            before,
            after,
            framesPerSecond,
            layout,
            inputValue,
            video: recorded,
            screenshot,
            capture,
            dialogRefusal: refused.dialogRefusal,
            ...(await hiddenWindowSamplesFinish()),
        };
    } finally {
        await video?.stop().catch(() => undefined);
        if (!mainSamples) await hiddenWindowSamplesFinish().catch(() => undefined);
        if (!windowServer) await watch?.stop().catch(() => undefined);
    }

    async function hiddenWindowSamplesFinish(): Promise<Record<string, unknown>> {
        mainSamples = await app.evaluate(() => {
            const state = (globalThis as MainInvisibilityGlobal).__happyDesktopGymInvisibility;
            if (!state) throw new Error("The main-process sampler is gone.");
            clearInterval(state.timer);
            return state.samples;
        });
        windowServer = watch ? await watch.stop() : undefined;
        if (mainSamples.visible > 0 || mainSamples.focused > 0 || mainSamples.dock > 0)
            throw new Error(
                `The main process saw the window on screen: ${JSON.stringify(mainSamples)}`,
            );
        if (windowServer) windowServerReportAssert(windowServer);
        return { mainSamples, windowServer: windowServer ?? "unavailable on this host" };
    }
}

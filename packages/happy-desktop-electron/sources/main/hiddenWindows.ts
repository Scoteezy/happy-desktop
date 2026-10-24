import { app, BaseWindow, BrowserWindow, dialog, screen, shell } from "electron";

/**
 * Hidden-window mode: what every Gym and agent-driven launch runs in.
 *
 * The person at the machine keeps working while an agent drives this app, so
 * the app must never appear in front of them. Each window is still a real
 * window — created, laid out, composited, painting every frame, answering
 * input, screenshots, and screencasts — but it is never ordered onto a screen:
 * it is never visible, never focused, cannot be clicked, and the process has no
 * Dock tile, Cmd-Tab entry, menu bar, or Mission Control presence.
 *
 * The mode is entered by the explicit flag, by a Gym profile, or by a launch
 * through Playwright's Electron loader; nothing a person starts by hand enters
 * it. Once entered it is impossible to leave: every API that would reveal a
 * window, raise the app, or put something else in front of the person is
 * replaced for the life of the process, and a window that becomes visible or
 * focused anyway ends the process loudly rather than stay on screen.
 */
export const hiddenWindowsEnvironment = "HAPPY_DESKTOP_WINDOWS_HIDDEN";

/** The exit code a hidden-mode process ends with when a window became visible. */
export const hiddenWindowsViolationExitCode = 87;

/**
 * Whether this launch must keep its windows hidden. Playwright's Electron
 * loader is not ours and offers no contract to read, so it is recognised here,
 * once, by the run hook it installs before the app's own code loads: that is
 * what turns an agent's ad-hoc `_electron.launch` into a hidden launch even
 * when it forgets the flag.
 */
export function hiddenWindowsRequested(
    environment: NodeJS.ProcessEnv,
    playwrightLaunched: boolean,
): boolean {
    // Any value asks for it: there is no way to ask for a visible window here,
    // and a misspelt "0" must not be the one launch that shows up.
    return (
        environment[hiddenWindowsEnvironment] !== undefined ||
        environment.HAPPY_DESKTOP_GYM_PROFILE !== undefined ||
        playwrightLaunched
    );
}

/**
 * What a launch tells the instance already holding the single-instance lock,
 * so a hidden launch that lost the lock never raises that instance's window.
 */
export interface HiddenWindowsLaunch {
    readonly hidden: boolean;
}

/** Whether a second instance's launch data says it was a hidden launch. */
export function hiddenWindowsLaunchHidden(data: unknown): boolean {
    return (
        typeof data === "object" && data !== null && (data as HiddenWindowsLaunch).hidden === true
    );
}

/**
 * Refuses an action that would put something in front of the person. The run
 * keeps going: a refused dialog or link is reported to the caller as the error
 * it is, and the run's log names it.
 */
function hiddenWindowsRefuse(action: string): Error {
    console.error(`[hidden-windows] refused ${action}: this run must stay invisible.`);
    return new Error(`A hidden-window run cannot ${action}.`);
}

function hiddenWindowsViolation(window: BaseWindow, what: string): void {
    if (!window.isDestroyed()) window.hide();
    console.error(
        `[hidden-windows] VIOLATION: window ${String(window.id)} became ${what}. ` +
            "Hidden-window runs must never show or focus a window; the process exits.",
    );
    app.exit(hiddenWindowsViolationExitCode);
}

/**
 * Enters hidden-window mode when this launch asks for it, before anything can
 * create a window. Returns whether it did.
 */
export function hiddenWindowsInstall(): boolean {
    const playwrightLaunched =
        typeof (globalThis as { __playwright_run?: unknown }).__playwright_run === "function";
    if (!hiddenWindowsRequested(process.env, playwrightLaunched)) return false;
    // Named in the environment too, for code that runs without Electron.
    process.env[hiddenWindowsEnvironment] = "1";

    // No Dock tile, no Cmd-Tab entry, no menu bar: an accessory application is
    // one the person never switches to. Set before launch finishes, so the tile
    // never appears even for a moment.
    if (process.platform === "darwin") {
        app.setActivationPolicy("accessory");
        app.dock?.hide();
    }

    // Presenting a window means leaving it where it already is: off every
    // screen. Every path that would order a window in, or raise it, comes
    // through these, including the ones the app reaches without knowing about
    // this mode.
    const quiet = function quiet(this: BaseWindow): void {};
    const prototype = BaseWindow.prototype;
    prototype.show = quiet;
    prototype.showInactive = quiet;
    prototype.focus = quiet;
    prototype.moveTop = quiet;
    // Electron reveals a hidden window it maximizes; this keeps the size and
    // leaves the window where it is.
    prototype.maximize = function maximize(this: BaseWindow): void {
        this.setBounds(screen.getDisplayMatching(this.getBounds()).workArea);
    };
    const fullScreen = (name: string) =>
        function enter(this: BaseWindow, flag: boolean): void {
            if (flag) hiddenWindowsViolation(this, `${name} (requested)`);
        };
    prototype.setFullScreen = fullScreen("full screen");
    prototype.setSimpleFullScreen = fullScreen("simple full screen");
    prototype.setKiosk = fullScreen("kiosk");
    app.focus = () => undefined;
    app.show = () => undefined;
    if (app.dock) {
        app.dock.show = () => Promise.resolve();
        app.dock.bounce = () => -1;
    }
    app.setActivationPolicy = (policy) => {
        if (policy === "regular") throw hiddenWindowsRefuse("become a regular application");
    };

    // Dialogs are windows of their own, and links and files open other
    // applications in front of the person.
    const refused = (action: string) => () => {
        throw hiddenWindowsRefuse(action);
    };
    const refusedAsync = (action: string) => () => Promise.reject(hiddenWindowsRefuse(action));
    dialog.showOpenDialog = refusedAsync("show an open dialog");
    dialog.showSaveDialog = refusedAsync("show a save dialog");
    dialog.showMessageBox = refusedAsync("show a message box");
    dialog.showCertificateTrustDialog = refusedAsync("show a certificate dialog");
    dialog.showOpenDialogSync = refused("show an open dialog");
    dialog.showSaveDialogSync = refused("show a save dialog");
    dialog.showMessageBoxSync = refused("show a message box");
    dialog.showErrorBox = (title, content) =>
        console.error(`[hidden-windows] ${title}: ${content}`);
    shell.openExternal = refusedAsync("open a link in another application");
    shell.openPath = refusedAsync("open a file in another application");
    shell.showItemInFolder = refused("reveal a file in Finder");

    app.on("web-contents-created", (_event, contents) => {
        // A window nobody looks at is a window Chromium would stop painting.
        contents.setBackgroundThrottling(false);
        contents.openDevTools = refused("open developer tools");
    });
    const watch = (window: BrowserWindow) => {
        window.on("show", () => hiddenWindowsViolation(window, "visible"));
        window.on("focus", () => hiddenWindowsViolation(window, "focused"));
        if (window.isVisible()) hiddenWindowsViolation(window, "visible on creation");
    };
    app.on("browser-window-created", (_event, window) => watch(window));
    // Native paths can order a window in without an event this process hears.
    // A cheap poll closes that gap for the life of the run.
    setInterval(() => {
        for (const window of BrowserWindow.getAllWindows()) {
            if (window.isVisible()) hiddenWindowsViolation(window, "visible");
            else if (window.isFocused()) hiddenWindowsViolation(window, "focused");
        }
        if (process.platform === "darwin" && app.dock?.isVisible()) {
            console.error("[hidden-windows] VIOLATION: the Dock tile appeared; the process exits.");
            app.exit(hiddenWindowsViolationExitCode);
        }
    }, 100).unref();
    console.error(
        `[hidden-windows] active${playwrightLaunched ? " (Playwright launch)" : ""}: ` +
            "windows render for real and are never shown.",
    );
    return true;
}

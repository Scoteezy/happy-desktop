/**
 * What a hidden first-launch smoke run reports about itself. A packaged build
 * refuses every debugger, so the smoke cannot look inside it; the app writes
 * this file instead and quits.
 */
export const desktopSmokeReportEnvironment = "HAPPY_DESKTOP_SMOKE_REPORT";
/** Where the welcome screen's capture goes; written only while it is on screen. */
export const desktopSmokeScreenshotEnvironment = "HAPPY_DESKTOP_SMOKE_SCREENSHOT";

export interface DesktopSmokeWindow {
    readonly visible: boolean;
    readonly focused: boolean;
}

export interface DesktopSmokeReport {
    readonly packaged: boolean;
    readonly platform: string;
    readonly arch: string;
    readonly welcomeVisible: boolean;
    readonly windowTitle: string;
    readonly screenshotWritten: boolean;
    readonly hiddenMode: boolean;
    readonly dockVisible: boolean | null;
    readonly focusedWindow: boolean;
    readonly windows: readonly DesktopSmokeWindow[];
}

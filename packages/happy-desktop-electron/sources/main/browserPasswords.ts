import { ipcMain, type BrowserWindow, type IpcMainInvokeEvent, type WebContents } from "electron";
import {
    desktopIpc,
    type DesktopBrowserOnePasswordConnectResult,
    type DesktopBrowserPasswordSettings,
} from "../shared/desktopContract";
import { BrowserLoginBrowserSource } from "./browserLoginBrowsers";
import { BrowserLoginOnePassword } from "./browserLoginOnePassword";
import { browserLoginsList, type BrowserLoginSourceList } from "./browserLoginSources";

/**
 * Saved logins, read on demand from the browsers and password manager the
 * person already uses. Happy stores no password: password values exist only in
 * main while one picked login is filled, and no IPC handler returns one.
 */
export class BrowserPasswords {
    readonly browsers = new BrowserLoginBrowserSource();
    readonly onePassword: BrowserLoginOnePassword;

    constructor(
        private readonly options: {
            /** Holds the connected 1Password account name only. */
            readonly onePasswordPath: string;
            readonly version: string;
            readonly windowRequire: (event: IpcMainInvokeEvent) => BrowserWindow;
            readonly pickerOpen: (owner: WebContents, guestId: number) => void;
        },
    ) {
        this.onePassword = new BrowserLoginOnePassword({
            path: options.onePasswordPath,
            integrationVersion: options.version,
        });
    }

    /** Every source's logins for one page origin. */
    logins = (origin: string): Promise<BrowserLoginSourceList> =>
        browserLoginsList([this.browsers, this.onePassword], origin);

    async install(): Promise<void> {
        await this.onePassword.load();
        ipcMain.handle(desktopIpc.browserPasswordPickerOpen, (event, rawId: unknown) => {
            const window = this.options.windowRequire(event);
            if (typeof rawId !== "number" || !Number.isSafeInteger(rawId) || rawId <= 0)
                throw new Error("This browser tab is unavailable.");
            // Opening this native menu cannot fill. Its native click callback is
            // the only capability which decrypts and delivers a chosen login.
            this.options.pickerOpen(window.webContents, rawId);
        });
        ipcMain.handle(desktopIpc.browserPasswordSettingsRead, (event) => {
            this.options.windowRequire(event);
            return this.settings();
        });
        ipcMain.handle(
            desktopIpc.browserOnePasswordConnect,
            async (event, rawAccount: unknown): Promise<DesktopBrowserOnePasswordConnectResult> => {
                this.options.windowRequire(event);
                try {
                    if (typeof rawAccount !== "string" || rawAccount.length > 256)
                        throw new Error("Enter your 1Password account name.");
                    await this.onePassword.connect(rawAccount);
                    return { type: "connected", settings: this.settings() };
                } catch (error) {
                    // Every connect failure is built from fixed, displayable text.
                    return {
                        type: "failed",
                        message:
                            error instanceof Error ? error.message : "1Password did not connect.",
                    };
                }
            },
        );
        ipcMain.handle(desktopIpc.browserOnePasswordDisconnect, async (event) => {
            this.options.windowRequire(event);
            await this.onePassword.disconnect();
            return this.settings();
        });
    }

    dispose(): void {
        for (const channel of [
            desktopIpc.browserPasswordPickerOpen,
            desktopIpc.browserPasswordSettingsRead,
            desktopIpc.browserOnePasswordConnect,
            desktopIpc.browserOnePasswordDisconnect,
        ])
            ipcMain.removeHandler(channel);
    }

    private settings(): DesktopBrowserPasswordSettings {
        return {
            onePasswordInstalled: this.onePassword.installed(),
            onePasswordAccount: this.onePassword.accountGet(),
        };
    }
}

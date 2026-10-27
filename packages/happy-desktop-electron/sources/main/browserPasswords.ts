import { ipcMain, type BrowserWindow, type IpcMainInvokeEvent, type WebContents } from "electron";
import { desktopIpc } from "../shared/desktopContract";
import { BrowserLoginBrowserSource } from "./browserLoginBrowsers";
import { browserLoginsList, type BrowserLoginSourceList } from "./browserLoginSources";

/**
 * Saved logins, read on demand from the browsers the person already uses.
 * Happy stores no password: password values exist only in main while one
 * picked login is filled, and no IPC handler returns one.
 */
export class BrowserPasswords {
    readonly browsers = new BrowserLoginBrowserSource();

    constructor(
        private readonly options: {
            readonly windowRequire: (event: IpcMainInvokeEvent) => BrowserWindow;
            readonly pickerOpen: (owner: WebContents, guestId: number) => void;
        },
    ) {}

    /** Every browser profile's logins for one page origin. */
    logins = (origin: string): Promise<BrowserLoginSourceList> =>
        browserLoginsList([this.browsers], origin);

    install(): void {
        ipcMain.handle(desktopIpc.browserPasswordPickerOpen, (event, rawId: unknown) => {
            const window = this.options.windowRequire(event);
            if (typeof rawId !== "number" || !Number.isSafeInteger(rawId) || rawId <= 0)
                throw new Error("This browser tab is unavailable.");
            // Opening this native menu cannot fill. Its native click callback is
            // the only capability which decrypts and delivers a chosen login.
            this.options.pickerOpen(window.webContents, rawId);
        });
    }

    dispose(): void {
        ipcMain.removeHandler(desktopIpc.browserPasswordPickerOpen);
    }
}

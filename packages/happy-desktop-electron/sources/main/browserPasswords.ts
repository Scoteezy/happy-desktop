import { randomUUID } from "node:crypto";
import { open } from "node:fs/promises";
import {
    dialog,
    ipcMain,
    type BrowserWindow,
    type IpcMainInvokeEvent,
    type WebContents,
} from "electron";
import type {
    BrowserLoginId,
    BrowserLoginSnapshot,
    BrowserPasswordImportId,
    BrowserPasswordImportProposal,
} from "happy-desktop-state";
import { desktopIpc } from "../shared/desktopContract";
import { BrowserLoginVault, type BrowserLoginSecretInput } from "./browserLoginVault";
import { browserPasswordCsvParse } from "./browserPasswordCsv";
import { browserPasswordRevealAuthorize } from "./browserPasswordPresence";

interface StagedImport {
    readonly id: BrowserPasswordImportId;
    readonly owner: WebContents;
    readonly logins: readonly BrowserLoginSecretInput[];
    readonly proposal: BrowserPasswordImportProposal;
    readonly expiry: ReturnType<typeof setTimeout>;
    committing: boolean;
}

/** Password values stay in this main-only owner and the selected guest frame. */
export class BrowserPasswords {
    readonly vault: BrowserLoginVault;
    private readonly imports = new Map<BrowserPasswordImportId, StagedImport>();
    private readonly choosing = new Set<number>();
    private readonly observedOwners = new WeakSet<WebContents>();

    constructor(
        private readonly options: {
            readonly path: string;
            readonly windowRequire: (event: IpcMainInvokeEvent) => BrowserWindow;
            readonly windowCurrent: () => BrowserWindow | undefined;
            readonly pickerOpen: (owner: WebContents, guestId: number) => void;
        },
    ) {
        this.vault = new BrowserLoginVault(options.path);
    }

    /** Live metadata delivery; called only with a completed vault result. */
    loginsChanged = (logins: readonly BrowserLoginSnapshot[]): void => {
        const window = this.options.windowCurrent();
        if (window && !window.isDestroyed())
            window.webContents.send(desktopIpc.browserLoginsChanged, logins);
    };

    install(): void {
        ipcMain.handle(desktopIpc.browserLoginsRead, (event) => {
            this.options.windowRequire(event);
            return this.vault.loginsRead();
        });
        ipcMain.handle(desktopIpc.browserLoginRemove, async (event, rawId: unknown) => {
            this.options.windowRequire(event);
            this.loginsChanged(await this.vault.loginRemove(loginIdRequire(rawId)));
        });
        ipcMain.handle(desktopIpc.browserLoginReveal, async (event, rawId: unknown) => {
            const window = this.options.windowRequire(event);
            const id = loginIdRequire(rawId);
            const metadata = (await this.vault.loginsRead()).find((login) => login.id === id);
            if (!metadata) throw new Error("This saved login is no longer available.");
            await browserPasswordRevealAuthorize(window);
            this.windowStillRequire(event, window);
            await this.vault.loginUse(id, metadata.origin, async (login) => {
                this.windowStillRequire(event, window);
                // Native UI is deliberately outside renderer snapshots, Dev Tools,
                // app state, and IPC return values. Never record this dialog.
                await dialog.showMessageBox(window, {
                    title: "Saved password",
                    type: "info",
                    message: metadata.origin,
                    detail: login.password,
                    buttons: ["Done"],
                    noLink: true,
                });
            });
        });
        ipcMain.handle(desktopIpc.browserPasswordPickerOpen, (event, rawId: unknown) => {
            const window = this.options.windowRequire(event);
            if (typeof rawId !== "number" || !Number.isSafeInteger(rawId) || rawId <= 0)
                throw new Error("This browser tab is unavailable.");
            // Opening this native menu cannot fill. Its native click callback is
            // the only capability which decrypts and delivers a chosen login.
            this.options.pickerOpen(window.webContents, rawId);
        });
        ipcMain.handle(desktopIpc.browserPasswordImportChoose, (event) => this.importChoose(event));
        ipcMain.handle(
            desktopIpc.browserPasswordImportCommit,
            (event, rawId: unknown, rawOrigins: unknown) =>
                this.importCommit(event, rawId, rawOrigins),
        );
        ipcMain.handle(desktopIpc.browserPasswordImportCancel, (event, rawId: unknown) => {
            const window = this.options.windowRequire(event);
            const staged = this.importRequire(window.webContents, rawId);
            if (staged.committing) throw new Error("This password import is already saving.");
            this.importDrop(staged.id);
        });
    }

    dispose(): void {
        for (const id of this.imports.keys()) this.importDrop(id);
        for (const channel of [
            desktopIpc.browserLoginsRead,
            desktopIpc.browserLoginRemove,
            desktopIpc.browserLoginReveal,
            desktopIpc.browserPasswordPickerOpen,
            desktopIpc.browserPasswordImportChoose,
            desktopIpc.browserPasswordImportCommit,
            desktopIpc.browserPasswordImportCancel,
        ])
            ipcMain.removeHandler(channel);
    }

    private async importChoose(
        event: IpcMainInvokeEvent,
    ): Promise<BrowserPasswordImportProposal | null> {
        const window = this.options.windowRequire(event);
        if (process.platform !== "darwin" && process.platform !== "win32")
            throw new Error(
                "Password import is available on macOS and Windows. Chrome on Windows requires an exported password CSV because app-bound encryption blocks outside import.",
            );
        const owner = window.webContents;
        if (this.choosing.has(owner.id)) throw new Error("A password CSV picker is already open.");
        for (const staged of this.imports.values()) {
            if (staged.owner !== owner) continue;
            if (staged.committing) throw new Error("This password import is already saving.");
            this.importDrop(staged.id);
        }
        this.choosing.add(owner.id);
        try {
            const result = await dialog.showOpenDialog(window, {
                title: "Choose an exported password CSV",
                buttonLabel: "Choose CSV",
                properties: ["openFile"],
                filters: [{ name: "Password CSV", extensions: ["csv"] }],
            });
            this.windowStillRequire(event, window);
            if (result.canceled || result.filePaths.length !== 1) return null;
            let logins: readonly BrowserLoginSecretInput[];
            let skipped: number;
            try {
                const handle = await open(result.filePaths[0], "r");
                try {
                    const stat = await handle.stat();
                    if (!stat.isFile() || stat.size > 16 * 1024 * 1024) throw new Error();
                    const bytes = await handle.readFile();
                    try {
                        if (bytes.length > 16 * 1024 * 1024) throw new Error();
                        ({ logins, skipped } = browserPasswordCsvParse(bytes.toString("utf8")));
                    } finally {
                        bytes.fill(0);
                    }
                } finally {
                    await handle.close();
                }
            } catch {
                throw new Error(
                    "This CSV could not be read. Choose a password export from Chrome, Safari, or Firefox, up to 16 MB.",
                );
            }
            this.windowStillRequire(event, window);
            const id = randomUUID() as BrowserPasswordImportId;
            const sites = new Map<string, { origin: string; usernames: string[]; count: number }>();
            for (const login of logins) {
                const site = sites.get(login.origin) ?? {
                    origin: login.origin,
                    usernames: [],
                    count: 0,
                };
                site.count += 1;
                if (!site.usernames.includes(login.username)) site.usernames.push(login.username);
                sites.set(login.origin, site);
            }
            const proposal: BrowserPasswordImportProposal = {
                id,
                skipped,
                expiresAt: Date.now() + 5 * 60_000,
                sites: [...sites.values()].sort((a, b) => a.origin.localeCompare(b.origin)),
            };
            const expiry = setTimeout(() => {
                const staged = this.imports.get(id);
                if (!staged || staged.committing) return;
                this.importDrop(id);
                if (!owner.isDestroyed()) owner.send(desktopIpc.browserPasswordImportExpired, id);
            }, 5 * 60_000);
            expiry.unref();
            this.imports.set(id, { id, owner, logins, proposal, expiry, committing: false });
            if (!this.observedOwners.has(owner)) {
                this.observedOwners.add(owner);
                owner.once("destroyed", () => {
                    for (const staged of this.imports.values())
                        if (staged.owner === owner) this.importDrop(staged.id);
                });
                // Renderer reloads must not leave an invisible staged CSV alive.
                owner.on("did-start-navigation", (navigation) => {
                    if (!navigation.isMainFrame || navigation.isSameDocument) return;
                    for (const staged of this.imports.values())
                        if (staged.owner === owner && !staged.committing)
                            this.importDrop(staged.id);
                });
            }
            return proposal;
        } finally {
            this.choosing.delete(owner.id);
        }
    }

    private async importCommit(
        event: IpcMainInvokeEvent,
        rawId: unknown,
        rawOrigins: unknown,
    ): Promise<void> {
        const window = this.options.windowRequire(event);
        const staged = this.importRequire(window.webContents, rawId);
        if (staged.committing) throw new Error("This password import is already saving.");
        if (
            !Array.isArray(rawOrigins) ||
            rawOrigins.length === 0 ||
            rawOrigins.length > staged.proposal.sites.length ||
            !rawOrigins.every(
                (origin): origin is string =>
                    typeof origin === "string" &&
                    staged.proposal.sites.some((site) => site.origin === origin),
            ) ||
            new Set(rawOrigins).size !== rawOrigins.length
        )
            throw new Error("Choose the sites to import first.");
        const selected = new Set(rawOrigins as string[]);
        const logins = staged.logins.filter((login) => selected.has(login.origin));
        staged.committing = true;
        try {
            const metadata = await this.vault.loginsSave(logins);
            this.importDrop(staged.id);
            this.loginsChanged(metadata);
        } catch {
            staged.committing = false;
            if (Date.now() >= staged.proposal.expiresAt) {
                this.importDrop(staged.id);
                if (!staged.owner.isDestroyed())
                    staged.owner.send(desktopIpc.browserPasswordImportExpired, staged.id);
            }
            throw new Error("The password import could not be saved. Nothing was imported.");
        }
    }

    private importRequire(owner: WebContents, rawId: unknown): StagedImport {
        const staged =
            typeof rawId === "string"
                ? this.imports.get(rawId as BrowserPasswordImportId)
                : undefined;
        if (!staged || staged.owner !== owner)
            throw new Error("This password import is no longer available. Choose the CSV again.");
        if (!staged.committing && Date.now() >= staged.proposal.expiresAt) {
            this.importDrop(staged.id);
            throw new Error("This password import expired. Choose the CSV again.");
        }
        return staged;
    }

    private importDrop(id: BrowserPasswordImportId): void {
        const staged = this.imports.get(id);
        if (!staged) return;
        clearTimeout(staged.expiry);
        this.imports.delete(id);
    }

    private windowStillRequire(event: IpcMainInvokeEvent, window: BrowserWindow): void {
        if (window.isDestroyed() || this.options.windowRequire(event) !== window)
            throw new Error("This password request is no longer available.");
    }
}

function loginIdRequire(raw: unknown): BrowserLoginId {
    if (
        typeof raw !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(raw)
    )
        throw new Error("This saved login is unavailable.");
    return raw as BrowserLoginId;
}

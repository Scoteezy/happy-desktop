import { createRequire } from "node:module";
import type { DesktopUpdateSnapshot } from "../shared/desktopContract";
import { desktopUpdateFeedResolve } from "./desktopUpdateFeed";

const { autoUpdater } = createRequire(import.meta.url)(
    "electron-updater",
) as typeof import("electron-updater");

export interface DesktopUpdater {
    check(): Promise<void>;
    /** Returns whether a ready update took ownership of quitting. */
    install(runAfterInstall?: boolean): boolean;
    previewUpdate(enabled: boolean): void;
}

export function desktopUpdaterCreate(input: {
    preview?: boolean;
    flavor: "standard" | "local-web";
    packaged: boolean;
    update: (snapshot: DesktopUpdateSnapshot) => void;
}): DesktopUpdater {
    let availableVersion: string | undefined;
    let updateReady = false;
    let preview = input.preview === true;
    let generation = 0;
    let activeGeneration = 0;
    let checking: Promise<void> | undefined;
    let downloadCancel: (() => void) | undefined;
    // Do not hand a download to Squirrel.Mac until an actual install/quit: once
    // Squirrel has staged it, disabling preview updates cannot revoke it. The
    // host's existing quit path calls install(false) for a still-allowed update.
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.allowPrerelease = preview;
    autoUpdater.allowDowngrade = false;
    autoUpdater.on("checking-for-update", () => {
        if (activeGeneration !== generation) return;
        input.update({ status: "checking" });
    });
    autoUpdater.on("update-not-available", () => {
        if (activeGeneration !== generation) return;
        availableVersion = undefined;
        input.update({ status: "idle" });
    });
    autoUpdater.on("update-available", (info) => {
        if (activeGeneration !== generation) return;
        availableVersion = info.version;
        input.update({ status: "available", availableVersion });
    });
    autoUpdater.on("download-progress", (progress) => {
        if (activeGeneration !== generation) return;
        input.update({
            status: "downloading",
            ...(availableVersion ? { availableVersion } : {}),
            downloadedFraction: progress.percent / 100,
            message: `${Math.round(progress.percent)}% downloaded`,
        });
    });
    autoUpdater.on("update-downloaded", (info) => {
        if (activeGeneration !== generation) return;
        availableVersion = info.version;
        updateReady = true;
        input.update({ status: "downloaded", availableVersion });
    });
    autoUpdater.on("error", (error) => {
        if (activeGeneration !== generation) return;
        input.update({ status: "error", message: error.message });
    });
    const check = (): Promise<void> => {
        if (!input.packaged || updateReady) return Promise.resolve();
        if (checking) return checking;
        activeGeneration = generation;
        checking = (async () => {
            try {
                input.update({ status: "checking" });
                const url = await desktopUpdateFeedResolve({ preview, flavor: input.flavor });
                if (activeGeneration !== generation) return;
                autoUpdater.allowPrerelease = preview;
                autoUpdater.setFeedURL({
                    provider: "generic",
                    url,
                    channel: input.flavor === "local-web" ? "nightly" : "latest",
                });
                const result = await autoUpdater.checkForUpdates();
                if (activeGeneration !== generation || !result?.isUpdateAvailable) return;
                downloadCancel = () => result.cancellationToken?.cancel();
                await autoUpdater.downloadUpdate(result.cancellationToken);
            } catch (error) {
                if (activeGeneration !== generation) return;
                input.update({
                    status: "error",
                    message:
                        error instanceof Error ? error.message : "Desktop update lookup failed.",
                });
                throw error;
            } finally {
                checking = undefined;
                downloadCancel = undefined;
                if (activeGeneration !== generation) void check().catch(() => undefined);
            }
        })();
        return checking;
    };
    return {
        check,
        previewUpdate(enabled) {
            if (preview === enabled) return;
            preview = enabled;
            generation += 1;
            updateReady = false;
            availableVersion = undefined;
            autoUpdater.autoInstallOnAppQuit = false;
            downloadCancel?.();
            input.update({ status: "idle" });
            void check().catch(() => undefined);
        },
        install(runAfterInstall = true) {
            if (!updateReady) return false;
            updateReady = false;
            autoUpdater.autoRunAppAfterInstall = runAfterInstall;
            autoUpdater.quitAndInstall(false, runAfterInstall);
            return true;
        },
    };
}

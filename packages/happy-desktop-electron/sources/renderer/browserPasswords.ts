import {
    browserLoginsStoreOwnedCreate,
    browserPasswordSettingsStoreOwnedCreate,
    type BrowserLoginsStore,
    type BrowserPasswordSettingsStore,
    type BrowserImportStore,
} from "happy-desktop-state";
import type { HappyDesktopBridge } from "../shared/desktopContract";
import { browserImportSourceCreate } from "./browserImport";

export interface BrowserPasswordsSource {
    readonly logins: BrowserLoginsStore;
    readonly settings: BrowserPasswordSettingsStore;
    readonly browserImport: BrowserImportStore;
    dispose(): void;
}

/** Thin native metadata adapter. Passwords never cross this bridge. */
export function browserPasswordsSourceCreate(bridge: HappyDesktopBridge): BrowserPasswordsSource {
    const browserImport = browserImportSourceCreate(bridge);
    const available = !!(
        bridge.browserPasswordsAvailable &&
        bridge.browserLoginsRead &&
        bridge.browserLoginsSubscribe &&
        bridge.browserLoginRemove &&
        bridge.browserLoginReveal &&
        bridge.browserPasswordImportChoose &&
        bridge.browserPasswordImportCommit &&
        bridge.browserPasswordImportCancel &&
        bridge.browserPasswordImportExpiredSubscribe
    );
    let disposed = false;
    const { store: settings, writer: settingsWriter } = browserPasswordSettingsStoreOwnedCreate({
        available,
        output: {
            importChooseRequested: () => {
                void bridge.browserPasswordImportChoose!().then(
                    (proposal) => settingsWriter.importProposed(proposal),
                    () =>
                        settingsWriter.operationFailed(
                            "This password CSV could not be opened. Choose a Chrome, Safari, or Firefox password export up to 16 MB.",
                        ),
                );
            },
            importCommitRequested: (id, origins) => {
                void bridge.browserPasswordImportCommit!(id, origins).then(
                    () => settingsWriter.importCommitted(),
                    () =>
                        settingsWriter.operationFailed(
                            "The import could not be saved. Check Keychain access and try again, or choose the CSV again if the selection expired.",
                        ),
                );
            },
            importCancelRequested: (id) => {
                void bridge.browserPasswordImportCancel?.(id).catch(() => undefined);
            },
            loginRevealRequested: (id) => {
                void bridge.browserLoginReveal!(id).then(
                    () => settingsWriter.operationFinished(),
                    () =>
                        settingsWriter.operationFailed(
                            "Touch ID or Windows Hello is required to reveal this password. The request was cancelled or could not be authorized.",
                        ),
                );
            },
        },
    });
    const { store: logins, writer: loginsWriter } = browserLoginsStoreOwnedCreate({
        output: {
            loginRemoveRequested: (id) => {
                void bridge.browserLoginRemove?.(id).then(
                    () => undefined,
                    () =>
                        settingsWriter.loginRemoveFailed(
                            "The saved login could not be removed. Its entry has been kept.",
                        ),
                );
            },
        },
    });
    let revision = 0;
    const unsubscribe = available
        ? bridge.browserLoginsSubscribe!((entries) => {
              revision += 1;
              loginsWriter.loginsReceived(entries);
              settingsWriter.loginsLoaded();
          })
        : () => undefined;
    const unsubscribeExpiry = available
        ? bridge.browserPasswordImportExpiredSubscribe!((id) => {
              settingsWriter.importExpired(id);
          })
        : () => undefined;
    if (available) {
        const readRevision = revision;
        void bridge.browserLoginsRead!().then(
            (entries) => {
                if (disposed) return;
                // A live change received while initial IPC was pending is newer.
                if (revision === readRevision) loginsWriter.loginsReceived(entries);
                settingsWriter.loginsLoaded();
            },
            () => {
                if (disposed || revision !== readRevision) return;
                settingsWriter.operationFailed(
                    "Saved passwords could not be read. Check access to this machine's system protection. Browser passwords are supported on macOS and Windows.",
                );
            },
        );
    }
    return {
        logins,
        settings,
        browserImport: browserImport.store,
        dispose() {
            disposed = true;
            unsubscribe();
            unsubscribeExpiry();
            settings[Symbol.dispose]();
            logins[Symbol.dispose]();
            browserImport.dispose();
        },
    };
}

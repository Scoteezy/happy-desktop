import {
    browserPasswordSettingsStoreOwnedCreate,
    type BrowserPasswordSettingsStore,
} from "happy-desktop-state";
import type { HappyDesktopBridge } from "../shared/desktopContract";

export interface BrowserPasswordsSource {
    readonly settings: BrowserPasswordSettingsStore;
    dispose(): void;
}

/** Thin native settings adapter. No login or password crosses this bridge. */
export function browserPasswordsSourceCreate(bridge: HappyDesktopBridge): BrowserPasswordsSource {
    const read = bridge.browserPasswordSettingsRead;
    const connect = bridge.browserOnePasswordConnect;
    const disconnect = bridge.browserOnePasswordDisconnect;
    const available = !!(read && connect && disconnect);
    const { store: settings, writer } = browserPasswordSettingsStoreOwnedCreate({
        available,
        output: {
            onePasswordConnectRequested: (account) => {
                void connect!(account).then(
                    (result) =>
                        result.type === "connected"
                            ? writer.settingsReceived(result.settings)
                            : writer.operationFailed(result.message),
                    () => writer.operationFailed("1Password did not connect."),
                );
            },
            onePasswordDisconnectRequested: () => {
                void disconnect!().then(
                    (received) => writer.settingsReceived(received),
                    () => writer.operationFailed("1Password could not be disconnected."),
                );
            },
        },
    });
    if (available)
        void read!().then(
            (received) => writer.settingsReceived(received),
            () => writer.operationFailed("Saved-login settings could not be read."),
        );
    return {
        settings,
        dispose() {
            settings[Symbol.dispose]();
        },
    };
}

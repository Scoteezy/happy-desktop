import type { StatusBarPersistence } from "happy-desktop-state";

const STATUS_BAR_KEY = "happy.status-bar.v1";

/** The status bar's show/hide choices, kept in this window's own storage. */
export function desktopStatusBarPersistence(): StatusBarPersistence {
    return {
        read() {
            try {
                return JSON.parse(localStorage.getItem(STATUS_BAR_KEY) ?? "null") as unknown;
            } catch {
                return undefined;
            }
        },
        write(document) {
            try {
                localStorage.setItem(STATUS_BAR_KEY, JSON.stringify(document));
            } catch {
                // A storage-denied renderer keeps the choice for this window's lifetime.
            }
        },
    };
}

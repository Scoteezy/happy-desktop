import type {
    HappyAgentSidebarViewDocument,
    HappyAgentSidebarViewPersistence,
} from "happy-desktop-state";

const SIDEBAR_VIEW_KEY = "happy.sidebar-view.v1";

/**
 * Where the sidebar's choice of list — every workspace, or what is waiting
 * and recent — is kept on this machine. The window's record, like the folding
 * beside it: how this reader wants to see the list does not change when a
 * machine comes or goes.
 */
export function desktopSidebarViewPersistence(): HappyAgentSidebarViewPersistence {
    return {
        read() {
            try {
                const value = localStorage.getItem(SIDEBAR_VIEW_KEY);
                return value ? (JSON.parse(value) as HappyAgentSidebarViewDocument) : undefined;
            } catch {
                return undefined;
            }
        },
        write(document) {
            try {
                localStorage.setItem(SIDEBAR_VIEW_KEY, JSON.stringify(document));
            } catch {
                // A storage-denied renderer still keeps the choice for as long
                // as the window stays open.
            }
        },
    };
}

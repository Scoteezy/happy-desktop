import type {
    HappyAgentSidebarFilterDocument,
    HappyAgentSidebarFilterPersistence,
} from "happy-desktop-state";

const SIDEBAR_FILTER_KEY = "happy.sidebar-filter.v1";

/**
 * Where the sidebar's filters — hide idle rows, hide resting bots — are kept
 * on this machine. The window's record, like the folding beside it: how this
 * reader wants to see the list does not change when a machine comes or goes.
 */
export function desktopSidebarFilterPersistence(): HappyAgentSidebarFilterPersistence {
    return {
        read() {
            try {
                const value = localStorage.getItem(SIDEBAR_FILTER_KEY);
                return value ? (JSON.parse(value) as HappyAgentSidebarFilterDocument) : undefined;
            } catch {
                return undefined;
            }
        },
        write(document) {
            try {
                localStorage.setItem(SIDEBAR_FILTER_KEY, JSON.stringify(document));
            } catch {
                // A storage-denied renderer still keeps the filter for as long
                // as the window stays open.
            }
        },
    };
}

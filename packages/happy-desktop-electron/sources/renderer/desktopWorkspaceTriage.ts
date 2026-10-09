import type {
    HappyAgentWorkspaceTriageDocument,
    HappyAgentWorkspaceTriagePersistence,
} from "happy-desktop-state";

const WORKSPACE_TRIAGE_KEY = "happy.workspace-triage.v1";

/**
 * Where the workspaces the reader pinned, snoozed, or settled are kept on this
 * machine. It is the window's record, not a Happy Agent's: a workspace put
 * away is put away whether or not the machine holding it is answering, and a
 * shelf that lived inside a connection would empty itself every time one
 * dropped.
 */
export function desktopWorkspaceTriagePersistence(): HappyAgentWorkspaceTriagePersistence {
    return {
        read() {
            try {
                const value = localStorage.getItem(WORKSPACE_TRIAGE_KEY);
                return value ? (JSON.parse(value) as HappyAgentWorkspaceTriageDocument) : undefined;
            } catch {
                return undefined;
            }
        },
        write(document) {
            try {
                localStorage.setItem(WORKSPACE_TRIAGE_KEY, JSON.stringify(document));
            } catch {
                // A storage-denied renderer still keeps the shelf for as long
                // as the window stays open.
            }
        },
    };
}

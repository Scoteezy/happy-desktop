import type {
    HappyAgentAttentionDocument,
    HappyAgentAttentionPersistence,
} from "happy-desktop-state";

const ATTENTION_KEY = "happy.attention.v1";

/**
 * Where this machine remembers which bots the person muted or hid and when each
 * connection chimes. It is the window's record, not a Happy Agent's: the
 * choices are about the person at this device, and they have to outlive a
 * connection going away and coming back, which nothing kept inside one would.
 * Every connection's choices sit in one record, addressed by connection id.
 */
export function desktopAttentionPersistence(): HappyAgentAttentionPersistence {
    return {
        read() {
            try {
                const value = localStorage.getItem(ATTENTION_KEY);
                return value ? (JSON.parse(value) as HappyAgentAttentionDocument) : undefined;
            } catch {
                return undefined;
            }
        },
        write(document) {
            try {
                localStorage.setItem(ATTENTION_KEY, JSON.stringify(document));
            } catch {
                // A storage-denied renderer still keeps the choices for as long
                // as the window stays open.
            }
        },
    };
}

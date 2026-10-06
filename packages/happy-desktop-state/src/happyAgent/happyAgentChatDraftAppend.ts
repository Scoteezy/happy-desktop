import type { HappyAgentChatStore } from "./happyAgentChatStore.js";

/**
 * The draft after adding `message` below what is already there, separated by a
 * blank line, or `undefined` when the draft already ends with it — a repeated
 * request leaves an unchanged suggestion as it is rather than doubling it.
 */
export function happyAgentDraftAppended(existing: string, message: string): string | undefined {
    if (existing === message || existing.endsWith(`\n\n${message}`)) return undefined;
    return existing ? `${existing}\n\n${message}` : message;
}

/**
 * Adds an unsent suggestion to one conversation's composer draft without
 * replacing what is already typed there. It only writes the draft: nothing is
 * sent, and the draft keeps that conversation's own model, effort, speed, and
 * access mode.
 */
export async function happyAgentChatDraftAppend(
    store: Pick<HappyAgentChatStore, "get" | "subscribe" | "draftSet">,
    message: string,
    options: {
        readonly updatedAt: () => number;
        readonly origin: string;
        readonly closed: () => boolean;
    },
): Promise<void> {
    // Read the existing draft before adding anything. Acquiring a chat starts
    // its projection, but does not wait for its data: the session can read as
    // loaded from its placeholder before the daemon has answered with its
    // draft and mode, and writing then would replace both with defaults.
    await new Promise<void>((resolve, reject) => {
        let unsubscribe = () => {};
        let settled = false;
        const finish = (error?: Error) => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            unsubscribe();
            if (error) reject(error);
            else resolve();
        };
        const timeout = setTimeout(
            () => finish(new Error("The conversation is still loading. Try again.")),
            15_000,
        );
        const check = () => {
            if (options.closed()) {
                finish(new Error("This workspace is no longer open."));
                return;
            }
            const snapshot = store.get();
            if (snapshot.session.type === "error") finish(snapshot.session.error);
            else if (snapshot.session.type === "ready" && snapshot.ready) finish();
        };
        unsubscribe = store.subscribe(check);
        if (settled) unsubscribe();
        else check();
    });
    if (options.closed()) throw new Error("This workspace is no longer open.");
    const next = happyAgentDraftAppended(store.get().draft ?? "", message);
    if (next === undefined) return;
    await store.draftSet(next, options.updatedAt(), options.origin);
}

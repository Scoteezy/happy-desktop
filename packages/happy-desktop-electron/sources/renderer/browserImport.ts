import { browserImportStoreOwnedCreate, type BrowserImportStore } from "happy-desktop-state";
import type { HappyDesktopBridge } from "../shared/desktopContract";

export interface BrowserImportSource {
    readonly store: BrowserImportStore;
    dispose(): void;
}

/** Native metadata transport only; the surface store owns selection and status. */
export function browserImportSourceCreate(bridge: HappyDesktopBridge): BrowserImportSource {
    let disposed = false;
    let generation = 0;
    let profileGeneration = 0;
    let catalogRevision = 0;
    let sourceFailureRevision = 0;
    let unsubscribe: (() => void) | undefined;
    let subscriberCount = 0;
    // Native sessions have one window-scoped lifetime. Serialize their commands
    // so closing during a scan finishes cleanup before a subsequent open starts.
    let operationTail = Promise.resolve();
    const enqueue = (operation: () => Promise<void>) => {
        operationTail = operationTail.then(operation).catch(() => undefined);
    };
    const available = !!(
        bridge.browserImportOpen &&
        bridge.browserImportProfileSelect &&
        bridge.browserImportCommit &&
        bridge.browserImportClose &&
        bridge.browserImportSubscribe
    );
    const { store, writer } = browserImportStoreOwnedCreate({
        output: {
            importOpenRequested() {
                const lifetime = ++generation;
                profileGeneration += 1;
                if (!available) {
                    writer.operationFailed(
                        "Browser import requires the Happy desktop app on macOS or Windows.",
                    );
                    return;
                }
                catalogRevision = 0;
                unsubscribe?.();
                unsubscribe = undefined;
                enqueue(async () => {
                    if (disposed || lifetime !== generation || !store.get().open) return;
                    try {
                        const revision = catalogRevision;
                        unsubscribe = bridge.browserImportSubscribe!((event) => {
                            if (disposed || lifetime !== generation || !store.get().open) return;
                            switch (event.type) {
                                case "catalogReceived":
                                    catalogRevision += 1;
                                    writer.catalogReceived(event.catalog);
                                    break;
                                case "proposalReceived":
                                    // The initial response is correlated with its request below.
                                    // Events update the already materialized proposal only.
                                    if (store.get().proposal?.id === event.proposal.id)
                                        writer.proposalReceived(event.proposal);
                                    break;
                                case "proposalExpired":
                                    writer.proposalExpired(event.id);
                                    break;
                                case "progressReceived":
                                    writer.progressReceived(event.progress);
                                    break;
                                case "sourceFailed":
                                    sourceFailureRevision += 1;
                                    writer.sourceFailed(event.message);
                                    break;
                            }
                        });
                        const catalog = await bridge.browserImportOpen!();
                        if (disposed || lifetime !== generation) return;
                        writer.importOpened(
                            revision === catalogRevision ? catalog : store.get().catalog,
                        );
                    } catch {
                        if (!disposed && lifetime === generation)
                            writer.operationFailed(
                                "Browser profiles could not be listed. Close this dialog and try importing again.",
                            );
                    }
                });
            },
            importCloseRequested() {
                generation += 1;
                profileGeneration += 1;
                unsubscribe?.();
                unsubscribe = undefined;
                // Stop native watchers as soon as the surface closes. Disposal
                // during a commit may be refused until that commit settles;
                // its queued cleanup then runs before any subsequent open.
                const closed =
                    bridge.browserImportClose?.().then(
                        () => true,
                        () => false,
                    ) ?? Promise.resolve(true);
                enqueue(async () => {
                    if (!(await closed)) await bridge.browserImportClose?.().catch(() => undefined);
                });
            },
            profileSelectRequested(id) {
                const lifetime = generation;
                const request = ++profileGeneration;
                enqueue(async () => {
                    if (disposed || lifetime !== generation || request !== profileGeneration)
                        return;
                    try {
                        const proposal = await bridge.browserImportProfileSelect!(id);
                        if (!disposed && lifetime === generation && request === profileGeneration)
                            writer.proposalReceived(proposal);
                    } catch {
                        if (!disposed && lifetime === generation && request === profileGeneration)
                            writer.operationFailed(
                                "This browser profile could not be read. Check that it is accessible, then choose it again.",
                            );
                    }
                });
            },
            importCommitRequested(selection) {
                const lifetime = generation;
                enqueue(async () => {
                    if (disposed || lifetime !== generation) return;
                    const failureRevision = sourceFailureRevision;
                    try {
                        const result = await bridge.browserImportCommit!(selection);
                        if (!disposed && lifetime === generation) writer.importFinished(result);
                    } catch {
                        if (
                            !disposed &&
                            lifetime === generation &&
                            failureRevision === sourceFailureRevision
                        )
                            writer.operationFailed(
                                "The selected sites could not be imported. Check source access and system authorization, then try again.",
                            );
                    }
                });
            },
        },
    });
    // The resource adapter owns the UI subscription lifetime. The concrete
    // feature store remains transport-free and retains all product state.
    const surfaceStore: BrowserImportStore = {
        ...store,
        subscribe(listener) {
            if (disposed) return () => {};
            subscriberCount += 1;
            const detach = store.subscribe(listener);
            let attached = true;
            return () => {
                if (!attached) return;
                attached = false;
                detach();
                subscriberCount -= 1;
                if (subscriberCount !== 0) return;
                // useSyncExternalStore may replace a subscription in one
                // commit. Only a genuinely unobserved surface closes native
                // watchers; normal snapshot notifications keep this function.
                queueMicrotask(() => {
                    if (!disposed && subscriberCount === 0 && store.get().open) store.importClose();
                });
            };
        },
    };
    return {
        store: surfaceStore,
        dispose() {
            if (disposed) return;
            store[Symbol.dispose]();
            disposed = true;
            generation += 1;
            unsubscribe?.();
            unsubscribe = undefined;
        },
    };
}

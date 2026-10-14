import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import {
    happyAgentSurfaceCatalogStoreCreate,
    type HappyAgentSurfaceCatalogDeps,
    type HappyAgentSurfaceCatalogStore,
} from "./surfaceCatalogStore.js";
import {
    happyAgentTodoListStoreCreate,
    type HappyAgentTodoListDeps,
    type HappyAgentTodoListStore,
} from "./surfaceTodoListStore.js";
import type { HappyAgentSurfaceId } from "./surfaceTypes.js";

/**
 * One Happy Agent's Surfaces. Each store is materialized on first access and
 * opens nothing until something subscribes to it, so a window that never
 * shows a Surface costs this connection nothing.
 */
export interface HappyAgentSurfaces {
    /** The whole catalog and the reader's sidebar of it. */
    catalog(): HappyAgentSurfaceCatalogStore;
    /**
     * One todo list Surface. Each list keeps its own store for the life of the
     * connection, so changes made in one list are still sent after the reader
     * has moved on to another, and a list opened again shows what it held
     * while it is read once more.
     */
    todoList(surfaceId: HappyAgentSurfaceId): HappyAgentTodoListStore;
    [Symbol.dispose](): void;
}

export interface HappyAgentSurfacesDeps {
    readonly client: HappyAgentSurfaceCatalogDeps["client"] & HappyAgentTodoListDeps["client"];
    readonly sync: HappyAgentSync;
}

export function happyAgentSurfacesCreate(deps: HappyAgentSurfacesDeps): HappyAgentSurfaces {
    let catalog: HappyAgentSurfaceCatalogStore | undefined;
    const todoLists = new Map<HappyAgentSurfaceId, HappyAgentTodoListStore>();
    /** Lists this connection is making, until the daemon answers, for their todo stores to wait on. */
    const creating = new Map<HappyAgentSurfaceId, Promise<void>>();
    let disposed = false;
    /*
     * A window can render one last time from a session whose connection has
     * just been disposed. A surface asking then gets a store that is already
     * disposed — it holds nothing and opens nothing — rather than an exception
     * thrown out of a render.
     */
    const inert = <Store extends { [Symbol.dispose](): void }>(store: Store): Store => {
        if (disposed) store[Symbol.dispose]();
        return store;
    };
    return {
        catalog() {
            return (catalog ??= inert(
                happyAgentSurfaceCatalogStoreCreate({
                    client: deps.client,
                    sync: deps.sync,
                    surfaceCreating(surfaceId, created) {
                        creating.set(surfaceId, created);
                        const done = (): void => {
                            creating.delete(surfaceId);
                        };
                        created.then(done, done);
                    },
                }),
            ));
        },
        todoList(surfaceId) {
            let store = todoLists.get(surfaceId);
            if (store === undefined) {
                const created = creating.get(surfaceId);
                store = inert(
                    happyAgentTodoListStoreCreate({
                        client: deps.client,
                        sync: deps.sync,
                        surfaceId,
                        ...(created === undefined ? {} : { surfaceCreated: created }),
                    }),
                );
                if (!disposed) todoLists.set(surfaceId, store);
            }
            return store;
        },
        [Symbol.dispose]() {
            if (disposed) return;
            disposed = true;
            catalog?.[Symbol.dispose]();
            for (const store of todoLists.values()) store[Symbol.dispose]();
            todoLists.clear();
        },
    };
}

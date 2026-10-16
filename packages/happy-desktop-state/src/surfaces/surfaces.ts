import type { HappyAgentSync } from "../happyAgentConnection/happyAgentSync.js";
import {
    happyAgentSurfaceCatalogStoreCreate,
    type HappyAgentSurfaceCatalogDeps,
    type HappyAgentSurfaceCatalogStore,
} from "./surfaceCatalogStore.js";
import {
    happyAgentSurfaceDocumentStoreCreate,
    type HappyAgentSurfaceDocumentDeps,
    type HappyAgentSurfaceDocumentStore,
} from "./surfaceDocumentStore.js";
import {
    happyAgentSurfaceDocumentSupportStoreCreate,
    type HappyAgentSurfaceDocumentSupportDeps,
    type HappyAgentSurfaceDocumentSupportStore,
} from "./surfaceDocumentSupportStore.js";
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
    /**
     * One document Surface, kept for the life of the connection like a todo
     * list, so typing is still sent after the reader has moved on.
     */
    document(surfaceId: HappyAgentSurfaceId): HappyAgentSurfaceDocumentStore;
    /** Whether documents can be made and written here, as this Happy Agent says. */
    documentSupport(): HappyAgentSurfaceDocumentSupportStore;
    [Symbol.dispose](): void;
}

export interface HappyAgentSurfacesDeps {
    readonly client: HappyAgentSurfaceCatalogDeps["client"] &
        HappyAgentTodoListDeps["client"] &
        HappyAgentSurfaceDocumentDeps["client"] &
        HappyAgentSurfaceDocumentSupportDeps["client"];
    readonly sync: HappyAgentSync;
    /** Told of the workspace each Surface chat is held in, once the daemon has said. */
    readonly chatFound?: HappyAgentSurfaceCatalogDeps["chatFound"];
}

export function happyAgentSurfacesCreate(deps: HappyAgentSurfacesDeps): HappyAgentSurfaces {
    let catalog: HappyAgentSurfaceCatalogStore | undefined;
    const todoLists = new Map<HappyAgentSurfaceId, HappyAgentTodoListStore>();
    const documents = new Map<HappyAgentSurfaceId, HappyAgentSurfaceDocumentStore>();
    let documentSupport: HappyAgentSurfaceDocumentSupportStore | undefined;
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
                    ...(deps.chatFound ? { chatFound: deps.chatFound } : {}),
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
        document(surfaceId) {
            let store = documents.get(surfaceId);
            if (store === undefined) {
                const created = creating.get(surfaceId);
                store = inert(
                    happyAgentSurfaceDocumentStoreCreate({
                        client: deps.client,
                        sync: deps.sync,
                        surfaceId,
                        ...(created === undefined ? {} : { surfaceCreated: created }),
                    }),
                );
                if (!disposed) documents.set(surfaceId, store);
            }
            return store;
        },
        documentSupport() {
            return (documentSupport ??= inert(
                happyAgentSurfaceDocumentSupportStoreCreate({
                    client: deps.client,
                    sync: deps.sync,
                }),
            ));
        },
        [Symbol.dispose]() {
            if (disposed) return;
            disposed = true;
            catalog?.[Symbol.dispose]();
            documentSupport?.[Symbol.dispose]();
            for (const store of todoLists.values()) store[Symbol.dispose]();
            todoLists.clear();
            for (const store of documents.values()) store[Symbol.dispose]();
            documents.clear();
        },
    };
}

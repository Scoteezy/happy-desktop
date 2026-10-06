import { describe, expect, it } from "vitest";
import type {
    HappyAgentWorkspaceClient,
    HappyAgentWorkspaceFilesChanged,
} from "./happyAgentClient.js";
import type {
    HappyAgentGroupId,
    HappyAgentWorkspaceFileTreeEntry,
    HappyAgentWorkspaceFileTreePage,
} from "./happyAgentTypes.js";
import { happyAgentWorkspaceStoreCreate } from "./happyAgentWorkspaceStore.js";

const GROUP = "prj_hackathon" as HappyAgentGroupId;

/**
 * A checkout on disk that the test edits, read through the one transport call
 * the all-files tree uses. Each read can be held so a disk change can land
 * while it is in flight.
 */
function checkout() {
    const directories = new Map<string, HappyAgentWorkspaceFileTreeEntry[]>([["", []]]);
    const reads: string[] = [];
    let held: Array<() => void> | undefined;
    let changed: ((change: HappyAgentWorkspaceFilesChanged) => void) | undefined;
    const entry = (path: string, kind: "file" | "directory"): HappyAgentWorkspaceFileTreeEntry => ({
        kind,
        name: path.slice(path.lastIndexOf("/") + 1),
        path,
    });
    return {
        reads,
        add(path: string, kind: "file" | "directory" = "file"): void {
            const slash = path.lastIndexOf("/");
            const parent = slash < 0 ? "" : path.slice(0, slash);
            directories.get(parent)!.push(entry(path, kind));
            if (kind === "directory") directories.set(path, []);
        },
        hold(): void {
            held = [];
        },
        release(): void {
            const pending = held ?? [];
            held = undefined;
            for (const resume of pending) resume();
        },
        emit(paths: readonly string[] | null): void {
            changed?.({ groupId: GROUP, paths });
        },
        async read(path: string): Promise<HappyAgentWorkspaceFileTreePage> {
            reads.push(path);
            // What the folder held when the read reached it, not when it returned.
            const entries = [...(directories.get(path) ?? [])];
            if (held) await new Promise<void>((resume) => held!.push(resume));
            return { entries };
        },
        subscribe(listener: (change: HappyAgentWorkspaceFilesChanged) => void): () => void {
            changed = listener;
            return () => {
                changed = undefined;
            };
        },
    };
}

/**
 * Every collaborator the tree does not exercise answers inertly: a method
 * returns nothing and a store holds nothing, so the workspace store runs its
 * real file-tree code against a client that only knows about the checkout.
 */
function inert(): unknown {
    return new Proxy(() => undefined, {
        get: (_target, property) =>
            property === "then"
                ? undefined
                : property === Symbol.iterator
                  ? function* () {}
                  : inert(),
        apply: () => undefined,
    });
}

function store(disk: ReturnType<typeof checkout>) {
    const loading = { type: "loading" } as const;
    const list = {
        projects: loading,
        bots: [],
        botsCreating: [],
        archivedSessions: [],
        revision: 0,
    };
    const client = new Proxy(
        {
            models: {
                get: () => loading,
                load: () => new Promise(() => undefined),
                subscribe: () => () => undefined,
            },
            sessionList: () =>
                new Proxy(
                    { get: () => list, subscribe: () => () => undefined },
                    {
                        get: (target, property) =>
                            property in target ? target[property as keyof typeof target] : inert(),
                    },
                ),
            openInTargetsRead: () => new Promise(() => undefined),
            workspaceFileTreeRead: (_group: HappyAgentGroupId, path: string) => disk.read(path),
            workspaceFilesSubscribe: (
                listener: (change: HappyAgentWorkspaceFilesChanged) => void,
            ) => disk.subscribe(listener),
        } as Record<PropertyKey, unknown>,
        { get: (target, property) => (property in target ? target[property] : inert()) },
    ) as unknown as HappyAgentWorkspaceClient;
    const workspace = happyAgentWorkspaceStoreCreate(client);
    const unsubscribe = workspace.subscribe(() => undefined);
    return {
        workspace,
        unsubscribe,
        names(path = ""): string[] | undefined {
            return workspace
                .get()
                .workspaceFiles?.directories.get(path)
                ?.entries.map((entry) => entry.path);
        },
    };
}

async function settle(): Promise<void> {
    for (let turn = 0; turn < 10; turn += 1) await Promise.resolve();
}

describe("All files follows the checkout on disk", () => {
    it("lists files an agent creates after the tree was first opened empty", async () => {
        // A project made a moment ago in a fresh folder: nothing in it yet.
        const disk = checkout();
        const { workspace, names, unsubscribe } = store(disk);
        workspace.groupOpen(GROUP);
        workspace.fileScopeUpdate(GROUP, "all");
        await settle();
        expect(names()).toEqual([]);
        expect(workspace.get().workspaceFilesLoading).toBe(false);

        disk.add("README.md");
        disk.add("src", "directory");
        disk.emit(["README.md", "src"]);
        // The rows already shown stay on screen while the listing is re-read.
        expect(workspace.get().workspaceFilesLoading).toBe(false);
        await settle();

        expect(names()).toEqual(["README.md", "src"]);
        expect(workspace.get().workspaceFilesLoading).toBe(false);
        unsubscribe();
    });

    it("re-reads only the opened directory that holds the change", async () => {
        const disk = checkout();
        disk.add("src", "directory");
        disk.add("docs", "directory");
        const { workspace, names, unsubscribe } = store(disk);
        workspace.groupOpen(GROUP);
        workspace.fileScopeUpdate(GROUP, "all");
        await settle();
        workspace.fileTreeExpandedUpdate("src", true);
        await settle();
        expect(names("src")).toEqual([]);
        disk.reads.length = 0;

        disk.add("src/index.ts");
        disk.emit(["src/index.ts"]);
        await settle();

        expect(names("src")).toEqual(["src/index.ts"]);
        // `docs` was never opened, so nothing reads it; the root did not change.
        expect(disk.reads).toEqual(["src"]);
        unsubscribe();
    });

    it("reads again when the disk changes while a read is in flight", async () => {
        const disk = checkout();
        const { workspace, names, unsubscribe } = store(disk);
        workspace.groupOpen(GROUP);
        workspace.fileScopeUpdate(GROUP, "all");
        await settle();

        disk.hold();
        disk.add("a.txt");
        disk.emit(["a.txt"]);
        await settle();
        // The first refresh is now in flight, and has already read the folder.
        disk.add("b.txt");
        disk.emit(["b.txt"]);
        disk.release();
        await settle();

        expect(names()).toEqual(["a.txt", "b.txt"]);
        unsubscribe();
    });

    it("re-reads everything listed when the change names no paths", async () => {
        const disk = checkout();
        disk.add("src", "directory");
        const { workspace, names, unsubscribe } = store(disk);
        workspace.groupOpen(GROUP);
        workspace.fileScopeUpdate(GROUP, "all");
        await settle();
        workspace.fileTreeExpandedUpdate("src", true);
        await settle();

        disk.add("top.md");
        disk.add("src/deep.ts");
        disk.emit(null);
        await settle();

        expect(names()).toEqual(["src", "top.md"]);
        expect(names("src")).toEqual(["src/deep.ts"]);
        unsubscribe();
    });
});

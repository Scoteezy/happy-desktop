import { expect, it, vi } from "vitest";
import type { MutationRejectedDelta } from "../happyAgentConnection/types.js";
import {
    happyAgentSessionListStoreCreate,
    type HappyAgentSessionListDeps,
} from "./happyAgentSessionListStore.js";
import type { HappyAgentTask, HappyAgentTaskId, HappyAgentWorktreeId } from "./happyAgentTypes.js";

/* The reader's own task list: joined tasks in membership order, leaving as an
 * optimistic act a refusal undoes, and archiving offered only to the people
 * the host says may do it. */

const task = (
    id: string,
    options: { readonly orderKey?: string; readonly canArchive?: boolean } = {},
): HappyAgentTask => ({
    id: id as HappyAgentTaskId,
    workspaceId: `ws_${id}` as HappyAgentWorktreeId,
    name: id,
    conversation: {
        id: `ses_${id}`,
        title: id,
        subtitle: "",
        updatedAt: 1,
        activity: "idle",
        participants: [],
    },
    subtasks: [],
    owner: {},
    path: `/tasks/${id}`,
    displayPath: `~/tasks/${id}`,
    createdAt: 1,
    archived: false,
    canArchive: options.canArchive === true,
    ...(options.orderKey === undefined ? {} : { membership: { orderKey: options.orderKey } }),
});

function listCreate(initial: readonly HappyAgentTask[]) {
    let hostTasks = initial;
    let catalogChanged = (): void => undefined;
    let rejected = (_rejection: MutationRejectedDelta): void => undefined;
    let mutation = 0;
    const actions = {
        archiveTask: vi.fn(() => `mut_${String(++mutation)}`),
        createTask: vi.fn(
            (): {
                taskId: string;
                workspaceId: string;
                agentId: string;
                task: Promise<unknown>;
            } => {
                throw new Error("No create was expected.");
            },
        ),
        renameTask: vi.fn(() => `mut_${String(++mutation)}`),
        joinTask: vi.fn(() => `mut_${String(++mutation)}`),
        leaveTask: vi.fn(() => `mut_${String(++mutation)}`),
        reorderTask: vi.fn(() => `mut_${String(++mutation)}`),
        unarchiveTask: vi.fn(() => `mut_${String(++mutation)}`),
        switchModel: vi.fn(() => `mut_${String(++mutation)}`),
        setEffort: vi.fn(() => `mut_${String(++mutation)}`),
        setPermissionMode: vi.fn(() => `mut_${String(++mutation)}`),
        setServiceTier: vi.fn(() => `mut_${String(++mutation)}`),
        sessionModeSaveWait: vi.fn((_id: string) => Promise.resolve()),
        renameWait: vi.fn((_id: string) => Promise.resolve()),
    };
    const deps = {
        client: {},
        catalogSource: {
            read: () =>
                Promise.resolve({
                    catalog: { bots: [], projects: [], tasks: hostTasks, worktrees: [] },
                    sessions: [],
                    archivedSessions: [],
                }),
            subscribe: (listener: () => void) => {
                catalogChanged = listener;
                return () => undefined;
            },
            [Symbol.dispose]: () => undefined,
        },
        connectActions: actions,
        connectMutationSubscribe: (listener: (rejection: MutationRejectedDelta) => void) => {
            rejected = listener;
            return () => undefined;
        },
    } as unknown as HappyAgentSessionListDeps;
    const list = happyAgentSessionListStoreCreate(deps);
    const unsubscribe = list.subscribe(() => undefined);
    return {
        list,
        actions,
        hostAnswers(next: readonly HappyAgentTask[]) {
            hostTasks = next;
            catalogChanged();
        },
        reject: (rejection: MutationRejectedDelta) => rejected(rejection),
        [Symbol.dispose]() {
            unsubscribe();
            list[Symbol.dispose]();
        },
    };
}

const ids = (tasks: readonly HappyAgentTask[]) => tasks.map((entry) => entry.id);

it.each([false, true])(
    "waits for task model setup and preserves partial creation on refusal (%s)",
    async (refused) => {
        using harness = listCreate([]);
        await vi.waitFor(() => expect(harness.list.get().projects.type).toBe("ready"));
        harness.actions.createTask.mockImplementation(() => ({
            taskId: "new",
            workspaceId: "ws_new",
            agentId: "ses_new",
            task: Promise.resolve({ id: "new", workspaceId: "ws_new", agent: { id: "ses_new" } }),
        }));
        let resolve!: () => void;
        let reject!: (error: Error) => void;
        const gate = {
            promise: new Promise<void>((done, fail) => {
                resolve = done;
                reject = fail;
            }),
            resolve: () => resolve(),
            reject: (error: Error) => reject(error),
        };
        harness.actions.sessionModeSaveWait.mockImplementation(() => gate.promise);
        let settled = false;
        const creation = harness.list
            .taskCreate({
                name: "New",
                selection: {
                    providerId: "codex",
                    modelId: "sol",
                    effort: "low",
                    serviceTier: "priority",
                    permissionMode: "read_only",
                },
            })
            .then((value) => {
                settled = true;
                return value;
            });
        const outcome = refused
            ? expect(creation).rejects.toThrow(
                  /“New” was created.*setup was not confirmed.*Check the task before trying again/,
              )
            : expect(creation).resolves.toMatchObject({ taskId: "new" });
        await vi.waitFor(() =>
            expect(harness.actions.sessionModeSaveWait).toHaveBeenCalledTimes(4),
        );
        harness.hostAnswers([task("new", { orderKey: "a0" })]);
        await vi.waitFor(() => expect(harness.list.get().tasks).toHaveLength(1));
        expect(settled).toBe(false);
        expect(harness.actions.switchModel).toHaveBeenCalledWith("ses_new", {
            providerId: "codex",
            modelId: "sol",
        });
        if (refused) gate.reject(new Error("Model save refused."));
        else gate.resolve();
        await outcome;
        expect(harness.actions.createTask).toHaveBeenCalledTimes(1);
    },
);

it("lists the joined tasks in the reader's membership order and keeps every active one browsable", async () => {
    using harness = listCreate([
        task("b", { orderKey: "a2" }),
        task("open"),
        task("a", { orderKey: "a1" }),
    ]);
    await vi.waitFor(() => expect(harness.list.get().tasks).toHaveLength(2));
    expect(ids(harness.list.get().tasks)).toEqual(["a", "b"]);
    expect(ids(harness.list.get().taskDirectory)).toEqual(["b", "open", "a"]);
});

it("leaves at once, and brings the row back with the host's reason when it refuses", async () => {
    using harness = listCreate([task("a", { orderKey: "a1" }), task("b", { orderKey: "a2" })]);
    await vi.waitFor(() => expect(harness.list.get().tasks).toHaveLength(2));

    await harness.list.taskLeave("a" as HappyAgentTaskId);
    expect(harness.actions.leaveTask).toHaveBeenCalledWith("a");
    expect(ids(harness.list.get().tasks)).toEqual(["b"]);
    // Still in the catalog for browsing: leaving is the reader's list only.
    expect(ids(harness.list.get().taskDirectory)).toContain("a");

    harness.reject({
        type: "mutation_rejected",
        action: "leave_task",
        message: "The host is busy.",
        mutationId: "mut_1",
    });
    expect(ids(harness.list.get().tasks)).toEqual(["a", "b"]);
    expect(harness.list.get().taskFailures.get("a" as HappyAgentTaskId)).toMatchObject({
        action: "leave",
        error: { message: "The host is busy." },
    });

    // Asked again and answered: the host's catalog settles it.
    await harness.list.taskLeave("a" as HappyAgentTaskId);
    expect(harness.list.get().taskFailures.size).toBe(0);
    harness.hostAnswers([task("a"), task("b", { orderKey: "a2" })]);
    await vi.waitFor(() => expect(ids(harness.list.get().tasks)).toEqual(["b"]));
});

it("archives only a task the host says the reader may archive, and never optimistically", async () => {
    using harness = listCreate([
        task("mine", { orderKey: "a1", canArchive: true }),
        task("theirs", { orderKey: "a2" }),
    ]);
    await vi.waitFor(() => expect(harness.list.get().tasks).toHaveLength(2));

    await harness.list.taskArchive("theirs" as HappyAgentTaskId);
    expect(harness.actions.archiveTask).not.toHaveBeenCalled();

    await harness.list.taskArchive("mine" as HappyAgentTaskId);
    expect(harness.actions.archiveTask).toHaveBeenCalledWith("mine");
    expect(ids(harness.list.get().tasks)).toEqual(["mine", "theirs"]);

    harness.reject({
        type: "mutation_rejected",
        action: "archive_task",
        message: "“mine” changed while you were looking at it. Try again.",
        mutationId: "mut_1",
    });
    expect(harness.list.get().taskFailures.get("mine" as HappyAgentTaskId)?.action).toBe("archive");
});

it("moves a task in the reader's own list until the host's order agrees", async () => {
    using harness = listCreate([
        task("a", { orderKey: "a1" }),
        task("b", { orderKey: "a2" }),
        task("c", { orderKey: "a3" }),
    ]);
    await vi.waitFor(() => expect(harness.list.get().tasks).toHaveLength(3));

    await harness.list.taskReorder("c" as HappyAgentTaskId, null);
    expect(harness.actions.reorderTask).toHaveBeenCalledWith("c", null);
    expect(ids(harness.list.get().tasks)).toEqual(["c", "a", "b"]);

    // A catalog published for something else meanwhile does not undo the move.
    harness.hostAnswers([
        task("a", { orderKey: "a1" }),
        task("b", { orderKey: "a2" }),
        task("c", { orderKey: "a3" }),
    ]);
    await Promise.resolve();
    expect(ids(harness.list.get().tasks)).toEqual(["c", "a", "b"]);

    harness.hostAnswers([
        task("a", { orderKey: "a1" }),
        task("b", { orderKey: "a2" }),
        task("c", { orderKey: "a0" }),
    ]);
    await vi.waitFor(() => expect(ids(harness.list.get().tasks)).toEqual(["c", "a", "b"]));
});

it("joins once, marking the task as joining until the host lists the membership", async () => {
    using harness = listCreate([task("open")]);
    await vi.waitFor(() => expect(harness.list.get().taskDirectory).toHaveLength(1));

    await harness.list.taskJoin("open" as HappyAgentTaskId);
    await harness.list.taskJoin("open" as HappyAgentTaskId);
    expect(harness.actions.joinTask).toHaveBeenCalledTimes(1);
    expect(harness.list.get().tasksJoining.has("open" as HappyAgentTaskId)).toBe(true);

    harness.hostAnswers([task("open", { orderKey: "a0" })]);
    await vi.waitFor(() => expect(ids(harness.list.get().tasks)).toEqual(["open"]));
    expect(harness.list.get().tasksJoining.size).toBe(0);
});

it("creates a task, answering with its conversation once the host lists it at the top", async () => {
    using harness = listCreate([task("a", { orderKey: "a1" })]);
    await vi.waitFor(() => expect(harness.list.get().tasks).toHaveLength(1));
    harness.actions.createTask.mockImplementation(() => ({
        taskId: "new",
        workspaceId: "ws_new",
        agentId: "ses_new",
        task: Promise.resolve({ id: "new", workspaceId: "ws_new", agent: { id: "ses_new" } }),
    }));

    let settled = false;
    const creation = harness.list.taskCreate({ name: "  Invoice rounding  " }).then((value) => {
        settled = true;
        return value;
    });
    expect(harness.actions.createTask).toHaveBeenCalledWith("Invoice rounding");
    // Not answered until the list carries it: the window must not turn to a
    // conversation the sidebar does not have yet.
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);

    harness.hostAnswers([task("new", { orderKey: "a0" }), task("a", { orderKey: "a1" })]);
    await expect(creation).resolves.toEqual({
        taskId: "new",
        location: { groupId: "ws_new", sessionId: "ses_new" },
    });
    expect(ids(harness.list.get().tasks)).toEqual(["new", "a"]);

    // A blank name is left out, for the host to name the task from its first message.
    harness.actions.createTask.mockImplementation(() => ({
        taskId: "other",
        workspaceId: "ws_other",
        agentId: "ses_other",
        task: Promise.reject(new Error("The task's folder could not be created.")),
    }));
    await expect(harness.list.taskCreate({ name: "   " })).rejects.toThrow(
        "The task's folder could not be created.",
    );
    expect(harness.actions.createTask).toHaveBeenLastCalledWith(undefined);
    expect(harness.list.get().mutationError?.message).toContain(
        "The task's folder could not be created.",
    );
    expect(harness.list.get().mutationError?.message).toContain(
        "The new task may not have been created:",
    );
    expect(harness.list.get().mutationError?.message).not.toContain("other");
});

it("renames at once and never shows the old name again, whatever the host answers when", async () => {
    using harness = listCreate([task("a", { orderKey: "a1" })]);
    await vi.waitFor(() => expect(harness.list.get().tasks).toHaveLength(1));
    const shown: string[] = ["a"];
    const unsubscribe = harness.list.subscribe(() => {
        const name = harness.list.get().tasks[0]?.name;
        if (name !== undefined && name !== shown.at(-1)) shown.push(name);
    });
    let reply!: () => void;
    harness.actions.renameWait.mockImplementationOnce(
        () => new Promise<void>((resolve) => (reply = resolve)),
    );

    const renamed = harness.list.taskRename("a" as HappyAgentTaskId, "Alpha");
    expect(harness.actions.renameTask).toHaveBeenCalledWith("a", "Alpha");
    await vi.waitFor(() => expect(harness.actions.renameWait).toHaveBeenCalled());
    expect(harness.list.get().tasks[0]?.name).toBe("Alpha");
    // The host's reply is late, and a catalog it read before the rename
    // landed comes in first: the row keeps the new name through it.
    harness.hostAnswers([task("a", { orderKey: "a1" })]);
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(harness.list.get().tasks[0]?.name).toBe("Alpha");
    reply();
    await expect(renamed).resolves.toBe(true);
    harness.hostAnswers([{ ...task("a", { orderKey: "a1" }), name: "Alpha" }]);
    await new Promise((resolve) => setTimeout(resolve, 10));
    // Carried by the host now, the name is the host's: a later rename by
    // someone else shows.
    harness.hostAnswers([{ ...task("a", { orderKey: "a1" }), name: "Alpha 2" }]);
    await vi.waitFor(() => expect(harness.list.get().tasks[0]?.name).toBe("Alpha 2"));
    unsubscribe();
    expect(shown).toEqual(["a", "Alpha", "Alpha 2"]);
});

it("states the host's refusal of a rename under the task, and puts the host's name back", async () => {
    using harness = listCreate([task("a", { orderKey: "a1" })]);
    await vi.waitFor(() => expect(harness.list.get().tasks).toHaveLength(1));
    let refuse!: (error: Error) => void;
    harness.actions.renameWait.mockImplementationOnce(
        () => new Promise<void>((_resolve, reject) => (refuse = reject)),
    );

    const renamed = harness.list.taskRename("a" as HappyAgentTaskId, "Alpha");
    await vi.waitFor(() => expect(harness.actions.renameWait).toHaveBeenCalled());
    expect(harness.list.get().tasks[0]?.name).toBe("Alpha");
    harness.reject({
        type: "mutation_rejected",
        action: "rename_task",
        message: "“a” changed while you were renaming it. Try again.",
        mutationId: "mut_1",
    });
    refuse(new Error("“a” changed while you were renaming it. Try again."));
    await expect(renamed).resolves.toBe(false);
    expect(harness.list.get().taskFailures.get("a" as HappyAgentTaskId)).toMatchObject({
        action: "rename",
        error: { message: "“a” changed while you were renaming it. Try again." },
    });
    await vi.waitFor(() => expect(harness.list.get().tasks[0]?.name).toBe("a"));
});

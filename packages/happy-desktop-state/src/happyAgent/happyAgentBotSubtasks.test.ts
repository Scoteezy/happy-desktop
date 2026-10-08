import { expect, it } from "vitest";
import { happyAgentTaskDepths } from "./happyAgentBotSubtasks.js";
import type {
    HappyAgentBot,
    HappyAgentBotId,
    HappyAgentBotSubtask,
    HappyAgentSessionId,
    HappyAgentWorktreeId,
} from "./happyAgentTypes.js";

const conversation = (id: string) => ({
    id: id as HappyAgentSessionId,
    title: id,
    subtitle: "~/Bots/builder",
    updatedAt: 1_763_999_000_000,
    activity: "idle" as const,
    participants: [],
});

const task = (
    id: string,
    subtasks: readonly HappyAgentBotSubtask[] = [],
): HappyAgentBotSubtask => ({
    workspaceId: "ws_builder" as HappyAgentWorktreeId,
    path: "/Users/happy/Bots/builder",
    conversation: conversation(id),
    subtasks,
});

const bot = (id: string, subtasks: readonly HappyAgentBotSubtask[]): HappyAgentBot => ({
    id: `bot_${id}` as HappyAgentBotId,
    workspaceId: `ws_${id}` as HappyAgentWorktreeId,
    conversation: conversation(id),
    name: id,
    username: id,
    orderKey: "a",
    path: `/Users/happy/Bots/${id}`,
    displayPath: `~/Bots/${id}`,
    subtasks,
});

it("counts a bot as top-level and each delegated task one below its parent", () => {
    const depths = happyAgentTaskDepths([
        bot("ses_builder", [task("ses_task", [task("ses_subtask", [task("ses_deep")])])]),
        bot("ses_chief", [task("ses_other")]),
    ]);

    expect(Object.fromEntries(depths)).toEqual({
        ses_builder: 0,
        ses_task: 1,
        ses_subtask: 2,
        ses_deep: 3,
        ses_chief: 0,
        ses_other: 1,
    });
});

it("keeps the first depth of a conversation listed twice", () => {
    const shared = task("ses_shared");
    const depths = happyAgentTaskDepths([bot("ses_builder", [task("ses_task", [shared]), shared])]);

    expect(depths.get("ses_shared")).toBe(2);
});

it("stops at the depth limit instead of following a tree that never ends", () => {
    let tail: HappyAgentBotSubtask = task("ses_40");
    for (let index = 39; index >= 1; index--) tail = task(`ses_${index}`, [tail]);
    const depths = happyAgentTaskDepths([bot("ses_builder", [tail])]);

    expect(depths.get("ses_32")).toBe(32);
    expect(depths.has("ses_33")).toBe(false);
    expect(depths.size).toBe(33);
});

it("reports nothing for a conversation no bot owns", () => {
    expect(happyAgentTaskDepths([bot("ses_builder", [])]).get("ses_project")).toBeUndefined();
});

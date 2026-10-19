import { expect, it } from "vitest";
import type { ConversationEntry, ConversationFileDiff } from "./conversationEntry.js";
import { conversationFileChanges, conversationFileDiff } from "./conversationFileChanges.js";

function edit(kind: ConversationFileDiff["kind"], text: string): ConversationEntry {
    return {
        kind: "agentActivity",
        id: kind,
        sequence: "1",
        activity: {
            kind: "tool",
            tool: {
                toolCallId: kind,
                toolName: "apply_patch",
                arguments: {},
                status: "success",
                failed: false,
                presentation: {
                    type: "fileDiff",
                    files: [
                        {
                            path: "removed.txt",
                            kind,
                            hunks: [
                                {
                                    oldStart: 1,
                                    newStart: 1,
                                    lines: [{ kind: kind === "add" ? "add" : "delete", text }],
                                },
                            ],
                        },
                    ],
                },
            },
        },
    };
}

it("keeps a preexisting deleted file and its before content in Changes", () => {
    const entries = [edit("delete", "original")];
    expect(conversationFileChanges(entries)).toEqual([
        { path: "removed.txt", added: 0, deleted: 1 },
    ]);
    expect(conversationFileDiff(entries, "removed.txt")).toMatchObject({
        kind: "delete",
        added: 0,
        deleted: 1,
        hunks: [{ oldStart: 1, newStart: 1, lines: [{ kind: "delete", text: "original" }] }],
    });
});

it("cancels a file created and then deleted in the conversation", () => {
    const entries = [edit("add", "new"), edit("delete", "new")];
    expect(conversationFileChanges(entries)).toEqual([]);
    expect(conversationFileDiff(entries, "removed.txt")).toMatchObject({
        added: 0,
        deleted: 0,
        hunks: [],
    });
});

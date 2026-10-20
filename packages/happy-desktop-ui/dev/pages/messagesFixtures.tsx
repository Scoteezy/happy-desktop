import { useState } from "react";
import type {
    HappyAgentSurfaceId,
    HappyAgentSurfaceMessage,
    HappyAgentSurfaceMessageId,
    HappyAgentSurfaceMessagesSnapshot,
    HappyAgentSurfacePerson,
} from "happy-desktop-state";
import type { HappyAgentSurfaceChatToggle } from "../../src/pages/surfaces/HappyAgentSurfaceHeader";
import { HappyAgentMessagesSurfacePage } from "../../src/pages/surfaces/HappyAgentMessagesSurfacePage";
import type { HappyAgentSurfaceView } from "../../src/pages/surfaces/surfacePresentation";

/** A chat Surface as the blueprint shows it: Steve, Ada, and Grace planning a weekend. */

const FAMILY_ID = "surface-weekend" as HappyAgentSurfaceId;

/** 2026-10-17, 09:00 UTC, so every message has a fixed time. */
const MORNING = 1_792_227_600_000;

function said(
    seq: number,
    authorUserId: string,
    text: string,
    minute: number,
    extra: Partial<HappyAgentSurfaceMessage> = {},
): HappyAgentSurfaceMessage {
    const at = MORNING + minute * 60_000;
    return {
        id: `m${String(seq)}` as HappyAgentSurfaceMessageId,
        surfaceId: FAMILY_ID,
        seq,
        authorUserId,
        text,
        status: "active",
        createdAt: at,
        updatedAt: at,
        editedAt: null,
        deletedAt: null,
        version: `v${String(seq)}`,
        ...extra,
    };
}

/** u1 is the reader, Steve. */
export const MESSAGES_VIEWER = { userId: "u1" } as const;

export const MESSAGES_SURFACE: HappyAgentSurfaceView = {
    name: "Weekend trip",
    type: { kind: "chat" },
    creator: { name: "Ada Park" },
    members: [
        { key: "u1", name: "Steve Korshakov" },
        { key: "u2", name: "Ada Park" },
        { key: "u3", name: "Grace Lin" },
    ],
};

const AUTHORS: ReadonlyMap<string, HappyAgentSurfacePerson> = new Map([
    ["u1", { name: "Steve Korshakov", photo: null }],
    ["u2", { name: "Ada Park", photo: null }],
    ["u3", { name: "Grace Lin", photo: null }],
]);

export const MESSAGES: readonly HappyAgentSurfaceMessage[] = [
    said(1, "u2", "Are we still on for the lake this weekend?", 0),
    said(2, "u2", "The forecast says **sunny** both days.", 1),
    said(3, "u1", "Yes! I can drive. Leaving Saturday around 8?", 4),
    said(4, "u3", "8 works. I'll bring the tent and the stove.", 6, {
        editedAt: MORNING + 7 * 60_000,
        updatedAt: MORNING + 7 * 60_000,
        version: "v4b",
    }),
    said(5, "u1", "Wrong chat, sorry", 9, {
        status: "deleted",
        deletedAt: MORNING + 9 * 60_000,
        updatedAt: MORNING + 9 * 60_000,
        version: "v5b",
    }),
    said(
        6,
        "u2",
        "Packing list so far:\n\n- Sleeping bags\n- Snacks for the drive\n- Sunscreen",
        12,
    ),
    said(7, "u1", "I'll pick up groceries on Friday evening.", 14),
    said(8, "u1", "Anyone want anything in particular?", 14),
];

export const MESSAGES_SNAPSHOT: HappyAgentSurfaceMessagesSnapshot = {
    surfaceId: FAMILY_ID,
    status: "ready",
    messages: MESSAGES,
    sending: [],
    older: "none",
    authors: AUTHORS,
    draft: "",
};

export const messagesHandlers = {
    onDraftChange: () => undefined,
    onDraftSubmit: () => undefined,
    onOlderLoad: () => undefined,
    onMessageEditStart: () => undefined,
    onMessageEditTextChange: () => undefined,
    onMessageEditCommit: () => undefined,
    onMessageEditCancel: () => undefined,
    onMessageDelete: () => undefined,
    onFailureDismiss: () => undefined,
};

/**
 * The page on a conversation held here, so posting, editing, and deleting can
 * be tried in the workbench. A post shows as sending for a moment, as it does
 * while the Happy Agent takes it. The application holds the same snapshot in
 * its store.
 */
export function LiveMessagesPage(props: {
    readonly initial?: HappyAgentSurfaceMessagesSnapshot;
    readonly chat?: HappyAgentSurfaceChatToggle;
    readonly focusOnType?: boolean;
}) {
    const [snapshot, setSnapshot] = useState(props.initial ?? MESSAGES_SNAPSHOT);
    const set = (patch: Partial<HappyAgentSurfaceMessagesSnapshot>) =>
        setSnapshot((current) => ({ ...current, ...patch }));
    const at = MORNING + 20 * 60_000;
    return (
        <HappyAgentMessagesSurfacePage
            {...messagesHandlers}
            {...(props.chat ? { chat: props.chat } : {})}
            focusOnType={props.focusOnType ?? !props.chat?.open}
            messages={snapshot}
            onDraftChange={(draft) => set({ draft })}
            onDraftSubmit={() => {
                const text = snapshot.draft.trim();
                if (text.length === 0) return;
                const id =
                    `n${String(snapshot.messages.length + snapshot.sending.length)}` as HappyAgentSurfaceMessageId;
                set({ draft: "", sending: [...snapshot.sending, { id, text, createdAt: at }] });
                setTimeout(() => {
                    setSnapshot((current) => {
                        const seq = (current.messages.at(-1)?.seq ?? 0) + 1;
                        return {
                            ...current,
                            sending: current.sending.filter((entry) => entry.id !== id),
                            messages: [...current.messages, { ...said(seq, "u1", text, 20), id }],
                        };
                    });
                }, 900);
            }}
            onFailureDismiss={() => set({ failure: undefined })}
            onMessageDelete={(messageId) =>
                set({
                    messages: snapshot.messages.map((message) =>
                        message.id === messageId
                            ? { ...message, status: "deleted", deletedAt: at }
                            : message,
                    ),
                    editing: undefined,
                })
            }
            onMessageEditCancel={() => set({ editing: undefined })}
            onMessageEditCommit={() => {
                const editing = snapshot.editing;
                if (editing === undefined || editing.text.trim().length === 0) return;
                set({
                    editing: undefined,
                    messages: snapshot.messages.map((message) =>
                        message.id === editing.messageId && message.text !== editing.text.trim()
                            ? { ...message, text: editing.text.trim(), editedAt: at }
                            : message,
                    ),
                });
            }}
            onMessageEditStart={(messageId) => {
                const message = snapshot.messages.find((entry) => entry.id === messageId);
                if (message) set({ editing: { messageId, text: message.text } });
            }}
            onMessageEditTextChange={(text) => {
                if (snapshot.editing)
                    set({ editing: { messageId: snapshot.editing.messageId, text } });
            }}
            surface={MESSAGES_SURFACE}
            viewer={MESSAGES_VIEWER}
        />
    );
}

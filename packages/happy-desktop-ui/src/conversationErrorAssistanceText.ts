import type { ConversationErrorAssistance } from "happy-desktop-state";

/** Shared by the card and its exact virtual-row text geometry. */
export function conversationErrorAssistanceText(assistance: ConversationErrorAssistance): {
    readonly label: string;
    readonly detail?: string;
    readonly disabled: boolean;
} {
    switch (assistance.status) {
        case "ready":
            return { label: "Ask Chief of Staff", disabled: false };
        case "pending":
            return { label: "Preparing Chief of Staff draft…", disabled: true };
        case "prepared":
            return { label: "Draft prepared in Chief of Staff", disabled: true };
        case "failed":
            return {
                label: "Ask Chief of Staff",
                detail: `Could not prepare the draft: ${assistance.reason}`,
                disabled: false,
            };
        case "unavailable":
            return {
                label: "Ask Chief of Staff",
                detail: assistance.reason,
                disabled: true,
            };
    }
}

import { createContext, useContext, type ReactNode } from "react";

/**
 * Keeps a disclosure in place while what it opens or closes changes size.
 * `above` holds the edge above the disclosure's row instead, for a control
 * whose own row goes away with what it closes.
 */
export type MessageListDisclosureAnchor = (disclosure: HTMLElement, hold?: "above") => void;

const MessageListDisclosureAnchorContext = createContext<MessageListDisclosureAnchor | undefined>(
    undefined,
);

/** Gives transcript disclosures the list-owned geometry action they need before resizing. */
export function MessageListDisclosureAnchorProvider(props: {
    children: ReactNode;
    value: MessageListDisclosureAnchor;
}) {
    return (
        <MessageListDisclosureAnchorContext.Provider value={props.value}>
            {props.children}
        </MessageListDisclosureAnchorContext.Provider>
    );
}

/** Optional so the same disclosure remains fully functional outside a MessageList. */
export function useMessageListDisclosureAnchor() {
    return useContext(MessageListDisclosureAnchorContext);
}

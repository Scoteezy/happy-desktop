import { createContext, useContext } from "react";

/** The row model's content measure, published without measuring a message. */
export const MessageListRowWidthContext = createContext<number | undefined>(undefined);

export function useMessageListRowWidth() {
    return useContext(MessageListRowWidthContext);
}

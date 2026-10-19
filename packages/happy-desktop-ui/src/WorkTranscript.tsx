import type { ReactNode } from "react";
import { Banner } from "./Banner";
import { Button } from "./Button";
import { ConversationDock, type ConversationDockProps } from "./ConversationDock";
import { ConversationSummaryRow } from "./ConversationSummaryRow";
import {
    HappyAgentUserInputPrompt,
    type HappyAgentUserInputPromptProps,
} from "./HappyAgentUserInputPrompt";
import { Message, MessageList } from "./Message";

export type WorkTranscriptRow = { id: string } & (
    | {
          kind: "message" | "leased";
          author: string;
          text: string;
          own?: boolean;
          imageUrl?: string;
          imageMark?: { src: string; alt?: string };
          streaming?: boolean;
      }
    | { kind: "summary" | "handoff"; label: string; details: readonly string[] }
    | { kind: "warning"; text: string }
    | {
          kind: "question";
          request: HappyAgentUserInputPromptProps["request"];
          onAnswer?: HappyAgentUserInputPromptProps["onAnswer"];
      }
    | { kind: "artifact"; label: string; onOpen: () => void }
);

export type WorkTranscriptProps = {
    rows: readonly WorkTranscriptRow[];
    composer: ConversationDockProps;
    floating?: ReactNode;
};

/** A short curated transcript, composed from the same message/list/composer primitives. */
export function WorkTranscript(props: WorkTranscriptProps) {
    return (
        <div className="happy-work-transcript" data-happy-desktop-ui="work-transcript">
            <div className="happy-work-transcript__conversation">
                <MessageList>
                    {props.rows.map((row) => {
                        switch (row.kind) {
                            case "message":
                            case "leased":
                                return (
                                    <Message
                                        key={row.id}
                                        author={row.author}
                                        agent={!row.own}
                                        own={row.own}
                                        body={row.text}
                                        imageUrl={row.imageUrl}
                                        imageMark={row.imageMark}
                                        generationStatus={row.streaming ? "streaming" : "complete"}
                                        streamingCaret={row.streaming}
                                    />
                                );
                            case "summary":
                            case "handoff":
                                return (
                                    <ConversationSummaryRow
                                        key={row.id}
                                        kind={row.kind === "summary" ? "tools" : "handoff"}
                                        label={row.label}
                                        details={row.details}
                                    />
                                );
                            case "warning":
                                return (
                                    <Banner key={row.id} tone="warning" icon="alert">
                                        {row.text}
                                    </Banner>
                                );
                            case "question":
                                return (
                                    <HappyAgentUserInputPrompt
                                        key={row.id}
                                        request={row.request}
                                        onAnswer={row.onAnswer}
                                    />
                                );
                            case "artifact":
                                return (
                                    <div className="happy-work-transcript__artifact" key={row.id}>
                                        <Button
                                            icon="tasks"
                                            onClick={row.onOpen}
                                            variant="secondary"
                                        >
                                            {row.label}
                                        </Button>
                                    </div>
                                );
                        }
                    })}
                </MessageList>
                <ConversationDock {...props.composer} />
            </div>
            {props.floating}
        </div>
    );
}

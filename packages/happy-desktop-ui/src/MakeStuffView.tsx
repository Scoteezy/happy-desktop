import { Button } from "./Button";
import { ConversationDock, type ConversationDockProps } from "./ConversationDock";
import type { IconName } from "./Icon";
import { StemCell } from "./StemCell";
import { WorkTranscript, type WorkTranscriptRow } from "./WorkTranscript";

export type MakeStuffStage =
    | {
          kind: "request";
          id: string;
          composer: ConversationDockProps;
      }
    | {
          kind: "context";
          rows: readonly WorkTranscriptRow[];
          composer: ConversationDockProps;
      };

export type MakeStuffViewProps = { stage: MakeStuffStage };

/** One kind of thing the new item can be made as directly, instead of described. */
export type MakeStuffOption = {
    id: string;
    icon: IconName;
    label: string;
};

export type MakeStuffIntroProps = {
    /** The new item's identity, so its stem cell is the one its row wears. */
    id: string;
    /** Things that can be made at once, offered under the line; the chat stays. */
    options?: readonly MakeStuffOption[];
    onOptionSelect?: (id: string) => void;
};

/**
 * C-302 — new work before its first message: its stem cell, one short line,
 * and the kinds of thing it can be made as straight away.
 */
export function MakeStuffIntro(props: MakeStuffIntroProps) {
    return (
        <div className="happy-make-stuff__empty" data-happy-desktop-ui="make-stuff-intro">
            <StemCell id={props.id} size={64} />
            <div className="happy-make-stuff__explanation">
                <p>Say what it is — it’ll find its place.</p>
                {props.options?.length ? <p>Or start one of these:</p> : null}
            </div>
            {props.options?.length ? (
                <div
                    className="happy-make-stuff__options"
                    data-happy-desktop-ui="make-stuff-options"
                >
                    {props.options.map((option) => (
                        <Button
                            icon={option.icon}
                            key={option.id}
                            onClick={() => props.onOptionSelect?.(option.id)}
                            size="small"
                            variant="secondary"
                        >
                            {option.label}
                        </Button>
                    ))}
                </div>
            ) : null}
        </div>
    );
}

/** One intent becomes work or an artifact after its context has been resolved. */
export function MakeStuffView({ stage }: MakeStuffViewProps) {
    if (stage.kind === "context")
        return <WorkTranscript rows={stage.rows} composer={stage.composer} />;
    return (
        <div className="happy-make-stuff" data-happy-desktop-ui="make-stuff" data-stage="request">
            <MakeStuffIntro id={stage.id} />
            <ConversationDock {...stage.composer} />
        </div>
    );
}
